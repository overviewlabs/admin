#!/usr/bin/env python3
"""Small, independent VPS health probe for WHOXOS."""

import json
import os
import re
from urllib.parse import urljoin
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path

STATE_DIR = Path('/var/lib/overview-labs-health')
STATE_FILE = STATE_DIR / 'latest.json'


def command(name, argv, timeout=10):
    try:
        result = subprocess.run(argv, capture_output=True, text=True, timeout=timeout, check=False)
        return {'ok': result.returncode == 0, 'detail': (result.stdout or result.stderr).strip()[:300]}
    except (OSError, subprocess.TimeoutExpired) as exc:
        return {'ok': False, 'detail': str(exc)[:300]}


checks = {}
checks['whox_service'] = command('whox_service', [
    'systemctl', 'is-active', 'WHOXOS.service',
])
checks['postgres'] = command('postgres', ['pg_isready', '-h', '127.0.0.1', '-p', '5432'])
try:
    with urllib.request.urlopen('http://127.0.0.1:3100/api/health', timeout=10) as response:
        health = json.load(response)
    checks['api'] = {
        'ok': health.get('status') == 'ok' and health.get('databaseBackup', {}).get('status') == 'ok',
        'detail': {
            'status': health.get('status'),
            'databaseBackup': health.get('databaseBackup', {}).get('status'),
            'backupWarnings': health.get('databaseBackup', {}).get('warnings', []),
        },
    }
except (OSError, ValueError, urllib.error.URLError) as exc:
    checks['api'] = {'ok': False, 'detail': str(exc)[:300]}

# Exercise the same document and asset paths that browsers need. API health can
# remain green even when an unreadable frontend makes every page return 500.
try:
    base = 'http://127.0.0.1:3100'
    with urllib.request.urlopen(base + '/OVE/projects', timeout=10) as response:
        html = response.read().decode('utf-8')
        if 'text/html' not in response.headers.get('Content-Type', '') or 'id="root"' not in html:
            raise ValueError('UI route did not return the application HTML')
    match = re.search(r'<script[^>]+src="([^"\s]+\.js[^"\s]*)"', html)
    if not match or not match[1].startswith('/') or match[1].startswith('//'):
        raise ValueError('UI HTML has no same-origin JavaScript entry')
    with urllib.request.urlopen(urljoin(base, match[1]), timeout=10) as response:
        if 'javascript' not in response.headers.get('Content-Type', ''):
            raise ValueError('UI entry did not return JavaScript')
    checks['ui'] = {'ok': True, 'detail': 'Projects HTML and JavaScript entry load'}
except (OSError, ValueError, urllib.error.URLError) as exc:
    checks['ui'] = {'ok': False, 'detail': str(exc)[:300]}

disk = os.statvfs('/')
free_fraction = disk.f_bavail / disk.f_blocks if disk.f_blocks else 0
checks['disk'] = {'ok': free_fraction >= 0.10, 'detail': {'freePercent': round(100 * free_fraction, 2)}}

available_kib = 0
with open('/proc/meminfo', encoding='utf-8') as meminfo:
    for line in meminfo:
        if line.startswith('MemAvailable:'):
            available_kib = int(line.split()[1])
            break
checks['memory'] = {'ok': available_kib >= 1024 * 1024, 'detail': {'availableMiB': available_kib // 1024}}

report = {
    'checkedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
    'ok': all(check['ok'] for check in checks.values()),
    'checks': checks,
}
STATE_DIR.mkdir(mode=0o755, parents=True, exist_ok=True)
fd, temporary = tempfile.mkstemp(prefix='latest-', suffix='.json', dir=STATE_DIR)
try:
    with os.fdopen(fd, 'w', encoding='utf-8') as output:
        json.dump(report, output, sort_keys=True, indent=2)
        output.write('\n')
    os.chmod(temporary, 0o644)
    os.replace(temporary, STATE_FILE)
finally:
    if os.path.exists(temporary):
        os.unlink(temporary)
print(json.dumps(report, sort_keys=True))
sys.exit(0 if report['ok'] else 1)
