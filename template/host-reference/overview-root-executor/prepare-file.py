#!/usr/bin/python3
"""Prepare a bounded hash-checked file transfer; never execute it or grant access."""
import argparse, base64, gzip, hashlib, json, pathlib, shlex
COMMAND_LIMIT = 32000

def prepare(source, destination, expected, baseline=None, mode=0o755, lock=None):
    data = pathlib.Path(source).read_bytes()
    if hashlib.sha256(data).hexdigest() != expected:
        raise ValueError('Source does not match the approved SHA-256')
    if not pathlib.Path(destination).is_absolute():
        raise ValueError('Destination must be absolute')
    if lock and not pathlib.Path(lock).is_absolute():
        raise ValueError('Lock must be absolute')
    payload = json.dumps({'path':str(destination),'sha':expected,'baseline':baseline,'mode':mode,
        'data':base64.b64encode(gzip.compress(data,mtime=0)).decode(),'lock':lock})
    script = '''import base64,gzip,hashlib,json,os,pathlib,tempfile,fcntl
p=json.loads(PAYLOAD)
lock=open(p['lock'],'a') if p['lock'] else None
if lock: fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
blob=gzip.decompress(base64.b64decode(p['data'],validate=True))
assert hashlib.sha256(blob).hexdigest()==p['sha'], 'Transfer digest mismatch'
target=pathlib.Path(p['path'])
assert not target.is_symlink(), 'Destination is a symlink'
current=hashlib.sha256(target.read_bytes()).hexdigest() if target.exists() else None
assert current==p['sha'] or current==p['baseline'], 'Destination baseline changed'
if current!=p['sha']:
 fd,name=tempfile.mkstemp(prefix='.verified-install-',dir=target.parent)
 try:
  with os.fdopen(fd,'wb') as f: f.write(blob);f.flush();os.fsync(f.fileno())
  os.chmod(name,p['mode'])
  if target.exists():
   s=target.stat();os.chown(name,s.st_uid,s.st_gid)
  os.replace(name,target)
  d=os.open(target.parent,os.O_RDONLY);os.fsync(d);os.close(d)
 finally: pathlib.Path(name).unlink(missing_ok=True)
print(json.dumps({'installedSha256':p['sha'],'changed':current!=p['sha']}))
'''.replace('PAYLOAD',repr(payload))
    command='/usr/bin/python3 -c '+shlex.quote(script)
    if len(command)>COMMAND_LIMIT:
        raise ValueError('Compressed command exceeds 32000 characters; use separately verified staged chunks')
    return command

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source');parser.add_argument('destination');parser.add_argument('--sha256',required=True)
    parser.add_argument('--baseline-sha256');parser.add_argument('--mode',default='755');parser.add_argument('--lock-file')
    parser.add_argument('--output',required=True)
    args=parser.parse_args()
    command=prepare(args.source,args.destination,args.sha256,args.baseline_sha256,int(args.mode,8),args.lock_file)
    output=pathlib.Path(args.output);output.write_text(command);output.chmod(0o600)
    print(json.dumps({'commandCharacters':len(command),'limit':COMMAND_LIMIT,'executed':False}))
