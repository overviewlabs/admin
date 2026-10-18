import type { ToolCredentialSecretRef } from '@whoxos/shared';
import { executeWasabiDirectS3, WasabiDirectError, type WasabiDirectInput } from './wasabi-direct-s3.js';
import { WASABI_COMPANY, WASABI_CONNECTION } from './wasabi-private-probe.js';

type DirectConnection = {
  id: string; companyId: string; authKind: string; config: Record<string, unknown>;
};
export function isWasabiDirectConnection(connection: DirectConnection): boolean {
  return connection.id === WASABI_CONNECTION && connection.companyId === WASABI_COMPANY &&
    connection.authKind === 'api_key' && connection.config.wasabiDirectS3 === true;
}

type DirectGrant = {
  companyId: string; connectionId: string; kind: string; status: string; isDefault: boolean;
  credentialSecretRefs: ToolCredentialSecretRef[];
};
type Input = {
  companyId: string; connection: DirectConnection; grant: DirectGrant;
  toolName: string; parameters: unknown; timeoutMs: number; hasPrivateConsumer: boolean;
  /** Trusted server-only namespace expansion; ordinary test/API callers cannot set it. */
  privateStorageScope?: 'history-storage-fixture-v1';
  resolveSecret: (ref: ToolCredentialSecretRef) => Promise<string>;
};

/** Called only after the normal gateway has resolved tool policy and the live
 * connection grant. Presigns cannot be returned to an ordinary tool caller. */
export async function executeWasabiDirectGateway(input: Input,
  dispatch: (input: WasabiDirectInput) => ReturnType<typeof executeWasabiDirectS3> = executeWasabiDirectS3) {
  const { connection, grant } = input;
  if (!isWasabiDirectConnection(connection) || input.companyId !== connection.companyId ||
      grant.companyId !== connection.companyId || grant.connectionId !== connection.id ||
      grant.kind !== 'organization' || grant.status !== 'active' || !grant.isDefault) {
    throw new WasabiDirectError('wasabi_direct_grant_denied');
  }
  if (input.toolName.startsWith('wasabi_s3_presign_') && !input.hasPrivateConsumer) {
    throw new WasabiDirectError('wasabi_direct_private_consumer_required');
  }
  const findRef = (path: string) => {
    const refs = grant.credentialSecretRefs.filter(ref => ref.configPath === path);
    if (refs.length !== 1) throw new WasabiDirectError('wasabi_direct_credentials_invalid');
    return refs[0]!;
  };
  const accessRef = findRef('wasabi.accessKeyId');
  const secretRef = findRef('wasabi.secretAccessKey');
  if (accessRef.secretId === secretRef.secretId) throw new WasabiDirectError('wasabi_direct_credentials_invalid');
  return dispatch({
    companyId: input.companyId, connectionId: connection.id, toolName: input.toolName,
    parameters: input.parameters, timeoutMs: input.timeoutMs,
    privateStorageScope: input.privateStorageScope,
    credentials: async () => {
      const accessKeyId = await input.resolveSecret(accessRef);
      const secretAccessKey = await input.resolveSecret(secretRef);
      return { accessKeyId, secretAccessKey };
    },
  });
}
