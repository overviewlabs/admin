import json
import os
import pwd
import socket
import subprocess
import tempfile
import threading
import unittest
from pathlib import Path
from executor import Broker, Handler, Server, process_stamp

# An unprivileged Node client represents the API; a second process with the
# very same UID represents an agent attempting to reach the broker directly.
CLIENT = r'''
const net = require('node:net');
const readline = require('node:readline');
process.stdout.write(JSON.stringify({pid:process.pid})+'\n');
readline.createInterface({input:process.stdin}).on('line', async line => {
  const request = JSON.parse(line);
  const socket = net.createConnection(process.argv[2]);
  let data=''; socket.setEncoding('utf8');
  socket.on('connect',()=>socket.write(JSON.stringify(request)+'\n'));
  socket.on('data',chunk=>{ data+=chunk; if(data.includes('\n')) {process.stdout.write(data);socket.destroy();} });
  socket.on('error',()=>process.stdout.write(JSON.stringify({error:'connection failed'})+'\n'));
});
'''


@unittest.skipUnless(os.geteuid() == 0, 'requires root and whoxos test client')
class ProtocolTest(unittest.TestCase):
    def test_unprivileged_pinned_client_and_same_uid_impostor(self):
        user = pwd.getpwnam('whox')
        with tempfile.TemporaryDirectory(prefix='overview-root-protocol-') as directory:
            base = Path(directory); base.chmod(0o755)
            script = base / 'client.cjs'; script.write_text(CLIENT); script.chmod(0o644)
            socket_path = str(base / 'broker.sock'); binding = base / 'binding.json'
            client = subprocess.Popen(['/usr/sbin/runuser', '-u', 'whox', '--', '/usr/bin/node', str(script), socket_path], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
            pid = json.loads(client.stdout.readline())['pid']
            binding.write_text(json.dumps(dict(pid=pid, uid=user.pw_uid, gid=user.pw_gid, startTime=process_stamp(pid)))); binding.chmod(0o600)
            server = Server(socket_path, Handler); server.config_path = str(binding); server.broker = Broker(base / 'state')
            os.chown(socket_path, 0, user.pw_gid); os.chmod(socket_path, 0o660)
            thread = threading.Thread(target=server.serve_forever); thread.start()
            company = '79255634-54f2-4a25-b72f-19f2808ad251'; agent = '44444444-4444-4444-8444-444444444444'
            scope = dict(companyId=company, agentId=agent)
            def call(**data):
                client.stdin.write(json.dumps(dict(scope, **data))+'\n'); client.stdin.flush()
                return json.loads(client.stdout.readline())
            try:
                self.assertFalse(call(operation='status')['result']['enabled'])
                self.assertTrue(call(operation='grant', enabled=True, actorId='test-admin')['result']['enabled'])
                req = dict(operation='execute', actorId='test-admin', requestId='55555555-5555-4555-8555-555555555555', command='id -u', timeoutMs=30000)
                response = call(**req)
                self.assertEqual(response['result']['output'], '0\n')
                self.assertEqual(response['result']['exitCode'], 0)
                # Replaying a completed request returns the same receipt and output.
                self.assertEqual(call(**req), response)
                impostor = subprocess.run(['/usr/sbin/runuser', '-u', 'whox', '--', '/usr/bin/python3', '-c',
                    'import socket,json,sys;s=socket.socket(socket.AF_UNIX);s.connect(sys.argv[1]);print(s.recv(4096).decode())', socket_path], capture_output=True, text=True, timeout=5)
                self.assertEqual(impostor.returncode, 0, impostor.stderr)
                self.assertEqual(json.loads(impostor.stdout)['status'], 403)
                self.assertFalse(call(operation='grant', enabled=False, actorId='test-admin')['result']['enabled'])
                self.assertEqual(call(**req)['status'], 403)
                # The exact Treasury IT route works through the pinned API too.
                scope = dict(companyId='0d8aad87-64f2-4f9c-a92c-94a261e140f7', agentId='10bf5dc5-8522-42a2-8456-9bc50cdd982d')
                self.assertFalse(call(operation='status')['result']['enabled'])
                self.assertTrue(call(operation='grant', enabled=True, actorId='test-admin')['result']['enabled'])
                req['requestId'] = '66666666-6666-4666-8666-666666666666'
                self.assertEqual(call(**req)['result']['output'], '0\n')
                self.assertFalse(call(operation='grant', enabled=False, actorId='test-admin')['result']['enabled'])
                self.assertEqual(call(**req)['status'], 403)
                # Even the original PID becomes invalid when the root binding is stale.
                binding.write_text(json.dumps(dict(pid=pid, uid=user.pw_uid, startTime='0')))
                self.assertEqual(call(operation='status')['status'], 403)
            finally:
                client.stdin.close(); client.wait(timeout=5); client.stdout.close()
                server.shutdown(); server.server_close(); thread.join(); server.broker.db.close()


if __name__ == '__main__': unittest.main()
