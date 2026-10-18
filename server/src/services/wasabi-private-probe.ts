import { mkdir, open } from 'node:fs/promises';
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';

export const WASABI_COMPANY = '0d8aad87-64f2-4f9c-a92c-94a261e140f7';
export const WASABI_CONNECTION = 'eb8abeaa-f7a2-416c-bd3c-0f2d87aff23d';
export const WASABI_BUCKET = 'whox-treasury-research-0d8aad87';
export const WASABI_REGION = 'us-east-1';
const PREFIX = `treasury/${WASABI_COMPANY}/research/verification/`;
const MARKER = Buffer.from('TRS-AESGCM-v1\0');
const MAX = 8192;
const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
type RecordValue = Record<string, unknown>;
type Consumer = (result: unknown) => Promise<unknown>;
export type ProbeExecute = (tool: string, parameters: RecordValue, consumer?: Consumer) => Promise<unknown>;
function record(value: unknown): RecordValue {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : {};
}
export class WasabiProbeError extends Error {
  constructor(readonly code: string) { super(code); }
}
function fail(code: string): never { throw new WasabiProbeError(code); }
export function providerValue(raw: unknown): RecordValue {
  const result = record(raw); const data = record(result.data);
  let value: RecordValue;
  if (data.structuredContent) value = record(data.structuredContent);
  else {
    try { value = record(JSON.parse(String(result.content))); }
    catch { return fail(data.isError ? 'provider_operation_failed' : 'provider_result_invalid'); }
  }
  // Some MCP providers return an application error with isError=false. Never
  // treat that as a presign or absence result, or expose provider error text.
  if (typeof value.error === 'string' && value.error.trim().toLowerCase() === 'reauth_required') {
    fail('provider_reauthentication_required');
  }
  if (data.isError || (value.error !== undefined && value.error !== null && value.error !== false && value.error !== '')) {
    fail('provider_operation_failed');
  }
  return value;
}
function validateScopedUrl(raw: RecordValue, key: string, prefix: string, now: number): URL {
  if (!key.startsWith(prefix) || !/^[a-zA-Z0-9/_-]+\.bin$/.test(key) || key.includes('..')) fail('object_denied');
  if (raw.url === undefined || raw.url === null || raw.url === '') fail('presign_url_missing');
  let u: URL; try { u = new URL(String(raw.url)); } catch { return fail('presign_url_parsing'); }
  const host = `s3.${WASABI_REGION}.wasabisys.com`;
  const virtual = `${WASABI_BUCKET}.${host}`;
  if (u.protocol !== 'https:' || u.username || u.password || u.hash || u.port || ![host, virtual].includes(u.hostname)) fail('host_denied');
  if (u.pathname !== (u.hostname === virtual ? `/${key}` : `/${WASABI_BUCKET}/${key}`)) fail('object_denied');
  const q = u.searchParams;
  if ([...new Set(q.keys())].some(k => q.getAll(k).length !== 1)) fail('presign_duplicate');
  if (q.get('X-Amz-Algorithm') !== 'AWS4-HMAC-SHA256') fail('presign_algorithm');
  if (!/^[a-fA-F0-9]{64}$/.test(q.get('X-Amz-Signature') ?? '')) fail('presign_signature');
  if (!/^[^/]+\/\d{8}\/us-east-1\/s3\/aws4_request$/.test(q.get('X-Amz-Credential') ?? '')) fail('presign_credential_scope');
  if (q.get('X-Amz-SignedHeaders') !== 'host') fail('presign_signed_headers');
  const d = q.get('X-Amz-Date') ?? '';
  if (!/^\d{8}T\d{6}Z$/.test(d)) fail('presign_date');
  const stamped = Date.parse(`${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}T${d.slice(9,11)}:${d.slice(11,13)}:${d.slice(13,15)}Z`);
  const ttl = Number(q.get('X-Amz-Expires'));
  if (!Number.isInteger(ttl) || ttl < 60 || ttl > 300 || ttl !== raw.expiresIn || !Number.isFinite(stamped) || stamped > now + 30000 || stamped + ttl * 1000 <= now) fail('presign_expired');
  return u;
}

