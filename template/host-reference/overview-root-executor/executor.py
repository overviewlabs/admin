#!/usr/bin/python3
"""Host-root command broker. No TCP listener, shared password, or sudo grant.

A root operator pins the API process (PID AND start time); peer credentials are
checked on every connection. Grants and replay receipts are held outside app
storage. A restart requires an explicit root-side rebind.
"""
import hashlib
import json
import os
import selectors
import signal
import socket
import socketserver
import sqlite3
import struct
import subprocess
import threading
import time
import uuid
from pathlib import Path

MAX_REQUEST = 200000
MAX_OUTPUT = 65536
HELPERS = {
    # Fixed argv only. No helper accepts a command, URL, path, environment, or payload.
    'service.reload': ('/usr/bin/systemctl', 'daemon-reload'),
    'service.recover': ('/usr/bin/systemctl', 'reset-failed', 'overview-root-executor.service'),
    'purpose.v14.synthetic_lifecycle': ('/usr/bin/python3', '-I', '-S', '-B', '/usr/local/libexec/treasury-research/march29-purpose-v1/synthetic_lifecycle_probe.py'),
}


def eligible_scope(company, agent):
    # The pinned control plane validates organization membership and leadership.
    # All scopes still require a root-owned grant; no UUID grants authority.
    try:
        return str(uuid.UUID(company)) == company and str(uuid.UUID(agent)) == agent
    except (ValueError, TypeError, AttributeError):
        return False


class Denied(Exception):
    def __init__(self, message, status=403):
        self.status = status
        super().__init__(message)


def process_stamp(pid):
    # comm may include spaces and ')'; starttime is field 22, tail begins at 3.
    return Path(f'/proc/{pid}/stat').read_text().rsplit(')', 1)[1].split()[19]


def trusted_config(path):
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(fd) as f:
        stat = os.fstat(f.fileno())
        if stat.st_uid != 0 or stat.st_mode & 0o022 or stat.st_size > 4096:
            raise Denied('Invalid root executor process binding', 503)
        return json.load(f)


def check_peer(sock, config_path):
    pid, uid, _ = struct.unpack('3i', sock.getsockopt(socket.SOL_SOCKET, socket.SO_PEERCRED, 12))
    config = trusted_config(config_path)
    if pid != config.get('pid') or uid != config.get('uid') or process_stamp(pid) != config.get('startTime'):
        raise Denied('Only the pinned control-plane process may use the root executor')


def identity(value):
    try:
        if not isinstance(value, str) or str(uuid.UUID(value)) != value:
            raise ValueError()
    except (ValueError, TypeError, AttributeError):
        raise Denied('Invalid identity', 400)
    return value


