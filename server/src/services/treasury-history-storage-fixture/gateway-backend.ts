/** Staged Board-attributed gateway adapter; this file registers no live route.
 * Expected scope and operator come from server-owned fixture admission. The
 * worker signs fixed operations. No gateway session or Data bearer is borrowed.
 */
import { createHash, verify } from 'node:crypto';
import { mkdir, open, readFile, rename, stat } from 'node:fs/promises';
import {
  listingEntries, providerValue, WASABI_BUCKET, WASABI_COMPANY,
  WASABI_CONNECTION, WASABI_REGION, type ProbeExecute,
} from '../wasabi-private-probe.js';

export const FIXTURE_PREFIX = `treasury/${WASABI_COMPANY}/research/history-storage-fixture-v1/`;
export const FIXTURE_FINANCE_AGENT = '10bf5dc5-8522-42a2-8456-9bc50cdd982d';
const MAX = 65536;
type Obj = Record<string, any>;
export type FixtureScope = { binding: Obj; gate: Obj };
type Transfer = { connectionId: string; operatorUserId: string; action: 'put' | 'get' | 'delete';
  row: { key: string; label: string; sha256: string; bytes: number }; scope: FixtureScope;
  at: number; nonce: string; ciphertext?: string };
export class FixtureGatewayError extends Error {
  constructor(readonly code = 'fixture_transfer_denied_or_unavailable') { super(code); }
}
function deny(code?: string): never { throw new FixtureGatewayError(code); }
function sorted(v: any): any {
  if (Array.isArray(v)) return v.map(sorted);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map(k => [k, sorted(v[k])]));
  return v;
}
export const canonical = (v: unknown) => JSON.stringify(sorted(v));
const hash = (v: string | Buffer) => createHash('sha256').update(v).digest('hex');
export function fixtureKey(binding: Obj, label: string) {
  const id = hash(canonical({ binding, label })).slice(0, 32);
  return FIXTURE_PREFIX + `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}.bin`;
}
export function authenticateFixtureTransfer(envelope: unknown, publicKey: string,
  operatorUserId: string, expected: FixtureScope, now = Date.now()): Transfer {
  try {
    const e = envelope as Obj;
    if (!e || Object.keys(e).sort().join(',') !== 'payload,signature' ||
        typeof e.payload !== 'string' || e.payload.length > 131072 ||
        typeof e.signature !== 'string' || e.signature.length !== 88) deny();
    const bytes = Buffer.from(e.payload, 'base64');
    if (!verify(null, bytes, publicKey, Buffer.from(e.signature, 'base64'))) deny();
    const r = JSON.parse(bytes.toString()) as Transfer;
    const fields = ['action', 'at', 'connectionId', 'nonce', 'operatorUserId', 'row', 'scope',
      ...(r.action === 'put' ? ['ciphertext'] : [])].sort().join(',');
    if (Object.keys(r).sort().join(',') !== fields || r.connectionId !== WASABI_CONNECTION ||
        r.operatorUserId !== operatorUserId || !operatorUserId ||
        !['put', 'get', 'delete'].includes(r.action) ||
        !Number.isSafeInteger(r.at) || Math.abs(now - r.at) > 30000 ||
        !/^[a-f0-9-]{36}$/.test(r.nonce) || canonical(r.scope) !== canonical(expected) ||
        expected.binding.identity?.companyId !== WASABI_COMPANY ||
        expected.binding.identity?.role !== 'storage_fixture' ||
        expected.gate.mode !== 'fixed-nonlicensed-history-storage-fixture-v1' ||
        Object.keys(r.row).sort().join(',') !== 'bytes,key,label,sha256' ||
        !/^[a-f0-9]{64}$/.test(r.row.sha256) || !Number.isSafeInteger(r.row.bytes)) deny();
    if (r.action === 'delete') {
      if (r.row.bytes !== 0 || r.row.sha256 !== '0'.repeat(64) || r.row.label !== 'purpose-end' ||
          !['chunk:0', 'manifest'].some(v => fixtureKey(expected.binding, v) === r.row.key)) deny();
    } else if (!['chunk:0', 'manifest'].includes(r.row.label) ||
        r.row.key !== fixtureKey(expected.binding, r.row.label) || r.row.bytes < 42 || r.row.bytes > MAX) deny();
    if (r.action === 'put') {
      if (typeof r.ciphertext !== 'string' || r.ciphertext.length > Math.ceil(MAX / 3) * 4) deny();
      const payload = Buffer.from(r.ciphertext, 'base64');
      if (payload.length !== r.row.bytes || hash(payload) !== r.row.sha256 ||
          !payload.subarray(0, 14).equals(Buffer.from('TRS-AESGCM-v1\0'))) deny();
    }
    return r;
  } catch { return deny(); }
}

