"""Versioned image lifecycle for the existing Studio management entrypoint."""
import json,shutil,subprocess,urllib.request,uuid,datetime
from pathlib import Path
import releases
REPO=Path('/.WHOX/organizations/ovl-studio/application');BASE=Path('/.WHOX/.System/studio-deployment')
def execute(args,env):return subprocess.run(args,env=env,capture_output=True,text=True,check=True,timeout=1800).stdout.strip()
def health():
 with urllib.request.urlopen('https://studio.overviewlabs.ai/api/health',timeout=20) as response:
  if response.status!=200:raise RuntimeError('Studio health verification failed')
  response.read(100000)
 return {'ok':True,'httpHealth':200}
def override(record):
 path=Path(record['sourcePath']).parent/'studio-images.json'
 path.write_text(json.dumps({'services':{service:{'image':artifact['imageTag'],'pull_policy':'never'} for service,artifact in record['artifacts'].items()}}))
 return ['-f',str(path)]
def runtime_command(app,record):
 source=Path(record['sourcePath'])
 for name in ('.env','.b2-files.env'):
  if (REPO/'deploy'/name).exists():shutil.copy2(REPO/'deploy'/name,source/'deploy'/name)
 secrets=source/'portal-infra/secrets';secrets.mkdir(parents=True,exist_ok=True)
 for name in ('higgsfield.env','shadcnblocks.env'):
  if (REPO/'portal-infra/secrets'/name).exists():shutil.copy2(REPO/'portal-infra/secrets'/name,secrets/name)
 command=[*app];command[command.index(str(REPO/'deploy/compose.yml'))]=str(source/'deploy/compose.yml')
 return command
def build(app,env):
 cfg=releases.for_repo(REPO);record=releases.prepare(cfg)
 source=Path(record['sourcePath'])
 for name in ('.env','.b2-files.env'):
  if (REPO/'deploy'/name).exists():shutil.copy2(REPO/'deploy'/name,source/'deploy'/name)
 try:
  command=[*app];command[command.index(str(REPO/'deploy/compose.yml'))]=str(source/'deploy/compose.yml')
  config=json.loads(execute(command+['config','--format','json'],env))
  services={k:v for k,v in config['services'].items() if v.get('build')}
  subprocess.run(command+['build','--builder','whox-studio-isolated',*services],env=env,check=True,timeout=3600)
  artifacts={}
  for service,details in services.items():
   image=execute(['docker','image','inspect','--format','{{.Id}}',details.get('image') or config['name']+'-'+service],env)
   retained='whox-studio-'+service+':'+record['releaseId']
   execute(['docker','image','tag',image,retained],env)
   artifacts[service]={'imageId':image,'imageTag':retained}
  record['artifacts']=artifacts
  releases.write(releases.directory(cfg)/record['releaseId']/'record.json',record)
  releases.write(BASE/'prepared-release.json',{'releaseId':record['releaseId']})
  print(json.dumps({'preparedRelease':record['releaseId'],'commit':record['commit']}))
 except Exception:releases.failed(cfg,record['releaseId']);raise

def backup(record,env):
 folder=Path(record['sourcePath']).parent/('private-backup-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')+'-'+uuid.uuid4().hex[:8]);folder.mkdir(mode=0o700)
 for name in ('.env','.b2-files.env'):
  if (REPO/'deploy'/name).exists():shutil.copy2(REPO/'deploy'/name,folder/name)
 containers=execute(['docker','ps','--filter','label=com.docker.compose.project=whox-studio-supabase','--filter','label=com.docker.compose.service=db','--format','{{.ID}}'],env).splitlines()
 if len(containers)!=1:raise RuntimeError('A healthy Studio database is required for the pre-release backup')
 dump=folder/'postgres.dump'
 with dump.open('wb') as output:
  subprocess.run(['docker','exec',containers[0],'pg_dump','-U','postgres','-d','postgres','--format=custom'],env=env,stdout=output,stderr=subprocess.PIPE,check=True,timeout=300)
 if dump.stat().st_size==0:raise RuntimeError('Studio database backup is empty')
 return {'path':str(folder),'postgresBackupBytes':dump.stat().st_size,'scope':'PostgreSQL and private deployment configuration; object storage remains external','dataRestoreAutomatic':False}
def start(app,env):
 cfg=releases.for_repo(REPO);pending=BASE/'prepared-release.json'
 if not pending.exists():
  subprocess.run(app+['start'],env=env,check=True)
  print(json.dumps({'legacyStartup':True,'sourceCommitKnown':False}));return
 record=releases.read(cfg,json.loads(pending.read_text())['releaseId'])
 if record['status'] not in ('prepared','deployed'):raise RuntimeError('Build a fresh verified checkpoint before deployment')
 snapshot=backup(record,env) if record['status']=='prepared' else record.get('backup')
 subprocess.run(runtime_command(app,record)+override(record)+['up','-d','--no-build','--wait','--wait-timeout','180'],env=env,check=True)
 for service,artifact in record['artifacts'].items():
  running=execute(['docker','inspect','--format','{{.Image}}','whox-studio-'+service+'-1'],env)
  if running!=artifact['imageId']:raise RuntimeError('Running Studio image does not match the prepared release: '+service)
 verification=health()
 if record['status']=='prepared':record=releases.complete(cfg,record['releaseId'],record['artifacts'],verification,snapshot)
 print(json.dumps({'deployedRelease':record['releaseId'],'commit':record['commit']}))

def rollback(app,env,release_id):
 cfg=releases.for_repo(REPO);target=releases.recovery(cfg,release_id)
 for artifact in target['artifacts'].values():execute(['docker','image','inspect',artifact['imageId']],env)
 snapshot=backup(target,env)
 subprocess.run(runtime_command(app,target)+override(target)+['up','-d','--no-build','--wait','--wait-timeout','180'],env=env,check=True)
 verification=health();new_id='release-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')+'-'+uuid.uuid4().hex[:8]
 record={**target,'releaseId':new_id,'status':'prepared','createdAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'previousReleaseId':json.loads((releases.directory(cfg)/'current.json').read_text())['releaseId']}
 folder=releases.directory(cfg)/new_id;folder.mkdir(mode=0o700);releases.write(folder/'record.json',record)
 record=releases.complete(cfg,new_id,target['artifacts'],verification,snapshot,rollback_of=release_id)
 releases.write(BASE/'prepared-release.json',{'releaseId':new_id})
 print(json.dumps({'rolledBackTo':release_id,'newRelease':new_id}))
