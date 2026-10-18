import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import {
  agents, companies, createDb, documents, documentRevisions, issueDocuments,
  heartbeatRuns, heartbeatRunEvents, issues, issueRecoveryActions, toolCallEvents,
  toolInvocations, environmentLeases, nativeRunFinalizations, startEmbeddedPostgresTestDatabase,
} from "@whoxos/db";
import { ISSUE_CONTINUATION_SUMMARY_DOCUMENT_KEY } from "@whoxos/shared";
import { createPostgresRunDispatchAdapter } from "../modules/run-dispatch/adapters/postgres.js";
import { legacyExecutionNeedsReconciliation } from "../services/legacy-execution-recovery.js";
import { recoveryService } from "../services/recovery/service.js";
import { settleUnrecoverableExecutions } from "../services/execution-recovery-resolution.js";
import { getExecutionBlocker } from "../services/execution-blocker.js";

describe("queued review wait cancellation evidence (isolated PostgreSQL)", () => {
  let database: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>>;
  let db: ReturnType<typeof createDb>;
  beforeAll(async () => {
    database = await startEmbeddedPostgresTestDatabase("pre-dispatch-review-wait-");
    db = createDb(database.connectionString);
  }, 90000);
  afterAll(async () => { await database?.cleanup(); }, 30000);

  async function fixture() {
    const companyId = randomUUID(), agentId = randomUUID(), issueId = randomUUID(), runId = randomUUID();
    const childId = randomUUID(), documentId = randomUUID(), revisionId = randomUUID();
    await db.insert(companies).values({ id: companyId, name: "Review wait fixture", issuePrefix: "T" + companyId.slice(0, 6), requireBoardApprovalForNewAgents: false });
    await db.insert(agents).values({ id: agentId, companyId, name: "Owner", role: "ceo", status: "idle", adapterType: "codex_local", adapterConfig: {}, runtimeConfig: { heartbeat: {wakeOnDemand: true} }, permissions: {} });
    await db.insert(issues).values([{ id: issueId, companyId, title: "Waiting owner", status: "in_progress", assigneeAgentId: agentId },
      { id: childId, companyId, parentId: issueId, title: "Independent review", status: "todo" }]);
    const body = "# Continuation Summary\n\n## Next Action\n\n- Wait for reviewer feedback or approval before continuing executor work.";
    await db.insert(documents).values({ id: documentId, companyId, title: "Continuation Summary", format: "markdown", latestBody: body, latestRevisionId: revisionId, latestRevisionNumber: 1, createdByAgentId: agentId, updatedByAgentId: agentId });
    await db.insert(documentRevisions).values({ id: revisionId, companyId, documentId, revisionNumber: 1, title: "Continuation Summary", format: "markdown", body, createdByAgentId: agentId });
    await db.insert(issueDocuments).values({ companyId, issueId, documentId, key: ISSUE_CONTINUATION_SUMMARY_DOCUMENT_KEY });
    await db.insert(heartbeatRuns).values({ id: runId, companyId, agentId, invocationSource: "retry", status: "queued", scheduledRetryAttempt: 20,
      contextSnapshot: {issueId, wakeReason: "issue_continuation_needed", retryReason: "issue_continuation_needed"} });
    return { companyId, agentId, issueId, runId, childId };
  }

  it("preserves an actual queued cancellation as a dependency wait through the recovery sweep and settlement", async () => {
    const f = await fixture();
    expect(await createPostgresRunDispatchAdapter(db).cancelStaleQueuedRun({ ...f, expectedStatus: "queued", now: new Date() }))
      .toMatchObject({ outcome: "cancelled", errorCode: "issue_continuation_waiting_on_review" });
    const [run] = await db.select().from(heartbeatRuns).where(eq(heartbeatRuns.id, f.runId));
    expect(run!.resultJson).toMatchObject({ executionRecovery: { kind: "pre_dispatch_review_wait", providerWorkStarted: false } });
    expect(legacyExecutionNeedsReconciliation(run!)).toBe(false);
    const enqueueWakeup = vi.fn(async () => null);
    const result = await recoveryService(db, { enqueueWakeup }).reconcileStrandedAssignedIssues();
    expect(result).toMatchObject({ waitingOnReviewResolved: 1, escalated: 0 });
    await settleUnrecoverableExecutions(db);
    expect(await getExecutionBlocker(db, f.companyId, f.issueId)).toBeNull();
    expect(await db.select().from(issueRecoveryActions).where(eq(issueRecoveryActions.sourceIssueId, f.issueId))).toHaveLength(0);
    const [task] = await db.select().from(issues).where(eq(issues.id, f.issueId));
    expect(task).toMatchObject({ status: "blocked", assigneeAgentId: f.agentId });
    expect(enqueueWakeup).not.toHaveBeenCalled();
  });

  it.each(["started", "process", "running", "tool_event", "invocation", "lease", "released_lease", "coordinator", "provider_event", "contradictory_recovery"] as const)(
    "does not issue a never-started proof when %s evidence exists", async (kind) => {
      const f = await fixture();
      if (kind === "started") await db.update(heartbeatRuns).set({ startedAt: new Date() }).where(eq(heartbeatRuns.id, f.runId));
      if (kind === "process") await db.update(heartbeatRuns).set({ processPid: 123 }).where(eq(heartbeatRuns.id, f.runId));
      if (kind === "running") await db.update(heartbeatRuns).set({ status: "running" }).where(eq(heartbeatRuns.id, f.runId));
      if (kind === "tool_event") await db.insert(toolCallEvents).values({ ...f, eventType: "tool.invocation.started" });
      if (kind === "invocation") await db.insert(toolInvocations).values({ ...f, toolName: "manufactured_test" });
      if (kind === "lease" || kind === "released_lease") await db.insert(environmentLeases).values({ companyId: f.companyId, heartbeatRunId: f.runId, releasedAt: kind === "released_lease" ? new Date() : null });
      if (kind === "coordinator") {
        await db.update(heartbeatRuns).set({ nativeIssueId: f.issueId }).where(eq(heartbeatRuns.id, f.runId));
        await db.insert(nativeRunFinalizations).values({ runId: f.runId, companyId: f.companyId, issueId: f.issueId, phase: "terminal_failure" });
      }
      if (kind === "provider_event") {
        await db.insert(heartbeatRunEvents).values({ ...f, seq: 1, eventType: "adapter.invoke" });
        await db.update(heartbeatRuns).set({ nextEventSeq: 2 }).where(eq(heartbeatRuns.id, f.runId));
      }
      if (kind === "contradictory_recovery") await db.update(heartbeatRuns).set({ resultJson: { executionRecovery: { kind: "interrupted", providerWorkStarted: true } } }).where(eq(heartbeatRuns.id, f.runId));
      expect(await createPostgresRunDispatchAdapter(db).cancelStaleQueuedRun({ ...f, expectedStatus: kind === "running" ? "running" : "queued", now: new Date() }))
        .toMatchObject({ outcome: "cancelled", errorCode: "issue_continuation_waiting_on_review" });
      const [run] = await db.select().from(heartbeatRuns).where(eq(heartbeatRuns.id, f.runId));
      expect(run!.resultJson?.executionRecovery).not.toMatchObject({ kind: "pre_dispatch_review_wait" });
      expect(legacyExecutionNeedsReconciliation(run!)).toBe(true);
    });
});
