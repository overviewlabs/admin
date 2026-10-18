#!/usr/bin/env python3
"""Fixed-source local service diagnostics. Never exports raw log content."""
from __future__ import annotations

import datetime as dt
import json
import os
from pathlib import Path
import re
import selectors
import stat
import subprocess
import tempfile
import time

CACHE = Path('/var/lib/overview-labs-health/it-diagnostics.json')
HISTORY = CACHE.parent / 'it-diagnostics-history'
RETENTION = dt.timedelta(hours=24)
ARCHIVE_NAME = re.compile(r'^\d{13}-\d{13}-\d{13}\.json$')
POSTGRES_LOG = Path('/var/log/postgresql/postgresql-18-main.log')
MAX_JOURNAL_BYTES = 2 * 1024 * 1024
MAX_POSTGRES_BYTES = 1024 * 1024
MAX_ROWS = 2000
MAX_EVENTS = 100
COMMAND_TIMEOUT = 4.0
UTC = dt.timezone.utc
UNITS = frozenset(('WHOXOS.service', 'whoxos.service', 'overview-labs-health.service', 'overview-labs-searxng.service', 'caddy.service', 'postgresql@18-main.service'))
CODES = frozenset(('dns_failure', 'connection_refused', 'connection_closed', 'permission_denied', 'out_of_memory', 'provider_rate_limit', 'terminal_limit', 'service_failure', 'database_deadlock', 'database_unique_conflict', 'runtime_tool_context', 'run_log_unavailable', 'request_not_found', 'request_validation', 'request_conflict', 'warning', 'error', 'critical'))
PG_HEADER = re.compile(r'^(\d{4}-\d\d-\d\d \d\d:\d\d:\d\d(?:\.\d{1,6})?) (?:UTC|GMT) \[\d+\].*?\b(WARNING|ERROR|FATAL|PANIC):\s*(.*)$')
ANSI_ESCAPE = re.compile(r'\x1b\[[0-?]*[ -/]*[@-~]')
PRETTY_LEVEL = re.compile(r'^\[\d\d:\d\d:\d\d(?:\.\d+)?\]\s+(WARN|ERROR|FATAL)\b')


def iso(value: dt.datetime) -> str:
    return value.astimezone(UTC).isoformat(timespec='milliseconds').replace('+00:00', 'Z')


def classify(message: str, severity: str) -> str:
    # Classification is the only use of message content. No substring is returned.
    text = message.casefold()
    # Fixed classes distinguish failed probes from host service failures without exposing paths or payloads.
    if re.search(r'\bpost /(?:api/)?mcp/runtime-tools (409|422)\b', text):
        return 'runtime_tool_context'
    if re.search(r'\bget /(?:api/)?heartbeat-runs/[^ /]+/log 404\b', text):
        return 'run_log_unavailable'
    for status, code in [('404', 'request_not_found'), ('422', 'request_validation'), ('409', 'request_conflict')]:
        if re.search(r'\b(?:get|post|patch|delete) /\S+ ' + status + r'\b', text):
            return code
    for code, patterns in (
        ('database_deadlock', ('deadlock detected',)),
        ('database_unique_conflict', ('duplicate key value violates unique constraint',)),
        ('dns_failure', ('could not resolve', 'temporary failure in name resolution', 'eai_again', 'enotfound')),
        ('connection_refused', ('connection refused', 'econnrefused')),
        ('connection_closed', ('connection_close', 'connection closed', 'econnreset', 'broken pipe')),
        ('permission_denied', ('permission denied', 'eacces', 'eperm')),
        ('out_of_memory', ('out of memory', 'oom-kill', 'oom killer')),
        ('provider_rate_limit', ('rate limit', 'resource_exhausted', 'too many requests')),
        ('terminal_limit', ('terminal limit', 'terminal_limit')),
        ('service_failure', ('failed to start', 'main process exited', 'failed with result')),
    ):
        if any(pattern in text for pattern in patterns):
            return code
    return severity


def journal_message(value: object) -> str | None:
    # Journald encodes ANSI/other non-printable messages as byte arrays in JSON.
    if isinstance(value, list) and len(value) <= MAX_JOURNAL_BYTES and all(type(item) is int and 0 <= item <= 255 for item in value):
        return bytes(value).decode('utf-8', errors='replace')
    return value if isinstance(value, str) else None


def log_severity(message: str, priority: int) -> str | None:
    # Node stdout keeps journal priority INFO even for application errors. Trust
    # only known top-level logger fields/prefixes, never severity words in text.
    levels = []
    if 0 <= priority <= 4:
        levels.append('critical' if priority <= 2 else 'error' if priority == 3 else 'warning')
    clean = ANSI_ESCAPE.sub('', message)
    match = PRETTY_LEVEL.match(clean)
    if match:
        levels.append({'WARN': 'warning', 'ERROR': 'error', 'FATAL': 'critical'}[match.group(1)])
    elif clean.startswith('{'):
        try:
            row = json.loads(clean)
            level = row.get('level') if isinstance(row, dict) else None
            if type(level) in (int, str):
                mapped = {40: 'warning', 50: 'error', 60: 'critical', 'warn': 'warning', 'warning': 'warning',
                          'error': 'error', 'fatal': 'critical', 'panic': 'critical'}.get(level)
                if mapped:
                    levels.append(mapped)
        except (ValueError, TypeError):
            pass
    return max(levels, key=lambda value: {'warning': 1, 'error': 2, 'critical': 3}[value]) if levels else None