class Broker:
    def __init__(self, directory):
        self.directory = Path(directory)
        self.directory.mkdir(mode=0o700, parents=True, exist_ok=True)
        self.lock = threading.RLock()
        self.active = {}
        self.results = {}
        self.db = sqlite3.connect(self.directory / 'state.sqlite', check_same_thread=False)
        self.db.execute('PRAGMA journal_mode=WAL')
        self.db.execute('PRAGMA synchronous=FULL')
        self.db.execute('CREATE TABLE IF NOT EXISTS grants (company TEXT, agent TEXT, actor TEXT, PRIMARY KEY(company,agent))')
        self.db.execute('CREATE TABLE IF NOT EXISTS managers (company TEXT, agent TEXT, PRIMARY KEY(company,agent))')
        self.db.execute('CREATE TABLE IF NOT EXISTS requests (id TEXT PRIMARY KEY, digest TEXT, state TEXT)')
        self.db.commit()

    def audit(self, event, **data):
        # Commands/results may contain credentials. Record the digest, never their contents.
        with open(self.directory / 'audit.jsonl', 'a', encoding='utf-8') as f:
            f.write(json.dumps(dict(at=time.time(), event=event, **data)) + '\n')
            f.flush()
            os.fsync(f.fileno())

    def granted(self, company, agent):
        if not eligible_scope(company, agent):
            return False
        return self.db.execute('SELECT 1 FROM grants WHERE company=? AND agent=?', (company, agent)).fetchone() is not None

    def dispatch(self, request):
        if not isinstance(request, dict):
            raise Denied('Invalid request', 400)
        company, agent = identity(request.get('companyId')), identity(request.get('agentId'))
        operation = request.get('operation')
        if not eligible_scope(company, agent):
            if operation == 'status':
                return dict(eligible=False, available=False, enabled=False, target='production', uid=0)
            raise Denied('This organization and agent are not eligible for production root access', 403)
        with self.lock:
            if operation == 'status':
                manager = self.db.execute('SELECT 1 FROM managers WHERE company=? AND agent=?', (company, agent)).fetchone() is not None
                return dict(available=True, enabled=self.granted(company, agent), canDelegate=manager, target='production', uid=0)
            if operation in ('grant', 'leadership'):
                if type(request.get('enabled')) is not bool or not isinstance(request.get('actorId'), str) or not request['actorId']:
                    raise Denied('Invalid grant', 400)
                manager = request.get('managerAgentId')
                if manager is not None:
                    identity(manager)
                    if operation != 'grant' or not self.granted(company, manager) or not self.db.execute('SELECT 1 FROM managers WHERE company=? AND agent=?', (company, manager)).fetchone():
                        raise Denied('An enabled leadership grant in this organization is required')
                self.audit('grant' if request['enabled'] else 'revoke', companyId=company, agentId=agent, actorId=request['actorId'])
                if operation == 'leadership':
                    if request['enabled']:
                        self.db.execute('INSERT OR IGNORE INTO managers VALUES (?,?)', (company, agent))
                    else:
                        self.db.execute('DELETE FROM managers WHERE company=? AND agent=?', (company, agent))
                if request['enabled']:
                    self.db.execute('INSERT OR REPLACE INTO grants VALUES (?,?,?)', (company, agent, request['actorId']))
                else:
                    self.db.execute('DELETE FROM grants WHERE company=? AND agent=?', (company, agent))
                    for key, job in list(self.active.items()):
                        if job['scope'] == (company, agent):
                            job['cancel'].set()
                self.db.commit()
                return dict(available=True, enabled=request['enabled'], target='production', uid=0)
        if operation not in ('helper', 'execute'):
            raise Denied('Unknown operation', 400)
        return self.execute_helper(company, agent, request)

    def execute_helper(self, company, agent, request):
        request_id = identity(request.get('requestId'))
        helper_id = request.get('helperId')
        if request['operation'] == 'helper':
            if helper_id not in HELPERS:
                raise Denied('Unknown helper', 400)
            if set(request) != {'companyId', 'agentId', 'operation', 'requestId', 'helperId', 'actorId'}:
                raise Denied('Unexpected helper request field', 400)
            command, timeout, argv = helper_id, 30000, HELPERS[helper_id]
        else:
            if set(request) - {'companyId', 'agentId', 'operation', 'requestId', 'command', 'actorId', 'timeoutMs'}:
                raise Denied('Unexpected command request field', 400)
            command, timeout = request.get('command'), request.get('timeoutMs', 30000)
            if not isinstance(command, str) or not command.strip() or len(command) > 32000 or '\0' in command or type(timeout) is not int or not 1 <= timeout <= 300000:
                raise Denied('Invalid root command or timeout', 400)
            argv = ('/bin/bash', '-c', command)
        actor = request.get('actorId')
        if not isinstance(actor, str) or not actor or len(actor) > 200:
            raise Denied('Execution attribution required', 400)
        digest = hashlib.sha256(json.dumps([company, agent, actor, request['operation'], command, timeout], separators=(',', ':')).encode()).hexdigest()
        with self.lock:
            if not self.granted(company, agent):
                raise Denied('Production root access is not enabled for this agent')
            prior = self.db.execute('SELECT digest,state FROM requests WHERE id=?', (request_id,)).fetchone()
            if prior:
                if prior[0] != digest:
                    raise Denied('Request ID reused for a different command', 409)
                if request_id in self.results:
                    return self.results[request_id]
                raise Denied('This command was already accepted. Check its outcome before submitting another command.', 409)
            if len(self.active) >= 4 or any(job['scope'] == (company, agent) for job in self.active.values()):
                raise Denied('A root command is already running; wait for its result', 409)
            if self.db.execute('SELECT count(*) FROM requests').fetchone()[0] >= 200000:
                raise Denied('Root execution receipt storage needs operator maintenance', 503)
            self.audit('helper_accepted' if helper_id else 'command_accepted', requestId=request_id, companyId=company, agentId=agent, actorId=actor, helperId=helper_id, digest=digest)
            self.db.execute('INSERT INTO requests VALUES (?,?,?)', (request_id, digest, 'accepted'))
            self.db.commit()
            cancel = threading.Event()
            self.active[request_id] = dict(scope=(company, agent), cancel=cancel)
        unit = 'overview-root-helper-' + request_id
        output, truncated, timed_out, revoked = bytearray(), False, False, False
        child = None
        started = time.monotonic()
        try:
            # A transient unit contains descendants, including daemonized children.
            # Its cgroup is stopped on completion, timeout, or revocation.
            child = subprocess.Popen([
                '/usr/bin/systemd-run', '--quiet', '--pipe', '--wait', '--collect', '--expand-environment=no',
                '--unit=' + unit, '--property=Type=exec', '--property=KillMode=control-group',
                '--property=TimeoutStopSec=2s', '--property=RuntimeMaxSec=' + str(timeout / 1000 + 5), '--property=Slice=system-whoxos.slice',
                '--property=WorkingDirectory=/', '--uid=root', '--gid=root',
                '/usr/bin/env', '-i', 'PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
                'HOME=/root', 'LANG=C.UTF-8', *argv,
            ], stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                env={'PATH': '/usr/sbin:/usr/bin:/sbin:/bin'}, start_new_session=True)
            selector = selectors.DefaultSelector()
            selector.register(child.stdout, selectors.EVENT_READ)
            eof = False
            while not eof:
                if cancel.is_set() or time.monotonic() - started > timeout / 1000:
                    revoked = cancel.is_set()
                    timed_out = not revoked
                    subprocess.run(['/usr/bin/systemctl', 'stop', unit], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=8)
                    child.kill()
                    break
                for key, _ in selector.select(0.05):
                    chunk = os.read(key.fileobj.fileno(), 8192)
                    if not chunk:
                        eof = True
                        break
                    remaining = MAX_OUTPUT - len(output)
                    output.extend(chunk[:max(0, remaining)])
                    truncated |= len(chunk) > remaining
            selector.close()
            code = child.wait(timeout=10)
            result = dict(requestId=request_id, exitCode=code, output=output.decode('utf-8', errors='replace'),
                          truncated=truncated, timedOut=timed_out, revoked=revoked, target='production', uid=0)
            with self.lock:
                self.audit('helper_finished' if helper_id else 'command_finished', requestId=request_id, companyId=company, agentId=agent, helperId=helper_id,
                           exitCode=code, timedOut=timed_out, revoked=revoked, truncated=truncated)
                self.db.execute('UPDATE requests SET state=? WHERE id=?', ('finished', request_id))
                self.db.commit()
                # Bounded in-memory replies; persistent receipts prevent unsafe replay after restart/eviction.
                self.results[request_id] = result
                while len(self.results) > 128:
                    self.results.pop(next(iter(self.results)))
            return result
        finally:
            subprocess.run(['/usr/bin/systemctl', 'stop', unit], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=8)
            if child:
                if child.poll() is None:
                    child.kill()
                    child.wait(timeout=5)
                child.stdout.close()
            with self.lock:
                self.active.pop(request_id, None)


