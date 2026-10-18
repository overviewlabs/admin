#!/usr/bin/env python3
"""Root operator utility: bounded time inputs, fixed sources, metadata archives only."""
import datetime as dt
import importlib.util
import json
import os
import sys


def parse_window(args, now):
    if len(args) != 2:
        raise ValueError('Provide exactly SINCE UNTIL as ISO timestamps')
    since, until = [dt.datetime.fromisoformat(value.replace('Z', '+00:00')) for value in args]
    if since.tzinfo is None or until.tzinfo is None or not now - dt.timedelta(hours=24) <= since < until <= now:
        raise ValueError('Window must be within the last 24 hours')
    if until - since > dt.timedelta(hours=2):
        raise ValueError('Window must not exceed two hours')
    return since, until


if __name__ == '__main__':
    if os.geteuid() != 0:
        raise SystemExit('Run only as the server administrator')
    now = dt.datetime.now(dt.timezone.utc)
    try:
        since, until = parse_window(sys.argv[1:], now)
    except ValueError as error:
        raise SystemExit(str(error))
    spec = importlib.util.spec_from_file_location('it_diagnostics', '/usr/local/libexec/overview-labs-it-diagnostics.py')
    collector = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(collector)
    count = 0
    cursor = since
    while cursor < until:
        end = min(until, cursor + dt.timedelta(minutes=2))
        report = collector.collect_window(cursor, end, generated_at=now)
        collector.write_archive(report, now=now)
        count += 1
        cursor = end
    print(json.dumps({'snapshots': count, 'since': collector.iso(since), 'until': collector.iso(until),
                      'notice': 'Bounded scans; inspect source coverage and truncation before drawing conclusions.'}))
