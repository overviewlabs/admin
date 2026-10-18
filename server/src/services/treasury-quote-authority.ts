/** Fresh, bounded control records for the private Treasury READ worker.
 * This response is not a grant: the root worker still validates its signed
 * object, immutable receipts, installed sources, lease and deletion witness.
 */
import type { Request } from "express";
import { and, eq } from "drizzle-orm";
import { heartbeatRuns, issues, issueComments, type Db } from "@whoxos/db";
import { assertProductionRootExecution, callRootExecutor, type RootAccessStatus } from "./production-root.js";

export const QUOTE_COMPANY = "0d8aad87-64f2-4f9c-a92c-94a261e140f7";
export const QUOTE_IT = "10bf5dc5-8522-42a2-8456-9bc50cdd982d";
export const QUOTE_ISSUE = "d2240e4b-119a-4dcd-9e70-da399bb5a587";
export const QUOTE_REVIEW = "3fe348f0-7da7-42d9-b419-313382f8cfb0";
export const QUOTE_TECH = "389e5e26-287a-4b5d-b34c-40a1aa4dc9bf";
export const QUOTE_GOV = "44036826-983b-4c03-92d3-4056c3310996";
const OPERATION = "historical_quote_authority_v1";
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const deny = (): never => { throw new Error("quote_read_denied"); };
type Row = Record<string, any>;
export interface QuoteAuthorityDependencies {
  authorize(): Promise<void>;
  issue(id: string): Promise<Row | undefined>;
  comments(issue: string, author: string): Promise<Row[]>;
}

function candidates(rows: Row[], issueId: string, author: string, schema: string, gate?: string) {
  if (!Array.isArray(rows) || rows.length > 4096) deny();
  const seen = new Set<string>();
  return rows.flatMap(row => {
    if (row.companyId !== QUOTE_COMPANY || row.issueId !== issueId || typeof row.id !== "string" || seen.has(row.id)) deny();
    seen.add(row.id);
    if (row.authorAgentId !== author || row.authorUserId != null) return [];
    let value: Row;
    try { value = JSON.parse(row.body); } catch { return []; }
    if (!value || typeof value !== "object" || Array.isArray(value) || value.schema !== schema || value.companyId !== QUOTE_COMPANY || (gate && value.gate !== gate)) return [];
    // Keep holds, revocations, deletion tombstones and equal-time candidates.
    // The existing root parser chooses the newest record and fails closed.
    return [{ id: row.id, issueId, companyId: row.companyId, authorAgentId: row.authorAgentId,
      authorUserId: row.authorUserId ?? null, body: row.body, createdAt: row.createdAt,
      deletedAt: row.deletedAt ?? null }];
  }).sort((a, b) => a.id.localeCompare(b.id));
}

export async function quoteAuthoritySnapshot(req: Request, deps: QuoteAuthorityDependencies) {
  const body = req.body;
  if (!body || typeof body !== "object" || Array.isArray(body)
    || Object.keys(body).sort().join(",") !== "operation,retentionIssueIds,runId"
    || body.operation !== OPERATION || typeof body.runId !== "string" || !UUID.test(body.runId)
    || !Array.isArray(body.retentionIssueIds) || body.retentionIssueIds.length < 1 || body.retentionIssueIds.length > 3
    || body.retentionIssueIds.some((id: unknown) => typeof id !== "string" || !UUID.test(id))
    || new Set(body.retentionIssueIds).size !== body.retentionIssueIds.length) deny();
  const actor = req.actor;
  if (actor.type !== "agent" || actor.source !== "agent_jwt" || actor.agentId !== QUOTE_IT
    || actor.companyId !== QUOTE_COMPANY || actor.runId !== body.runId
    || (actor.keyScope && actor.keyScope.kind !== "standard")) deny();
  await deps.authorize();
  const ids = [QUOTE_REVIEW, ...body.retentionIssueIds];
  for (const id of ids) {
    const issue = await deps.issue(id);
    if (!issue || issue.id !== id || issue.companyId !== QUOTE_COMPANY) deny();
  }
  const reviewRows = candidates(await deps.comments(QUOTE_REVIEW, QUOTE_TECH), QUOTE_REVIEW, QUOTE_TECH, "quote-read-acceptance-v1");
  const retentionRows: Record<string, Row[]> = {};
  for (const id of body.retentionIssueIds) {
    retentionRows[id] = candidates(await deps.comments(id, QUOTE_GOV), id, QUOTE_GOV, "storage-control-record-v1", "retention");
  }
  const result = { ok: true, operation: OPERATION,
    identity: { companyId: QUOTE_COMPANY, agentId: QUOTE_IT, issueId: QUOTE_ISSUE, runId: body.runId },
    reviewRows, retentionRows };
  if (Buffer.byteLength(JSON.stringify(result)) > 1024 * 1024) deny();
  await deps.authorize();
  return result;
}

export async function treasuryQuoteAuthority(db: Db, req: Request) {
  return quoteAuthoritySnapshot(req, {
    authorize: async () => {
      await assertProductionRootExecution(db, req, QUOTE_COMPANY, QUOTE_IT);
      const [run] = await db.select({ status: heartbeatRuns.status, finishedAt: heartbeatRuns.finishedAt,
        context: heartbeatRuns.contextSnapshot }).from(heartbeatRuns).where(and(
          eq(heartbeatRuns.id, req.actor.runId!), eq(heartbeatRuns.agentId, QUOTE_IT), eq(heartbeatRuns.companyId, QUOTE_COMPANY)));
      const [task] = await db.select({ status: issues.status, assigneeAgentId: issues.assigneeAgentId,
        assigneeUserId: issues.assigneeUserId, checkoutRunId: issues.checkoutRunId, executionRunId: issues.executionRunId })
        .from(issues).where(and(eq(issues.id, QUOTE_ISSUE), eq(issues.companyId, QUOTE_COMPANY)));
      if (run?.status !== "running" || run.finishedAt || run.context?.agentJwtRevokedAt != null
        || task?.status !== "in_progress" || task.assigneeAgentId !== QUOTE_IT || task.assigneeUserId != null
        || task.checkoutRunId !== req.actor.runId || task.executionRunId !== req.actor.runId) deny();
      const capability = await callRootExecutor<RootAccessStatus>({ operation: "status", companyId: QUOTE_COMPANY, agentId: QUOTE_IT });
      if (capability.available !== true || capability.enabled !== true) deny();
    },
    issue: async id => (await db.select({ id: issues.id, companyId: issues.companyId }).from(issues)
      .where(and(eq(issues.id, id), eq(issues.companyId, QUOTE_COMPANY))).limit(1))[0],
    comments: async (id, author) => db.select({ id: issueComments.id, companyId: issueComments.companyId,
      issueId: issueComments.issueId, authorAgentId: issueComments.authorAgentId, authorUserId: issueComments.authorUserId,
      body: issueComments.body, createdAt: issueComments.createdAt, deletedAt: issueComments.deletedAt }).from(issueComments)
      .where(and(eq(issueComments.companyId, QUOTE_COMPANY), eq(issueComments.issueId, id), eq(issueComments.authorAgentId, author)))
      .limit(4097),
  });
}
