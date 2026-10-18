import {
  S3Client, PutObjectCommand, GetObjectCommand, ListObjectVersionsCommand,
  ListObjectsV2Command, DeleteObjectCommand, type S3ClientConfig,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { WASABI_COMPANY, WASABI_CONNECTION, WASABI_BUCKET, WASABI_REGION } from './wasabi-private-probe.js';

type Value = Record<string, unknown>;
export type WasabiDirectCredentials = { accessKeyId: string; secretAccessKey: string };
export type WasabiDirectInput = {
  companyId: string; connectionId: string; toolName: string; parameters: unknown;
  timeoutMs?: number;
  /** Trusted server-only namespace expansion for the fixed storage fixture. */
  privateStorageScope?: 'history-storage-fixture-v1';
  credentials: () => Promise<WasabiDirectCredentials>;
};
type Dependencies = { createClient?: (config: S3ClientConfig) => S3Client };
export class WasabiDirectError extends Error {
  constructor(readonly code: string) { super(code); }
}
function deny(code: string): never { throw new WasabiDirectError(code); }
const prefix = `treasury/${WASABI_COMPANY}/research/`;
function record(raw: unknown): Value {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) deny('wasabi_direct_arguments_invalid');
  return raw as Value;
}
function exactFields(value: Value, fields: string[]) {
  if (Object.keys(value).some(key => !fields.includes(key))) deny('wasabi_direct_arguments_invalid');
}
function objectKey(raw: unknown, privateStorageScope?: WasabiDirectInput['privateStorageScope']): string {
  const allowed = privateStorageScope === 'history-storage-fixture-v1'
    ? /^history-storage-fixture-v1\/[a-zA-Z0-9_-]+\.bin$/
    : /^(history|verification)\/[a-zA-Z0-9/_-]+\.bin$/;
  if (typeof raw !== 'string' || raw.length > 1024 || !raw.startsWith(prefix) ||
      !allowed.test(raw.slice(prefix.length)) || raw.includes('//')) {
    deny('wasabi_direct_scope_denied');
  }
  return raw;
}
function normalizeError(error: unknown): never {
  if (error instanceof WasabiDirectError) throw error;
  const name = error && typeof error === 'object' && 'name' in error ? String(error.name) : '';
  if (['AccessDenied', 'InvalidAccessKeyId', 'SignatureDoesNotMatch', 'ExpiredToken', 'InvalidToken'].includes(name)) {
    deny('wasabi_direct_authentication_failed');
  }
  if (['AbortError', 'TimeoutError', 'RequestTimeout'].includes(name)) deny('wasabi_direct_timeout');
  return deny('wasabi_direct_operation_failed');
}
async function boundedCredentials(resolve: WasabiDirectInput['credentials'], signal: AbortSignal) {
  let stop: (() => void) | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(resolve),
      new Promise<never>((_accept, reject) => {
        stop = () => reject(new WasabiDirectError('wasabi_direct_timeout'));
        if (signal.aborted) stop(); else signal.addEventListener('abort', stop, { once: true });
      }),
    ]);
  } finally { if (stop) signal.removeEventListener('abort', stop); }
}

/** Fixed Treasury S3 dispatch. The caller retains grant/policy/audit checks and
 * privately consumes presigns; credentials never use the ambient AWS chain. */
