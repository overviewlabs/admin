#!/usr/bin/python3
"""One WHOX service lifecycle for the control plane and its Python Admin worker."""
import os
import signal
import pwd
import subprocess
import time
from pathlib import Path

ROOT = Path('/.WHOX/.System/.Admin')
SOCKET = Path('/run/overview-labs-admin/app.sock')
stopping = False
children = []

def stop(signum, _frame):
    global stopping
    stopping = True
    for child in children:
        if child.poll() is None:
            child.send_signal(signal.SIGTERM)

signal.signal(signal.SIGTERM, stop)
signal.signal(signal.SIGINT, stop)

def start_admin():
    SOCKET.unlink(missing_ok=True)
    env = dict(os.environ, HOME='/root', USER='root', LOGNAME='root', SHELL='/bin/bash', CPTR_DATA_DIR=str(ROOT / 'data'),
               CPTR_CORS_ALLOWED_ORIGINS='https://overviewlabs.ai',
               PYTHONDONTWRITEBYTECODE='1', PYTHONUNBUFFERED='1')
    env.pop('NOTIFY_SOCKET', None)
    child = subprocess.Popen([str(ROOT / 'venv/bin/cptr'), 'run', '--headless', '--uds', str(SOCKET)],
                             cwd='/', env=env, umask=0o007)
    children.append(child)
    return child

admin = start_admin()
account = pwd.getpwnam('whox')
api_env = dict(os.environ, HOME='/WHOX/.System/overview-labs/home', USER='whox', LOGNAME='whox', SHELL='/bin/bash')
api = subprocess.Popen(['/WHOX/.System/overview-labs/home/.local/bin/whox',
                        'run', '--instance', 'default'], env=api_env,
                       cwd=api_env['HOME'], user=account.pw_uid, group=account.pw_gid,
                       extra_groups=os.getgrouplist('whox', account.pw_gid))
subprocess.run(['/usr/bin/python3', '/usr/local/libexec/overview-root-executor/bind.py', '--pid', str(api.pid)], check=True)
children.append(api)
next_admin_start = 0.0
try:
    while not stopping and api.poll() is None:
        if admin.poll() is not None and time.monotonic() >= next_admin_start:
            print('Restarting the Admin worker within WHOX', flush=True)
            children.remove(admin)
            admin = start_admin()
            next_admin_start = time.monotonic() + 10
        time.sleep(0.5)
finally:
    stop(signal.SIGTERM, None)
    deadline = time.monotonic() + 280
    for child in children:
        try:
            child.wait(timeout=max(1, deadline - time.monotonic()))
        except subprocess.TimeoutExpired:
            child.kill()
            child.wait()
    SOCKET.unlink(missing_ok=True)
raise SystemExit(api.returncode or 0)
