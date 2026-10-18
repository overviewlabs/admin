import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { createDb, companies, toolApplications, toolConnections, toolCatalogEntries, connectionGrants, secretAccessEvents, startEmbeddedPostgresTestDatabase } from '@whoxos/db';
import { toolAccessService } from '../services/tool-access.js';
import { secretService } from '../services/secrets.js';
import * as direct from '../services/wasabi-direct-s3.js';
import { WASABI_COMPANY, WASABI_CONNECTION } from '../services/wasabi-private-probe.js';
import { WASABI_DIRECT_TOOL_NAMES, validateDirectWasabiUpdate } from '../services/wasabi-direct-lifecycle.js';

describe('Wasabi direct lifecycle with isolated PostgreSQL', () => {
  let database: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>>;
  let db: ReturnType<typeof createDb>;
  let service: ReturnType<typeof toolAccessService>;
  let refs: {secretId: string; configPath: string}[];
  let originalIds: string[];
  const remote = vi.fn(async () => { throw new Error('remote MCP must not be contacted'); });
  beforeAll(async () => {
    vi.stubEnv('WHOXOS_SECRETS_MASTER_KEY', 'ab'.repeat(32));
    database = await startEmbeddedPostgresTestDatabase('wasabi-direct-lifecycle-test-');
    db = createDb(database.connectionString);
    service = toolAccessService(db, { remoteHttpEndpointLookup: async () => [{ address: '8.8.8.8', family: 4 }], remoteHttpRequest: remote });
    await db.insert(companies).values({ id: WASABI_COMPANY, name: 'Manufactured Treasury', issuePrefix: 'TST' });
    const [app] = await db.insert(toolApplications).values({ companyId: WASABI_COMPANY, applicationKey: 'wasabi-test', name: 'Wasabi test', type: 'mcp_http' }).returning();
    await db.insert(toolConnections).values({ id: WASABI_CONNECTION, companyId: WASABI_COMPANY, applicationId: app!.id, uid: 'wasabi-test', name: 'Wasabi test', transport: 'mcp_remote', authKind: 'oauth', status: 'active', enabled: true, config: {url: 'https://mcp.wasabisys.dev/s3'} });
    refs = [];
    for (const name of ['accessKeyId', 'secretAccessKey']) {
      const secret = await secretService(db).create(WASABI_COMPANY, {name, key: 'wasabi.test.' + name, provider: 'local_encrypted', value: 'MANUFACTURED_' + name});
      refs.push({ secretId: secret.id, configPath: 'wasabi.' + name });
    }
    const rows = await db.insert(toolCatalogEntries).values([...WASABI_DIRECT_TOOL_NAMES, 'wasabi_s3_delete_bucket'].map((name, index) => ({ companyId: WASABI_COMPANY, applicationId: app!.id, connectionId: WASABI_CONNECTION, name, toolName: name, versionHash: 'preserved-' + index, inputSchema: { type: 'object' }, status: index === 1 ? 'disabled' as const : 'active' as const }))).returning();
    originalIds = rows.filter(row => row.toolName !== 'wasabi_s3_delete_bucket').map(row => row.id).sort();
  }, 90000);
  afterAll(async () => { vi.restoreAllMocks(); vi.unstubAllEnvs(); await database?.cleanup(); }, 30000);
  it('converts explicitly and synchronizes only the existing organization identity credentials', async () => {
    const updated = await service.updateConnection(WASABI_CONNECTION, { authKind: 'api_key', credentialPolicy: 'shared', credentialRefs: [], credentialSecretRefs: refs,
      config: { url: 'https://mcp.wasabisys.dev/s3', wasabiDirectS3: true } });
    expect(updated.authKind).toBe('api_key');
    const grants = await db.select().from(connectionGrants).where(eq(connectionGrants.connectionId, WASABI_CONNECTION));
    expect(grants).toHaveLength(1);
    expect(grants[0]).toMatchObject({ kind: 'organization', isDefault: true, status: 'active', credentialSecretRefs: refs });
  });
  it('keeps five catalog IDs, schemas and status while disabling unsupported tools without MCP/OAuth', async () => {
    const result = await service.refreshCatalog(WASABI_CONNECTION);
    expect(result.catalog.map(row => row.id).sort()).toEqual(originalIds);
    expect(result.catalog.every(row => row.versionHash.startsWith('preserved-'))).toBe(true);
    expect(result.catalog.find(row => row.toolName === 'wasabi_s3_presign_get_object')?.status).toBe('disabled');
    const rows = await db.select().from(toolCatalogEntries).where(eq(toolCatalogEntries.connectionId, WASABI_CONNECTION));
    expect(rows.find(row => row.toolName === 'wasabi_s3_delete_bucket')?.status).toBe('disabled');
    expect(remote).not.toHaveBeenCalled();
  });
  it('checks real adapter credentials through vault refs and never contacts MCP', async () => {
    const execute = vi.spyOn(direct, 'executeWasabiDirectS3').mockImplementation(async request => {
      expect(request.toolName).toBe('wasabi_s3_list_objects_v2');
      expect(request.parameters).toMatchObject({ MaxKeys: 1 });
      expect(await request.credentials()).toEqual({ accessKeyId: 'MANUFACTURED_accessKeyId', secretAccessKey: 'MANUFACTURED_secretAccessKey' });
      return { content: '{}', data: {structuredContent: {}, isError: false} };
    });
    const result = await service.checkHealth(WASABI_CONNECTION);
    expect(result.connection.healthStatus).toBe('ok');
    expect(result.connection.healthMessage).toContain('direct S3 API');
    expect(execute).toHaveBeenCalledOnce(); expect(remote).not.toHaveBeenCalled();
    const accesses = await db.select().from(secretAccessEvents).where(eq(secretAccessEvents.consumerId, WASABI_CONNECTION));
    expect(accesses.filter(row => row.outcome === 'success').map(row => row.configPath).sort()).toEqual(['wasabi.accessKeyId', 'wasabi.secretAccessKey']);
  });
  it('does not reactivate a revoked grant on an ordinary connection name edit', async () => {
    await db.update(connectionGrants).set({ status: 'revoked' }).where(eq(connectionGrants.connectionId, WASABI_CONNECTION));
    await service.updateConnection(WASABI_CONNECTION, { name: 'Renamed' });
    const [grant] = await db.select().from(connectionGrants).where(eq(connectionGrants.connectionId, WASABI_CONNECTION));
    expect(grant!.status).toBe('revoked');
  });
  it('rejects invalid identity, implicit auth conversion, and missing or duplicate API references', () => {
    const base = { id: WASABI_CONNECTION, companyId: WASABI_COMPANY, authKind: 'oauth', config: {}, credentialPolicy: 'shared', credentialRefs: [], credentialSecretRefs: refs };
    for (const [existing, patch] of [[{...base, companyId: 'other'}, {authKind: 'api_key'}], [base, {}], [base, {authKind:'api_key', credentialSecretRefs:[refs[0]!,refs[0]!]}], [base, {authKind:'api_key',credentialSecretRefs:[]}]] as const) {
      expect(() => validateDirectWasabiUpdate(existing, patch, {wasabiDirectS3:true})).toThrow('wasabi_direct_configuration_invalid');
    }
  });
});
