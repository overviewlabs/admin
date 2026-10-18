#!/usr/bin/python3
"""Verified encrypted cold storage for finalized release snapshots."""
import argparse,contextlib,datetime,fcntl,hashlib,json,os,shutil,subprocess,sys,tarfile,tempfile,time
from pathlib import Path
sys.path.insert(0,'/usr/local/libexec/overview-file-store')
from maintenance import encrypt,decrypt
ROOT=Path('/var/lib/overview-version-control/releases')
STATE=Path('/var/lib/overview-storage-cleanup')
SCRATCH=Path('/.WHOX/.System/storage-cleanup-scratch')
REMOTE='/usr/local/libexec/overview-storage-cleanup/remote.mjs'
def run(args,**kw):return subprocess.run(args,check=True,timeout=1800,**kw)
def atomic(p,value):
 q=p.with_suffix('.new');q.write_text(json.dumps(value,indent=2)+'\n');q.chmod(0o600);q.replace(p)
def digest(p):
 with p.open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()
def signature(folder):
 rows=[]
 for root,dirs,files in os.walk(folder,followlinks=False):
  for name in sorted(dirs+files):
   p=Path(root)/name
   if p.name in ('cold.json','cold.new'):continue
   s=p.lstat();rows.append((str(p.relative_to(folder)),s.st_mode,s.st_size,s.st_mtime_ns,os.readlink(p) if p.is_symlink() else ''))
 return hashlib.sha256(json.dumps(sorted(rows)).encode()).hexdigest()
def mounted():
 ids=subprocess.check_output(['docker','ps','-aq'],text=True,timeout=60).split()
 if not ids:return []
 # Every container is included, even stopped containers that might be restarted.
 data=json.loads(subprocess.check_output(['docker','inspect',*ids],timeout=60))
 return [m['Source'] for c in data for m in c.get('Mounts',[])]
def in_use(folder,paths):
 prefix=str(folder)+'/'
 if any(p==str(folder) or p.startswith(prefix) for p in paths):return True
 for p in Path('/proc').iterdir():
  if not p.name.isdigit():continue
  try:refs=[p/'cwd',*(p/'fd').iterdir()]
  except OSError:continue
  for ref in refs:
   try:target=os.readlink(ref)
   except OSError:continue
   if target==str(folder) or target.startswith(prefix):return True
 return False

def download(folder,tmp):
 receipt=json.loads((folder/'cold.json').read_text())
 pointer=tmp/'pointer.json';atomic(pointer,receipt['remote'])
 encrypted=tmp/'snapshot.enc';archive=tmp/'snapshot.tar.zst'
 run(['node',REMOTE,'get',str(pointer),str(encrypted)])
 decrypt(encrypted,archive)
 if digest(archive)!=receipt['archiveSha256']:raise RuntimeError('Snapshot archive checksum mismatch')
 return archive

def extract(archive,destination):
 destination.mkdir(mode=0o700)
 proc=subprocess.Popen(['zstd','-q','-d','-c',str(archive)],stdout=subprocess.PIPE)
 try:
  with tarfile.open(fileobj=proc.stdout,mode='r|') as tar:tar.extractall(destination,filter='data')
  if proc.wait()!=0:raise RuntimeError('Snapshot decompression failed')
 finally:
  proc.stdout.close()
  if proc.poll() is None:proc.kill();proc.wait()

@contextlib.contextmanager
def release_lock(folder):
 locks=STATE/'locks';locks.mkdir(mode=0o700,parents=True,exist_ok=True)
 name=hashlib.sha256(str(folder).encode()).hexdigest()+'.lock'
 with (locks/name).open('a') as lock:
  fcntl.flock(lock,fcntl.LOCK_EX);yield

def ensure_local(folder,verify_only=False):
 folder=Path(folder).resolve()
 if not folder.is_relative_to(ROOT) or len(folder.relative_to(ROOT).parts)!=2:raise ValueError('Invalid release folder')
 with release_lock(folder):
  if not (folder/'cold.json').exists():return
  SCRATCH.mkdir(mode=0o700,parents=True,exist_ok=True)
  with tempfile.TemporaryDirectory(dir=SCRATCH,prefix='restore-') as temp:
   tmp=Path(temp);archive=download(folder,tmp);restored=tmp/'restored';extract(archive,restored)
   record=json.loads((restored/'record.json').read_text())
   if record['releaseId']!=folder.name:raise RuntimeError('Release identity mismatch')
   if digest(restored/'source.tar')!=record['sourceSha256']:raise RuntimeError('Restored source checksum mismatch')
   if verify_only:
    print(json.dumps({'restoreVerified':str(folder)}),flush=True);return
   for child in restored.iterdir():
    if child.name=='record.json':continue
    dest=folder/child.name
    if child.is_dir() and not child.is_symlink():
     shutil.copytree(child,dest,dirs_exist_ok=True,symlinks=True)
    else:
     if dest.is_symlink():dest.unlink()
     shutil.copy2(child,dest,follow_symlinks=False)
   (folder/'cold.json').unlink()
   print(json.dumps({'restored':str(folder)}),flush=True)