/** Validate the new namespace without widening existing production validators. */
export function validateFixtureUrl(raw: Obj, key: string, now = Date.now()): URL {
  if (!key.startsWith(FIXTURE_PREFIX) || !/^[a-zA-Z0-9/_-]+\.bin$/.test(key) || key.includes('..')) deny();
  let url: URL;
  try { url = new URL(String(raw.url)); } catch { return deny(); }
  const host = `s3.${WASABI_REGION}.wasabisys.com`, virtual = `${WASABI_BUCKET}.${host}`;
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.port ||
      ![host, virtual].includes(url.hostname) ||
      url.pathname !== (url.hostname === virtual ? `/${key}` : `/${WASABI_BUCKET}/${key}`)) deny();
  const q = url.searchParams;
  if ([...new Set(q.keys())].some(k => q.getAll(k).length !== 1) ||
      q.get('X-Amz-Algorithm') !== 'AWS4-HMAC-SHA256' ||
      !/^[a-fA-F0-9]{64}$/.test(q.get('X-Amz-Signature') ?? '') ||
      !/^[^/]+\/\d{8}\/us-east-1\/s3\/aws4_request$/.test(q.get('X-Amz-Credential') ?? '') ||
      q.get('X-Amz-SignedHeaders') !== 'host') deny();
  const d = q.get('X-Amz-Date') ?? '', ttl = Number(q.get('X-Amz-Expires'));
  if (!/^\d{8}T\d{6}Z$/.test(d)) deny();
  const stamped = Date.parse(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T${d.slice(9, 11)}:${d.slice(11, 13)}:${d.slice(13, 15)}Z`);
  if (!Number.isInteger(ttl) || ttl < 60 || ttl > 300 || ttl !== raw.expiresIn ||
      !Number.isFinite(stamped) || stamped > now + 30000 || stamped + ttl * 1000 <= now) deny();
  return url;
}

async function persistNew(path: string, value: Obj) {
  const file = await open(path, 'wx', 0o600);
  try { await file.writeFile(JSON.stringify(value)); await file.sync(); } finally { await file.close(); }
}
async function syncDir(directory: string) {
  const file = await open(directory, 'r'); try { await file.sync(); } finally { await file.close(); }
}
async function ended(path: string) {
  try { await stat(path); } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw e;
  }
  return true;
}

/** Uses executeTestCall + consumePrivateResult, exactly like private-storage-probe.
 * directory is a fixed protected fixture journal supplied by server setup.
 * authorize rechecks Board membership, tools permission and Finance test rights.
 */
export async function fixtureGatewayTransfer(r: Transfer, execute: ProbeExecute,
  authorize: () => Promise<void>, directory: string, fetchImpl: typeof fetch = fetch) {
  const keyFile = `${directory}/key-${hash(r.row.key)}.json`;
  const endedFile = `${directory}/ended-${hash(r.row.key)}.json`;
  const deletedFile = `${directory}/deleted-${hash(r.row.key)}.json`;
  let privateBytes: Buffer | undefined;
  const op = async (name: string, params: Obj, consumer?: (raw: unknown) => Promise<unknown>) => {
    await authorize();
    const response = await execute('wasabi_s3_' + name, params, consumer) as Obj;
    if (response?.decision !== 'allowed' || response.error) deny();
    return consumer ? response.result : providerValue(response.result);
  };
  try {
    await authorize();
    await mkdir(directory, { recursive: true, mode: 0o700 });
    if (r.action === 'delete' && await ended(deletedFile)) {
      const receipt = JSON.parse(await readFile(deletedFile, 'utf8')) as Obj;
      if (Object.keys(receipt).sort().join(',') !== 'allVersionsAbsent,dispatchSettled,objectKey' ||
          receipt.objectKey !== r.row.key || receipt.allVersionsAbsent !== true || receipt.dispatchSettled !== true) deny();
      await authorize();
      return receipt;
    }
    // Nonces and key reservations are permanent across API and worker restart.
    await persistNew(`${directory}/nonce-${r.nonce}.json`, { action: r.action, key: r.row.key });
    await syncDir(directory);
    if (r.action === 'put') {
      if (await ended(endedFile)) deny();
      await persistNew(keyFile, { ...r.row, scope: r.scope, nonce: r.nonce, state: 'dispatch_unknown' });
      await syncDir(directory);
    } else {
      const saved = JSON.parse(await readFile(keyFile, 'utf8')) as Obj;
      if (saved.state !== 'put_settled' || canonical(saved.scope) !== canonical(r.scope) || saved.key !== r.row.key) deny();
      if (r.action === 'get' && (await ended(endedFile) || saved.sha256 !== r.row.sha256 || saved.bytes !== r.row.bytes)) deny();
    }
    const params = { Bucket: WASABI_BUCKET, region: WASABI_REGION };
    if (r.action === 'delete') {
      if (!await ended(endedFile)) {
        try { await persistNew(endedFile, { key: r.row.key, ended: true }); }
        catch (e) { if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e; }
      }
      await syncDir(directory);
      const entries = listingEntries(await op('list_object_versions', { ...params, Prefix: r.row.key, MaxKeys: 1000 }), r.row.key, 'versions');
      for (const entry of entries) await op('delete_object', { ...params, Key: r.row.key, VersionId: entry.VersionId });
      if (!entries.length) await op('delete_object', { ...params, Key: r.row.key });
      const versions = listingEntries(await op('list_object_versions', { ...params, Prefix: r.row.key, MaxKeys: 1000 }), r.row.key, 'versions');
      const objects = listingEntries(await op('list_objects_v2', { ...params, Prefix: r.row.key, MaxKeys: 1000 }), r.row.key, 'objects');
      if (versions.length || objects.length) deny();
      await authorize();
      const receipt = { objectKey: r.row.key, allVersionsAbsent: true, dispatchSettled: true };
      await persistNew(deletedFile, receipt); await syncDir(directory);
      return receipt;
    }
    let consumed = false;
    const result = await op('presign_' + r.action + '_object', {
      bucket: WASABI_BUCKET, key: r.row.key, region: WASABI_REGION, expiresIn: 300,
      ...(r.action === 'put' ? { contentType: 'application/octet-stream' } : {}),
    }, async raw => {
      try {
        await authorize();
        if (await ended(endedFile)) deny();
        const url = validateFixtureUrl(providerValue(raw), r.row.key);
        const response = await fetchImpl(url, { method: r.action.toUpperCase(), redirect: 'error',
          signal: AbortSignal.timeout(30000), ...(r.action === 'put' ? {
            body: Buffer.from(r.ciphertext!, 'base64'), headers: { 'Content-Type': 'application/octet-stream' },
          } : {}) });
        if (!response.ok) { await response.body?.cancel(); deny(); }
        if (r.action === 'get') {
          if (!response.body) deny();
          const chunks: Buffer[] = []; let size = 0;
          for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
            size += chunk.length; if (size > r.row.bytes) deny(); chunks.push(Buffer.from(chunk));
          }
          privateBytes = Buffer.concat(chunks);
          if (privateBytes.length !== r.row.bytes || hash(privateBytes) !== r.row.sha256) deny();
        } else {
          await response.body?.cancel();
          const saved = JSON.parse(await readFile(keyFile, 'utf8')) as Obj;
          if (saved.state !== 'dispatch_unknown' || saved.nonce !== r.nonce) deny();
          await persistNew(keyFile + '.settling', { ...saved, state: 'put_settled' });
          await rename(keyFile + '.settling', keyFile); await syncDir(directory);
        }
        await authorize(); if (await ended(endedFile)) deny(); consumed = true;
        return { action: r.action, key: r.row.key, sha256: r.row.sha256, bytes: r.row.bytes };
      } catch { return deny(r.action === 'put' ? 'fixture_put_outcome_unknown' : 'fixture_read_unverified'); }
    });
    if (!consumed) deny();
    return { receipt: result, ...(privateBytes ? { ciphertext: privateBytes.toString('base64') } : {}) };
  } catch { return deny(r.action === 'put' ? 'fixture_put_outcome_unknown' : 'fixture_transfer_unverified'); }
  finally { privateBytes?.fill(0); }
}
