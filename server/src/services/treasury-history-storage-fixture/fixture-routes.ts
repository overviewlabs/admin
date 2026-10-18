/** Concrete route registration proposal. This module is not imported by the app.
 * authorizeBoard must wrap existing getAccessibleResource, assertBoard,
 * assertBoardAnyToolPermission and assertCanTestAsAgent checks on EACH call.
 * No request value selects worker, key, purpose, agent, metadata or provider.
 */
import type { Request, Router } from 'express';
import { createHash } from 'node:crypto';
import type { ToolGatewayService } from '../tool-gateway.js';
import { WASABI_COMPANY, WASABI_CONNECTION } from '../wasabi-private-probe.js';
import { authenticateFixtureTransfer, fixtureGatewayTransfer, FIXTURE_FINANCE_AGENT,
  canonical, type FixtureScope } from './gateway-backend.js';

type Operator = { companyId: string; connectionId: string; userId: string };
export type FixtureAudit = { operation: 'prove' | 'cleanup'; state: 'started' | 'verified' | 'held'; queryId: string; scopeSha256: string };
export type FixtureRouteDependencies = {
  gateway: ToolGatewayService;
  authorizeBoard: (req: Request, agentId: string) => Promise<Operator>;
  /** Protected, pinned server metadata + current explicit operator fixture record. */
  currentScope: (req: Request, kind: 'prove' | 'transfer') => Promise<FixtureScope>;
  workerPublicKey: () => Promise<string>;
  /** Fixed server-owned fixture path, never request JSON or a release history path. */
  journalDirectory: string;
  /** Concrete fixture-host.ts launcher: fixed root worker over bounded private IPC. */
  runFixedWorker: (operator: Operator, scope: FixtureScope, req: Request,
    operation?: 'prove' | 'cleanup') => Promise<unknown>;
  audit: (req: Request, entry: FixtureAudit) => Promise<void>;
  currentAttestation?: (req: Request, operation: 'prove' | 'cleanup') => Promise<{ scope: FixtureScope; attestation: Record<string, unknown> }>;
};