def eligible():
 paths=mounted();candidates=[]
 for workspace in ROOT.iterdir():
  if not workspace.is_dir() or workspace.is_symlink():continue
  records=[]
  for p in workspace.glob('release-*/record.json'):
   r=json.loads(p.read_text());records.append((p.parent,r))
  deployed=sorted(((p,r) for p,r in records if r.get('status')=='deployed'),key=lambda x:x[1]['createdAt'],reverse=True)
  keep={p for p,r in deployed[:2]}
  current=workspace/'current.json'
  if current.exists():keep.add(workspace/json.loads(current.read_text())['releaseId'])
  keep.update(p for p,r in records if r.get('status') not in ('deployed','failed'))
  # Rollback records can reference a different release's source tree.
  paths.extend(r.get('sourcePath','') for p,r in records if p in keep)
  for folder,r in records:
   if folder in keep or (folder/'cold.json').exists():continue
   if r.get('status') not in ('deployed','failed'):continue
   if time.time()-(folder/'record.json').stat().st_mtime<86400:continue
   if Path(r['sourcePath']).parent!=folder or Path(r['sourceArchive']).parent!=folder:continue
   if not (folder/'source.tar').is_file() or in_use(folder,paths):continue
   candidates.append(folder)
 return candidates

def offload():
 STATE.mkdir(mode=0o700,exist_ok=True);SCRATCH.mkdir(mode=0o700,parents=True,exist_ok=True)
 total=0;count=0
 with (STATE/'cold.lock').open('a') as lock:
  fcntl.flock(lock,fcntl.LOCK_EX)
  for folder in eligible():
   with release_lock(folder):
    print(json.dumps({'archiving':str(folder)}),flush=True)
    before=signature(folder)
    size=sum(p.lstat().st_blocks*512 for p in folder.rglob('*') if not p.is_symlink())
    with tempfile.TemporaryDirectory(dir=SCRATCH,prefix='offload-') as temp:
     tmp=Path(temp);archive=tmp/'snapshot.tar.zst';encrypted=tmp/'snapshot.enc'
     run(['tar','--zstd','-cf',str(archive),'-C',str(folder),'.'])
     if signature(folder)!=before:raise RuntimeError('Release changed while packaging')
     archive_sha=digest(archive);encrypt(archive,encrypted)
     key='release-snapshots/'+folder.parent.name+'/'+folder.name+'.tar.zst.enc'
     output=subprocess.check_output(['node',REMOTE,'put',key,str(encrypted)],text=True,timeout=1800)
     remote=json.loads(output.strip().splitlines()[-1])
     receipt={'schemaVersion':1,'remote':remote,'archiveSha256':archive_sha,'archivedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'localBytes':size}
     # Verify the complete download/decryption path before removing any local data.
     pointer=tmp/'pointer.json';atomic(pointer,remote);readback=tmp/'readback.enc';plain=tmp/'readback.tar.zst'
     run(['node',REMOTE,'get',str(pointer),str(readback)]);decrypt(readback,plain)
     if digest(plain)!=archive_sha:raise RuntimeError('Snapshot recovery verification failed')
     receipt_file=tmp/'receipt.json';atomic(receipt_file,receipt)
     run(['node',REMOTE,'put',key+'.receipt.json',str(receipt_file)],stdout=subprocess.DEVNULL)
     run(['node',REMOTE,'checkpoint'],stdout=subprocess.DEVNULL)
     if signature(folder)!=before or in_use(folder,mounted()):raise RuntimeError('Release became active; local copy retained')
     atomic(folder/'cold.json',receipt)
     for child in folder.iterdir():
      if child.name in ('record.json','cold.json'):continue
      if child.is_dir() and not child.is_symlink():shutil.rmtree(child)
      else:child.unlink()
     count+=1;total+=size
     print(json.dumps({'offloaded':str(folder),'bytes':size,'downloadDecryptVerified':True}),flush=True)
 atomic(STATE/'snapshot-status.json',{'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'releases':count,'bytes':total})
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('action',choices=['offload','restore','verify','plan']);p.add_argument('folder',nargs='?');a=p.parse_args()
 if a.action=='offload':offload()
 elif a.action=='plan':print(json.dumps([str(f) for f in eligible()],indent=2))
 else:ensure_local(a.folder,a.action=='verify')
