"""Versioned coordinator code deployments; never change trading mode or ledger data."""
import argparse,hashlib,json,os,shutil,socket,sqlite3,subprocess,sys,datetime,uuid
from pathlib import Path
import releases
REPO=Path('/.WHOX/organizations/treasury/projects/source');RUNTIME=Path('/usr/local/libexec/treasury-workflow');FILES=('workflow.py','service.py','client.py')
def health():
 with socket.socket(socket.AF_UNIX,socket.SOCK_STREAM) as sock:
  sock.settimeout(10);sock.connect('/run/treasury-workflow/workflow.sock');sock.sendall(b'{"operation":"status"}\n')
  data=json.loads(sock.makefile('rb').readline(1048576))
  if not data.get('ok'):raise RuntimeError('Coordinator read-only status check failed')
 return {'ok':True,'readOnlyStatusVerified':True}
def backup(folder):
 path=folder/'private-backup';path.mkdir(mode=0o700)
 ledger=Path('/.WHOX/organizations/treasury/data/trading/workflow.sqlite3')
 if ledger.exists():
  with sqlite3.connect(ledger.as_uri()+'?mode=ro',uri=True) as src,sqlite3.connect(path/'workflow.sqlite3') as dst:
   src.backup(dst)
   if dst.execute('PRAGMA quick_check').fetchone()[0]!='ok':raise RuntimeError('Ledger backup integrity failed')
 shutil.copy2('/etc/overview-labs/treasury-workflow.json',path/'policy.json')
 return {'path':str(path),'ledgerRestoreAutomatic':False}
def install(source):
 # Stage the complete code set before stopping listeners. No request can launch
 # the coordinator while its three modules are being replaced.
 for name in FILES:
  staged=RUNTIME/(name+'.release-new');shutil.copy2(source/name,staged);staged.chmod(0o644)
 subprocess.run(['systemctl','stop','treasury-workflow.socket'],check=True)
 try:
  subprocess.run(['systemctl','stop','treasury-workflow.service'],check=True)
  for name in FILES:(RUNTIME/(name+'.release-new')).replace(RUNTIME/name)
 finally:subprocess.run(['systemctl','start','treasury-workflow.socket'],check=True)
 return {name:{'sha256':hashlib.sha256((RUNTIME/name).read_bytes()).hexdigest(),'path':str(RUNTIME/name)} for name in FILES}
def deploy():
 cfg=releases.for_repo(REPO);r=releases.prepare(cfg);source=Path(r['sourcePath'])/'trading'
 try:
  subprocess.run(['/usr/bin/python3','-m','unittest','discover','-s',str(source),'-v'],check=True,timeout=180)
  for name in FILES:
   if not (source/name).is_file():raise RuntimeError('Missing coordinator source file')
  snapshot=backup(Path(r['sourcePath']).parent)
  artifacts=install(source);verification=health()
  return releases.complete(cfg,r['releaseId'],artifacts,verification,snapshot)
 except Exception:releases.failed(cfg,r['releaseId']);raise

def rollback(release_id):
 cfg=releases.for_repo(REPO);target=releases.recovery(cfg,release_id);source=Path(target['sourcePath'])/'trading'
 for name in FILES:
  if hashlib.sha256((source/name).read_bytes()).hexdigest()!=target['artifacts'][name]['sha256']:raise RuntimeError('Retained rollback code checksum mismatch')
 rid='release-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')+'-'+uuid.uuid4().hex[:8]
 folder=releases.directory(cfg)/rid;folder.mkdir(mode=0o700);snapshot=backup(folder)
 artifacts=install(source);verification=health()
 r={**target,'releaseId':rid,'status':'prepared','createdAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'previousReleaseId':json.loads((releases.directory(cfg)/'current.json').read_text())['releaseId']}
 releases.write(folder/'record.json',r)
 return releases.complete(cfg,rid,artifacts,verification,snapshot,release_id)
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('action',choices=['deploy','rollback','releases']);p.add_argument('release_id',nargs='?');args=p.parse_args()
 if os.geteuid()!=0:sys.exit('Use an authorized host operator for Treasury code releases; organization permissions are unchanged.')
 try:
  if args.action=='deploy':result=deploy()
  elif args.action=='rollback':result=rollback(args.release_id)
  else:result=releases.history(releases.for_repo(REPO))
  print(json.dumps(result,indent=2))
 except Exception as e:print(json.dumps({'error':str(e)}),file=sys.stderr);sys.exit(1)
