#!/usr/bin/python3
"""Bind the root broker to an API PID selected by the server operator."""
import argparse
import json
import os
from pathlib import Path
from executor import process_stamp

parser = argparse.ArgumentParser()
parser.add_argument('--pid', type=int, required=True)
args = parser.parse_args()
if os.geteuid() != 0:
    raise SystemExit('Only root can register a control-plane process')
status = Path(f'/proc/{args.pid}/status').read_text().splitlines()
uid = int(next(row for row in status if row.startswith('Uid:')).split()[1])
gid = int(next(row for row in status if row.startswith('Gid:')).split()[1])
if uid == 0:
    raise SystemExit('The control-plane process must remain unprivileged')
config = dict(pid=args.pid, uid=uid, gid=gid, startTime=process_stamp(args.pid))
root = Path('/etc/overview-labs')
root.mkdir(mode=0o755, exist_ok=True)
if root.stat().st_uid != 0 or root.stat().st_mode & 0o022:
    raise SystemExit('Configuration directory must be root-owned and not group/world writable')
target = root / 'root-executor-process.json'
temp = root / 'root-executor-process.json.new'
fd = os.open(temp, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
with os.fdopen(fd, 'w') as f:
    json.dump(config, f)
    f.flush()
    os.fsync(f.fileno())
os.replace(temp, target)
print(f'Bound production root executor to API PID {args.pid}; grants are unchanged.')
