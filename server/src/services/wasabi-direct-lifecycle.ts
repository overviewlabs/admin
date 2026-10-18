import { WASABI_COMPANY, WASABI_CONNECTION } from './wasabi-private-probe.js';
export const WASABI_DIRECT_TOOL_NAMES = [
  'wasabi_s3_presign_put_object', 'wasabi_s3_presign_get_object',
  'wasabi_s3_list_object_versions', 'wasabi_s3_list_objects_v2', 'wasabi_s3_delete_object',
] as const;
export const WASABI_DIRECT_CREDENTIAL_PATHS = ['wasabi.accessKeyId', 'wasabi.secretAccessKey'] as const;
type Connection = { id: string; companyId: string; authKind: string; credentialPolicy?: string;
  config: Record<string, unknown>; credentialRefs?: unknown[];
  credentialSecretRefs: {configPath: string; secretId: string}[] };
export function isDirectWasabiLifecycle(connection: Pick<Connection, 'id' | 'companyId' | 'authKind' | 'config'>) {
  return connection.id === WASABI_CONNECTION && connection.companyId === WASABI_COMPANY &&
    connection.authKind === 'api_key' && connection.config.wasabiDirectS3 === true;
}
/** A mode switch is explicit, scoped, and contains only the two vault refs.
 * Ordinary edits must never reactivate a revoked organization grant. */
export function validateDirectWasabiUpdate(existing: Connection, input: {
  authKind?: string; credentialPolicy?: string; credentialRefs?: unknown[];
  credentialSecretRefs?: Connection['credentialSecretRefs'];
}, config: Record<string, unknown>) {
  if (config.wasabiDirectS3 !== true) return false;
  const next = { ...existing, ...input, config };
  if (!isDirectWasabiLifecycle(next) || next.credentialPolicy !== 'shared' || (next.credentialRefs?.length ?? 0) !== 0 ||
      next.credentialSecretRefs.length !== 2 || WASABI_DIRECT_CREDENTIAL_PATHS.some(path =>
        next.credentialSecretRefs.filter(ref => ref.configPath === path && /^[0-9a-f-]{36}$/i.test(ref.secretId)).length !== 1)) {
    throw new Error('wasabi_direct_configuration_invalid');
  }
  if (!isDirectWasabiLifecycle(existing) && input.authKind !== 'api_key') throw new Error('wasabi_direct_configuration_invalid');
  return !isDirectWasabiLifecycle(existing) || input.authKind !== undefined || input.credentialSecretRefs !== undefined;
}
