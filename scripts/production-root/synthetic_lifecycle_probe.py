#!/usr/bin/python3
"""Fixed, no-argument synthetic lifecycle probe. Never uses production paths."""
import hashlib
import json
import os
import sqlite3
import shutil
import stat
import sys
import tempfile
import time
import types
from unittest.mock import patch
from pathlib import Path

sys.dont_write_bytecode = True

BASE = Path('/usr/local/libexec/treasury-research/march29-purpose-v1')
RUNTIME = Path('/usr/local/libexec/treasury-research/history-candidate-20261004')
PINS = {
    'canonical_run.py': '1951940f0465a0347f133b0cae353d66be687444871992d6aec6064d9111aef4',
    'history_stream.py': '6f06638a7953e9d5b10522534c3a2a3fae097dbc169cd5723fb6defa4ea1c01e',
    'persistent_sink.py': '14c29eba89ce4eb81b1a6e8f563d82eae2667fbeb3594149d432b76f1f0196ec',
    'runtime_binding.py': '3d02d57e2d6fb784e25d5f855f1a97e1ad617240c9f0978b650fdd64401e6dff',
    'encrypted_source_spool.py': '2ba8b5067f8cfd981a21e7e8424093ab027f9b48afe14ed6a56ce4ef87258927',
}
MODULE_ORDER = ('history_stream.py', 'canonical_run.py', 'runtime_binding.py',
                'persistent_sink.py', 'encrypted_source_spool.py')
MODULE_NAMES = tuple(name.removesuffix('.py') for name in MODULE_ORDER)
MAX_SOURCE_BYTES = 2 * 1024 * 1024

def fail(code):
    print(json.dumps({'state': 'held', 'error': code}, sort_keys=True))
    raise SystemExit(2)

def runtime_on_sys_path():
    try:
        expected = RUNTIME.resolve()
    except (OSError, RuntimeError):
        return True
    for entry in sys.path:
        if not entry:
            continue
        try:
            if Path(entry).resolve() == expected:
                return True
        except (OSError, RuntimeError, TypeError):
            pass
    return False

def interpreter_flags():
    return {
        'isolated': sys.flags.isolated == 1,
        'noSite': sys.flags.no_site == 1,
        'dontWriteBytecode': sys.flags.dont_write_bytecode == 1,
    }

def metadata_fingerprint(value):
    return (value.st_dev, value.st_ino, value.st_mode, value.st_uid, value.st_gid,
            value.st_nlink, value.st_size, value.st_mtime_ns, value.st_ctime_ns)

def open_runtime_directory():
    flags = os.O_RDONLY | os.O_CLOEXEC | os.O_DIRECTORY | os.O_NOFOLLOW
    try:
        fd = os.open(RUNTIME, flags)
    except OSError:
        fail('runtime_directory_open_failed')
    try:
        info = os.fstat(fd)
        if (not stat.S_ISDIR(info.st_mode) or info.st_uid != 0 or info.st_gid != 0
                or stat.S_IMODE(info.st_mode) != 0o700):
            fail('runtime_directory_metadata_invalid')
        return fd, info
    except BaseException:
        os.close(fd)
        raise

def revalidate_runtime_directory(directory_fd, expected):
    try:
        current = os.fstat(directory_fd)
    except OSError:
        fail('runtime_directory_revalidation_failed')
    if metadata_fingerprint(current) != metadata_fingerprint(expected):
        fail('runtime_directory_changed')
    flags = os.O_RDONLY | os.O_CLOEXEC | os.O_DIRECTORY | os.O_NOFOLLOW
    try:
        rebound_fd = os.open(RUNTIME, flags)
    except OSError:
        fail('runtime_directory_revalidation_failed')
    try:
        rebound = os.fstat(rebound_fd)
        if metadata_fingerprint(rebound) != metadata_fingerprint(expected):
            fail('runtime_directory_rebound')
    finally:
        os.close(rebound_fd)

