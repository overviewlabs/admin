#!/usr/bin/env python3
"""Generate private per-install configuration without overwriting an existing file."""
import argparse,os,secrets
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--output',type=Path,default=Path(__file__).resolve().parents[1]/'.env');p.add_argument('--url',default='http://localhost:3100');a=p.parse_args()
if '\n' in a.url or '\r' in a.url or not a.url.startswith(('http://','https://')):p.error('--url must be an HTTP(S) URL')
os.umask(0o077)
values={'OVERVIEW_PORT':'3100','WHOXOS_PUBLIC_URL':a.url,'POSTGRES_PASSWORD':secrets.token_hex(32),'BETTER_AUTH_SECRET':secrets.token_hex(32),'WHOXOS_TOOL_ACTION_SIGNING_SECRET':secrets.token_hex(32)}
try:
 with a.output.open('x') as f:f.write('# Private configuration. Never commit this file.\n'+''.join(k+'='+v+'\n' for k,v in values.items()))
except FileExistsError:p.exit(1,'Configuration already exists; edit it explicitly instead of replacing its secrets.\n')
print('Created '+str(a.output)+' with fresh private secrets.')
