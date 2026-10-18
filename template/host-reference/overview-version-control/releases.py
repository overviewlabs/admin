"""Immutable source checkpoints and append-only deployment records."""
import datetime,hashlib,json,os,re,subprocess,tarfile,uuid,shutil
from pathlib import Path
from sync import Sync,Pause
from registry import ROOT,query

def configs():return json.loads((ROOT/'registry.json').read_text())
def for_repo(repo):
 rows=[c for c in configs() if c['repo']==str(repo)]
 if len(rows)!=1:raise RuntimeError('Deployment source must be a registered organization repository')
 return rows[0]
def directory(cfg):
 p=ROOT/'releases'/cfg['workspaceId'];p.mkdir(parents=True,exist_ok=True,mode=0o700);return p

def write(path,data):
 temporary=path.with_suffix('.new');temporary.write_text(json.dumps(data,indent=2)+'\n');temporary.chmod(0o600);temporary.replace(path)
def read(cfg,release_id):
 if not re.fullmatch(r'release-[0-9TZ]+-[0-9a-f]{8}',release_id):raise ValueError('Invalid release ID')
 return json.loads((directory(cfg)/release_id/'record.json').read_text())
def history(cfg):
 rows=[json.loads(p.read_text()) for p in directory(cfg).glob('release-*/record.json')]
 baseline=directory(cfg)/'legacy-baseline.json'
 if baseline.exists():rows.append(json.loads(baseline.read_text()))
 return sorted(rows,key=lambda r:r['createdAt'],reverse=True)
def active_except(cfg,run_id):
 if run_id and not re.fullmatch(r'[0-9a-f-]{36}',run_id):raise ValueError('Invalid run identity')
 extra=" AND id!='"+run_id+"'" if run_id else ''
 return int(query("SELECT count(*) FROM heartbeat_runs WHERE company_id='"+cfg['companyId']+"' AND status='running'"+extra))>0

def tag(cfg,name,commit,message):
 worker=Sync(cfg);worker.identity()
 env={**worker.env,'GIT_COMMITTER_NAME':cfg['authorName'],'GIT_COMMITTER_EMAIL':cfg['authorEmail']}
 if worker.git('tag','--list',name).decode().strip():
  if worker.git('rev-parse',name+'^{}').decode().strip()!=commit:raise RuntimeError('Existing release tag points at a different commit')
 else:worker.git('tag','-a',name,commit,'-m',message,env=env)
 worker.git('push','origin','refs/tags/'+name)
 # Dereference the annotated tag at GitHub, not just the local tag object.
 actual=worker.git('ls-remote','origin','refs/tags/'+name+'^{}').decode().split()
 if not actual or actual[0]!=commit:raise RuntimeError('Remote release tag verification failed')

def retain_tooling():
 paths=[*Path('/usr/local/libexec/overview-version-control').glob('*.py'),Path('/usr/local/libexec/tql-wms-control.py'),Path('/usr/local/bin/tql-wms'),Path('/usr/local/bin/overview-release'),Path('/usr/local/bin/treasury-release'),Path('/.WHOX/.System/studio-deployment/manage.py'),Path('/usr/local/libexec/overview-organization-repositories/worker.mjs'),Path('/usr/local/libexec/overview-organization-repositories/policy.mjs')]
 h=hashlib.sha256()
 for p in sorted(paths):h.update(str(p).encode());h.update(p.read_bytes())
 version=h.hexdigest();dest=ROOT/'tooling'/version
 if not dest.exists():
  dest.mkdir(parents=True,mode=0o700);manifest=[]
  for index,p in enumerate(sorted(paths)):
   name=str(index)+'-'+p.name;shutil.copy2(p,dest/name);manifest.append({'originalPath':str(p),'retainedFile':name,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()})
  write(dest/'manifest.json',manifest)
 result={'version':version,'path':str(dest)};write(ROOT/'tooling-current.json',result);return result
def prepare(cfg,run_id=None):
 if active_except(cfg,run_id):raise RuntimeError('Finish other organization tasks before preparing a deployment')
 checkpoint_cfg={**cfg,'quietSeconds':0,'quietOutput':True}
 worker=Sync(checkpoint_cfg,active=lambda:active_except(cfg,run_id));worker.run()
 status=json.loads((Path(cfg['stateDir'])/'status.json').read_text())
 if status['status'] not in ('synced','up_to_date'):raise RuntimeError('Source checkpoint blocked: '+status.get('reason','sync unavailable'))
 if worker.git('status','--porcelain'):raise RuntimeError('Deployment requires a clean source checkpoint')
 commit=worker.git('rev-parse','HEAD').decode().strip()
 release_id='release-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')+'-'+uuid.uuid4().hex[:8]
 folder=directory(cfg)/release_id;folder.mkdir(mode=0o700)
 archive=folder/'source.tar';source=folder/'source';source.mkdir(mode=0o700)
 with archive.open('wb') as out:
  subprocess.run(['/usr/bin/git','-c',f"safe.directory={cfg['repo']}",'-C',cfg['repo'],'archive','--format=tar',commit],stdout=out,stderr=subprocess.PIPE,check=True,timeout=180)
 with tarfile.open(archive) as tar:tar.extractall(source,filter='data')
 with archive.open('rb') as file:checksum=hashlib.file_digest(file,'sha256').hexdigest()
 previous=next((r for r in history(cfg) if r.get('status')=='deployed'),None)
 record={'schemaVersion':1,'releaseId':release_id,'workspaceId':cfg['workspaceId'],'companyId':cfg['companyId'],'repository':cfg['remote'],'commit':commit,'createdAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'status':'prepared','previousReleaseId':previous['releaseId'] if previous else None,'sourcePath':str(source),'sourceArchive':str(archive),'sourceSha256':checksum,'checkpointTag':'checkpoint/'+release_id,'dataRestoreAutomatic':False}
 record['tooling']=retain_tooling()
 write(folder/'record.json',record)
 tag(cfg,record['checkpointTag'],commit,'Immutable source checkpoint for '+release_id)
 return record

def complete(cfg,release_id,artifacts,verification,backup=None,rollback_of=None):
 r=read(cfg,release_id)
 if r['status']!='prepared':raise RuntimeError('Release record has already been finalized')
 if not verification.get('ok'):raise RuntimeError('Health verification must pass before marking a deployment successful')
 if not artifacts:raise RuntimeError('Successful release requires retained immutable artifact references')
 release_tag='releases/'+release_id
 tag(cfg,release_tag,r['commit'],'Verified deployed release '+release_id)
 r.update(status='deployed',deployedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),releaseTag=release_tag,artifacts=artifacts,verification=verification,backup=backup,rollbackOf=rollback_of)
 write(directory(cfg)/release_id/'record.json',r)
 write(directory(cfg)/'current.json',{'releaseId':release_id,'commit':r['commit'],'artifacts':artifacts})
 return r

def failed(cfg,release_id):
 r=read(cfg,release_id)
 if r['status']=='prepared':r.update(status='failed',failedAt=datetime.datetime.now(datetime.timezone.utc).isoformat());write(directory(cfg)/release_id/'record.json',r)

def recovery(cfg,release_id):
 r=read(cfg,release_id)
 if r['status']!='deployed':raise RuntimeError('Only a verified deployed release can be selected for artifact rollback')
 # Older release payloads are hydrated from verified encrypted Backblaze storage.
 folder=Path(r['sourcePath']).parent
 subprocess.run(['/usr/bin/python3','/usr/local/libexec/overview-storage-cleanup/cold.py','restore',str(folder)],check=True,timeout=1800)
 return r