export function validateProbeUrl(raw: RecordValue, key: string, now = Date.now()): URL {
  return validateScopedUrl(raw,key,PREFIX,now);
}
export function validateHistoryUrl(raw: RecordValue, key: string, now = Date.now()): URL {
  return validateScopedUrl(raw,key,`treasury/${WASABI_COMPANY}/research/history/`,now);
}

/** Require a complete, successful provider listing before issuing absence receipts.
 * The SDK omits empty arrays, but it must supply pagination and bucket scope. */
export function listingEntries(value: RecordValue, key: string, kind: 'versions' | 'objects'): RecordValue[] {
  if (record(value.$metadata).httpStatusCode !== 200 || value.IsTruncated !== false ||
      value.Name !== WASABI_BUCKET || value.Prefix !== key || !Number.isInteger(value.MaxKeys) ||
      Number(value.MaxKeys) < 1 || Number(value.MaxKeys) > 1000 ||
      ['NextKeyMarker','NextVersionIdMarker','NextContinuationToken'].some(k => value[k] !== undefined && value[k] !== '') ||
      ['KeyMarker','VersionIdMarker'].some(k => value[k] !== undefined && value[k] !== '')) fail('listing_invalid');
  const fields = kind === 'versions' ? ['Versions','DeleteMarkers'] : ['Contents'];
  const entries:RecordValue[]=[];
  for (const field of [...fields,'CommonPrefixes']) {
    if (value[field] === undefined) continue;
    if (!Array.isArray(value[field]) || (field === 'CommonPrefixes' && value[field].length)) fail('listing_invalid');
    if (field === 'CommonPrefixes') continue;
    for (const raw of value[field]) {
      const entry=record(raw);
      if (entry.Key !== key || (kind === 'versions' &&
          (typeof entry.VersionId !== 'string' || !entry.VersionId || entry.VersionId.length > 1024))) fail('listing_invalid');
      entries.push(entry);
    }
  }
  if (entries.length > Number(value.MaxKeys) || (kind === 'objects' &&
      (!Number.isInteger(value.KeyCount) || value.KeyCount !== entries.length))) fail('listing_invalid');
  return entries;
}

/** Durable intent contains metadata only, never URLs, keys or payload bytes. */
export type ProbeJournal = (entry: RecordValue) => Promise<void>;
export const recordProbeIntent: ProbeJournal = async entry => {
  const directory = '/var/lib/whox/.whox/wasabi-probe-intents';
  if (!/^[a-f0-9-]{36}$/.test(String(entry.probeId))) fail('journal_identity_invalid');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const file = await open(`${directory}/${entry.probeId}.jsonl`, 'a', 0o600);
  try { await file.writeFile(JSON.stringify(entry) + '\n'); await file.sync(); }
  finally { await file.close(); }
  const parent = await open(directory, 'r');
  try { await parent.sync(); } finally { await parent.close(); }
};

/** Fixed synthetic probe only. No request-supplied bytes, keys, hosts or prefixes.
 * Each upstream operation must execute via the authenticated connector policy.
 * Raw URLs exist only within the trusted consumer; only receipts reach auditing.
 */
