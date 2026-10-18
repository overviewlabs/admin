"""Owner-scoped repository defaults, shared by provisioning and synchronization."""
import hashlib,json,re,subprocess,os
from pathlib import Path
from git_trust import reconcile_git_trust
ROOT=Path('/var/lib/overview-version-control')
POLICY='''# Version control and releases

This organization uses private GitHub source history by default. The host checks
source workspaces every minute and automatically commits/pushes after two quiet
minutes and after organization tasks finish, using the owner's GitHub identity.
Feature branches sync to their own GitHub branch and require normal review before merge. Staged work and remote conflicts
pause synchronization; history is never rewritten or force-pushed.

Every production deployment must use an immutable source checkpoint and a
release record created by `overview-release`. Successful releases have a pushed
annotated Git tag, exact commit, source archive checksum, parent release,
verification evidence, and retained artifact/image IDs and backup reference.
Use the organization deployment tool where integrated. Otherwise the authorized
host operator must prepare a checkpoint, build from its returned sourcePath,
back up private data/configuration, deploy, verify health, and complete the
release record. Do not tag unverified code as a successful deployment.

`overview-release list <workspace-id>` lists release history. Code recovery uses
`git revert` followed by a new tested release, or a detached worktree at a release
tag; never reset the shared checkout or force push. Artifact rollback must use
retained immutable image/artifact IDs. Rollbacks are new recorded releases.
Database migrations and customer data need separate backups and compatibility
review; code rollback must never overwrite newer customer data automatically.

Credentials, customer records, databases, local task evidence and generated
runtime files belong outside Git. Follow the existing organization approvals,
task handoffs and verification rules. Automatic source snapshots are not proof
of tests, deployment, or release quality.
'''
def query(sql):
 r=subprocess.run(['/usr/sbin/runuser','-u','postgres','--','/usr/bin/psql','-d','whoxos','-At','-c',sql],capture_output=True,text=True,timeout=30)
 if r.returncode:raise RuntimeError('Organization registry database query failed')
 return r.stdout.strip()
def git(repo,*args):
 r=subprocess.run(['/usr/bin/git','-c',f'safe.directory={repo}','-C',str(repo),*args],capture_output=True,text=True,timeout=20)
 if r.returncode:raise RuntimeError('Repository check failed: '+args[0])
 return r.stdout.strip()
def reconcile():
 ROOT.mkdir(mode=0o700,parents=True,exist_ok=True)
 cfg=json.loads(Path('/etc/overview-labs/organization-repositories.json').read_text());owner=cfg['responsibleUserId']
 if not re.fullmatch(r'[A-Za-z0-9_-]+',owner):raise RuntimeError('Invalid owner identity')
 raw=query("SELECT coalesce(json_agg(row_to_json(t)),'[]') FROM (SELECT w.id,w.company_id,c.name,w.cwd,w.repo_url,w.metadata FROM project_workspaces w JOIN projects p ON p.id=w.project_id JOIN companies c ON c.id=w.company_id JOIN company_memberships m ON m.company_id=c.id WHERE c.status='active' AND p.archived_at IS NULL AND m.principal_type='user' AND m.principal_id='"+owner+"' AND m.status='active' AND m.membership_role IN ('owner','admin') AND w.repo_url IS NOT NULL) t")
 entries=[];errors=[]
 old=json.loads((ROOT/'registry.json').read_text()) if (ROOT/'registry.json').exists() else []
 cached={r['workspaceId']:r for r in old}
 for row in json.loads(raw):
  try:
   repo=Path(row['cwd'] or '')
   if not str(repo).startswith('/.WHOX/organizations/') or repo.resolve()!=repo or not (repo/'.git').exists():raise RuntimeError('Workspace needs a canonical local Git checkout')
   url=row['repo_url'].rstrip('/').removesuffix('.git')
   if not re.fullmatch(r'https://github.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+',url):raise RuntimeError('Unsupported repository URL')
   remote=git(repo,'remote','get-url','origin')
   if remote.rstrip('/').removesuffix('.git')!=url:raise RuntimeError('Workspace Git origin does not match its registered repository')
   prior=cached.get(row['id'])
   if prior and prior['remote']==remote:branch=prior.get('defaultBranch',prior['branch'])
   else:
    r=subprocess.run(['/usr/bin/gh','api','repos/'+url.split('github.com/')[1],'--jq','{private,default_branch,push:.permissions.push}'],capture_output=True,text=True,timeout=25,env={**os.environ,'GH_CONFIG_DIR':'/root/.config/gh','GH_PROMPT_DISABLED':'1'})
    if r.returncode:raise RuntimeError('GitHub repository permission check failed')
    details=json.loads(r.stdout)
    if not details['private'] or not details['push']:raise RuntimeError('Private writable repository is required')
    branch=details['default_branch']
   default_branch=branch
   branch=git(repo,'symbolic-ref','--short','HEAD')
   key=row['id'];entry={'workspaceId':key,'companyId':row['company_id'],'name':row['name'],'repo':str(repo),'remote':remote,'branch':branch,'defaultBranch':default_branch,'allowNewBranch':True,'login':'overviewlabs','authorName':'Admin','authorEmail':'187229044+overviewlabs@users.noreply.github.com','quietSeconds':120,'stateDir':str(ROOT/'workspaces'/key)}
   doc=repo/'VERSION-CONTROL.md'
   if not doc.exists():doc.write_text(POLICY);doc.chmod(0o644)
   agents=repo/'AGENTS.md';line='\n## Organization version control default\nRead VERSION-CONTROL.md. Source sync is automatic; deployments must create immutable release checkpoints and records. Never rewrite history or restore business data as part of a code rollback.\n'
   if not agents.exists():agents.write_text('# Organization source workspace\n'+line);agents.chmod(0o644)
   elif '## Organization version control default' not in agents.read_text():agents.write_text(agents.read_text()+line)
   policy={'enabled':True,'sourceSync':'automatic','quietSeconds':120,'releasePolicy':'immutable-checkpoint-tag-and-artifact','historyRewrite':False,'deploymentCommand':'overview-release','workspaceId':key}
   if (row['metadata'] or {}).get('versionControl')!=policy:
    value=json.dumps({'versionControl':policy}).replace("'","''")
    query("UPDATE project_workspaces SET metadata=coalesce(metadata,'{}'::jsonb)||'"+value+"'::jsonb,updated_at=now() WHERE id='"+key+"' AND company_id='"+row['company_id']+"';")
   entries.append(entry)
  except Exception as e:errors.append({'workspaceId':row['id'],'name':row['name'],'reason':str(e)})
 reconcile_git_trust(entries)
 tmp=ROOT/'registry.new';tmp.write_text(json.dumps(entries,indent=2)+'\n');tmp.chmod(0o600);tmp.replace(ROOT/'registry.json')
 (ROOT/'registry-errors.json').write_text(json.dumps(errors,indent=2)+'\n')
 return entries
if __name__=='__main__':print(json.dumps({'configuredWorkspaces':len(reconcile())}))