class Handler(socketserver.StreamRequestHandler):
    def handle(self):
        self.connection.settimeout(10)
        try:
            check_peer(self.connection, self.server.config_path)
            raw = self.rfile.readline(MAX_REQUEST + 1)
            if len(raw) > MAX_REQUEST or not raw.endswith(b'\n'):
                raise Denied('Request too large', 400)
            result = self.server.broker.dispatch(json.loads(raw))
            reply = dict(ok=True, result=result)
        except Denied as error:
            reply = dict(ok=False, status=error.status, error=str(error))
        except Exception:
            reply = dict(ok=False, status=503, error='Root executor failed; command outcome may be unknown. Do not automatically repeat it.')
        try:
            self.wfile.write(json.dumps(reply).encode() + b'\n')
        except (BrokenPipeError, ConnectionResetError):
            pass


class Server(socketserver.ThreadingUnixStreamServer):
    daemon_threads = False


def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--socket', default='/run/overview-root-executor/control.sock')
    parser.add_argument('--config', default='/etc/overview-labs/root-executor-process.json')
    parser.add_argument('--state', default='/var/lib/overview-root-executor')
    args = parser.parse_args()
    if os.geteuid() != 0:
        raise SystemExit('The production root executor must run as root')
    os.umask(0o077)
    try:
        os.unlink(args.socket)
    except FileNotFoundError:
        pass
    server = Server(args.socket, Handler)
    server.config_path = args.config
    server.broker = Broker(args.state)
    config = trusted_config(args.config)
    os.chown(args.socket, 0, config['gid'])
    os.chmod(args.socket, 0o660)
    def stop(_signal, _frame):
        with server.broker.lock:
            for job in server.broker.active.values():
                job['cancel'].set()
        threading.Thread(target=server.shutdown, daemon=True).start()
    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    try:
        server.serve_forever()
    finally:
        server.server_close()
        server.broker.db.close()


if __name__ == '__main__':
    main()
