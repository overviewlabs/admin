import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomUUID} from 'node:crypto';
import {UUID, slug, githubRepositoryUrl, ensureRepository, IGNORE} from './policy.mjs';

const exec = promisify(execFile), stateDir = '/var/lib/overview-organization-repositories';
const config = JSON.parse(await fs.readFile('/etc/overview-labs/organization-repositories.json', 'utf8'));
if (!/^[A-Za-z0-9-]+$/.test(config.owner) || !config.responsibleUserId) throw Error('Invalid repository provisioning configuration');
const require = createRequire('/var/lib/whox/.whox/cli/current/node_modules/@whoxos/db/package.json');
const postgres = require('postgres');
const database = JSON.parse(await fs.readFile('/var/lib/whox/.whox/instances/default/config.json', 'utf8')).database.connectionString;
const sql = postgres(database, {max: 1, idle_timeout: 0, connect_timeout: 10, onnotice: () => {}});
await fs.mkdir(stateDir, {recursive: true, mode: 0o700});
const stateFile = path.join(stateDir, 'status.json');
const state = JSON.parse(await fs.readFile(stateFile, 'utf8').catch(() => '{}'));
async function save() {
  const temp = `${stateFile}.new`;
  await fs.writeFile(temp, JSON.stringify(state, null, 2), {mode: 0o600});
  await fs.rename(temp, stateFile);
}
const env = {...process.env, HOME: '/root', GH_CONFIG_DIR: '/root/.config/gh', GH_PROMPT_DISABLED: '1', GIT_TERMINAL_PROMPT: '0'};
async function api(method, endpoint, body, missingOkay = false) {
  const args = ['api', '--method', method, endpoint, '-H', 'Accept: application/vnd.github+json', '-H', 'X-GitHub-Api-Version: 2022-11-28'];
  if (body) args.push('--input', '-');
  // Input is supplied through stdin, never interpolated into shell code.
  try {
    const output = await new Promise((resolve, reject) => {
      const child = execFile('/usr/bin/gh', args, {env, timeout: 25000, maxBuffer: 2 * 1024 ** 2}, (error, stdout, stderr) => error ? reject(Object.assign(error, {providerError: stderr})) : resolve(stdout));
      child.stdin.end(body ? JSON.stringify(body) : undefined);
    });
    return JSON.parse(output);
  } catch (error) {
    if (missingOkay && /HTTP 404/.test(error.providerError || '')) return null;
    throw Error(`GitHub ${method} failed for ${endpoint}`);
  }
}
async function chownTree(root) {
  for (const item of await fs.readdir(root, {withFileTypes: true})) {
    const file = path.join(root, item.name);
    if (item.isDirectory() && !item.isSymbolicLink()) await chownTree(file);
    await fs.lchown(file, config.uid, config.gid);
  }
  await fs.chown(root, config.uid, config.gid);
}
async function workingCopy(company, repo, recordedRoot) {
  // Existing organization roots are explicit operator mappings. New roots use
  // the immutable identity suffix so duplicate names cannot share directories.
  const root = config.organizationRoots?.[company.id] || recordedRoot || `/.WHOX/organizations/${slug(company.name)}-${company.id.slice(0, 8)}`;
  if (!root.startsWith('/.WHOX/organizations/') || path.resolve(root) !== root) throw Error('Invalid organization root');
  const rootExists = Boolean(await fs.lstat(root).catch(() => null));
  await fs.mkdir(root, {recursive: true, mode: 0o750});
  if ((await fs.lstat(root)).isSymbolicLink() || await fs.realpath(root) !== root) throw Error('Invalid organization root');
  const parent = path.join(root, 'projects');
  const parentExists = Boolean(await fs.lstat(parent).catch(() => null));
  await fs.mkdir(parent, {recursive: true, mode: 0o750});
  if (await fs.realpath(parent) !== parent) throw Error('Invalid project directory');
  const destination = path.join(parent, 'source');
  const info = await fs.lstat(destination).catch(() => null);
  if (info) {
    if (!info.isDirectory() || info.isSymbolicLink()) throw Error('Source directory already contains unrelated data');
    const {stdout} = await exec('/usr/bin/git', ['-c', `safe.directory=${destination}`, '-C', destination, 'remote', 'get-url', 'origin'], {env, timeout: 10000});
    if (githubRepositoryUrl(stdout.trim()) !== repo.full_name) throw Error('Source directory belongs to a different repository');
    return destination;
  }
  const temp = path.join(parent, `.source-${randomUUID()}`);
  try {
    await exec('/usr/bin/git', ['-c', 'credential.helper=', '-c', 'credential.helper=!/usr/bin/gh auth git-credential', 'clone', '--', repo.html_url, temp], {env, timeout: 60000, maxBuffer: 65536});
    await chownTree(temp);
    await fs.rename(temp, destination);
    if (!parentExists) await fs.chown(parent, config.uid, config.gid);
    if (!rootExists) await fs.chown(root, config.uid, config.gid);
    return destination;
  } finally { await fs.rm(temp, {recursive: true, force: true}); }
}
async function provision(id) {
  if (!UUID.test(id)) return;
  await sql.begin(async tx => {
    const [lock] = await tx`select pg_try_advisory_xact_lock(481711, hashtext(${id})) as acquired`;
    if (!lock.acquired) return;
    const [company] = await tx`select c.id,c.name from companies c
      join company_memberships m on m.company_id=c.id and m.principal_type='user' and m.principal_id=${config.responsibleUserId}
      join instance_user_roles r on r.user_id=m.principal_id and r.role='instance_admin'
      where c.id=${id}::uuid and c.status='active'
      and m.status='active' and m.membership_role in ('owner','admin')`;
    if (!company) return;
    const linked = await tx`select w.id,w.repo_url,w.cwd,w.metadata,p.id project_id from project_workspaces w
      join projects p on p.id=w.project_id and p.company_id=w.company_id
      where w.company_id=${id}::uuid and p.archived_at is null and w.repo_url is not null
      order by (w.metadata->>'organizationRepository'='true') desc nulls last,w.is_primary desc,w.created_at`;
    const existing = linked.find(row => githubRepositoryUrl(row.repo_url));
    if (existing) {
      if (state[id]?.workspaceId === existing.id && state[id]?.url === existing.repo_url && state[id]?.status === 'ready') return;
      const fullName = githubRepositoryUrl(existing.repo_url);
      const repo = await api('GET', `/repos/${fullName}`);
      if (!repo.permissions?.push) throw Error('Existing repository is not writable by the provisioning account');
      // Preserve the existing repository, working directory and project history.
      await tx`update project_workspaces set metadata=coalesce(metadata,'{}'::jsonb)||${tx.json({organizationRepository: true, githubRepositoryId: String(repo.id)})},updated_at=now() where id=${existing.id}`;
      state[id] = {status: 'ready', name: company.name, url: existing.repo_url, workspaceId: existing.id, projectId: existing.project_id, retained: true, at: new Date().toISOString()};
      return;
    }
    const repo = await ensureRepository(company, config.owner, api, state[id]?.repositoryFullName);
    // Persist the remote receipt before local/SQL work so an interrupted setup
    // still reuses this repo even if the organization is renamed meanwhile.
    const organizationRoot = config.organizationRoots?.[id] || state[id]?.organizationRoot || `/.WHOX/organizations/${slug(company.name)}-${id.slice(0, 8)}`;
    state[id] = {...state[id],status: 'preparing',repositoryFullName: repo.full_name,organizationRoot,url: repo.html_url};await save();
    const ignore = await api('GET', `/repos/${repo.full_name}/contents/.gitignore`, null, true);
    if (!ignore) await api('PUT', `/repos/${repo.full_name}/contents/.gitignore`, {message: 'Initialize organization source exclusions', content: Buffer.from(IGNORE).toString('base64'), branch: repo.default_branch});
    const cwd = await workingCopy(company, repo, organizationRoot);
    // Allocate a readable project name without colliding with user-owned projects.
    let projectName = `${company.name} — Source`;
    const sameName = await tx`select id from projects where company_id=${id}::uuid and name=${projectName}`;
    if (sameName.length) projectName += ` (${id.slice(0, 8)})`;
    const [project] = await tx`insert into projects(company_id,name,description,status) values(${id}::uuid,${projectName},${`Private application source for ${company.name}. GitHub: ${repo.html_url}. Runtime data and credentials stay outside this repository.`},'planned') returning id`;
    const [workspace] = await tx`insert into project_workspaces(company_id,project_id,name,cwd,repo_url,repo_ref,default_ref,source_type,is_primary,metadata)
      values(${id}::uuid,${project.id},${repo.full_name},${cwd},${repo.html_url},${repo.default_branch},${repo.default_branch},'git_repo',true,${tx.json({organizationRepository: true, githubRepositoryId: String(repo.id), provisionedBy: 'overview-organization-repositories'})}) returning id`;
    await tx`insert into activity_log(company_id,actor_type,actor_id,action,entity_type,entity_id,details)
      values(${id}::uuid,'system','organization-repositories','organization.repository_provisioned','project',${project.id}::text,${tx.json({repositoryUrl: repo.html_url,private: true,workspaceId: workspace.id})})`;
    state[id] = {status: 'ready', name: company.name, url: repo.html_url, repositoryFullName: repo.full_name,organizationRoot,cwd, workspaceId: workspace.id, projectId: project.id, retained: false, at: new Date().toISOString()};
  });
  await save();
}
const pending = new Set(), attempts = new Map(), retries = new Map();
let running = false, stopped = false;
async function drain() {
  if (running || stopped) return;
  running = true;
  try {
    while (pending.size && !stopped) {
      const id = pending.values().next().value; pending.delete(id);
      try {
        await provision(id); attempts.delete(id);
        if (retries.has(id)) {clearTimeout(retries.get(id));retries.delete(id);}
        console.log(JSON.stringify({organizationId: id, status: state[id]?.status || 'ineligible'}));
      } catch (error) {
        const attempt = (attempts.get(id) || 0) + 1; attempts.set(id, attempt);
        state[id] = {...state[id],status: 'error',error: error.message.startsWith('GitHub ') ? error.message : 'Repository setup failed; inspect the organization workspace and retry.',attempt,at: new Date().toISOString()};await save();
        console.error(JSON.stringify({organizationId: id, status: 'error', attempt}));
        // Retry timers exist only for failed jobs and stop after five attempts.
        if (attempt < 5) retries.set(id, setTimeout(() => {retries.delete(id);enqueue(id);}, Math.min(900000,60000 * 2 ** (attempt - 1))));
      }
    }
  } finally {running = false;}
}
function enqueue(id) {if (UUID.test(id) && !stopped) {pending.add(id);void drain();}}
async function reconcile() {
  // Ownership, rather than the selectable task-responsible user, determines
  // provisioning authority. A different AI connection owner cannot skip setup.
  for (const row of await sql`select c.id from companies c join company_memberships m on m.company_id=c.id
    where c.status='active' and m.principal_type='user' and m.principal_id=${config.responsibleUserId}
    and m.status='active' and m.membership_role in ('owner','admin')`) enqueue(row.id);
}
// Reconcile only on startup/database reconnection, including notifications
// missed while the database or this worker was unavailable.
await sql.listen('overview_organization_repositories', payload => enqueue(payload), () => void reconcile().catch(() => {}));
await reconcile();
console.log('Organization repository worker listening; no idle polling.');
async function stop() {
  if (stopped) return;stopped = true;for (const timer of retries.values()) clearTimeout(timer);
  while (running) await new Promise(resolve => setTimeout(resolve, 100));
  await sql.end({timeout: 5});
}
process.on('SIGTERM', () => void stop());process.on('SIGINT', () => void stop());