export async function runWasabiPrivateProbe(execute: ProbeExecute, fetchImpl: typeof fetch = fetch, journal: ProbeJournal = recordProbeIntent) {
  const id = randomUUID(); const key = PREFIX + id + '.bin';
  const plain = Buffer.concat([Buffer.from('WHOX synthetic storage probe\n'), randomBytes(4096)]);
  const secret = randomBytes(32); const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', secret, nonce); cipher.setAAD(Buffer.from(key));
  const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
  const payload = Buffer.concat([MARKER, nonce, encrypted, cipher.getAuthTag()]);
  const digest = sha(payload);
  const report: RecordValue = { probeId:id, bucket:WASABI_BUCKET, region:WASABI_REGION, key,
    bytes:payload.length, ciphertextSha256:digest, uploaded:false, readVerified:false, decrypted:false, cleanupVerified:false };
  const op = async (name: string, params: RecordValue, consumer?: Consumer) => {
    const response = record(await execute('wasabi_s3_' + name, params, consumer));
    if (response.decision !== 'allowed' || response.error) fail('tool_not_completed');
    return consumer ? record(response.result) : providerValue(response.result);
  };
  const params = {Bucket:WASABI_BUCKET, region:WASABI_REGION};
  let putStarted = false;
  let putSettled = false;
  const persist = async (state: string) => journal({probeId:id, key, bucket:WASABI_BUCKET,
    ciphertextSha256:digest, bytes:payload.length, state, at:new Date().toISOString()});
  try {
    await op('presign_put_object', {bucket:WASABI_BUCKET,key,region:WASABI_REGION,expiresIn:300,contentType:'application/octet-stream'}, async raw => {
      const url = validateProbeUrl(providerValue(raw), key);
      // Persist intent before dispatch: a killed process leaves a discoverable
      // unresolved key, and an ambiguous network result never means absence.
      await persist('put_pending');
      putStarted = true;
      let response: Response;
      try { response = await fetchImpl(url, {method:'PUT',body:payload,headers:{'Content-Type':'application/octet-stream'},redirect:'error',signal:AbortSignal.timeout(30000)}); }
      catch { return fail('put_outcome_unknown'); }
      if (!response.ok) { await response.body?.cancel(); fail('put_http_failure'); }
      await response.body?.cancel();
      await persist('put_completed');
      putSettled = true; report.uploaded = true;
      return {probeId:id,operation:'synthetic_put',sha256:digest,bytes:payload.length};
    });
    await op('presign_get_object', {bucket:WASABI_BUCKET,key,region:WASABI_REGION,expiresIn:300}, async raw => {
      const url = validateProbeUrl(providerValue(raw), key);
      let received: Buffer;
      try {
        const response = await fetchImpl(url, {redirect:'error',signal:AbortSignal.timeout(30000)});
        if (!response.ok || !response.body) { await response.body?.cancel(); fail('get_http_failure'); }
        const chunks:Buffer[]=[];let size=0;
        for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
          size += chunk.length; if(size > MAX) fail('get_size_limit'); chunks.push(Buffer.from(chunk));
        }
        received = Buffer.concat(chunks);
      } catch(error) { if(error instanceof WasabiProbeError) throw error; return fail('get_failed'); }
      if (received.length !== payload.length || sha(received) !== digest) fail('checksum_mismatch');
      report.readVerified = true;
      try {
        const decipher = createDecipheriv('aes-256-gcm', secret, received.subarray(MARKER.length,MARKER.length+12));
        decipher.setAAD(Buffer.from(key));decipher.setAuthTag(received.subarray(-16));
        const result = Buffer.concat([decipher.update(received.subarray(MARKER.length+12,-16)),decipher.final()]);
        if(!result.equals(plain)) fail('decryption_mismatch');
        result.fill(0); report.decrypted = true;
      } catch { return fail('decryption_failed'); }
      received.fill(0);
      return {probeId:id,operation:'synthetic_get',sha256:digest,bytes:payload.length,decrypted:true};
    });
  } catch(error) { report.error = error instanceof WasabiProbeError ? error.code : 'probe_failed'; }
  finally {
    // A remote PUT may complete after timeout, process loss or an HTTP error.
    // Immediate empty listings cannot settle that uncertainty. Keep its durable
    // intent/key, withhold absence and leave reconciliation explicit.
    try {
      if (putStarted && !putSettled) {
        report.reconciliationRequired = true;
        await persist('put_outcome_unknown');
        fail('unknown_upload_cleanup_held');
      }
      const before = await op('list_object_versions', {...params,Prefix:key,MaxKeys:1000});
      const entries = listingEntries(before,key,'versions');
      for (const entry of entries) {
        if(entry.Key !== key || typeof entry.VersionId !== 'string') fail('cleanup_scope_mismatch');
        await op('delete_object', {...params,Key:key,VersionId:entry.VersionId});
      }
      if(entries.length===0) await op('delete_object', {...params,Key:key});
      const after = await op('list_object_versions', {...params,Prefix:key,MaxKeys:1000});
      const objects = await op('list_objects_v2', {...params,Prefix:key,MaxKeys:1000});
      if(listingEntries(after,key,'versions').length || listingEntries(objects,key,'objects').length) fail('cleanup_incomplete');
      await persist('cleanup_verified');
      report.cleanupVerified = true;
    } catch(error) { report.cleanupError = error instanceof WasabiProbeError ? error.code : 'cleanup_failed'; }
    secret.fill(0);plain.fill(0);payload.fill(0);
  }
  report.ok = report.uploaded === true && report.readVerified === true && report.decrypted === true && report.cleanupVerified === true && !report.error;
  return report;
}