def verified_source(directory_fd, directory_info, filename, expected):
    if filename not in MODULE_ORDER or Path(filename).name != filename:
        fail('pinned_source_name_invalid')
    flags = os.O_RDONLY | os.O_CLOEXEC | os.O_NOFOLLOW | os.O_NONBLOCK
    if hasattr(os, 'O_NOATIME'):
        flags |= os.O_NOATIME
    try:
        fd = os.open(filename, flags, dir_fd=directory_fd)
    except OSError:
        fail('pinned_source_open_failed')
    try:
        before = os.fstat(fd)
        if (not stat.S_ISREG(before.st_mode) or before.st_uid != 0 or before.st_gid != 0
                or stat.S_IMODE(before.st_mode) != 0o600 or before.st_nlink != 1
                or before.st_dev != directory_info.st_dev
                or before.st_size <= 0 or before.st_size > MAX_SOURCE_BYTES):
            fail('pinned_source_metadata_invalid')
        chunks = []
        remaining = before.st_size
        try:
            while remaining:
                part = os.read(fd, min(remaining, 1024 * 1024))
                if not part:
                    fail('pinned_source_short_read')
                chunks.append(part)
                remaining -= len(part)
            if os.read(fd, 1):
                fail('pinned_source_grew')
            after = os.fstat(fd)
        except OSError:
            fail('pinned_source_read_failed')
        if metadata_fingerprint(before) != metadata_fingerprint(after):
            fail('pinned_source_changed')
        raw = b''.join(chunks)
        actual = hashlib.sha256(raw).hexdigest()
        if actual != expected:
            fail('pinned_source_mismatch')
        return raw, actual
    finally:
        os.close(fd)

def load_verified_runtime():
    if not sys.dont_write_bytecode:
        fail('bytecode_writes_not_disabled')
    if runtime_on_sys_path():
        fail('runtime_import_path_denied')
    if set(PINS) != set(MODULE_ORDER) or len(MODULE_NAMES) != len(set(MODULE_NAMES)):
        fail('pinned_source_configuration_invalid')
    if any(name in sys.modules for name in MODULE_NAMES):
        fail('runtime_module_already_loaded')
    sources, verified = {}, {}
    directory_fd, directory_info = open_runtime_directory()
    try:
        for filename in MODULE_ORDER:
            raw, actual = verified_source(directory_fd, directory_info, filename, PINS[filename])
            sources[filename] = raw
            verified[filename] = actual
        revalidate_runtime_directory(directory_fd, directory_info)
    finally:
        os.close(directory_fd)
    modules = {}
    for filename, name in zip(MODULE_ORDER, MODULE_NAMES):
        module = types.ModuleType(name)
        module.__file__ = str(RUNTIME / filename)
        module.__package__ = ''
        module.__loader__ = None
        module.__cached__ = None
        modules[name] = module
        sys.modules[name] = module
    executed = {}
    try:
        for filename, name in zip(MODULE_ORDER, MODULE_NAMES):
            module = modules[name]
            code = compile(sources[filename], module.__file__, 'exec', dont_inherit=True, optimize=0)
            exec(code, module.__dict__)
            executed[filename] = hashlib.sha256(sources[filename]).hexdigest()
        if (verified != {name: PINS[name] for name in MODULE_ORDER}
                or executed != {name: PINS[name] for name in MODULE_ORDER}
                or tuple(modules) != MODULE_NAMES
                or any(sys.modules.get(name) is not modules[name] for name in MODULE_NAMES)):
            fail('executed_source_set_mismatch')
    except BaseException:
        for name, module in modules.items():
            if sys.modules.get(name) is module:
                sys.modules.pop(name, None)
        raise
    return modules, verified, executed

