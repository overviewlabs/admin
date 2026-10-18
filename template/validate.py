#!/usr/bin/env python3
"""Validate template boundaries and content-pinned secret-scan findings."""
import argparse,hashlib,json,os,shutil,subprocess,tempfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser();parser.add_argument('--secrets',action='store_true');args=parser.parse_args()
required=['LICENSE','Dockerfile','pnpm-lock.yaml','pnpm-workspace.yaml','server/package.json','ui/package.json','template/configure.py','template/compose.yaml','TEMPLATE-SOURCE.json']
for name in required:
 if not (ROOT/name).is_file():raise SystemExit('Missing template file: '+name)
# Inspect versioned/exportable files; generated local dependencies are not template inputs.
if (ROOT/'.git').exists():
 paths=[ROOT/p.decode() for p in subprocess.check_output(['git','-C',str(ROOT),'ls-files','-z']).split(b'\0') if p]
else:
 paths=[]
 for base,dirs,files in os.walk(ROOT):
  dirs[:]=[d for d in dirs if d not in {'.git','node_modules','__pycache__','target','dist'}]
  paths.extend(Path(base)/f for f in files)
for p in paths:
 rel=p.relative_to(ROOT)
 if any(part in {'home','node_modules','.git','__pycache__'} or part.startswith('ui-dist') for part in rel.parts):raise SystemExit('Unexpected runtime path: '+str(rel))
 if p.name.startswith('.env') and not p.name.endswith(('.example','.sample','.template')):raise SystemExit('Private environment file in template: '+str(rel))
 if p.suffix in {'.sqlite','.sqlite3','.dump','.pem','.key','.p12','.pfx'}:raise SystemExit('Unexpected private/runtime file: '+str(rel))
 if p.is_symlink() and not p.resolve().is_relative_to(ROOT):raise SystemExit('External symlink: '+str(rel))
 if p.is_file() and p.stat().st_size>100*1024**2:raise SystemExit('File exceeds GitHub file limit: '+str(rel))
for p in ROOT.rglob('package.json'):
 if 'node_modules' in p.parts:continue
 json.loads(p.read_text())
with tempfile.TemporaryDirectory(prefix='overview-template-validation-') as temp:
 env=Path(temp)/'instance.env';second=Path(temp)/'another.env'
 for path in [env,second]:subprocess.run(['python3',str(ROOT/'template/configure.py'),'--output',str(path)],check=True,stdout=subprocess.DEVNULL)
 one=dict(line.split('=',1) for line in env.read_text().splitlines() if line and not line.startswith('#'))
 two=dict(line.split('=',1) for line in second.read_text().splitlines() if line and not line.startswith('#'))
 keys=['POSTGRES_PASSWORD','BETTER_AUTH_SECRET','WHOXOS_TOOL_ACTION_SIGNING_SECRET']
 assert len({one[k] for k in keys})==3 and all(one[k]!=two[k] and len(one[k])==64 for k in keys)
 before=env.read_bytes();refuse=subprocess.run(['python3',str(ROOT/'template/configure.py'),'--output',str(env)],capture_output=True)
 assert refuse.returncode!=0 and env.read_bytes()==before and env.stat().st_mode&0o077==0
 if shutil.which('docker'):
  subprocess.run(['docker','compose','--env-file',str(env),'-f',str(ROOT/'template/compose.yaml'),'config','--quiet'],check=True)
 if args.secrets:
  if not shutil.which('gitleaks'):raise SystemExit('Install gitleaks to run --secrets')
  report=Path(temp)/'scan.json'
  scan=subprocess.run(['gitleaks','detect','--no-git','--source','.', '--redact','--report-format','json','--report-path',str(report)],cwd=ROOT,capture_output=True,text=True)
  if scan.returncode not in (0,1):raise SystemExit('Secret scanner could not complete; inspect gitleaks installation')
  findings=json.loads(report.read_text()) if report.exists() else []
  accepted=json.loads((ROOT/'template/secret-fixtures.json').read_text())['reviewedFindings']
  known={(x['path'],x['rule'],x['start'],x['end'],x['lineSha256']) for x in accepted}
  unexpected=[]
  for row in findings:
   path=Path(row['File']);path=(ROOT/path).resolve() if not path.is_absolute() else path.resolve()
   rel=str(path.relative_to(ROOT));lines=path.read_text(errors='replace').splitlines()
   sha=hashlib.sha256('\n'.join(lines[row['StartLine']-1:row['EndLine']]).encode()).hexdigest()
   if (rel,row['RuleID'],row['StartLine'],row['EndLine'],sha) not in known:unexpected.append({'path':rel,'rule':row['RuleID'],'line':row['StartLine']})
  if unexpected:raise SystemExit('Unreviewed secret-scan findings: '+json.dumps(unexpected))
  print('Secret scan passed; '+str(len(findings))+' content-pinned synthetic/public-identifier matches reviewed.')
print('Template structure, JSON, fresh secrets, overwrite protection, and available Compose validation passed.')
