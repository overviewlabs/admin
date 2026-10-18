#!/usr/bin/env python3
"""Upload completed files and encrypted recoverable backups. Never evict active workspaces."""
import argparse, datetime, fcntl, hashlib, hmac, json, os, pathlib, shutil, sqlite3, subprocess, tempfile, time, threading, concurrent.futures
STATE_LOCK=threading.RLock()
SCRATCH=pathlib.Path('/.WHOX/.System/overview-file-store-scratch')
BASE=pathlib.Path('/var/lib/overview-file-store');NODE='/usr/local/libexec/overview-file-store/store.mjs'
ROOTS={
 'studio-source':'/.WHOX/organizations/ovl-studio/application/Blueprints',
 'studio-previews':'/var/lib/docker/volumes/whox-studio_previews/_data',
 'studio-projects':'/var/lib/docker/volumes/whox-studio_template-work/_data',
 'studio-data':'/var/lib/docker/volumes/whox-studio_dashboard-data/_data',
 'studio-jobs':'/var/lib/docker/volumes/whox-studio_jobs/_data',
 'studio-supabase':'/.WHOX/.System/studio-deployment/supabase/volumes/storage',
 'admin-uploads':'/.WHOX/.System/.Admin/data/uploads',
 'whoxos-assets':'/.WHOX/.System/overview-labs/home/.whox/instances/default/data/storage',
}
WORKSPACES=[
 '/.WHOX/organizations/tql-wms/application','/.WHOX/organizations/ovl-studio/projects/ohio-582-v21',
 '/.WHOX/.System/overview-labs/home/.whox/instances/default/companies',
 '/.WHOX/.System/overview-labs/home/.whox/instances/default/project-workspaces',
]
WORKSPACE_IDENTITIES = {'/.WHOX/organizations/tql-wms/application': '/.WHOX/TQL-WMS', '/.WHOX/organizations/ovl-studio/projects/ohio-582-v21': '/.WHOX/Ohio-582-v21'}
def workspace_storage_identity(root):
 for canonical,identity in WORKSPACE_IDENTITIES.items():
  if root==canonical or root.startswith(canonical+'/'):return identity+root[len(canonical):]
 return root
def workspace_roots():
 roots=set(WORKSPACES)
 query="select coalesce(json_agg(cwd),'[]'::json) from (select cwd from project_workspaces union select cwd from execution_workspaces) w"
 values=json.loads(subprocess.check_output(['runuser','-u','postgres','--','psql','-X','-At','-d','whoxos','-c',query],text=True))
 with sqlite3.connect('file:/.WHOX/.System/.Admin/data/app.db?mode=ro',uri=True) as db:
  values.extend(r[0] for r in db.execute('select path from workspaces'))
 for value in values:
  if not value:continue
  p=pathlib.Path(value).resolve()
  # Registered System/root workspaces contain the installation and credentials.
  # They are covered by encrypted backups, not copied as unfiltered project files.
  if str(p) in ['/', '/.WHOX','/.WHOX/.System'] or '.System' in p.parts:continue
  if str(p).startswith('/.WHOX/') and p.is_dir():roots.add(str(p))
 return sorted(roots)
def run(args):subprocess.run(args,check=True)
def atomic(p,value):
 q=p.with_suffix('.new');q.write_text(json.dumps(value,indent=2));q.chmod(0o600);q.replace(p)
def init():
 SCRATCH.mkdir(mode=0o700,parents=True,exist_ok=True)
 for name in ['recovery-key','recovery-key-independent-copy']:
  p=BASE/name
  if not p.exists():
   value=os.urandom(32).hex() if name=='recovery-key' else (BASE/'recovery-key').read_text()
   p.write_text(value);p.chmod(0o600)
 # The independent local copy is on the boot disk; protect it alongside host recovery configuration.
 p=pathlib.Path('/root/.overview-storage-recovery-key')
 if not p.exists():shutil.copy2(BASE/'recovery-key',p);p.chmod(0o600)
