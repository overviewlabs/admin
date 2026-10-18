import datetime as dt
import importlib.util
import json
import os
from pathlib import Path
import stat
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('collector', Path(__file__).with_name('collector.py'))
collector = importlib.util.module_from_spec(spec)
spec.loader.exec_module(collector)


class CollectorTests(unittest.TestCase):
    def setUp(self):
        self.until = dt.datetime(2026, 9, 28, 12, 0, tzinfo=dt.timezone.utc)
        self.since = self.until - dt.timedelta(minutes=30)

    def journal(self, **overrides):
        return {'__REALTIME_TIMESTAMP': str(int(self.until.timestamp() * 1_000_000)),
                'PRIORITY': '3', '_SYSTEMD_USER_UNIT': 'whoxos.service',
                'MESSAGE': 'Permission denied: PRIVATE_TOKEN user@example.org transcript SQL SELECT', **overrides}

    def test_journal_projects_only_safe_metadata(self):
        row = self.journal(EXTRA='PRIVATE_EXTRA')
        events, scanned = collector.journal_events(json.dumps(row).encode(), self.since, self.until)
        self.assertEqual(scanned, 1)
        self.assertEqual(events, [{'timestamp': '2026-09-28T12:00:00.000Z', 'severity': 'error',
                                 'code': 'permission_denied', 'unit': 'whoxos.service', 'count': 1}])
        self.assertNotIn('PRIVATE', json.dumps(events))
        self.assertNotIn('user@', json.dumps(events))

    def test_journal_rejects_malformed_outside_window_and_info(self):
        rows = [b'bad json', b'null', b'[]', b'123', json.dumps(self.journal(PRIORITY='6')).encode(),
                json.dumps(self.journal(MESSAGE=['PRIVATE'])).encode(),
                json.dumps(self.journal(__REALTIME_TIMESTAMP='999999999999999999999')).encode(),
                json.dumps(self.journal(__REALTIME_TIMESTAMP=str(int((self.since - dt.timedelta(seconds=1)).timestamp() * 1_000_000)))).encode(),
                json.dumps(self.journal(__REALTIME_TIMESTAMP=str(int((self.until + dt.timedelta(seconds=1)).timestamp() * 1_000_000)))).encode()]
        events, _ = collector.journal_events(b'\n'.join(rows), self.since, self.until)
        self.assertEqual(events, [])

    def test_unknown_unit_does_not_escape(self):
        raw = json.dumps(self.journal(_SYSTEMD_USER_UNIT='PRIVATE-company-name.service')).encode()
        events, _ = collector.journal_events(raw, self.since, self.until)
        self.assertIsNone(events[0]['unit'])

    def test_real_stdout_byte_array_and_logger_severity(self):
        message = '\x1b[31m[11:59:00] ERROR\x1b[39m: Could not resolve host PRIVATE_HOST key=PRIVATE_KEY'
        raw = json.dumps(self.journal(PRIORITY='6', MESSAGE=list(message.encode()))).encode()
        events, _ = collector.journal_events(raw, self.since, self.until)
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0]['code'], 'dns_failure')
        self.assertEqual(events[0]['severity'], 'error')
        self.assertNotIn('PRIVATE', json.dumps(events))

    def test_structured_logger_errors_on_stdout_and_untrusted_severity_words(self):
        for message in [json.dumps({'level': 50, 'msg': 'PRIVATE error'}), json.dumps({'level': 'error', 'msg': 'PRIVATE'})]:
            raw = json.dumps(self.journal(PRIORITY='6', MESSAGE=message)).encode()
            events, _ = collector.journal_events(raw, self.since, self.until)
            self.assertEqual(events[0]['severity'], 'error')
            self.assertNotIn('PRIVATE', json.dumps(events))
        for message in ['[11:59:00] INFO: user said ERROR', '{"level":30,"msg":"FATAL"}', 'PRIVATE ERROR']:
            raw = json.dumps(self.journal(PRIORITY='6', MESSAGE=message)).encode()
            self.assertEqual(collector.journal_events(raw, self.since, self.until)[0], [])
        self.assertIsNone(collector.journal_message([False, 65]))
        self.assertIsNone(collector.journal_message([256]))

    def test_fixed_classification_codes(self):
        for text, code in [('Could not resolve host', 'dns_failure'), ('ECONNREFUSED', 'connection_refused'),
                           ('connection closed', 'connection_closed'), ('OOM-kill', 'out_of_memory'),
                           ('RESOURCE_EXHAUSTED', 'provider_rate_limit'), ('terminal_limit', 'terminal_limit'),
                           ('Failed with result', 'service_failure'), ('deadlock detected PRIVATE SQL', 'database_deadlock'),
                           ('duplicate key value violates unique constraint PRIVATE', 'database_unique_conflict'), ('PRIVATE UNKNOWN', 'warning')]:
            self.assertEqual(collector.classify(text, 'warning'), code)
            self.assertIn(code, collector.CODES)

    def test_whox_and_specific_probe_failures(self):
        for message, code in [('[11:59:00] WARN: POST /mcp/runtime-tools 409', 'runtime_tool_context'),
                              ('[11:59:00] WARN: GET /api/heartbeat-runs/private-id/log 404', 'run_log_unavailable'),
                              ('[11:59:00] WARN: GET /issues/private-id 404', 'request_not_found')]:
            events, _ = collector.journal_events(json.dumps(self.journal(PRIORITY='6', MESSAGE=message, _SYSTEMD_USER_UNIT='WHOXOS.service')).encode(), self.since, self.until)
            self.assertEqual(events[0]['code'], code)
            self.assertEqual(events[0]['unit'], 'WHOXOS.service')
            self.assertNotIn('private-id', json.dumps(events))

    def test_priority_mapping(self):
        for priority, severity in [(0, 'critical'), (2, 'critical'), (3, 'error'), (4, 'warning')]:
            raw = json.dumps(self.journal(PRIORITY=str(priority), MESSAGE='not classified')).encode()
            events, _ = collector.journal_events(raw, self.since, self.until)
            self.assertEqual(events[0]['severity'], severity)
            self.assertEqual(events[0]['code'], severity)

    def test_source_caps_events_and_reports_truncation(self):
        events, _ = collector.journal_events(json.dumps(self.journal()).encode(), self.since, self.until)
        result = collector.source_result('whoxos', 'ok', 5000, events * 101)
        self.assertEqual(len(result['events']), 100)
        self.assertEqual(result['matchedEvents'], 101)
        self.assertEqual(result['scannedEntries'], 2000)
        self.assertTrue(result['truncated'])

    def test_postgres_headers_only_no_statement_or_private_payload(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory, 'pg.log')
            path.write_text('2026-09-28 11:59:59.123 UTC [123] user@database ERROR: connection refused PRIVATE_TOKEN\n'
                            '2026-09-28 11:59:59.123 UTC [123] user@database STATEMENT: SELECT secret FROM anything\n'
                            'PRIVATE TRANSCRIPT continuation\n'
                            '2026-09-28 11:00:00 UTC [123] FATAL: old entry\n'
                            '2026-09-28 12:01:00 UTC [123] FATAL: future entry\n')
            result = collector.postgres_source(self.since, self.until, path)
        self.assertEqual(result['matchedEvents'], 1)
        self.assertEqual(result['events'][0]['code'], 'connection_refused')
        self.assertEqual(result['events'][0]['timestamp'], '2026-09-28T11:59:59.123Z')
        self.assertNotIn('PRIVATE', json.dumps(result))
        self.assertNotIn('secret', json.dumps(result))

    def test_postgres_refuses_missing_symlink_and_fifo(self):
        with tempfile.TemporaryDirectory() as directory:
            missing = Path(directory, 'missing')
            target = Path(directory, 'target')
            target.write_text('PRIVATE')
            link = Path(directory, 'link')
            link.symlink_to(target)
            fifo = Path(directory, 'fifo')
            os.mkfifo(fifo)
            for path in [missing, link, fifo]:
                result = collector.postgres_source(self.since, self.until, path)
                self.assertFalse(result['available'])
                self.assertEqual(result['events'], [])

    def test_postgres_tail_is_bounded(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(collector, 'MAX_POSTGRES_BYTES', 128):
            path = Path(directory, 'pg.log')
            path.write_text('PRIVATE_OLD' * 300 + '\n2026-09-28 11:59:59 UTC [123] WARNING: permission denied\n')
            result = collector.postgres_source(self.since, self.until, path)
        self.assertTrue(result['truncated'])
        self.assertEqual(result['matchedEvents'], 1)

    def test_commands_have_timeout_output_bound_and_unavailable_status(self):
        status, raw, truncated = collector.bounded_command(['/bin/sh', '-c', 'printf safe'])
        self.assertEqual((status, raw, truncated), ('ok', b'safe', False))
        self.assertEqual(collector.bounded_command(['/no/such/program']), ('unavailable', b'', False))
        with patch.object(collector, 'COMMAND_TIMEOUT', 0.02):
            self.assertEqual(collector.bounded_command(['/usr/bin/sleep', '2'])[0], 'timeout')
        with patch.object(collector, 'MAX_JOURNAL_BYTES', 128):
            status, raw, truncated = collector.bounded_command(['/usr/bin/python3', '-c', 'print("x" * 10000)'])
        self.assertLessEqual(len(raw), 128)
        self.assertTrue(truncated)

    def test_fixed_sources_and_30_minute_window(self):
        with patch.object(collector, 'bounded_command', return_value=('ok', b'', False)) as command, \
             patch.object(collector, 'postgres_source', return_value=collector.source_result('postgresql', 'ok')):
            result = collector.collect(self.until)
        self.assertEqual(result['window'], {'since': '2026-09-28T11:30:00.000Z', 'until': '2026-09-28T12:00:00.000Z', 'minutes': 30})
        self.assertEqual([source['id'] for source in result['sources']], ['whoxos', 'overview_services', 'postgresql'])
        self.assertEqual(len(command.call_args_list), 2)
        for call in command.call_args_list:
            args = call.args[0]
            self.assertEqual(args[0], '/usr/bin/journalctl')
            self.assertIn('--lines=2000', args)
            self.assertNotIn('--priority=warning', args, 'stdout application errors often use journal priority INFO')

    def test_report_atomic_safe_permissions_and_replacement(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory, 'cache', 'report.json')
            collector.write_report({'version': 1}, path)
            self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o644)
            collector.write_report({'version': 2}, path)
            self.assertEqual(json.loads(path.read_text()), {'version': 2})
            self.assertEqual([entry.name for entry in path.parent.iterdir()], ['report.json'])


    def test_archive_immutable_atomic_and_retention(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory, 'history')
            with patch.object(collector, 'bounded_command', return_value=('ok', b'', False)), \
                 patch.object(collector, 'postgres_source', return_value=collector.source_result('postgresql', 'ok')):
                result = collector.collect_window(self.until - dt.timedelta(minutes=2), self.until)
            collector.write_archive(result, path, self.until)
            file = next(path.iterdir())
            original = file.read_bytes()
            collector.write_archive({**result, 'sources': []}, path, self.until)
            self.assertEqual(file.read_bytes(), original, 'published evidence is not overwritten')
            self.assertEqual(stat.S_IMODE(file.stat().st_mode), 0o644)
            self.assertEqual(len(list(path.iterdir())), 1)
            later = self.until + dt.timedelta(hours=24, minutes=1)
            newer = {**result, 'generatedAt': collector.iso(later), 'window': {
                'since': collector.iso(later - dt.timedelta(minutes=2)), 'until': collector.iso(later), 'minutes': 2}}
            collector.write_archive(newer, path, later)
            self.assertFalse(file.exists())
            self.assertEqual(len(list(path.iterdir())), 1)

    def test_archive_refuses_symlink_or_writable_directory(self):
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            real = base / 'real'; real.mkdir()
            link = base / 'link'; link.symlink_to(real, target_is_directory=True)
            for path in [link, real]:
                if path == real:
                    path.chmod(0o777)
                with self.assertRaises(ValueError):
                    collector.write_archive({}, path, self.until)

    def test_historical_window_bounds_and_fixed_sources(self):
        with patch.object(collector, 'bounded_command', return_value=('ok', b'', False)) as command, \
             patch.object(collector, 'postgres_source', return_value=collector.source_result('postgresql', 'ok')):
            result = collector.collect_window(self.since, self.until, generated_at=self.until + dt.timedelta(hours=1))
        self.assertEqual(result['generatedAt'], '2026-09-28T13:00:00.000Z')
        self.assertEqual(len(command.call_args_list), 2)
        for since, until in [(self.until, self.since), (self.since - dt.timedelta(hours=2), self.until)]:
            with self.assertRaises(ValueError):
                collector.collect_window(since, until)
        spec = importlib.util.spec_from_file_location('backfill', Path(__file__).with_name('backfill.py'))
        backfill = importlib.util.module_from_spec(spec); spec.loader.exec_module(backfill)
        self.assertEqual(backfill.parse_window(['2026-09-28T11:30:00Z', '2026-09-28T12:00:00Z'], self.until), (self.since, self.until))
        for args in [[], ['--path', '/private'], ['2026-09-28T12:00:00', '2026-09-28T12:01:00'],
                     ['2026-09-27T11:00:00Z', '2026-09-27T11:02:00Z'],
                     ['2026-09-28T09:00:00Z', '2026-09-28T12:00:00Z'],
                     ['2026-09-28T11:00:00Z', '2026-09-28T12:00:01Z']]:
            with self.assertRaises(ValueError):
                backfill.parse_window(args, self.until)


    def test_fractional_journal_boundary_is_not_rounded_down(self):
        since = self.since.replace(microsecond=123456)
        until = self.until.replace(microsecond=987654)
        row = self.journal(__REALTIME_TIMESTAMP=str(int(self.until.timestamp()) * 1_000_000 + 900000))
        with patch.object(collector, 'bounded_command', return_value=('ok', json.dumps(row).encode(), False)) as command:
            result = collector.journal_source('whoxos', ['_UID=1001'], since, until)
        self.assertEqual(result['matchedEvents'], 1)
        self.assertIn('--all', command.call_args.args[0])
        self.assertIn('--since=@' + str(int(since.timestamp())) + '.123456', command.call_args.args[0])
        self.assertIn('--until=@' + str(int(until.timestamp())) + '.987654', command.call_args.args[0])

    def test_empty_or_rotated_sources_never_claim_retention_verified(self):
        with patch.object(collector, 'bounded_command', return_value=('ok', b'', False)):
            empty = collector.journal_source('whoxos', ['_UID=1001'], self.since, self.until)
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory, 'postgresql-18-main.log')
            # This file may have been rotated; a successful small tail cannot prove older records survived.
            path.write_text('2026-09-28 12:01:00 UTC [123] LOG: database system ready\n')
            rotated = collector.postgres_source(self.since, self.until, path)
        for result in [empty, rotated]:
            self.assertTrue(result['available'])
            self.assertEqual(result['events'], [])
            self.assertFalse(result['truncated'])
            self.assertFalse(result['retentionVerified'])
            self.assertEqual(result['coverageProvenance'], 'bounded_scan')

    def test_null_journal_message_retains_trusted_severity_without_raw_content(self):
        raw = json.dumps(self.journal(MESSAGE=None)).encode()
        events, _ = collector.journal_events(raw, self.since, self.until)
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0]['severity'], 'error')
        self.assertEqual(events[0]['code'], 'error')
        info = json.dumps(self.journal(MESSAGE=None, PRIORITY='6')).encode()
        self.assertEqual(collector.journal_events(info, self.since, self.until)[0], [])


if __name__ == '__main__':
    unittest.main()