def source_result(source: str, status: str, scanned: int = 0, events: list | None = None, truncated: bool = False) -> dict:
    ordered = sorted(events or [], key=lambda event: event['timestamp'], reverse=True)
    return {'id': source, 'available': status == 'ok', 'status': status, 'scannedEntries': min(scanned, MAX_ROWS),
            'matchedEvents': len(ordered), 'truncated': truncated or len(ordered) > MAX_EVENTS,
            'coverageProvenance': 'bounded_scan', 'retentionVerified': False,
            'events': ordered[:MAX_EVENTS]}


def bounded_command(argv: list[str]) -> tuple[str, bytes, bool]:
    """No shell, inherited environment, stderr, unbounded output, or user arguments."""
    try:
        proc = subprocess.Popen(argv, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                                env={'PATH': '/usr/bin:/bin', 'LANG': 'C.UTF-8', 'TZ': 'UTC', 'SYSTEMD_PAGER': ''})
    except OSError:
        return 'unavailable', b'', False
    output = bytearray()
    deadline = time.monotonic() + COMMAND_TIMEOUT
    truncated = False
    status = 'ok'
    try:
        with selectors.DefaultSelector() as selector:
            selector.register(proc.stdout, selectors.EVENT_READ)
            while True:
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    status = 'timeout'
                    break
                if not selector.select(remaining):
                    status = 'timeout'
                    break
                chunk = os.read(proc.stdout.fileno(), 65536)
                if not chunk:
                    break
                budget = MAX_JOURNAL_BYTES - len(output)
                output.extend(chunk[:budget])
                if len(chunk) > budget or len(output) >= MAX_JOURNAL_BYTES:
                    truncated = True
                    break
        if status != 'ok' or truncated:
            proc.kill()
        code = proc.wait(timeout=1)
        if code != 0 and not truncated and status == 'ok':
            status = 'unavailable'
    except (OSError, subprocess.TimeoutExpired):
        status = 'timeout'
    finally:
        if proc.poll() is None:
            proc.kill()
            proc.wait(timeout=1)
        proc.stdout.close()
    return status, bytes(output), truncated


def journal_events(raw: bytes, since: dt.datetime, until: dt.datetime) -> tuple[list, int]:
    events = []
    rows = raw.splitlines()[:MAX_ROWS]
    for line in rows:
        try:
            row = json.loads(line)
            timestamp = dt.datetime.fromtimestamp(int(row['__REALTIME_TIMESTAMP']) / 1_000_000, UTC)
            priority = int(row['PRIORITY'])
            message = journal_message(row.get('MESSAGE', ''))
            if (message is None and row.get('MESSAGE') is not None) or priority < 0 or priority > 7 or not since <= timestamp <= until:
                continue
            # A null (omitted/oversized) message still has trustworthy journal severity.
            message = message or ''
            severity = log_severity(message, priority)
            if severity is None:
                continue
            unit = row.get('_SYSTEMD_USER_UNIT') or row.get('_SYSTEMD_UNIT')
            events.append({'timestamp': iso(timestamp), 'severity': severity, 'code': classify(message, severity),
                           'unit': unit if isinstance(unit, str) and unit in UNITS else None, 'count': 1})
        except (ValueError, KeyError, TypeError, OverflowError, OSError):
            continue
    return events, len(rows)


