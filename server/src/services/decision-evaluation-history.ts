import { decisionReferenceTokens, decisionTaskLinks, decisionEvaluationFailure } from "./decision-evidence.js";
import type { AuthorizationActor } from "./authorization.js";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { agents, agentWakeupRequests, decisionEvaluations, heartbeatRuns, type Db } from "@whoxos/db";
import { notFound } from "../errors.js";

/** Read-only projection. The route must authorize the task before calling this.
 * Never expose evaluation state, credentials, or the worker's runtime context. */
export async function listDecisionEvaluations(db: Db, companyId: string, issueId: string, cursor?: string, actor?: AuthorizationActor) {
  const scope = and(eq(decisionEvaluations.companyId, companyId), eq(decisionEvaluations.issueId, issueId));
  const [after] = cursor ? await db.select({ id: decisionEvaluations.id, createdAt: decisionEvaluations.createdAt })
    .from(decisionEvaluations).where(and(scope, eq(decisionEvaluations.id, cursor))) : [];
  if (cursor && !after) throw notFound("Evaluation cursor not found in this task");
  const rows = await db.selectDistinctOn([decisionEvaluations.createdAt, decisionEvaluations.id], {
    evaluationId: decisionEvaluations.id, callerRunId: decisionEvaluations.callerRunId,
    callerName: agents.name, createdAt: decisionEvaluations.createdAt,
    receiptStatus: decisionEvaluations.status, wakeStatus: agentWakeupRequests.status,
    runStatus: heartbeatRuns.status,
    errorCode: heartbeatRuns.errorCode,
    stateBytes: sql<number>`coalesce(octet_length((${heartbeatRuns.contextSnapshot} -> 'state')::text), 0)`,
    purpose: sql<unknown>`${heartbeatRuns.contextSnapshot} -> 'purpose'`,
    questions: sql<unknown>`coalesce(${heartbeatRuns.contextSnapshot} -> 'decisionDisplayQuestions', ${heartbeatRuns.contextSnapshot} -> 'typesafeQuestions')`,
    taskReferences: sql<unknown>`${heartbeatRuns.contextSnapshot} -> 'decisionTaskReferences'`,
    evidenceHash: sql<unknown>`${heartbeatRuns.contextSnapshot} -> 'decisionEvidenceHash'`,
    result: sql<unknown>`jsonb_build_object('model', ${heartbeatRuns.resultJson} -> 'model', 'answers', ${heartbeatRuns.resultJson} -> 'answers', 'usage', ${heartbeatRuns.resultJson} -> 'usage')`,
  }).from(decisionEvaluations)
    .leftJoin(agents, and(eq(agents.id, decisionEvaluations.callerAgentId), eq(agents.companyId, companyId)))
    .leftJoin(agentWakeupRequests, and(eq(agentWakeupRequests.companyId, companyId), eq(agentWakeupRequests.agentId, decisionEvaluations.engineAgentId), sql`${agentWakeupRequests.idempotencyKey} = 'jev:' || ${decisionEvaluations.id}::text`))
    .leftJoin(heartbeatRuns, and(eq(heartbeatRuns.companyId, companyId), eq(heartbeatRuns.agentId, decisionEvaluations.engineAgentId), sql`${heartbeatRuns.id} = coalesce(${decisionEvaluations.runId}, ${agentWakeupRequests.runId})`))
    .where(and(scope, after ? sql`(${decisionEvaluations.createdAt}, ${decisionEvaluations.id}) > (${after.createdAt.toISOString()}::timestamptz, ${after.id}::uuid)` : undefined))
    .orderBy(asc(decisionEvaluations.createdAt), asc(decisionEvaluations.id), desc(sql`${agentWakeupRequests.runId} is not null`), desc(agentWakeupRequests.createdAt), desc(agentWakeupRequests.id)).limit(101);
  const referenceTokens = new Map<string, string[]>();
  for (const row of rows.slice(0, 100)) {
    let tokens: string[] = [];
    try { tokens = decisionReferenceTokens({ purpose: typeof row.purpose === "string" ? row.purpose : "", questions: (row.questions ?? {}) as Record<string, any> }, false); } catch { /* Historical malformed references remain plain text. */ }
    if (Array.isArray(row.taskReferences)) tokens.push(...row.taskReferences.flatMap(ref => typeof ref?.id === "string" ? [ref.id] : []));
    referenceTokens.set(row.evaluationId, tokens);
  }
  const links = await decisionTaskLinks(db, companyId, [...new Set([...referenceTokens.values()].flat())], actor);
  const items = rows.slice(0, 100).map(row => {
    const result = row.result as { model?: unknown; answers?: unknown; usage?: unknown } | null;
    const complete = row.runStatus === "succeeded" && typeof result?.model === "string" && result.answers && typeof result.answers === "object" && !Array.isArray(result.answers) && Object.keys(result.answers).length > 0 && result.usage && typeof result.usage === "object";
    return {
      evaluationId: row.evaluationId, callerRunId: row.callerRunId, callerName: row.callerName,
      createdAt: row.createdAt.toISOString(),
      status: row.runStatus === "succeeded" && !complete ? "result_unavailable" : row.runStatus ?? row.wakeStatus ?? row.receiptStatus,
      purpose: typeof row.purpose === "string" ? row.purpose : null,
      questions: row.questions,
      taskReferences: links.filter(link => referenceTokens.get(row.evaluationId)?.some(token => token === link.id || token.toUpperCase() === link.identifier.toUpperCase())),
      evidenceHash: typeof row.evidenceHash === "string" ? row.evidenceHash : null,
      error: row.runStatus && !["queued", "running", "succeeded"].includes(row.runStatus) ? decisionEvaluationFailure(row.errorCode, Number(row.stateBytes)) : null,
      result: complete ? result : null,
    };
  });
  return { items, nextCursor: rows.length > 100 ? items[items.length - 1].evaluationId : null };
}