export async function executeWasabiDirectS3(input: WasabiDirectInput, dependencies: Dependencies = {}) {
  if (input.companyId !== WASABI_COMPANY || input.connectionId !== WASABI_CONNECTION) deny('wasabi_direct_scope_denied');
  const p = record(input.parameters);
  const presign = ['wasabi_s3_presign_put_object', 'wasabi_s3_presign_get_object'].includes(input.toolName);
  const listing = ['wasabi_s3_list_object_versions', 'wasabi_s3_list_objects_v2'].includes(input.toolName);
  const deleting = input.toolName === 'wasabi_s3_delete_object';
  if (!presign && !listing && !deleting) deny('wasabi_direct_tool_denied');
  if ((presign ? p.bucket : p.Bucket) !== WASABI_BUCKET || p.region !== WASABI_REGION) deny('wasabi_direct_scope_denied');
  const key = objectKey(presign ? p.key : listing ? p.Prefix : p.Key, input.privateStorageScope);
  if (presign) {
    exactFields(p, ['bucket', 'key', 'region', 'expiresIn', ...(input.toolName === 'wasabi_s3_presign_put_object' ? ['contentType'] : [])]);
    if (!Number.isInteger(p.expiresIn) || Number(p.expiresIn) < 60 || Number(p.expiresIn) > 300 ||
        (p.contentType !== undefined && p.contentType !== 'application/octet-stream')) deny('wasabi_direct_arguments_invalid');
  } else if (listing) {
    exactFields(p, ['Bucket', 'Prefix', 'region', 'MaxKeys']);
    if (!Number.isInteger(p.MaxKeys) || Number(p.MaxKeys) < 1 || Number(p.MaxKeys) > 1000) deny('wasabi_direct_arguments_invalid');
  } else {
    exactFields(p, ['Bucket', 'Key', 'region', 'VersionId']);
    if (p.VersionId !== undefined && (typeof p.VersionId !== 'string' || p.VersionId.length < 1 || p.VersionId.length > 1024 || /[\x00-\x1f\x7f]/.test(p.VersionId))) deny('wasabi_direct_arguments_invalid');
  }
  const timeoutMs = input.timeoutMs ?? 30000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120000) deny('wasabi_direct_arguments_invalid');
  let client: S3Client | undefined;
  const signal = AbortSignal.timeout(timeoutMs);
  try {
    const credentials = await boundedCredentials(input.credentials, signal);
    if (typeof credentials?.accessKeyId !== 'string' || !credentials.accessKeyId || credentials.accessKeyId.length > 512 ||
        typeof credentials?.secretAccessKey !== 'string' || !credentials.secretAccessKey || credentials.secretAccessKey.length > 4096) deny('wasabi_direct_credentials_invalid');
    if (signal.aborted) deny('wasabi_direct_timeout');
    client = (dependencies.createClient ?? (config => new S3Client(config)))({
      region: WASABI_REGION, endpoint: `https://s3.${WASABI_REGION}.wasabisys.com`, forcePathStyle: true,
      credentials: { accessKeyId: credentials.accessKeyId, secretAccessKey: credentials.secretAccessKey },
      maxAttempts: 1, followRegionRedirects: false,
      requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED',
      requestHandler: { connectionTimeout: Math.min(timeoutMs, 5000), requestTimeout: timeoutMs },
    });
    let value: Value;
    if (presign) {
      const command = input.toolName === 'wasabi_s3_presign_put_object'
        ? new PutObjectCommand({ Bucket: WASABI_BUCKET, Key: key, ContentType: 'application/octet-stream' })
        : new GetObjectCommand({ Bucket: WASABI_BUCKET, Key: key });
      const url = await getSignedUrl(client, command, { expiresIn: Number(p.expiresIn) });
      if (signal.aborted) deny('wasabi_direct_timeout');
      value = { url, expiresIn: p.expiresIn };
    } else if (listing) {
      const args = { Bucket: WASABI_BUCKET, Prefix: key, MaxKeys: Number(p.MaxKeys) };
      const response = await client.send(input.toolName === 'wasabi_s3_list_object_versions'
        ? new ListObjectVersionsCommand(args) : new ListObjectsV2Command(args), { abortSignal: signal });
      // Preserve authoritative listing/pagination fields. Never manufacture an
      // empty/successful listing when the vendor omits required evidence.
      value = { ...response, $metadata: { httpStatusCode: response.$metadata.httpStatusCode } };
    } else {
      const response = await client.send(new DeleteObjectCommand({ Bucket: WASABI_BUCKET, Key: key,
        ...(typeof p.VersionId === 'string' ? { VersionId: p.VersionId } : {}) }), { abortSignal: signal });
      value = { ...response, $metadata: { httpStatusCode: response.$metadata.httpStatusCode } };
    }
    return { content: JSON.stringify(value), data: { structuredContent: value, isError: false } };
  } catch (error) { return normalizeError(error); }
  finally { client?.destroy(); }
}
