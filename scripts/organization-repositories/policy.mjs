export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export function slug(name) {
  return name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60).replace(/-$/g, '') || 'organization';
}
export function repositoryNames(company) {
  if (!UUID.test(company.id)) throw Error('Invalid organization identity');
  const base = slug(company.name);
  return [base, `${base}-${company.id.slice(0, 8)}`, `${base}-${company.id}`];
}
export const marker = id => `Overview Labs organization ${id}:`;
export function ownsRepository(repo, company, owner) {
  return repo?.private === true && repo?.owner?.login?.toLowerCase() === owner.toLowerCase() && repo?.description?.startsWith(marker(company.id));
}
export function githubRepositoryUrl(value) {
  const match = /^https:\/\/github\.com\/([A-Za-z0-9_.-]+\/[^/?#]+?)(?:\.git)?\/?$/.exec(value || '');
  return match && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(match[1]) ? match[1] : null;
}
export async function ensureRepository(company, owner, api, previousFullName) {
  if (previousFullName) {
    if (!githubRepositoryUrl(`https://github.com/${previousFullName}`) || previousFullName.split('/')[0].toLowerCase() !== owner.toLowerCase()) throw Error('Invalid repository receipt');
    const previous = await api('GET', `/repos/${previousFullName}`, null, true);
    if (previous) {
      if (!ownsRepository(previous, company, owner)) throw Error('Repository receipt ownership verification failed');
      return previous;
    }
  }
  for (const name of repositoryNames(company)) {
    let repo = await api('GET', `/repos/${owner}/${name}`, null, true);
    if (repo && !ownsRepository(repo, company, owner)) continue;
    if (!repo) {
      try {
        repo = await api('POST', `/orgs/${owner}/repos`, {
          name, private: true, auto_init: true,
          description: `${marker(company.id)} ${company.name}`.slice(0, 300),
          has_issues: true, has_wiki: false,
        });
      } catch (error) {
        // A disconnected POST may have succeeded. Adopt only this exact
        // organization's marked private repository; never an unrelated repo.
        repo = await api('GET', `/repos/${owner}/${name}`, null, true);
        if (!ownsRepository(repo, company, owner)) throw error;
      }
    }
    if (!ownsRepository(repo, company, owner)) throw Error('Repository ownership verification failed');
    return repo;
  }
  throw Error('Unable to allocate a unique organization repository name');
}
export const IGNORE = `# Keep credentials, runtime data and generated files outside source control.
.env
.env.*
!.env.example
!.env.template
*.pem
*.key
credentials.json
auth.json
.auth/
.codex/
node_modules/
.next/
__pycache__/
*.pyc
.venv/
/data/
/logs/
/backups/
/uploads/
/configuration/
*.sqlite*
*.sql.gz
.DS_Store
`;