def encrypt(source,target):
 mac=hmac.new((BASE/'recovery-key').read_bytes(),digestmod=hashlib.sha256)
 process=subprocess.Popen(['openssl','enc','-aes-256-cbc','-pbkdf2','-iter','200000','-salt','-in',str(source),'-pass','file:'+str(BASE/'recovery-key')],stdout=subprocess.PIPE)
 try:
  with target.open('wb') as out:
   out.write(b'OVLENC1\n'+b'0'*64+b'\n')
   while chunk:=process.stdout.read(1024*1024):mac.update(chunk);out.write(chunk)
   if process.wait()!=0:raise RuntimeError('Archive encryption failed')
   out.seek(8);out.write(mac.hexdigest().encode())
 finally:
  process.stdout.close()
  if process.poll() is None:process.kill();process.wait()
def decrypt(source,target):
 with source.open('rb') as inp:
  if inp.readline()!=b'OVLENC1\n':raise ValueError('Unknown archive format')
  expected=inp.readline().strip().decode();cipher=target.with_suffix('.cipher');mac=hmac.new((BASE/'recovery-key').read_bytes(),digestmod=hashlib.sha256)
  with cipher.open('wb') as out:
   while chunk:=inp.read(1024*1024):mac.update(chunk);out.write(chunk)
 if not hmac.compare_digest(expected,mac.hexdigest()):cipher.unlink();raise ValueError('Encrypted archive authentication failed')
 try:run(['openssl','enc','-d','-aes-256-cbc','-pbkdf2','-iter','200000','-in',str(cipher),'-out',str(target),'-pass','file:'+str(BASE/'recovery-key')])
 finally:cipher.unlink(missing_ok=True)