def main():
    if len(sys.argv) != 1:
        fail('arguments_denied')
    if os.geteuid() != 0:
        fail('root_probe_required')
    if Path(__file__).resolve() != BASE / 'synthetic_lifecycle_probe.py':
        fail('probe_path_mismatch')
    flags = interpreter_flags()
    if not all(flags.values()):
        fail('interpreter_flags_invalid')
    modules, hashes, executed_hashes = load_verified_runtime()
    Held, digest = modules['history_stream'].Held, modules['history_stream'].digest
    PersistentSink = modules['persistent_sink'].PersistentSink
    cleanup = modules['encrypted_source_spool'].cleanup

    class SyntheticTransport:
        def __init__(self): self.copies = {'live': {}, 'backup': {}, 'replica': {}}
        def verified_chunk(self, binding, ordinal, payload, sha):
            from history_stream import remote_key
            key = remote_key(binding, 'chunk:' + str(ordinal))
            for replica in self.copies.values(): replica[key] = bytes(payload)
            return {'verified': True, 'ordinal': ordinal, 'plaintextSha256': sha,
                    'plaintextBytes': len(payload), 'objectKey': key}
        def delete_verified(self, binding, gate, key):
            for replica in self.copies.values(): replica.pop(key, None)
            return {'objectKey': key, 'allVersionsAbsent': all(key not in x for x in self.copies.values()), 'dispatchSettled': True}

    def lifecycle(path, purpose, *, expiry):
        transport = SyntheticTransport()
        events, ended = [], set()
        def witness(op, ids):
            events.append((op, tuple(ids)))
            if op == 'end': ended.update(ids)
            return [ident for ident in ids if ident in ended]
        now = time.time()
        gate = {'purpose': purpose, 'expiresAt': expiry if expiry is not None else now + 60, 'maxBytes': 1024}
        binding = {'envelopeSha256': 'synthetic-envelope-' + purpose, 'queryId': 'synthetic-query-' + purpose,
                   'querySha256': 'synthetic-query-hash-' + purpose, 'identity': 'synthetic',
                   'artifactHashes': {'fixture': 'synthetic'}}
        db_path = path / 'journal.sqlite'
        sink = PersistentSink(str(db_path), transport, lambda _: gate)
        handle = sink.begin(binding, gate)
        from history_stream import remote_key
        payload = b'TASK-181 synthetic object bytes'
        key = remote_key(binding, 'chunk:0')
        receipt = sink.append(handle, 0, payload, hashlib.sha256(payload).hexdigest())
        created = receipt['objectKey'] == key and all(r.get(key) == payload for r in transport.copies.values())
        db = sqlite3.connect(db_path)
        try: serialized_gate = db.execute('SELECT gate FROM queries WHERE id=?', (handle,)).fetchone()[0]
        finally: db.close()
        # Reopen from disk, like a restored worker process. No gate edits or end call.
        sink = PersistentSink(str(db_path), transport, lambda _: gate)
        return sink, transport, witness, ended, events, gate, serialized_gate, handle, key, payload, created, db_path
    with tempfile.TemporaryDirectory(prefix='task181-synthetic-') as temp:
        root = Path(temp)
        # Expiry path: clock substitution exists only while using this TemporaryDirectory fixture.
        expiry_dir = root / 'expiry'; expiry_dir.mkdir()
        vals = lifecycle(expiry_dir, 'synthetic-expiry-only', expiry=None)
        sink, transport, witness, ended, events, gate, serialized_gate, handle, key, payload, object_created, db_path = vals
        if db_path.resolve().parent != expiry_dir.resolve() or not isinstance(transport, SyntheticTransport):
            fail('fixture_boundary_invalid')
        before_deadline = time.time()
        pre_rows = sink.recover(witness)
        with sink.db() as db:
            pre_metadata = (db.execute('SELECT count(*) FROM queries').fetchone()[0] == 1 and
                db.execute('SELECT count(*) FROM remote_intents WHERE object_key=? AND state="verified"', (key,)).fetchone()[0] == 1)
            unchanged_gate = db.execute('SELECT gate FROM queries WHERE id=?', (handle,)).fetchone()[0] == serialized_gate
        after_pre = all(replica.get(key) == payload for replica in transport.copies.values())
        fixture_time = {'value': gate['expiresAt'] + 1, 'active': True}
        real_time = time.time
        def controlled_time():
            # Only the pinned recovery implementation may observe this substituted clock.
            import inspect
            caller = inspect.currentframe().f_back.f_code.co_filename
            if not fixture_time['active'] or Path(caller).resolve() != (RUNTIME / 'persistent_sink.py').resolve():
                raise RuntimeError('fixture_clock_escape')
            return fixture_time['value']
        try:
            event_count_before_expiry = len(events)
            with patch.object(time, 'time', controlled_time):
                expired_rows = sink.recover(witness)
        finally:
            fixture_time['active'] = False
        production_clock_unchanged = time.time is real_time
        expiry_events = events[event_count_before_expiry:]
        copies_absent = all(key not in replica for replica in transport.copies.values())
        expiry_witness_ended = bool(ended) and any(op == 'end' for op, _ in expiry_events)
        with sink.db() as db:
            query_ended = db.execute('SELECT state FROM queries WHERE id=?', (handle,)).fetchone()[0] == 'ended'
            rows = db.execute('SELECT receipt FROM deletion_receipts').fetchall()
            absence_receipts = len(rows) == 1 and all(json.loads(row[0]).get('allVersionsAbsent') is True and json.loads(row[0]).get('dispatchSettled') is True for row in rows)
            settled_intents = db.execute("SELECT count(*) FROM remote_intents WHERE query_id=? AND state='verified'", (handle,)).fetchone()[0] == 1
            same_gate_after = db.execute('SELECT gate FROM queries WHERE id=?', (handle,)).fetchone()[0] == serialized_gate
        allowed_local = {db_path, Path(str(db_path) + '.writer-lock')}
        no_local_bytes = not any(p.is_file() and p not in allowed_local for p in expiry_dir.rglob('*'))

        # Purpose-end tombstone is a distinct query and journal, independent of expiry.
        end_dir = root / 'purpose-end'; end_dir.mkdir()
        end_vals = lifecycle(end_dir, 'synthetic-purpose-end-only', expiry=time.time() + 3600)
        end_sink, end_transport, end_witness, end_set, end_events, end_gate, end_serialized, end_handle, end_key, end_payload, end_created, end_db = end_vals
        end_rows = end_sink.end(end_gate['purpose'], end_witness)
        end_absent = all(end_key not in replica for replica in end_transport.copies.values())
        with end_sink.db() as db:
            explicit_end_receipts = len(db.execute('SELECT receipt FROM deletion_receipts').fetchall()) == 1
            end_query = db.execute('SELECT state FROM queries WHERE id=?', (end_handle,)).fetchone()[0] == 'ended'
        tombstone = bool(end_set) and end_absent and explicit_end_receipts and end_query
        cleanup_result = cleanup(end_witness, root=root / 'spool-absent')
        ok = bool(object_created and not pre_rows and pre_metadata and after_pre and unchanged_gate and
            expired_rows and copies_absent and expiry_witness_ended and query_ended and absence_receipts and
            settled_intents and same_gate_after and no_local_bytes and production_clock_unchanged and
            tombstone and end_created and end_rows and cleanup_result == [])
        print(json.dumps({'state': 'ok' if ok else 'failed', 'synthetic': True,
            'expiryBranch': {'allThreeRemoteCopiesAbsent': copies_absent, 'expiryWitnessMarkedEnded': expiry_witness_ended,
                'queryEnded': query_ended, 'settledAbsenceReceipts': absence_receipts, 'gateUnmodified': unchanged_gate and same_gate_after,
                'noLocalBytesRecreated': no_local_bytes, 'persistedRowsRecovered': pre_metadata,
                'realRecoverCalledWithoutPriorEnd': bool(expiry_events) and expiry_events[0][0] == 'check' and
                    next((i for i, (op, _) in enumerate(expiry_events) if op == 'end'), 999) > 0,
                'clockSubstitutionScopedToRecoveryWithinTemporaryDirectory': production_clock_unchanged},
            'explicitPurposeEndTombstone': tombstone,
            'syntheticObjectCreatedThroughSinkAppend': object_created,
            'preExpiryRecoverRetainsIntentAndRemoteBytes': not pre_rows and after_pre and pre_metadata,
            'postExpiryRecoverPurgesSameObject': query_ended and copies_absent,
            'localObjectRestore': 'unsupported_by_pinned_PersistentSink_API',
            'restoreApiLimitation': 'PersistentSink.recover reconciles journal metadata and purges expired remote objects; it has no remote fetch/local object restoration operation.',
            'cleanupEntryPoint': cleanup_result == [], 'productionStateTouched': False,
            'providerCalls': 0, 'sourceHashes': hashes, 'verifiedSourceHashes': hashes,
            'executedSourceHashes': executed_hashes, 'sourceExecutionMode': 'verified_source_bytes',
            'executedModules': list(modules), 'loadedRuntimeModules': list(modules),
            'runtimeModuleLoadOrder': list(MODULE_ORDER),
            'runtimeOnSysPath': runtime_on_sys_path(), 'bytecodeWritesDisabled': sys.dont_write_bytecode,
            'interpreterFlags': flags}, sort_keys=True))
        if not ok: raise SystemExit(1)

if __name__ == '__main__': main()