def journal_epoch(value: dt.datetime) -> str:
    microseconds = (value.astimezone(UTC) - dt.datetime(1970, 1, 1, tzinfo=UTC)) // dt.timedelta(microseconds=1)
    return '@' + str(microseconds // 1_000_000) + '.' + str(microseconds % 1_000_000).zfill(6)


def journal_source(source: str, selectors_: list[str], since: dt.datetime, until: dt.datetime) -> dict:
    args = ['/usr/bin/journalctl', '--no-pager', '--all', '--output=json', '--output-fields=__REALTIME_TIMESTAMP,PRIORITY,_SYSTEMD_UNIT,_SYSTEMD_USER_UNIT,MESSAGE',
            '--lines=' + str(MAX_ROWS), '--since=' + journal_epoch(since), '--until=' + journal_epoch(until), *selectors_]
    status, raw, truncated = bounded_command(args)
    events, scanned = journal_events(raw, since, until)
    return source_result(source, status, scanned, events, truncated or scanned >= MAX_ROWS)


def postgres_source(since: dt.datetime, until: dt.datetime, path: Path = POSTGRES_LOG) -> dict:
    try:
        descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
        with os.fdopen(descriptor, 'rb') as stream:
            info = os.fstat(stream.fileno())
            if not stat.S_ISREG(info.st_mode):
                return source_result('postgresql', 'unavailable')
            offset = max(0, info.st_size - MAX_POSTGRES_BYTES)
            stream.seek(offset)
            raw = stream.read(MAX_POSTGRES_BYTES)
            if offset:
                raw = raw.partition(b'\n')[2]
    except OSError:
        return source_result('postgresql', 'unavailable')
    rows = raw.decode('utf-8', errors='replace').splitlines()
    events = []
    for line in rows[-MAX_ROWS:]:
        match = PG_HEADER.match(line)
        if not match:
            continue
        try:
            timestamp = dt.datetime.fromisoformat(match.group(1)).replace(tzinfo=UTC)
        except ValueError:
            continue
        if not since <= timestamp <= until:
            continue
        severity = 'critical' if match.group(2) in ('FATAL', 'PANIC') else 'error' if match.group(2) == 'ERROR' else 'warning'
        events.append({'timestamp': iso(timestamp), 'severity': severity, 'code': classify(match.group(3), severity),
                       'unit': 'postgresql@18-main.service', 'count': 1})
    return source_result('postgresql', 'ok', min(len(rows), MAX_ROWS), events, bool(offset) or len(rows) > MAX_ROWS)


def collect_window(since: dt.datetime, until: dt.datetime, generated_at: dt.datetime | None = None) -> dict:
    if since.tzinfo is None or until.tzinfo is None or not 0 < (until - since).total_seconds() <= 7200:
        raise ValueError('Expected a timezone-aware window of at most two hours')
    return {'version': 1, 'generatedAt': iso(generated_at or until), 'window': {'since': iso(since), 'until': iso(until),
            'minutes': (until - since).total_seconds() / 60}, 'sources': [
        journal_source('whoxos', ['_UID=1001', '_SYSTEMD_USER_UNIT=whoxos.service', '_SYSTEMD_USER_UNIT=WHOXOS.service'], since, until),
        journal_source('overview_services', ['--unit=overview-labs-health.service', '--unit=overview-labs-searxng.service', '--unit=caddy.service'], since, until),
        postgres_source(since, until),
    ]}


def collect(now: dt.datetime | None = None) -> dict:
    until = (now or dt.datetime.now(UTC)).astimezone(UTC)
    return collect_window(until - dt.timedelta(minutes=30), until)


def write_archive(report: dict, directory: Path = HISTORY, now: dt.datetime | None = None) -> None:
    """Immutable metadata snapshots; only the fixed root service writes this directory."""
    current = (now or dt.datetime.now(UTC)).astimezone(UTC)
    directory.mkdir(mode=0o755, parents=True, exist_ok=True)
    info = directory.lstat()
    if not stat.S_ISDIR(info.st_mode) or info.st_uid != os.geteuid() or info.st_mode & 0o022:
        raise ValueError('Unsafe diagnostics archive directory')
    stamps = [dt.datetime.fromisoformat(value.replace('Z', '+00:00')) for value in
              (report['window']['since'], report['window']['until'], report['generatedAt'])]
    if not current - RETENTION <= stamps[0] < stamps[1] <= current or stamps[1] - stamps[0] > dt.timedelta(hours=2):
        raise ValueError('Archive window outside retention')
    filename = '-'.join(str(int(value.timestamp() * 1000)) for value in stamps) + '.json'
    descriptor, temporary = tempfile.mkstemp(prefix='.pending-', dir=directory)
    try:
        with os.fdopen(descriptor, 'w', encoding='utf-8') as stream:
            json.dump(report, stream, separators=(',', ':'))
            stream.write('\n')
        os.chmod(temporary, 0o644)
        try:
            # A hard link publishes only a completely written file and never replaces history.
            os.link(temporary, directory / filename)
        except FileExistsError:
            pass
    finally:
        os.unlink(temporary)
    cutoff = int((current - RETENTION).timestamp() * 1000)
    for entry in directory.iterdir():
        if ARCHIVE_NAME.fullmatch(entry.name) and int(entry.name.split('-')[0]) < cutoff:
            entry.unlink()  # unlink does not follow a symlink


def write_report(report: dict, path: Path = CACHE) -> None:
    path.parent.mkdir(mode=0o755, parents=True, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(prefix='it-diagnostics-', suffix='.json', dir=path.parent)
    try:
        with os.fdopen(descriptor, 'w', encoding='utf-8') as stream:
            json.dump(report, stream, separators=(',', ':'))
            stream.write('\n')
        os.chmod(temporary, 0o644)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


if __name__ == '__main__':
    import sys
    if len(sys.argv) != 1:
        raise SystemExit('This collector accepts no arguments')
    current = dt.datetime.now(UTC)
    write_report(collect(current))
    # Overlapping short scans retain useful history even if a busy 30-minute scan is capped.
    write_archive(collect_window(current - dt.timedelta(minutes=2), current), now=current)