def backup(source,key,state):
 s=source.stat();signature=[s.st_size,s.st_mtime_ns]
 prior=state.get(str(source))
 if prior and prior['fingerprint']==signature:return
 with tempfile.TemporaryDirectory(prefix='encrypted-',dir=SCRATCH) as tmp:
  target=pathlib.Path(tmp)/'archive.enc';encrypt(source,target)
  if [source.stat().st_size,source.stat().st_mtime_ns]!=signature:raise RuntimeError('Backup file changed during upload')
  run(['node',NODE,'import-file','backups',key,str(target)])
 with STATE_LOCK:
  state[str(source)]={'fingerprint':signature,'key':key,'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'encrypted':True}
  atomic(BASE/'backup-receipts.json',state)
 print(json.dumps({'backup':source.name,'verified':True}),flush=True)
def sync(include_backups=False):
 init()
 for ns,root in ROOTS.items():
  if pathlib.Path(root).exists():run(['node',NODE,'import',ns,root])
 managed=workspace_roots()
 for root in managed:
  if pathlib.Path(root).exists():run(['node',NODE,'import','workspaces',root,hashlib.sha256(workspace_storage_identity(root).encode()).hexdigest()[:20]])
 if not include_backups:return
 receipt=BASE/'backup-receipts.json';state=json.loads(receipt.read_text()) if receipt.exists() else {}
 hour=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%d-%H')
 # Full database snapshots include authentication and the new file index, all encrypted.
 for name,command in [
   ('whoxos',['runuser','-u','postgres','--','pg_dump','-Fc','-d','whoxos']),
   ('studio',['docker','exec','whox-studio-supabase-db','pg_dump','-U','postgres','-d','postgres','-Fc']),
 ]:
  marker='database:'+name+':'+hour
  if marker not in state:
   with tempfile.TemporaryDirectory(prefix='full-db-',dir=SCRATCH) as tmp:
    dump=pathlib.Path(tmp)/(name+'.dump')
    with dump.open('wb') as out:subprocess.run(command,stdout=out,check=True)
    key=name+'-database/full-'+hour+'.dump.enc';backup(dump,key,state)
    state[marker]=state.pop(str(dump));atomic(receipt,state)
 with tempfile.TemporaryDirectory(prefix='db-snapshot-',dir=SCRATCH) as tmp:
  snapshot=pathlib.Path(tmp)/'admin.sqlite'
  with sqlite3.connect('file:/.WHOX/.System/.Admin/data/app.db?mode=ro',uri=True) as original,sqlite3.connect(snapshot) as copy:original.backup(copy)
  backup(snapshot,'admin-database/'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%d-%H%M%S')+'.sqlite.enc',state)
  del state[str(snapshot)];atomic(receipt,state)
 # WMS uses live SQLite databases; use online snapshots, never copy WAL databases raw.
 for source in pathlib.Path('/var/lib/docker/volumes/tql-wms_data/_data').glob('*.db'):
  with tempfile.TemporaryDirectory(prefix='wms-db-',dir=SCRATCH) as tmp:
   snapshot=pathlib.Path(tmp)/source.name
   with sqlite3.connect('file:'+str(source)+'?mode=ro',uri=True) as original,sqlite3.connect(snapshot) as copy:original.backup(copy)
   backup(snapshot,'wms-database/'+hour+'-'+source.name+'.enc',state);del state[str(snapshot)];atomic(receipt,state)
 source=pathlib.Path('/var/lib/docker/volumes/tql-wms_data/_data/crm.sqlite3')
 if source.exists():
  with tempfile.TemporaryDirectory(prefix='wms-crm-',dir=SCRATCH) as tmp:
   snapshot=pathlib.Path(tmp)/source.name
   with sqlite3.connect('file:'+str(source)+'?mode=ro',uri=True) as original,sqlite3.connect(snapshot) as copy:original.backup(copy)
   backup(snapshot,'wms-database/'+hour+'-crm.sqlite3.enc',state);del state[str(snapshot)];atomic(receipt,state)
 backups=pathlib.Path('/.WHOX/.System/overview-labs/home/.whox/instances/default/data/backups')
 with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
  # A new SQL gzip is written in place; wait until it is stable before uploading.
  futures=[executor.submit(backup,p,'whoxos-database/'+p.name+'.enc',state) for p in sorted(backups.glob('*.sql.gz')) if time.time()-p.stat().st_mtime>=600 and p.stat().st_size>0]
  for future in futures:future.result()
 # Compressed deployment archives are cold rollback material; they are encrypted before leaving the host.
 deployment=pathlib.Path('/.WHOX/.System/overview-labs/deployment')
 archives=list(deployment.rglob('*.tar.zst'))
 for p in archives:
  if p.is_symlink():continue
  backup(p,'deployment-archives/'+str(p.relative_to(deployment))+'.enc',state)
 for p in pathlib.Path('/.WHOX/.System/wms-deployment/backups').glob('**/*.tar.gz'):
  if p.is_symlink():continue
  backup(p,'wms-archives/'+str(p.relative_to('/.WHOX/.System/wms-deployment/backups'))+'.enc',state)
 # Preserve a remotely recoverable path-to-object receipt without storing recovery keys.
 run(['node',NODE,'import-file','backups','index/backup-receipts.json',str(receipt)])
 run(['node',NODE,'checkpoint'])
 atomic(BASE/'maintenance-status.json',{'completedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'backups':len(state),'roots':ROOTS,'workspaces':managed,'workspaceIdentities':{hashlib.sha256(workspace_storage_identity(root).encode()).hexdigest()[:20]:workspace_storage_identity(root) for root in managed}})
 run(['node','/usr/local/libexec/overview-file-store/catalog.mjs'])
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('action',choices=['sync','decrypt']);parser.add_argument('--backups',action='store_true');parser.add_argument('--source');parser.add_argument('--destination');args=parser.parse_args()
 if args.action=='decrypt':decrypt(pathlib.Path(args.source),pathlib.Path(args.destination))
 else:
  with (BASE/'maintenance.lock').open('a') as lock:
   fcntl.flock(lock,fcntl.LOCK_EX);sync(args.backups)
