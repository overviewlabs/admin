/** Complete protected current-scope and normal WHOXOS Board permission wiring.
 * Uses existing services/read-only relational queries; no agent checkout/JWT.
 * The module remains unmounted until the reviewed staging release is approved.
 */
import type { Request } from 'express';
import type { Db } from '@whoxos/db';
import type { accessService } from '../access.js';
import type { ToolGatewayService } from '../tool-gateway.js';
import { assertBoard, assertCompanyAccess } from '../../routes/authz.js';
import { isAgentStatusAssignableToWork } from '@whoxos/shared';
import { WASABI_COMPANY, WASABI_CONNECTION } from '../wasabi-private-probe.js';
import { authenticateFixtureTransfer, canonical, FIXTURE_FINANCE_AGENT, type FixtureScope } from './gateway-backend.js';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { launchFixedFixtureWorker, trustedFixtureFile, trustedFixtureJson, verifySourcePins } from './fixture-host.js';
import type { FixtureAudit, FixtureRouteDependencies } from './fixture-routes.js';
import { logActivity } from '../activity-log.js';

const REVIEWER = '389e5e26-287a-4b5d-b34c-40a1aa4dc9bf';
const ACTION = 'treasury.history-storage-fixture.v1';
const CLEANUP = 'treasury.history-storage-fixture.cleanup.v1';
type Obj = Record<string, any>;
function deny(): never { throw new Error('fixture_current_scope_denied'); }
type Integration = {
  db: Db; access: ReturnType<typeof accessService>; gateway: ToolGatewayService;
  connections: { getConnection: (id: string) => Promise<{ id: string; companyId: string } | undefined | null> };
  configPath: string;
};

export async function currentTechnologyReview(db: Db, config: Obj, now = Date.now() / 1000) {
  const ref = config.technologyReference;
  if (!ref || Object.keys(ref).sort().join(',') !== 'commentId,issueId' || !ref.issueId || !ref.commentId) deny();
  const comments = await db.query.issueComments.findMany({
    where: (row, { and, eq }) => and(eq(row.companyId, WASABI_COMPANY),
      eq(row.issueId, ref.issueId), eq(row.authorAgentId, REVIEWER)),
  });
  const records = comments.flatMap(row => {
    try {
      const record = JSON.parse(row.body);
      return record.schema === 'storage-control-record-v1' && record.companyId === WASABI_COMPANY &&
        record.gate === 'review' ? [{ row, record }] : [];
    } catch { return []; }
  }).sort((a, b) => b.row.createdAt.getTime() - a.row.createdAt.getTime());
  const current = records[0];
  if (!current || current.row.id !== ref.commentId || current.row.authorUserId || current.row.deletedAt ||
      records[1]?.row.createdAt.getTime() === current.row.createdAt.getTime() ||
      current.record.revoked !== false || !Number.isFinite(current.record.validUntil) ||
      current.record.validUntil <= now || current.record.value?.decision !== 'accept' ||
      current.record.value?.scope !== 'history-storage-fixture-v1' ||
      canonical(current.record.value?.artifactHashes) !== canonical(config.scope.binding.artifactHashes)) deny();
  return current.row.id;
}

