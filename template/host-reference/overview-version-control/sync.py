#!/usr/bin/python3 -I
"""Owner-authorized source snapshots; never deploy, rebase, reset or force push."""
import fcntl, hashlib, json, os, re, subprocess, tempfile, time
from pathlib import Path

class Pause(Exception): pass

class Sync:
    def __init__(self,cfg,active=None,identity=None,secrets=None):
        self.cfg=cfg;self.repo=Path(cfg['repo']);self.state=Path(cfg['stateDir']);self.state.mkdir(parents=True,exist_ok=True,mode=0o700)
        self.active=active or self.active_runs;self.identity=identity or self.check_identity;self.secrets=secrets or self.runtime_secrets
        self.env={**os.environ,'GH_CONFIG_DIR':'/root/.config/gh','GH_PROMPT_DISABLED':'1','GIT_TERMINAL_PROMPT':'0'}
        for key in ('GIT_INDEX_FILE','GIT_DIR','GIT_WORK_TREE','GIT_CONFIG_COUNT','GIT_ASKPASS','SSH_ASKPASS'):
            self.env.pop(key,None)
    def git(self,*args,env=None,input=None):
        result=subprocess.run(['/usr/bin/git','-c',f'safe.directory={self.repo}','-c','credential.helper=','-c','credential.helper=!/usr/bin/gh auth git-credential','-C',str(self.repo),*args],input=input,capture_output=True,env=env or self.env,timeout=90)
        if result.returncode: raise Pause('Git command failed: '+args[0]+' (inspect the repository or GitHub access)')
        return result.stdout
    def active_runs(self):
        query="SELECT count(*) FROM heartbeat_runs WHERE company_id='"+self.cfg['companyId']+"' AND status='running'"
        result=subprocess.run(['/usr/sbin/runuser','-u','postgres','--','/usr/bin/psql','-d','whoxos','-At','-c',query],capture_output=True,text=True,timeout=15)
        if result.returncode:raise Pause('Unable to check active team tasks')
        return int(result.stdout.strip())>0
    def check_identity(self):
        result=subprocess.run(['/usr/bin/gh','api','user','--jq','.login'],env=self.env,capture_output=True,text=True,timeout=25)
        if result.returncode or result.stdout.strip()!=self.cfg['login']:raise Pause('Expected GitHub owner account is unavailable')
    def runtime_secrets(self):
        values=[]
        for p in [self.repo/'.env',self.repo/'deploy/.compose.env',*list((self.repo/'deploy').glob('*.env')),*list((self.repo/'deploy/standalone').glob('*.env')),*list((self.repo/'portal-infra/secrets').glob('*.env'))]:
            if p.exists():
                for line in p.read_text().splitlines():
                    k,sep,v=line.partition('=');v=v.strip().strip('\"\'')
                    if sep and any(t in k.upper() for t in ('SECRET','PASSWORD','TOKEN','KEY')) and len(v)>=8:values.append(v.encode())
        p=Path('/.WHOX/.System/wms-deployment/private/wms-login.json') if self.cfg['companyId']=='a5a8e5c4-220e-4396-9491-939cf1f18be0' else self.state/'unconfigured-login.json'
        if p.exists():
            v=json.loads(p.read_text()).get('password','')
            if len(v)>=8:values.append(v.encode())
        return values
    def blocked_path(self,name):
        parts=Path(name).parts;base=parts[-1].lower()
        return any(p in {'.whox-handoffs','runtime','.cptr','workspace','exports','node_modules','.venv','venv','__pycache__','.svelte-kit'} for p in parts) or ((base=='.env' or base.startswith('.env.') or base.endswith('.env')) and not base.endswith('.example')) or base in {'auth.json','credentials.json','config.toml'} or base.endswith(('.pem','.key','.p12','.pfx','.db','.sqlite','.sqlite3','.log','.tar.gz','.zip'))
    def changes(self):
        names=self.git('ls-files','--modified','--deleted','--others','--exclude-standard','-z').decode().split('\0')
        return sorted(set(n for n in names if n))
    def fingerprint(self,names):
        h=hashlib.sha256();h.update(self.git('rev-parse','HEAD'))
        for name in names:
            h.update(name.encode());p=self.repo/name
            if p.is_symlink():raise Pause('Symlink change needs manual review: '+name)
            if p.exists():
                s=p.stat();h.update(str((s.st_mode,s.st_mtime_ns,s.st_size)).encode());h.update(p.read_bytes())
            else:h.update(b'deleted')
        return h.hexdigest()
    def scan(self,names):
        secret_values=self.secrets()
        pattern=re.compile(rb'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bgh[pousr]_[A-Za-z0-9_]{30,}|\bgithub_pat_[A-Za-z0-9_]{30,}|\bAKIA[A-Z0-9]{16}\b')
        for name in names:
            if self.blocked_path(name):raise Pause('Private/runtime path needs review: '+name)
            p=self.repo/name
            if not p.exists():continue
            if p.stat().st_size>50*1024*1024:raise Pause('Large file needs manual review: '+name)
            data=p.read_bytes()
            if pattern.search(data) or any(v in data for v in secret_values):raise Pause('Possible credential detected in: '+name)
    def save(self,status,**extra):
        p=self.state/'status.json';temp=p.with_suffix('.new');temp.write_text(json.dumps({'status':status,'checkedAt':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),**extra},indent=2)+'\n');temp.chmod(0o600);os.replace(temp,p)
        with (self.state/'audit.jsonl').open('a') as f:f.write(json.dumps({'at':time.time(),'status':status,**extra})+'\n')
        if not self.cfg.get('quietOutput'):print(json.dumps({'status':status,**extra}))
    def run(self):
        with (self.state/'lock').open('a') as lock:
            try:fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
            except BlockingIOError:return self.save('waiting',reason='Sync already running')
            try:self.sync()
            except Pause as e:self.save('paused',reason=str(e))
            except Exception as e:self.save('error',reason='Sync failed: '+type(e).__name__+'; inspect host service')
    def sync(self):
        if self.git('remote','get-url','origin').decode().strip()!=self.cfg['remote']:raise Pause('Repository origin changed')
        if self.git('symbolic-ref','--short','HEAD').decode().strip()!=self.cfg['branch']:raise Pause('Checkout is not on the configured branch')
        gd=Path(self.git('rev-parse','--absolute-git-dir').decode().strip())
        if any((gd/n).exists() for n in ('MERGE_HEAD','CHERRY_PICK_HEAD','REVERT_HEAD','rebase-merge','rebase-apply','index.lock')):return self.save('waiting',reason='Git operation in progress')
        if self.git('diff','--cached','--name-only'):return self.save('waiting',reason='Manually staged changes are preserved')
        if self.active():return self.save('waiting',reason='Team task is running')
        names=self.changes();fingerprint=self.fingerprint(names)
        observation=self.state/'observation.json';previous=json.loads(observation.read_text()) if observation.exists() else {}
        now=time.time()
        if previous.get('fingerprint')!=fingerprint:
            observation.write_text(json.dumps({'fingerprint':fingerprint,'since':now}));previous={'since':now}
        quiet=now-previous.get('since',now)
        if names and quiet<self.cfg['quietSeconds']:return self.save('waiting',reason='Source changes are settling',files=len(names),quietSeconds=round(quiet))
        self.identity()
        exists=self.git('ls-remote','origin','refs/heads/'+self.cfg['branch']).decode().strip()
        if not exists and not self.cfg.get('allowNewBranch'):raise Pause('Configured GitHub branch is unavailable')
        self.git('fetch','--no-tags','origin',self.cfg['branch'] if exists else self.cfg['defaultBranch'])
        head=self.git('rev-parse','HEAD').decode().strip();remote=self.git('rev-parse','FETCH_HEAD').decode().strip()
        ancestry=['merge-base',*(['--is-ancestor'] if exists else []),remote,head]
        ancestor=subprocess.run(['/usr/bin/git','-c',f'safe.directory={self.repo}','-C',str(self.repo),*ancestry],capture_output=True)
        if ancestor.returncode:raise Pause('GitHub has changes not in this checkout; reconcile manually before syncing')
        commit=head
        if names:
            self.scan(names)
            # Holding the real index lock prevents other Git writers while an
            # alternate index snapshots files. Failed checks leave HEAD/index intact.
            try:fd=os.open(gd/'index.lock',os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o664)
            except FileExistsError:return self.save('waiting',reason='Git index is busy')
            os.close(fd)
            try:
                if self.git('diff','--cached','--name-only'):raise Pause('Changes were staged while sync was starting')
                with tempfile.TemporaryDirectory(dir=self.state,prefix='snapshot-') as folder:
                    alternate=Path(folder)/'index';env={**self.env,'GIT_INDEX_FILE':str(alternate)}
                    self.git('read-tree','HEAD',env=env)
                    self.git('add','--all','--',*names,env=env)
                    staged=self.git('diff','--cached','--name-only',env=env)
                    if staged:
                        tree=self.git('write-tree',env=env).decode().strip()
                        if self.active() or self.fingerprint(self.changes())!=fingerprint:raise Pause('Source changed during snapshot; retry after it settles')
                        message=('chore: sync '+self.cfg.get('name','organization')+' source updates\n\nAutomatic source snapshot; not a deployment or test result.\n\nCo-Authored-By: Overview Labs <noreply@overviewlabs.ai>\n').encode()
                        commit_env={**env,'GIT_AUTHOR_NAME':self.cfg['authorName'],'GIT_AUTHOR_EMAIL':self.cfg['authorEmail'],'GIT_COMMITTER_NAME':self.cfg['authorName'],'GIT_COMMITTER_EMAIL':self.cfg['authorEmail']}
                        commit=self.git('commit-tree',tree,'-p',head,env=commit_env,input=message).decode().strip()
                        # Read-tree writes are complete before replacing the real index.
                        (gd/'index.lock').write_bytes(alternate.read_bytes())
                        self.git('update-ref','-m','automatic organization source snapshot','HEAD',commit,head)
                        os.replace(gd/'index.lock',gd/'index')
            finally:(gd/'index.lock').unlink(missing_ok=True)
        if commit!=remote or not exists:
            self.git('push','origin',f'HEAD:refs/heads/{self.cfg["branch"]}')
            actual=self.git('ls-remote','origin',f'refs/heads/{self.cfg["branch"]}').decode().split()[0]
            if actual!=commit:raise Pause('Push verification did not match the local commit')
            self.save('synced',commit=commit,files=len(names),login=self.cfg['login'])
        else:self.save('up_to_date',commit=commit)

