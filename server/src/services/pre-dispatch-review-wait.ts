import { and, eq, sql } from "drizzle-orm";
import {
  environmentLeases, heartbeatRunEvents, heartbeatRuns, nativeRunFinalizations,
  toolCallEvents, toolInvocations, type Db,
} from "@whoxos/db";

type Run = typeof heartbeatRuns.$inferSelect;
export type ReviewWaitStartFields = Pick<Run,
  "startedAt" | "processPid" | "processGroupId" | "processStartedAt" |
  "externalRunId" | "runnerInstanceId" | "nativeSessionId" |
  "lastOutputAt" | "lastOutputSeq" | "logBytes"
>;
export const PRE_DISPATCH_REVIEW_WAIT = "pre_dispatch_review_wait";
export const REVIEW_WAIT_ERROR = "issue_continuation_waiting_on_review";

/** Missing fields are not evidence: historical/partial observations stay held. */
export function hasNoReviewWaitExecutionStart(run: Partial<ReviewWaitStartFields>): boolean {
  return run.startedAt === null && run.processPid === null && run.processGroupId === null &&
    run.processStartedAt === null && run.externalRunId === null && run.runnerInstanceId === null &&
    run.nativeSessionId === null && run.lastOutputAt === null && run.lastOutputSeq === 0 &&
    (run.logBytes === null || run.logBytes === 0);
}

/** Called only inside the dispatch transaction holding the issue and run locks.
 * Cancel before claim, with a closed absence check; never infer this from an
 * error label on a run that may already have executed or acquired authority.
 */
export async function preDispatchReviewWaitEvidence(db: Db, run: Run, errorCode: string) {
  if (run.runtimeMode !== "legacy" || run.status !== "queued" || errorCode !== REVIEW_WAIT_ERROR ||
      !hasNoReviewWaitExecutionStart(run) || run.resultJson?.executionRecovery != null) return null;
  const [observed] = await db.select({
    hasActivity: sql<boolean>`
      exists (select 1 from ${toolCallEvents} where ${toolCallEvents.companyId} = ${run.companyId} and ${toolCallEvents.runId} = ${run.id})
      or exists (select 1 from ${toolInvocations} where ${toolInvocations.companyId} = ${run.companyId} and ${toolInvocations.runId} = ${run.id})
      or exists (select 1 from ${environmentLeases} where ${environmentLeases.companyId} = ${run.companyId} and ${environmentLeases.heartbeatRunId} = ${run.id})
      or exists (select 1 from ${nativeRunFinalizations} where ${nativeRunFinalizations.companyId} = ${run.companyId} and ${nativeRunFinalizations.runId} = ${run.id})
      or exists (select 1 from ${heartbeatRunEvents} where ${heartbeatRunEvents.companyId} = ${run.companyId} and ${heartbeatRunEvents.runId} = ${run.id} and ${heartbeatRunEvents.eventType} <> 'lifecycle')`,
  }).from(heartbeatRuns).where(and(eq(heartbeatRuns.id, run.id), eq(heartbeatRuns.companyId, run.companyId)));
  if (!observed || observed.hasActivity !== false) return null;
  return { kind: PRE_DISPATCH_REVIEW_WAIT, providerWorkStarted: false };
}
