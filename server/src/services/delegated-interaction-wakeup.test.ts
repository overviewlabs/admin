import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { activityLog, heartbeatRuns, agentWakeupRequests, agents, companies, companyMemberships, createDb, issueThreadInteractions, issues, projects, startEmbeddedPostgresTestDatabase } from "@whoxos/db";
import { delegatedInteractionWakeupService, registerDelegatedInteractionWakeup } from "./delegated-interaction-wakeup.js";
import { setExecutiveDelegation } from "./executive-delegation.js";
import { buildWHOXOSWakePayload } from "./heartbeat.js";
import { createPostgresRunDispatchAdapter } from "../modules/run-dispatch/adapters/postgres.js";
import type { heartbeatService } from "./heartbeat.js";
import { issueThreadInteractionService } from "./issue-thread-interactions.js";

describe("durable delegated CEO interaction routing", () => {
  let temporary: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>>;
  let db: ReturnType<typeof createDb>;
  beforeAll(async () => { temporary = await startEmbeddedPostgresTestDatabase("delegated-interaction-routing-"); db = createDb(temporary.connectionString); }, 90_000);
  afterAll(async () => { await temporary?.cleanup(); });
  afterEach(async () => {
    await db.delete(activityLog); await db.delete(agentWakeupRequests); await db.delete(issueThreadInteractions);
    await db.delete(issues); await db.delete(heartbeatRuns); await db.delete(projects); await db.delete(companyMemberships); await db.delete(agents); await db.delete(companies);
  });
  async function fixture() {
    const companyId = randomUUID(), agentId = randomUUID(), creatorId = randomUUID(), issueId = randomUUID(), owner = randomUUID();
    await db.insert(companies).values({ id: companyId, name: "Routing", issuePrefix: `R${companyId.slice(0, 8)}` });
    await db.insert(agents).values([{ id: agentId, companyId, name: "CEO", role: "ceo" }, { id: creatorId, companyId, name: "Data", role: "engineer" }]);
    await db.insert(companyMemberships).values([{ companyId, principalType: "user", principalId: owner, membershipRole: "owner" }, { companyId, principalType: "agent", principalId: agentId, membershipRole: "operator" }]);
    await db.insert(issues).values({ id: issueId, companyId, title: "Task", status: "in_progress", assigneeAgentId: creatorId });
    await setExecutiveDelegation(db, { companyId, userId: owner, agentId });
    const wakeup = vi.fn(async (id: string, options: Parameters<ReturnType<typeof heartbeatService>["wakeup"]>[1] = {}) => {
      await db.insert(agentWakeupRequests).values({ companyId, agentId: id, source: "automation", reason: "interaction_pending", status: "queued", idempotencyKey: options.idempotencyKey as string });
      return null;
    });
    const service = delegatedInteractionWakeupService(db, { wakeup });
    const create = (extra: Record<string, unknown> = {}) => issueThreadInteractionService(db).create({ id: issueId, companyId }, {
      kind: "ask_user_questions", resolverPolicy: "human_only", continuationPolicy: "none", idempotencyKey: randomUUID(),
      payload: { version: 1, questions: [{ id: "decision", prompt: "Choose a route", selectionMode: "single", options: [{ id: "a", label: "A" }, { id: "b", label: "B" }] }] }, ...extra,
    } as never, { agentId: creatorId });
    return { companyId, agentId, creatorId, issueId, owner, wakeup, service, create };
  }
  it("routes central service creation and startup reconciliation once across fresh service instances", async () => {
    const f = await fixture(), notified = vi.fn();
    const dispose = registerDelegatedInteractionWakeup(db, notified);
    const card = await f.create();
    dispose();
    expect(notified).toHaveBeenCalledOnce();
    await f.service.sweepPending();
    expect(f.wakeup).toHaveBeenCalledOnce();
    expect(f.wakeup).toHaveBeenCalledWith(f.agentId, expect.objectContaining({ reason: "interaction_pending", requestedByActorType: "system", requestedByActorId: "system:executive-delegation", allowRunCoalescing: false,
      payload: expect.objectContaining({ interactionId: card.id, decisionIssueId: f.issueId }) }));
    await delegatedInteractionWakeupService(db, { wakeup: f.wakeup }).sweepPending();
    expect(f.wakeup).toHaveBeenCalledOnce();
  });
  it.each(["anyone", "not_creator"])("routes ordinary %s decisions to the delegated CEO without requiring a human-only exception", async resolverPolicy => {
    const f = await fixture();
    const card = await f.create({ resolverPolicy });
    await f.service.sweepPending();
    expect(f.wakeup).toHaveBeenCalledOnce();
    expect(f.wakeup).toHaveBeenCalledWith(f.agentId, expect.objectContaining({
      payload: expect.objectContaining({ interactionId: card.id, decisionIssueId: f.issueId }),
    }));
    await delegatedInteractionWakeupService(db, { wakeup: f.wakeup }).sweepPending();
    expect(f.wakeup).toHaveBeenCalledOnce();
    const [saved] = await db.select().from(issueThreadInteractions).where(eq(issueThreadInteractions.id, card.id));
    expect(saved.status).toBe("pending");
    expect(saved.effectiveResolverPolicy).toBe(resolverPolicy);
  });
  it.each(["anyone", "not_creator"])("does not route an ordinary %s decision without a current delegation or back to its creator", async resolverPolicy => {
    const f = await fixture();
    const card = await f.create({ resolverPolicy });
    await db.update(issueThreadInteractions).set({ createdByAgentId: f.agentId }).where(eq(issueThreadInteractions.id, card.id));
    await f.service.sweepPending();
    expect(f.wakeup).not.toHaveBeenCalled();
    await db.update(issueThreadInteractions).set({ createdByAgentId: f.creatorId }).where(eq(issueThreadInteractions.id, card.id));
    await setExecutiveDelegation(db, { companyId: f.companyId, userId: f.owner, agentId: null });
    await f.service.sweepPending();
    expect(f.wakeup).not.toHaveBeenCalled();
  });
  it("serializes simultaneous workers and does not retry failed or skipped wake receipts", async () => {
    const f = await fixture(); await f.create();
    const second = delegatedInteractionWakeupService(db, { wakeup: f.wakeup });
    await Promise.all([f.service.sweepPending(), second.sweepPending()]);
    expect(f.wakeup).toHaveBeenCalledOnce();
    for (const status of ["failed", "skipped", "cancelled"]) {
      await db.update(agentWakeupRequests).set({ status }).where(eq(agentWakeupRequests.companyId, f.companyId));
      await f.service.sweepPending();
    }
    expect(f.wakeup).toHaveBeenCalledOnce();
  });
  it.each(["revoked", "owner suspended", "ceo paused", "ceo demoted", "membership suspended"])("does not route when grant becomes %s after creation", async changed => {
    const f = await fixture(); await f.create();
    if (changed === "revoked") await setExecutiveDelegation(db, { companyId: f.companyId, userId: f.owner, agentId: null });
    if (changed === "owner suspended") await db.update(companyMemberships).set({ status: "suspended" }).where(eq(companyMemberships.principalId, f.owner));
    if (changed === "ceo paused") await db.update(agents).set({ status: "paused" }).where(eq(agents.id, f.agentId));
    if (changed === "ceo demoted") await db.update(agents).set({ role: "general" }).where(eq(agents.id, f.agentId));
    if (changed === "membership suspended") await db.update(companyMemberships).set({ status: "suspended" }).where(eq(companyMemberships.principalId, f.agentId));
    await f.service.sweepPending(); expect(f.wakeup).not.toHaveBeenCalled();
  });
  it.each(["personal", "other agent", "tool", "secret", "review", "self", "closed", "conversation", "resolved", "not_creator"])("retains %s exclusions", async excluded => {
    const f = await fixture(), card = await f.create();
    if (excluded === "personal") await db.update(issueThreadInteractions).set({ addresseeUserId: f.owner }).where(eq(issueThreadInteractions.id, card.id));
    if (excluded === "other agent") await db.update(issueThreadInteractions).set({ addresseeAgentId: f.creatorId }).where(eq(issueThreadInteractions.id, card.id));
    if (excluded === "tool" || excluded === "secret") await db.update(issueThreadInteractions).set({ kind: "request_confirmation", payload: { [excluded === "tool" ? "toolAction" : "secretProposal"]: {} } as never }).where(eq(issueThreadInteractions.id, card.id));
    if (excluded === "review") {
      await db.update(issueThreadInteractions).set({ kind: "request_confirmation" }).where(eq(issueThreadInteractions.id, card.id));
      await db.update(issues).set({ status: "in_review", reviewPolicy: "human_only", createdByAgentId: f.creatorId }).where(eq(issues.id, f.issueId));
    }
    if (excluded === "self" || excluded === "not_creator") await db.update(issueThreadInteractions).set({ createdByAgentId: f.agentId, ...(excluded === "not_creator" ? { requestedResolverPolicy: "not_creator" as const } : {}) }).where(eq(issueThreadInteractions.id, card.id));
    if (excluded === "closed") await db.update(issues).set({ status: "done" }).where(eq(issues.id, f.issueId));
    if (excluded === "conversation") await db.update(issues).set({ conversationAgentId: f.agentId, assigneeAgentId: f.agentId, conversationUserId: f.owner, conversationState: "active" }).where(eq(issues.id, f.issueId));
    if (excluded === "resolved") await db.update(issueThreadInteractions).set({ status: "answered" }).where(eq(issueThreadInteractions.id, card.id));
    await f.service.sweepPending(); expect(f.wakeup).not.toHaveBeenCalled();
  });
  it("routes an explicitly addressed CEO without changing the assignee or human inbox card", async () => {
    const f = await fixture(); const card = await f.create({ addresseeAgentId: f.agentId });
    await f.service.sweepPending(); expect(f.wakeup).toHaveBeenCalledOnce();
    const [saved] = await db.select().from(issueThreadInteractions).where(eq(issueThreadInteractions.id, card.id));
    const [issue] = await db.select().from(issues).where(eq(issues.id, f.issueId));
    expect(saved.status).toBe("pending"); expect(issue.assigneeAgentId).toBe(f.creatorId);
  });
  it("durably delivers an explicit peer question without CEO delegation or claiming the other assignee's work", async () => {
    const f = await fixture(), peerId = randomUUID();
    await db.insert(agents).values({ id: peerId, companyId: f.companyId, name: "IT", role: "engineer", status: "active" });
    await db.insert(companyMemberships).values({ companyId: f.companyId, principalType: "agent", principalId: peerId, membershipRole: "operator" });
    await setExecutiveDelegation(db, { companyId: f.companyId, userId: f.owner, agentId: null });
    const card = await f.create({ resolverPolicy: "not_creator", addresseeAgentId: peerId });
    await f.service.sweepPending();
    expect(f.wakeup).toHaveBeenCalledOnce();
    expect(f.wakeup).toHaveBeenCalledWith(peerId, expect.objectContaining({
      idempotencyKey: `interaction-pending:${card.id}`,
      payload: expect.objectContaining({ decisionIssueId: f.issueId }),
    }));
    const options = f.wakeup.mock.calls[0]![1]!;
    expect(options.contextSnapshot).not.toHaveProperty("issueId");
    expect(options.contextSnapshot).not.toHaveProperty("taskId");
    const runId = randomUUID();
    await db.insert(heartbeatRuns).values({ id: runId, companyId: f.companyId, agentId: peerId, status: "queued", invocationSource: "automation", contextSnapshot: options.contextSnapshot });
    const dispatch = createPostgresRunDispatchAdapter(db);
    expect(await dispatch.cancelStaleQueuedRun({ companyId: f.companyId, runId, expectedStatus: "queued", now: new Date() })).toEqual({ outcome: "not_stale" });
    await delegatedInteractionWakeupService(db, { wakeup: f.wakeup }).sweepPending();
    expect(f.wakeup).toHaveBeenCalledOnce();
    const [task] = await db.select().from(issues).where(eq(issues.id, f.issueId));
    expect(task.assigneeAgentId).toBe(f.creatorId);
  });
  it.each(["human_only", "paused", "membership_suspended", "issue_acl", "other_company", "governed"])("does not deliver an ineligible peer card: %s", async condition => {
    const f = await fixture(), peerId = randomUUID();
    await db.insert(agents).values({ id: peerId, companyId: f.companyId, name: "IT", role: "engineer" });
    await db.insert(companyMemberships).values({ companyId: f.companyId, principalType: "agent", principalId: peerId, membershipRole: "operator" });
    const card = await f.create({ resolverPolicy: condition === "human_only" ? "human_only" : "anyone", addresseeAgentId: peerId });
    if (condition === "paused") await db.update(agents).set({ status: "paused" }).where(eq(agents.id, peerId));
    if (condition === "membership_suspended") await db.update(companyMemberships).set({ status: "suspended" }).where(eq(companyMemberships.principalId, peerId));
    if (condition === "issue_acl") {
      const projectId = randomUUID(), rootIssueId = randomUUID();
      await db.insert(projects).values({ id: projectId, companyId: f.companyId, name: "Restricted project" });
      await db.insert(issues).values({ id: rootIssueId, companyId: f.companyId, title: "Authorized boundary", projectId, assigneeAgentId: peerId });
      await db.update(agents).set({ permissions: { trustPreset: "low_trust_review", authorizationPolicy: {
        trustBoundary: { mode: "low_trust_review", projectIds: [projectId], rootIssueId },
      } } }).where(eq(agents.id, peerId));
    }
    if (condition === "other_company") {
      const other = randomUUID();
      await db.insert(companies).values({ id: other, name: "Other", issuePrefix: `O${other.slice(0, 8)}` });
      await db.update(agents).set({ companyId: other }).where(eq(agents.id, peerId));
    }
    if (condition === "governed") await db.update(issueThreadInteractions).set({ payload: { toolAction: {} } as never }).where(eq(issueThreadInteractions.id, card.id));
    await f.service.sweepPending();
    expect(f.wakeup).not.toHaveBeenCalled();
  });
  it("passes real queued/final dispatch and injects a decision instruction without claiming the other assignee's task", async () => {
    const f = await fixture(); await f.create(); await f.service.sweepPending();
    const options = f.wakeup.mock.calls[0]![1]!;
    const context = options.contextSnapshot!;
    expect(context).not.toHaveProperty("issueId"); expect(context).not.toHaveProperty("taskId");
    expect(options.payload).not.toHaveProperty("issueId");
    const runId = randomUUID();
    await db.insert(heartbeatRuns).values({ id: runId, companyId: f.companyId, agentId: f.agentId, status: "queued", invocationSource: "automation", contextSnapshot: context });
    const dispatch = createPostgresRunDispatchAdapter(db);
    expect(await dispatch.cancelStaleQueuedRun({ companyId: f.companyId, runId, expectedStatus: "queued", now: new Date() })).toEqual({ outcome: "not_stale" });
    await db.update(heartbeatRuns).set({ status: "running" }).where(eq(heartbeatRuns.id, runId));
    expect(await dispatch.cancelStaleQueuedRun({ companyId: f.companyId, runId, expectedStatus: "running", now: new Date() })).toEqual({ outcome: "not_stale" });
    const wake = await buildWHOXOSWakePayload({ db, companyId: f.companyId, agentId: f.agentId, runId, contextSnapshot: context });
    expect(wake?.issue).toBeNull(); expect(wake?.agentMessage?.text).toContain(`/api/issues/${f.issueId}/interactions`);
    expect(wake?.agentMessage?.text).toContain("do not check out, reassign, execute, or bypass dependencies");
    const [task] = await db.select().from(issues).where(eq(issues.id, f.issueId));
    expect(task.assigneeAgentId).toBe(f.creatorId); expect(task.executionRunId).toBeNull();
  });
  it("recovers a lost post-create notification without importing heartbeat into creation", async () => {
    const f = await fixture(); await f.create();
    await f.service.sweepPending(); expect(f.wakeup).toHaveBeenCalledOnce();
  });
  it.each(["task", "parent"])("preserves %s responsible user and project budget scope in decision-only runs", async origin => {
    const f = await fixture(), responsibleUserId = randomUUID(), projectId = randomUUID();
    await db.insert(companyMemberships).values({ companyId: f.companyId, principalType: "user", principalId: responsibleUserId, membershipRole: "operator" });
    await db.insert(projects).values({ id: projectId, companyId: f.companyId, name: "Decision budget" });
    if (origin === "parent") {
      const parentId = randomUUID();
      await db.insert(issues).values({ id: parentId, companyId: f.companyId, title: "Parent", responsibleUserId });
      await db.update(issues).set({ parentId, projectId }).where(eq(issues.id, f.issueId));
    } else await db.update(issues).set({ responsibleUserId, projectId }).where(eq(issues.id, f.issueId));
    await f.create({ resolverPolicy: "anyone" });
    await f.service.sweepPending();
    expect(f.wakeup).toHaveBeenCalledWith(f.agentId, expect.objectContaining({
      contextSnapshot: expect.objectContaining({ responsibleUserId, projectId }),
    }));
    expect(f.wakeup.mock.calls[0]![1]!.contextSnapshot).not.toHaveProperty("issueId");
  });
  it.each(["voice_task", "voice_origin"])("does not start a text runtime for %s decisions", async mode => {
    const f = await fixture();
    const card = await f.create({ resolverPolicy: "anyone" });
    if (mode === "voice_task") {
      await db.update(issues).set({ assigneeAdapterOverrides: { adapterConfig: { voiceExecutionOnly: true } } }).where(eq(issues.id, f.issueId));
    } else {
      const runId = randomUUID();
      await db.insert(heartbeatRuns).values({ id: runId, companyId: f.companyId, agentId: f.creatorId, status: "succeeded", invocationSource: "on_demand", runtimeMode: "voice_direct" });
      await db.update(issueThreadInteractions).set({ sourceRunId: runId }).where(eq(issueThreadInteractions.id, card.id));
    }
    await f.service.sweepPending();
    expect(f.wakeup).not.toHaveBeenCalled();
  });
});
