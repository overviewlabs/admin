/** Real bounded launcher IPC; only server-owned protected configuration selects paths. */
import { constants } from 'node:fs';
import { open, lstat, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { connect } from 'node:net';
import { dirname, join, relative, isAbsolute } from 'node:path';
import type { Request } from 'express';
import { canonical, type FixtureScope } from './gateway-backend.js';
import { trustedBoardMutationOrigin } from '../../middleware/board-mutation-guard.js';

export const FIXTURE_STAGE_ROOT = '/tmp/treasury-history-storage-fixture-v1';
const MAX = 65536;
type Obj = Record<string, any>;
function held(): never { throw new Error('fixture_protected_host_held'); }
export function fixedStagePath(path: string) {
  const rel = relative(FIXTURE_STAGE_ROOT, path);
  if (!isAbsolute(path) || !rel || rel.startsWith('..') || isAbsolute(rel)) held();
  return path;
}
export async function trustedFixtureFile(path: string, secret = false): Promise<Buffer> {
  fixedStagePath(path);
  for (let parent = dirname(path); ; parent = dirname(parent)) {
    const info = await lstat(parent);
    if (!info.isDirectory() || info.isSymbolicLink() || info.uid !== 0 || (info.mode & 0o022)) held();
    if (parent === FIXTURE_STAGE_ROOT) break;
    if (parent === dirname(parent)) held();
  }
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.uid !== 0 || (info.mode & (secret ? 0o077 : 0o022)) || info.size > 262144) held();
    const raw = await handle.readFile(); if (raw.length > 262144) held(); return raw;
  } finally { await handle.close(); }
}
export async function trustedFixtureJson(path: string): Promise<Obj> {
  const value = JSON.parse((await trustedFixtureFile(path)).toString());
  if (!value || typeof value !== 'object' || Array.isArray(value)) held();
  return value;
}
export async function verifySourcePins(sourceRoot: string, sourcePins: Record<string, string>) {
  fixedStagePath(sourceRoot);
  const expected = ['fixture.py', 'fixture_host.py', 'fixture_primitives.py', 'fixture_retention.py',
    'fixture_broker.py', 'gateway_client.py', 'persistent_sink.py', 'private_transport.py',
    'fixture-entry.py', 'gateway-backend.ts', 'fixture-routes.ts', 'fixture-host.ts',
    'server-integration.ts', 'upstream-pins.json'];
  if (Object.keys(sourcePins).sort().join(',') !== expected.sort().join(',')) held();
  for (const [name, sha] of Object.entries(sourcePins)) {
    if (!/^[a-f0-9]{64}$/.test(sha) || createHash('sha256').update(await trustedFixtureFile(join(sourceRoot, name))).digest('hex') !== sha) held();
  }
}

export async function launchFixedFixtureWorker(configPath: string, operator: {
  companyId: string; connectionId: string; userId: string }, scope: FixtureScope,
  req: Request, operation: 'prove' | 'cleanup' = 'prove'): Promise<unknown> {
  const config = await trustedFixtureJson(configPath);
  const runtime = dirname(configPath), socketPath = join(runtime, 'worker.sock');
  if (config.schema !== 'fixture-server-config-v1' || config.enabled !== true ||
      config.socketPath !== socketPath || config.sourceRoot !== join(dirname(runtime), 'release') ||
      operator.userId !== config.operatorUserId || canonical(scope) !== canonical(config.scope)) held();
  await verifySourcePins(config.sourceRoot, config.sourcePins);
  const socket = await lstat(socketPath);
  if (!socket.isSocket() || socket.isSymbolicLink() || socket.uid !== config.allowedPeerUid || (socket.mode & 0o077)) held();
  // Normal original Board credential only. No agent JWT or gateway-token fallback.
  const authorization = req.header('authorization'), cookie = req.header('cookie');
  const origin = cookie && !authorization ? trustedBoardMutationOrigin(req) : undefined;
  const boardCredential = authorization?.startsWith('Bearer ')
    ? { kind: 'bearer', value: authorization.slice(7) }
    : !authorization && cookie && origin ? { kind: 'cookie', value: cookie, origin } : undefined;
  if (!boardCredential || boardCredential.value.length < 16 || boardCredential.value.length > 16384 ||
      /[\r\n\0]/.test(boardCredential.value)) held();
  const encoded = Buffer.from(JSON.stringify({ operation, operatorUserId: operator.userId, boardCredential, scope }) + '\n');
  if (encoded.length > MAX) held();
  return new Promise((resolve, reject) => {
    const connection = connect(socketPath); const chunks: Buffer[] = []; let count = 0;
    let finished = false;
    const fail = () => { if (!finished) { finished = true; connection.destroy(); reject(new Error('fixture_worker_held')); } };
    connection.setTimeout(90000, fail);
    connection.on('error', fail);
    connection.on('connect', () => { connection.write(encoded, () => encoded.fill(0)); });
    connection.on('data', part => {
      count += part.length;
      if (count > MAX) return fail();
      chunks.push(part);
      const body = Buffer.concat(chunks);
      if (!body.includes(10)) return;
      try {
        if (body[body.length - 1] !== 10 || body.subarray(0, -1).includes(10)) return fail();
        const value = JSON.parse(body.toString());
        if (value?.ok !== true || Object.keys(value).sort().join(',') !== 'ok,proof') return fail();
        finished = true; connection.destroy(); resolve(value.proof);
      } catch { fail(); }
      finally { body.fill(0); }
    });
    connection.on('end', () => { if (!finished) fail(); });
  });
}
