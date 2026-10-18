import json
import os
import socket
import struct
import tempfile
import threading
import time
import unittest
import uuid
from pathlib import Path
from unittest.mock import patch
from executor import Broker, Denied, check_peer, identity, process_stamp, trusted_config, MAX_OUTPUT

COMPANY = '79255634-54f2-4a25-b72f-19f2808ad251'
AGENT = '22222222-2222-4222-8222-222222222222'


class BrokerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='overview-root-test-')
        self.broker = Broker(self.temp.name)
        self.scope = dict(companyId=COMPANY, agentId=AGENT)

    def tearDown(self):
        self.broker.db.close()
        self.temp.cleanup()

    def grant(self, enabled=True):
        return self.broker.dispatch(dict(self.scope, operation='grant', enabled=enabled, actorId='human'))

    def command(self, command='id -u', **changes):
        return dict(self.scope, operation='execute', command=command, requestId=str(uuid.uuid4()), actorId='human', **changes)

    def test_default_denied_and_grants_are_exact(self):
        self.assertFalse(self.broker.dispatch(dict(self.scope, operation='status'))['enabled'])
        with self.assertRaises(Denied): self.broker.dispatch(self.command())
        self.grant()
        self.assertTrue(self.broker.dispatch(dict(self.scope, operation='status'))['enabled'])
        with self.assertRaises(Denied):
            self.broker.dispatch(dict(self.command(), companyId=str(uuid.uuid4())))
        with self.assertRaises(Denied):
            self.broker.dispatch(dict(self.command(), agentId=str(uuid.uuid4())))
        self.grant(False)
        with self.assertRaises(Denied): self.broker.dispatch(self.command())

    def test_organization_scope_and_leadership_delegation(self):
        other = str(uuid.uuid4())
        manager = str(uuid.uuid4())
        child = dict(companyId=COMPANY, agentId=str(uuid.uuid4()))
        with self.assertRaises(Denied):
            self.broker.dispatch(dict(child, operation='grant', enabled=True, actorId=manager, managerAgentId=manager))
        self.broker.dispatch(dict(companyId=COMPANY, agentId=manager, operation='leadership', enabled=True, actorId='owner'))
        self.assertTrue(self.broker.dispatch(dict(companyId=COMPANY, agentId=manager, operation='status'))['canDelegate'])
        for enabled in (True, False):
            self.broker.dispatch(dict(child, operation='grant', enabled=enabled, actorId=manager, managerAgentId=manager))
            self.assertEqual(self.broker.granted(COMPANY, child['agentId']), enabled)
        with self.assertRaises(Denied):
            self.broker.dispatch(dict(child, companyId=other, operation='grant', enabled=True, actorId=manager, managerAgentId=manager))
        self.broker.dispatch(dict(companyId=COMPANY, agentId=manager, operation='leadership', enabled=False, actorId='owner'))
        with self.assertRaises(Denied):
            self.broker.dispatch(dict(child, operation='grant', enabled=True, actorId=manager, managerAgentId=manager))

    def test_all_organizations_require_exact_explicit_grants(self):
        for company in ('0d8aad87-64f2-4f9c-a92c-94a261e140f7', str(uuid.uuid4())):
            self.scope = dict(companyId=company, agentId=str(uuid.uuid4()))
            self.assertFalse(self.broker.dispatch(dict(self.scope, operation='status'))['enabled'])
            with self.assertRaises(Denied): self.broker.dispatch(self.command())
            self.grant()
            self.assertTrue(self.broker.dispatch(dict(self.scope, operation='status'))['enabled'])
            self.assertFalse(self.broker.granted(company, str(uuid.uuid4())))
            self.assertFalse(self.broker.granted(str(uuid.uuid4()), self.scope['agentId']))
            self.grant(False)
            with self.assertRaises(Denied): self.broker.dispatch(self.command())

    def test_validation(self):
        self.grant()
        for change in [dict(command=''), dict(command='a\0b'), dict(command='x'*32001), dict(timeoutMs=True), dict(timeoutMs=300001), dict(timeoutMs=0), dict(requestId='../x'), dict(actorId='')]:
            with self.assertRaises(Denied): self.broker.dispatch(dict(self.command(), **change))
        for invalid in [None, 5, '../root', 'invalid']:
            with self.assertRaises(Denied): identity(invalid)

    def test_audit_failure_prevents_grant_and_execution(self):
        with patch.object(self.broker, 'audit', side_effect=OSError('disk unavailable')):
            with self.assertRaises(OSError): self.grant()
        self.assertFalse(self.broker.granted(COMPANY, AGENT))
        self.grant()
        with patch.object(self.broker, 'audit', side_effect=OSError('disk unavailable')):
            with self.assertRaises(OSError): self.broker.dispatch(self.command())
        self.assertFalse(self.broker.active)

    @unittest.skipUnless(os.geteuid() == 0, 'real systemd root execution test')
    def test_real_root_clean_environment_and_replay(self):
        self.grant()
        request = self.command("id -u; printf '%s' \"${OVERVIEW_ROOT_TEST_SECRET-unset}\"")
        with patch.dict(os.environ, OVERVIEW_ROOT_TEST_SECRET='neverinherit'):
            result = self.broker.dispatch(request)
        self.assertEqual(result['exitCode'], 0)
        self.assertEqual(result['output'], '0\nunset')
        self.assertEqual(self.broker.dispatch(request), result)
        with self.assertRaises(Denied): self.broker.dispatch(dict(request, command='echo changed'))
        reopened = Broker(self.temp.name)
        try:
            self.assertTrue(reopened.granted(COMPANY, AGENT))
            with self.assertRaises(Denied): reopened.dispatch(request)
        finally: reopened.db.close()
        audit = Path(self.temp.name, 'audit.jsonl').read_text()
        self.assertNotIn(request['command'], audit)
        self.assertNotIn('neverinherit', audit)
        self.assertIn('command_finished', audit)

    @unittest.skipUnless(os.geteuid() == 0, 'real systemd root execution test')
    def test_bounds_output_and_reports_nonzero(self):
        self.grant()
        result = self.broker.dispatch(self.command("python3 -c 'print(\"x\"*100000)'"))
        self.assertEqual(len(result['output']), MAX_OUTPUT)
        self.assertTrue(result['truncated'])
        self.assertEqual(self.broker.dispatch(self.command('exit 7'))['exitCode'], 7)

    @unittest.skipUnless(os.geteuid() == 0, 'real systemd root execution test')
    def test_timeout_and_descendant_cleanup(self):
        self.grant()
        marker = Path(self.temp.name, 'escaped')
        result = self.broker.dispatch(self.command(f'(sleep 1; touch {marker}) & wait', timeoutMs=200))
        self.assertTrue(result['timedOut'])
        time.sleep(1.1)
        self.assertFalse(marker.exists())
        self.assertFalse(self.broker.active)

    @unittest.skipUnless(os.geteuid() == 0, 'real systemd root execution test')
    def test_revoke_active_and_block_concurrent(self):
        self.grant()
        results = []
        task = threading.Thread(target=lambda: results.append(self.broker.dispatch(self.command('sleep 10'))))
        task.start()
        deadline = time.monotonic() + 3
        while not self.broker.active and time.monotonic() < deadline: time.sleep(.01)
        with self.assertRaises(Denied): self.broker.dispatch(self.command())
        self.grant(False)
        task.join(12)
        self.assertFalse(task.is_alive())
        self.assertTrue(results[0]['revoked'])
        self.assertFalse(self.broker.active)
        with self.assertRaises(Denied): self.broker.dispatch(self.command())


class PeerTests(unittest.TestCase):
    @unittest.skipUnless(os.geteuid() == 0, 'root-owned binding tests')
    def test_kernel_peer_pinning_includes_starttime(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory, 'binding.json')
            current = dict(pid=os.getpid(), uid=os.getuid(), startTime=process_stamp(os.getpid()))
            path.write_text(json.dumps(current))
            os.chmod(path, 0o600)
            left, right = socket.socketpair()
            try:
                check_peer(left, path)
                for change in [dict(pid=current['pid']+1), dict(uid=1234), dict(startTime='0')]:
                    path.write_text(json.dumps(dict(current, **change)))
                    with self.assertRaises(Denied): check_peer(left, path)
                path.write_text(json.dumps(current))
                os.chmod(path, 0o666)
                with self.assertRaises(Denied): trusted_config(path)
                os.chmod(path, 0o600)
                link = Path(directory, 'link'); link.symlink_to(path)
                with self.assertRaises(OSError): trusted_config(link)
            finally: left.close(); right.close()


if __name__ == '__main__': unittest.main()
