import { Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { S3Client, type S3ClientConfig } from '@aws-sdk/client-s3';
import { executeWasabiDirectS3, WasabiDirectError, type WasabiDirectInput } from '../services/wasabi-direct-s3.js';
import { WASABI_COMPANY, WASABI_CONNECTION, WASABI_BUCKET, WASABI_REGION, providerValue, validateHistoryUrl, listingEntries } from '../services/wasabi-private-probe.js';

const key = `treasury/${WASABI_COMPANY}/research/history/manufactured/record.bin`;
const fixtureKey = `treasury/${WASABI_COMPANY}/research/history-storage-fixture-v1/manufactured.bin`;
const credentials = vi.fn(async () => ({ accessKeyId: 'MANUFACTURED_ACCESS_KEY', secretAccessKey: 'MANUFACTURED_SECRET_KEY' }));
function input(toolName = 'wasabi_s3_presign_get_object', parameters: Record<string, unknown> = { bucket: WASABI_BUCKET, region: WASABI_REGION, key, expiresIn: 60 }): WasabiDirectInput {
  return { companyId: WASABI_COMPANY, connectionId: WASABI_CONNECTION, toolName, parameters, credentials };
}
const listArgs = { Bucket: WASABI_BUCKET, Prefix: key, region: WASABI_REGION, MaxKeys: 1000 };
type Request = { path: string; query: Record<string, unknown>; method: string };

describe('fixed direct Wasabi API adapter', () => {
  for (const action of ['get', 'put']) it(`actual SDK ${action} presign satisfies the unchanged private URL validator`, async () => {
    const raw = await executeWasabiDirectS3(input(`wasabi_s3_presign_${action}_object`, { bucket: WASABI_BUCKET, region: WASABI_REGION, key, expiresIn: 60, ...(action === 'put' ? { contentType: 'application/octet-stream' } : {}) }));
    const value = providerValue(raw);
    const url = validateHistoryUrl(value, key);
    expect(url.hostname).toBe('s3.us-east-1.wasabisys.com');
    expect(url.searchParams.get('X-Amz-SignedHeaders')).toBe('host');
    expect(url.searchParams.get('X-Amz-Credential')).toMatch(/^MANUFACTURED_ACCESS_KEY\//);
    expect(JSON.stringify(raw)).not.toContain('MANUFACTURED_SECRET_KEY');
  });
  for (const [name, mutate] of [
    ['cross-company', (p: WasabiDirectInput) => { p.companyId = 'other'; }],
    ['cross-connection', (p: WasabiDirectInput) => { p.connectionId = 'other'; }],
    ['unknown action', (p: WasabiDirectInput) => { p.toolName = 'wasabi_s3_delete_bucket'; }],
    ['wrong bucket', (p: WasabiDirectInput) => { (p.parameters as Record<string, unknown>).bucket = 'other'; }],
    ['wrong region', (p: WasabiDirectInput) => { (p.parameters as Record<string, unknown>).region = 'eu-central-1'; }],
    ['root listing', (p: WasabiDirectInput) => { p.toolName = 'wasabi_s3_list_objects_v2'; p.parameters = { ...listArgs, Prefix: `treasury/${WASABI_COMPANY}/research/` }; }],
    ['traversal', (p: WasabiDirectInput) => { (p.parameters as Record<string, unknown>).key = key.replace('manufactured/', '../'); }],
    ['external endpoint injection', (p: WasabiDirectInput) => { (p.parameters as Record<string, unknown>).endpoint = 'https://attacker.invalid'; }],
    ['unbounded ttl', (p: WasabiDirectInput) => { (p.parameters as Record<string, unknown>).expiresIn = 301; }],
    ['unbounded listing', (p: WasabiDirectInput) => { p.toolName = 'wasabi_s3_list_objects_v2'; p.parameters = { ...listArgs, MaxKeys: 1001 }; }],
    ['ambiguous pagination', (p: WasabiDirectInput) => { p.toolName = 'wasabi_s3_list_objects_v2'; p.parameters = { ...listArgs, ContinuationToken: 'hidden' }; }],
    ['control in version', (p: WasabiDirectInput) => { p.toolName = 'wasabi_s3_delete_object'; p.parameters = { Bucket: WASABI_BUCKET, region: WASABI_REGION, Key: key, VersionId: 'a\nb' }; }],
  ] as const) it(`denies ${name} before resolving credentials or making requests`, async () => {
    const request = input(); mutate(request); const resolver = vi.fn(() => credentials()); request.credentials = resolver;
    await expect(executeWasabiDirectS3(request)).rejects.toBeInstanceOf(WasabiDirectError);
    expect(resolver).not.toHaveBeenCalled();
  });
  it('opens the exact fixture namespace only for the trusted private scope', async () => {
    const denied = input('wasabi_s3_list_objects_v2', { ...listArgs, Prefix: fixtureKey });
    const deniedResolver = vi.fn(() => credentials()); denied.credentials = deniedResolver;
    await expect(executeWasabiDirectS3(denied)).rejects.toThrow('wasabi_direct_scope_denied');
    expect(deniedResolver).not.toHaveBeenCalled();
    const raw = await executeWasabiDirectS3({
      ...input('wasabi_s3_list_objects_v2', { ...listArgs, Prefix: fixtureKey }),
      privateStorageScope: 'history-storage-fixture-v1',
    }, { createClient: config => new S3Client({ ...config, requestHandler: { handle: async () => ({
      response: { statusCode: 200, headers: { 'content-type': 'application/xml' },
        body: Readable.from([`<ListBucketResult><Name>${WASABI_BUCKET}</Name><Prefix>${fixtureKey}</Prefix><MaxKeys>1000</MaxKeys><KeyCount>0</KeyCount><IsTruncated>false</IsTruncated></ListBucketResult>`]) },
    }) } }) });
    expect(listingEntries(providerValue(raw), fixtureKey, 'objects')).toEqual([]);
  });
  it('uses fixed explicit credentials, endpoint, single attempt, and honors actual authoritative listing XML', async () => {
    const requests: unknown[] = []; let observed: S3ClientConfig | undefined;
    const raw = await executeWasabiDirectS3(input('wasabi_s3_list_object_versions', listArgs), { createClient: config => {
      observed = config;
      return new S3Client({ ...config, requestHandler: { handle: async (request: Request) => {
        requests.push(request);
        return { response: { statusCode: 200, headers: { 'content-type': 'application/xml' }, body: Readable.from([`<ListVersionsResult><Name>${WASABI_BUCKET}</Name><Prefix>${key}</Prefix><MaxKeys>1000</MaxKeys><IsTruncated>false</IsTruncated></ListVersionsResult>`]) } };
      } } });
    } });
    expect(observed?.credentials).toMatchObject(await credentials());
    expect(observed?.maxAttempts).toBe(1);
    expect(observed?.followRegionRedirects).toBe(false);
    expect(observed?.endpoint).toBe('https://s3.us-east-1.wasabisys.com');
    expect(requests).toHaveLength(1);
    expect(listingEntries(providerValue(raw), key, 'versions')).toEqual([]);
  });
  it('does not manufacture absence proof from malformed vendor listing', async () => {
    const raw = await executeWasabiDirectS3(input('wasabi_s3_list_objects_v2', listArgs), { createClient: config => new S3Client({ ...config, requestHandler: { handle: async () => ({ response: { statusCode: 200, headers: {}, body: Readable.from(['<ListBucketResult/>']) } }) } }) });
    expect(() => listingEntries(providerValue(raw), key, 'objects')).toThrow('listing_invalid');
  });
  it('deletes only the requested exact version and makes no retry on a provider failure', async () => {
    const calls: { path: string; query: Record<string, unknown>; method: string }[] = [];
    const request = input('wasabi_s3_delete_object', { Bucket: WASABI_BUCKET, Key: key, region: WASABI_REGION, VersionId: 'manufactured-version' });
    await expect(executeWasabiDirectS3(request, { createClient: config => new S3Client({ ...config, requestHandler: { handle: async (r: Request) => {
      calls.push({ path: r.path, query: r.query, method: r.method });
      throw Object.assign(new Error('PRIVATE_PROVIDER_SECRET_CANARY'), { name: 'AccessDenied' });
    } } }) })).rejects.toThrow('wasabi_direct_authentication_failed');
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ path: `/${WASABI_BUCKET}/${key}`, query: { versionId: 'manufactured-version' }, method: 'DELETE' });
  });
  it('aborts a hanging provider operation and emits only the fixed timeout classification', async () => {
    let aborted = false;
    await expect(executeWasabiDirectS3({ ...input('wasabi_s3_list_objects_v2', listArgs), timeoutMs: 50 }, { createClient: config => new S3Client({ ...config, requestHandler: { handle: async (_request: Request, opts?: {abortSignal?: AbortSignal}) => new Promise((_resolve, reject) => {
      const stop = () => { aborted = true; reject(Object.assign(new Error('PRIVATE_TIMEOUT_CANARY'), { name: 'AbortError' })); };
      if (opts?.abortSignal?.aborted) stop(); else opts?.abortSignal?.addEventListener('abort', stop, { once: true });
    }) } }) })).rejects.toThrow('wasabi_direct_timeout');
    expect(aborted).toBe(true);
  });
  it('sanitizes credential resolution errors without leaking the secret', async () => {
    await expect(executeWasabiDirectS3({ ...input(), credentials: async () => { throw new Error('PRIVATE_VAULT_CANARY'); } })).rejects.toThrow('wasabi_direct_operation_failed');
  });
  it('bounds a stalled vault lookup before constructing an S3 client', async () => {
    const createClient = vi.fn();
    await expect(executeWasabiDirectS3({ ...input(), timeoutMs: 20, credentials: () => new Promise(() => {}) }, { createClient })).rejects.toThrow('wasabi_direct_timeout');
    expect(createClient).not.toHaveBeenCalled();
  });
});