export function registerFixtureRoutes(router: Router, deps: FixtureRouteDependencies) {
  const check = async (req: Request) => {
    const actor = await deps.authorizeBoard(req, FIXTURE_FINANCE_AGENT);
    if (req.params.connectionId !== WASABI_CONNECTION || actor.companyId !== WASABI_COMPANY ||
        actor.connectionId !== WASABI_CONNECTION || !actor.userId) throw new Error('fixture_operator_required');
    return actor;
  };
  router.post('/tool-connections/:connectionId/private-history-storage-fixture-authority', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      await check(req);
      if (!deps.currentAttestation || !req.body || Object.keys(req.body).join(',') !== 'operation' ||
          !['prove', 'cleanup'].includes(req.body.operation)) throw new Error('fixture_authority_request_denied');
      res.json(await deps.currentAttestation(req, req.body.operation));
    } catch { res.status(403).json({ error: 'fixture_current_scope_denied' }); }
  });
  router.post('/tool-connections/:connectionId/private-history-storage-fixture', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    let audit: FixtureAudit | undefined;
    try {
      const operator = await check(req);
      if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body) || Object.keys(req.body).length)
        throw new Error('fixture_empty_body_required');
      const scope = await deps.currentScope(req, 'prove');
      const entry: FixtureAudit = { operation: 'prove', state: 'started', queryId: scope.binding.queryId,
        scopeSha256: createHash('sha256').update(canonical(scope)).digest('hex') };
      // A durable audit receipt is required before root-worker dispatch.
      await deps.audit(req, entry); audit = entry;
      const proof = await deps.runFixedWorker(operator, scope, req);
      await check(req);
      const value = proof as Record<string, unknown>;
      const fields = ['schema', 'ok', 'mode', 'queryId', 'artifactHashes', 'plaintextSha256',
        'manifestSha256', 'writeReadHashVerified', 'allVersionsPurgeVerified', 'restoredManifestDenied',
        'licensedAcquisitionEnabled', 'licensedCoverageVerified', 'optionsQualificationVerified',
        'downloadsEnabled', 'liveTradingEnabled'];
      if (!value || Object.keys(value).sort().join(',') !== fields.sort().join(',') ||
          value.schema !== 'fixed-history-storage-fixture-proof-v1' || value.ok !== true ||
          value.mode !== 'fixed-nonlicensed-fixture' || value.queryId !== scope.binding.queryId ||
          canonical(value.artifactHashes) !== canonical(scope.binding.artifactHashes) ||
          !['plaintextSha256', 'manifestSha256'].every(k => /^[a-f0-9]{64}$/.test(String(value[k]))) ||
          !['writeReadHashVerified', 'allVersionsPurgeVerified', 'restoredManifestDenied'].every(k => value[k] === true) ||
          !['licensedAcquisitionEnabled', 'licensedCoverageVerified', 'optionsQualificationVerified',
            'downloadsEnabled', 'liveTradingEnabled'].every(k => value[k] === false)) throw new Error('fixture_proof_invalid');
      await deps.audit(req, { ...entry, state: 'verified' });
      res.json(proof);
    } catch {
      if (audit) { try { await deps.audit(req, { ...audit, state: 'held' }); } catch { /* Remain held; never redispatch. */ } }
      res.status(403).json({ ok: false, error: 'fixture_proof_held' });
    }
  });
  router.post('/tool-connections/:connectionId/private-history-storage-fixture-cleanup', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    let audit: FixtureAudit | undefined;
    try {
      const operator = await check(req);
      if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body) || Object.keys(req.body).length)
        throw new Error('fixture_empty_body_required');
      if (!deps.currentAttestation) throw new Error('fixture_cleanup_authority_required');
      const { scope } = await deps.currentAttestation(req, 'cleanup');
      const entry: FixtureAudit = { operation: 'cleanup', state: 'started', queryId: scope.binding.queryId,
        scopeSha256: createHash('sha256').update(canonical(scope)).digest('hex') };
      await deps.audit(req, entry); audit = entry;
      const proof = await deps.runFixedWorker(operator, scope, req, 'cleanup');
      await check(req);
      const value = proof as Record<string, unknown>;
      const fields = ['schema', 'ok', 'mode', 'recovery'];
      const recovery = value?.recovery as Array<Record<string, unknown>>;
      if (!value || Object.keys(value).sort().join(',') !== fields.sort().join(',') ||
          value.schema !== 'fixed-history-storage-fixture-cleanup-v1' || value.ok !== true ||
          value.mode !== 'fixed-nonlicensed-fixture' ||
          !Array.isArray(recovery) || recovery.length !== 1 ||
          Object.keys(recovery[0] ?? {}).sort().join(',') !== 'absenceVerified,queryId,state' ||
          recovery[0].queryId !== scope.binding.queryId || recovery[0].state !== 'ended' ||
          recovery[0].absenceVerified !== true)
        throw new Error('fixture_cleanup_proof_invalid');
      // The witness lives outside the restored journal. Requiring the same
      // frozen scope to be denied for prove after purge demonstrates that
      // restoring saved manifest metadata cannot reacquire write/read rights.
      let restoredManifestDenied = false;
      try { await deps.currentAttestation(req, 'prove'); } catch { restoredManifestDenied = true; }
      if (!restoredManifestDenied) throw new Error('fixture_restored_manifest_allowed');
      await deps.audit(req, { ...entry, state: 'verified' });
      res.json({ schema: 'fixed-history-storage-fixture-cleanup-proof-v1', ok: true,
        mode: 'fixed-nonlicensed-fixture', queryId: scope.binding.queryId,
        artifactHashes: scope.binding.artifactHashes, recovery,
        allVersionsPurgeVerified: true, restoredManifestDenied: true,
        licensedAcquisitionEnabled: false, licensedCoverageVerified: false,
        optionsQualificationVerified: false, downloadsEnabled: false, liveTradingEnabled: false });
    } catch {
      if (audit) { try { await deps.audit(req, { ...audit, state: 'held' }); } catch { /* held */ } }
      res.status(403).json({ ok: false, error: 'fixture_cleanup_held' });
    }
  });
  router.post('/tool-connections/:connectionId/private-history-storage-fixture-transfer', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const operator = await check(req);
      const scope = await deps.currentScope(req, 'transfer');
      const transfer = authenticateFixtureTransfer(req.body, await deps.workerPublicKey(), operator.userId, scope);
      const authorize = async () => {
        const fresh = await check(req);
        if (fresh.userId !== operator.userId || canonical(await deps.currentScope(req, 'transfer')) !== canonical(scope))
          throw new Error('fixture_authority_changed');
      };
      const result = await fixtureGatewayTransfer(transfer, (toolName, parameters, consumePrivateResult) =>
        deps.gateway.executeTestCall({ companyId: WASABI_COMPANY, connectionId: WASABI_CONNECTION,
          agentId: FIXTURE_FINANCE_AGENT, userId: operator.userId, toolName, parameters, consumePrivateResult,
          privateStorageScope: 'history-storage-fixture-v1' }),
        authorize, deps.journalDirectory);
      res.json(result);
    } catch { res.status(403).json({ error: 'fixture_transfer_held' }); }
  });
}