export function createFixtureIntegration(input: Integration): FixtureRouteDependencies & {
  currentAttestation: (req: Request, operation: 'prove' | 'cleanup') => Promise<{ scope: FixtureScope; attestation: Obj }>;
} {
  const config = async () => {
    if (!input.configPath.endsWith('/runtime/server-config.json')) deny();
    const value = await trustedFixtureJson(input.configPath);
    const runtime = dirname(input.configPath);
    const required = ['schema', 'configId', 'mode', 'enabled', 'sourceRoot', 'sourcePins', 'socketPath',
      'dispatchDirectory', 'witnessPath', 'workerPublicKeyPath', 'allowedPeerUid', 'operatorUserId',
      'scope', 'technologyReference', 'cleanupEnabled', 'cleanupValidUntil'];
    if (Object.keys(value).sort().join(',') !== required.sort().join(',') ||
        value.schema !== 'fixture-server-config-v1' || value.enabled !== true ||
        !['local-test', 'live-candidate'].includes(value.mode) ||
        value.sourceRoot !== join(dirname(runtime), 'release') || value.socketPath !== join(runtime, 'worker.sock') ||
        value.dispatchDirectory !== join(runtime, 'dispatch') || value.witnessPath !== join(runtime, 'purpose-witness.json') ||
        value.workerPublicKeyPath !== join(runtime, 'worker-public.pem')) deny();
    await verifySourcePins(value.sourceRoot, value.sourcePins);
    if (value.scope?.binding?.identity?.role !== 'storage_fixture' ||
        value.scope.binding.identity.companyId !== WASABI_COMPANY ||
        value.scope?.gate?.mode !== 'fixed-nonlicensed-history-storage-fixture-v1' ||
        value.scope.gate.maxBytes !== 65536 || !Number.isFinite(value.scope.gate.expiresAt)) deny();
    if (value.scope.gate.authorityId !== value.technologyReference?.commentId) deny();
    if (Object.keys(value.scope.binding.artifactHashes ?? {}).sort().join(',') !== Object.keys(value.sourcePins).sort().join(',')) deny();
    for (const [name, hash] of Object.entries(value.scope.binding.artifactHashes ?? {})) {
      if (value.sourcePins[name] !== hash) deny();
    }
    await currentTechnologyReview(input.db, value);
    return value;
  };
  const authorizeBoard = async (req: Request, agentId: string) => {
    assertBoard(req); assertCompanyAccess(req, WASABI_COMPANY);
    // A named normal Board principal owns the original credential and audit.
    if (!req.actor.userId || req.actor.source === 'local_implicit' || req.actor.source === 'agent_jwt') deny();
    const connection = await input.connections.getConnection(String(req.params.connectionId));
    if (!connection || connection.id !== WASABI_CONNECTION || connection.companyId !== WASABI_COMPANY ||
        agentId !== FIXTURE_FINANCE_AGENT) deny();
    if (!req.actor.isInstanceAdmin && !await input.access.hasPermission(WASABI_COMPANY, 'user', req.actor.userId, 'tools:use') &&
        !await input.access.hasPermission(WASABI_COMPANY, 'user', req.actor.userId, 'tools:manage_connections')) deny();
    const agent = await input.db.query.agents.findFirst({ where: (row, { and, eq }) =>
      and(eq(row.id, FIXTURE_FINANCE_AGENT), eq(row.companyId, WASABI_COMPANY)) });
    if (!agent || !isAgentStatusAssignableToWork(agent.status)) deny();
    const decision = await input.access.decide({ actor: req.actor, action: 'tasks:assign', resource: {
      type: 'issue', companyId: WASABI_COMPANY, issueId: null, projectId: null, parentIssueId: null,
      assigneeAgentId: FIXTURE_FINANCE_AGENT, assigneeUserId: null,
    }, scope: { assigneeAgentId: FIXTURE_FINANCE_AGENT, assigneeUserId: null } });
    if (!decision.allowed) deny();
    const current = await config();
    if (current.operatorUserId !== req.actor.userId) deny();
    return { companyId: WASABI_COMPANY, connectionId: WASABI_CONNECTION, userId: req.actor.userId };
  };
  const currentAttestation = async (req: Request, operation: 'prove' | 'cleanup') => {
    await authorizeBoard(req, FIXTURE_FINANCE_AGENT);
    const value = await config(), scope = value.scope as FixtureScope;
    const witness = await trustedFixtureJson(value.witnessPath);
    const purposeHash = createHash('sha256').update(canonical({ purpose: scope.gate.purpose })).digest('hex');
    if (witness.schema !== 'fixture-purpose-witness-v1' || witness.configId !== value.configId ||
        witness.purposeHash !== purposeHash || witness.expiresAt !== scope.gate.expiresAt || typeof witness.ended !== 'boolean') deny();
    const now = Date.now() / 1000;
    const expiry = operation === 'cleanup' ? value.cleanupValidUntil : scope.gate.expiresAt;
    if (!Number.isFinite(expiry) || expiry <= now || expiry > now + 600 ||
        (operation === 'prove' && witness.ended) || (operation === 'cleanup' && value.cleanupEnabled !== true)) deny();
    return { scope, attestation: { companyId: WASABI_COMPANY, principalType: 'board', principalId: value.operatorUserId,
      action: operation === 'cleanup' ? CLEANUP : ACTION, authorityId: scope.gate.authorityId,
      enabled: true, validUntil: expiry, artifactHashes: scope.binding.artifactHashes } };
  };
  const currentScope = async (req: Request, kind: 'prove' | 'transfer') => {
    let operation: 'prove' | 'cleanup' = 'prove';
    if (kind === 'transfer') {
      const value = await config();
      const transfer = authenticateFixtureTransfer(req.body, (await trustedFixtureFile(value.workerPublicKeyPath)).toString(),
        req.actor.userId ?? '', value.scope);
      operation = transfer.action === 'delete' ? 'cleanup' : 'prove';
    }
    return (await currentAttestation(req, operation)).scope;
  };
  return { gateway: input.gateway, authorizeBoard, currentScope, currentAttestation,
    audit: async (req: Request, entry: FixtureAudit) => {
      assertBoard(req); assertCompanyAccess(req, WASABI_COMPANY);
      if (!req.actor.userId || !['started', 'verified', 'held'].includes(entry.state) ||
          !['prove', 'cleanup'].includes(entry.operation) || !/^[a-f0-9]{64}$/.test(entry.queryId) ||
          !/^[a-f0-9]{64}$/.test(entry.scopeSha256) ||
          Object.keys(entry).sort().join(',') !== 'operation,queryId,scopeSha256,state') deny();
      await logActivity(input.db, { companyId: WASABI_COMPANY, actorType: 'user', actorId: req.actor.userId,
        responsibleUserIdOverride: req.actor.userId, action: 'treasury.history_storage_fixture.' + entry.operation + '.' + entry.state,
        entityType: 'tool_connection', entityId: WASABI_CONNECTION, details: { ...entry, mode: 'fixed-nonlicensed-fixture' } });
    },
    workerPublicKey: async () => (await trustedFixtureFile((await config()).workerPublicKeyPath)).toString(),
    // Only the protected server configuration selects this path.
    journalDirectory: join(dirname(input.configPath), 'dispatch'),
    runFixedWorker: (operator, scope, req, operation = 'prove') =>
      launchFixedFixtureWorker(input.configPath, operator, scope, req, operation) };
}
