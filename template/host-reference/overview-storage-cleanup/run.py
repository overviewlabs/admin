#!/usr/bin/python3
"""Daily bounded cleanup; preserve application data and tagged rollback images."""
import datetime,fcntl,json,os,subprocess,sys
from pathlib import Path
STATE=Path('/var/lib/overview-storage-cleanup');STATE.mkdir(mode=0o700,exist_ok=True)
def disks():
 result={}
 for p in ['/','/.WHOX']:
  s=os.statvfs(p);result[p]={'usedBytes':(s.f_blocks-s.f_bfree)*s.f_frsize,'availableBytes':s.f_bavail*s.f_frsize}
 return result
with (STATE/'run.lock').open('a') as lock:
 try:fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
 except BlockingIOError:sys.exit('Cleanup already running')
 status={'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'before':disks(),'steps':[]}
 def step(name,args,timeout=3600):
  print('Starting '+name,flush=True)
  try:
   r=subprocess.run(args,text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=timeout)
   item={'name':name,'ok':r.returncode==0,'exitCode':r.returncode,'output':r.stdout[-6000:]}
  except Exception as e:item={'name':name,'ok':False,'error':str(e)}
  status['steps'].append(item);print(json.dumps(item),flush=True)
 step('verified-release-offload',['/usr/bin/python3','/usr/local/libexec/overview-storage-cleanup/cold.py','offload'],10800)
 step('verified-local-file-and-backup-cache',['systemctl','start','overview-files-cache.service'],1800)
 for builder in ['whox-studio-isolated','tql-wms-isolated']:
  step(builder+'-unused-build-cache',['docker','buildx','prune','--builder',builder,'--force','--filter','until=24h','--reserved-space','2GB'],1800)
 step('default-unused-build-cache',['docker','builder','prune','--force','--filter','until=24h'],1800)
 step('old-dangling-images',['docker','image','prune','--force','--filter','until=168h'],600)
 step('package-download-cache',['apt-get','clean'],300)
 step('journal-retention',['journalctl','--vacuum-size=512M','--vacuum-time=14d'],300)
 status.update(finishedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),after=disks())
 status['ok']=all(s['ok'] for s in status['steps'])
 target=STATE/'last-run.json';temp=target.with_suffix('.new');temp.write_text(json.dumps(status,indent=2)+'\n');temp.chmod(0o600);temp.replace(target)
 print(json.dumps({'ok':status['ok'],'before':status['before'],'after':status['after']}),flush=True)
 sys.exit(0 if status['ok'] else 1)
