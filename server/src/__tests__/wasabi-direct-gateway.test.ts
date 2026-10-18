import { describe, expect, it, vi } from 'vitest';
import { executeWasabiDirectGateway, isWasabiDirectConnection } from '../services/wasabi-direct-gateway.js';
import { WASABI_COMPANY, WASABI_CONNECTION } from '../services/wasabi-private-probe.js';

const connection = { id: WASABI_CONNECTION, companyId: WASABI_COMPANY, authKind: 'api_key', config: { wasabiDirectS3: true } };
function fixture() {
  return { companyId: WASABI_COMPANY, connection, grant: {
    companyId: WASABI_COMPANY, connectionId: WASABI_CONNECTION, kind: 'organization', status: 'active', isDefault: true,
    credentialSecretRefs: [
      { secretId: 'id-secret', configPath: 'wasabi.accessKeyId', versionSelector: 'latest' as const },
      { secretId: 'key-secret', configPath: 'wasabi.secretAccessKey', versionSelector: 'latest' as const },
    ],
  }, toolName: 'wasabi_s3_presign_get_object', parameters: {}, timeoutMs: 1000, hasPrivateConsumer: true,
  resolveSecret: vi.fn(async (ref: { secretId: string }) => ref.secretId === 'id-secret' ? 'manufactured-id' : 'manufactured-secret') };
}
describe('Wasabi direct gateway consent and private result boundary', () => {
  it('resolves only the explicit current grant secret refs for the private dispatcher', async () => {
    const input = fixture();
    const dispatch = vi.fn(async (args) => {
      expect(await args.credentials()).toEqual({ accessKeyId: 'manufactured-id', secretAccessKey: 'manufactured-secret' });
      return { content: 'private', data: { structuredContent: {}, isError: false } };
    });
    await executeWasabiDirectGateway(input, dispatch);
    expect(dispatch).toHaveBeenCalledOnce();
    expect(input.resolveSecret.mock.calls.map(([ref]) => ref.secretId)).toEqual(['id-secret', 'key-secret']);
  });
  it('forwards the trusted fixture namespace marker only when supplied by server code', async () => {
    const input = { ...fixture(), privateStorageScope: 'history-storage-fixture-v1' as const };
    const dispatch = vi.fn(async request => {
      expect(request.privateStorageScope).toBe('history-storage-fixture-v1');
      return { content: '{}', data: { structuredContent: {}, isError: false } };
    });
    await executeWasabiDirectGateway(input, dispatch);
    expect(dispatch).toHaveBeenCalledOnce();
  });
  it.each(['wasabi_s3_presign_get_object', 'wasabi_s3_presign_put_object'])('denies %s before credentials when no trusted private consumer exists', async toolName => {
    const input = { ...fixture(), toolName, hasPrivateConsumer: false };
    const dispatch = vi.fn();
    await expect(executeWasabiDirectGateway(input, dispatch)).rejects.toThrow('wasabi_direct_private_consumer_required');
    expect(dispatch).not.toHaveBeenCalled(); expect(input.resolveSecret).not.toHaveBeenCalled();
  });
  it.each([
    { companyId: 'another-company' }, { connectionId: 'another-connection' },
    { kind: 'user' }, { status: 'revoked' }, { isDefault: false },
  ])('rejects mismatched or revoked grant %j', async patch => {
    const input = fixture(); input.grant = { ...input.grant, ...patch };
    await expect(executeWasabiDirectGateway(input)).rejects.toThrow('wasabi_direct_grant_denied');
    expect(input.resolveSecret).not.toHaveBeenCalled();
  });
  it('rejects absent or ambiguous refs before reading secrets', async () => {
    for (const refs of [[], [...fixture().grant.credentialSecretRefs, fixture().grant.credentialSecretRefs[0]!]]) {
      const input = fixture(); input.grant.credentialSecretRefs = refs;
      await expect(executeWasabiDirectGateway(input)).rejects.toThrow('wasabi_direct_credentials_invalid');
      expect(input.resolveSecret).not.toHaveBeenCalled();
    }
  });
  it('does not activate for another company, connection, auth mode, or implicit flag', () => {
    expect(isWasabiDirectConnection(connection)).toBe(true);
    for (const patch of [{ id: 'different' }, { companyId: 'different' }, { authKind: 'oauth' }, { config: {} }, { config: { wasabiDirectS3: 'true' } }]) {
      expect(isWasabiDirectConnection({ ...connection, ...patch })).toBe(false);
    }
  });
});
