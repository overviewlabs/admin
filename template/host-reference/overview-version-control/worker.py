import json
from pathlib import Path
from registry import reconcile
from sync import Sync
results=[]
for cfg in reconcile():
 Sync(cfg).run()
 p=Path(cfg['stateDir'])/'status.json'
 results.append({'workspaceId':cfg['workspaceId'],'name':cfg['name'],**json.loads(p.read_text())})
Path('/var/lib/overview-version-control/status.json').write_text(json.dumps(results,indent=2)+'\n')
