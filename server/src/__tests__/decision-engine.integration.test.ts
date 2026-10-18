import { listDecisionEvaluations } from "../services/decision-evaluation-history.js";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import express from "express";
import request from "supertest";
import { agents, approvals, authUsers, companyMemberships, companies, companySecrets, heartbeatRuns, agentWakeupRequests, issueComments, issueDocuments, documents, issues, decisionEvaluations, createDb, startEmbeddedPostgresTestDatabase } from "@whoxos/db";
import { decisionEngineService, decisionEvaluationSchema, DECISION_ENGINE_GUIDANCE } from "../services/decision-engine.js";
import { DECISION_SCOPE_RULE, DECISION_CLAIM_CRITERIA } from "../services/decision-evidence-policy.js";
import { decisionEngineRoutes } from "../routes/decision-engine.js";
import { projectToolDefinitions } from "../services/project-tools.js";
import { companyService } from "../services/companies.js";
import { agentService } from "../services/agents.js";

const wake = vi.hoisted(() => vi.fn());
vi.mock("../services/heartbeat.js", () => ({ heartbeatService: () => ({ wakeup: wake }) }));
vi.mock("../services/live-events.js", () => ({ publishLiveEvent: vi.fn() }));
describe("agent-only Real-Time Decision Engine", () => {
  let temporary: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>>;
  let db: ReturnType<typeof createDb>;
  let companyId: string, callerAgentId: string, issueId: string, callerRunId: string;
  const input = { idempotencyKey: "ticket-1", purpose: "Route this project's support ticket", state: "The integration is failing urgently", questions: { urgent: { type: "noul", instructions: "Is urgent attention requested?" } } };
  const context = () => ({ companyId, callerAgentId, callerRunId, issueId, responsibleUserId: "owner" });
  beforeAll(async () => {
    vi.stubEnv("WHOXOS_DECISION_ENGINE_PROVISIONING_FILE", "/tmp/decision-fixture-no-provisioning-policy.json");
    temporary = await startEmbeddedPostgresTestDatabase("decision-engine-"); db = createDb(temporary.connectionString);
    await db.insert(authUsers).values({ id: "owner", name: "Fixture owner", email: "decision-fixture@example.test", emailVerified: true, createdAt: new Date(), updatedAt: new Date() });
  }, 90_000);
  afterAll(async () => { await temporary?.cleanup(); vi.unstubAllEnvs(); });
  beforeEach(async () => {
    companyId = randomUUID(); callerAgentId = randomUUID(); issueId = randomUUID(); callerRunId = randomUUID();
    await db.insert(companies).values({ id: companyId, name: "Evaluation fixture", issuePrefix: `D${companyId.replaceAll("-", "").slice(0, 12)}` });
    await db.insert(companyMemberships).values({ companyId, principalType: "user", principalId: "owner", membershipRole: "admin" });
    await db.insert(companySecrets).values({ companyId, name: "TYPESAFE_API_KEY", key: "typesafe_api_key" });
    await db.insert(agents).values({ id: callerAgentId, companyId, name: "Project agent", status: "idle" });
    await db.insert(issues).values({ id: issueId, companyId, title: "Project fixture", status: "in_progress", assigneeAgentId: callerAgentId });
    await db.insert(heartbeatRuns).values({ id: callerRunId, companyId, agentId: callerAgentId, status: "running", responsibleUserId: "owner", contextSnapshot: { issueId } });
    wake.mockReset().mockImplementation(async (engineAgentId: string, opts: any) => {
      const runId = randomUUID(), wakeId = randomUUID();
      await db.insert(agentWakeupRequests).values({ id: wakeId, companyId, agentId: engineAgentId, source: opts.source, idempotencyKey: opts.idempotencyKey, requestedByActorType: "agent", requestedByActorId: callerAgentId, runId });
      const [run] = await db.insert(heartbeatRuns).values({ id: runId, companyId, agentId: engineAgentId, wakeupRequestId: wakeId, status: "queued", contextSnapshot: opts.contextSnapshot }).returning();
      return run;
    });
  });
  it("provisions exactly one canonical engine under concurrent calls", async () => {
    const svc = decisionEngineService(db);
    const result = await Promise.all([svc.ensure(companyId), svc.ensure(companyId)]);
    expect(result[0].id).toBe(result[1].id); expect(result[0].name).toBe("Real-Time Decision Engine");
    expect(result[0].adapterConfig).toMatchObject({ agentOnly: true, model: "jev-latest", stateJson: "" });
  });
  it("automatically provisions an engine when a future organization is created", async () => {
    const company = await companyService(db).create({ name: "Future fixture" });
    const rows = await db.select().from(agents).where(eq(agents.companyId, company.id));
    expect(rows.filter(a => a.adapterType === "typesafe").map(a => a.name)).toEqual(["Real-Time Decision Engine"]);
  });
  it("preserves required hiring approval and the canonical service identity", async () => {
    await db.update(companies).set({ requireBoardApprovalForNewAgents: true }).where(eq(companies.id, companyId));
    const svc = decisionEngineService(db); const engine = await svc.ensure(companyId);
    expect(engine.status).toBe("pending_approval");
    expect(await db.select().from(approvals).where(eq(approvals.companyId, companyId))).toHaveLength(1);
    await svc.ensure(companyId);
    expect(await db.select().from(approvals).where(eq(approvals.companyId, companyId))).toHaveLength(1);
    await expect(svc.evaluate(context(), input)).rejects.toMatchObject({ status: 409 });
    await expect(agentService(db).update(engine.id, { name: "Chat agent" })).rejects.toMatchObject({ status: 409 });
    await expect(agentService(db).update(engine.id, { adapterType: "codex_local" })).rejects.toMatchObject({ status: 409 });
    expect(wake).not.toHaveBeenCalled();
  });
  it("dispatches one worker run for concurrent identical requests", async () => {
    const svc = decisionEngineService(db); await svc.ensure(companyId);
    const results = await Promise.all([svc.evaluate(context(), input), svc.evaluate(context(), input)]);
    expect(results[0].evaluationId).toBe(results[1].evaluationId); expect(wake).toHaveBeenCalledTimes(1);
    expect(wake.mock.calls[0][1].contextSnapshot).toMatchObject({ state: { suppliedState: input.state, taskContext: { tasks: expect.any(Array) } }, decisionDisplayQuestions: input.questions, decisionEngineIssueId: issueId, responsibleUserId: "owner" });
    expect(wake.mock.calls[0][1].contextSnapshot.issueId).toBeUndefined();
  });
  it("rejects changed input under an existing request key", async () => {
    const svc = decisionEngineService(db); await svc.evaluate(context(), input);
    await expect(svc.evaluate(context(), { ...input, state: "Different facts" })).rejects.toMatchObject({ status: 409 });
    expect(wake).toHaveBeenCalledTimes(1);
  });
  it("isolates company, caller, task and responsible-user results", async () => {
    const svc = decisionEngineService(db); const receipt = await svc.evaluate(context(), input);
    await expect(svc.read(randomUUID(), callerAgentId, receipt.evaluationId, "owner", issueId)).rejects.toMatchObject({ status: 404 });
    await expect(svc.read(companyId, randomUUID(), receipt.evaluationId, "owner", issueId)).rejects.toMatchObject({ status: 404 });
    await expect(svc.read(companyId, callerAgentId, receipt.evaluationId, "other-owner", issueId)).rejects.toMatchObject({ status: 403 });
    await expect(svc.read(companyId, callerAgentId, receipt.evaluationId, "owner", randomUUID())).rejects.toMatchObject({ status: 403 });
  });
  it("returns answers only after successful execution", async () => {
    const svc = decisionEngineService(db); const receipt = await svc.evaluate(context(), input);
    expect(receipt).not.toHaveProperty("result");
    const result = { model: "jev-1.13.0", answers: { urgent: { type: "noul", noul: 0.98 } }, usage: { input_tokens: 23, output_tokens: 7 } };
    await db.update(heartbeatRuns).set({ status: "succeeded", resultJson: result }).where(eq(heartbeatRuns.id, receipt.runId!));
    expect(await svc.read(companyId, callerAgentId, receipt.evaluationId, "owner", issueId)).toMatchObject({ status: "succeeded", result });
  });
  it("projects task history without raw state or runtime metadata", async () => {
    const svc = decisionEngineService(db); const receipt = await svc.evaluate(context(), input);
    const result = { model: "jev-1.13.0", answers: { urgent: { type: "noul", noul: 0.98 } }, usage: { input_tokens: 23 }, configFreshness: { secret: "private" } };
    await db.update(heartbeatRuns).set({ status: "succeeded", resultJson: result }).where(eq(heartbeatRuns.id, receipt.runId!));
    const history = await listDecisionEvaluations(db, companyId, issueId);
    expect(history.items).toHaveLength(1);
    expect(history.items[0]).toMatchObject({ callerRunId, callerName: "Project agent", status: "succeeded", questions: input.questions, purpose: input.purpose, result: { model: result.model, answers: result.answers } });
    expect(JSON.stringify(history)).not.toContain(input.state);
    expect(JSON.stringify(history)).not.toContain("private");
    expect(await listDecisionEvaluations(db, randomUUID(), issueId)).toEqual({ items: [], nextCursor: null });
    expect(await listDecisionEvaluations(db, companyId, randomUUID())).toEqual({ items: [], nextCursor: null });
  });
  it("keeps failed and incomplete history unavailable and recovers lost run references", async () => {
    const svc = decisionEngineService(db); const receipt = await svc.evaluate(context(), input);
    expect((await listDecisionEvaluations(db, companyId, issueId)).items[0]).toMatchObject({ status: "queued", result: null });
    await db.update(decisionEvaluations).set({ runId: null }).where(eq(decisionEvaluations.id, receipt.evaluationId));
    await db.update(heartbeatRuns).set({ status: "failed", resultJson: { model: "jev-latest", answers: { stale: true } } }).where(eq(heartbeatRuns.id, receipt.runId!));
    expect((await listDecisionEvaluations(db, companyId, issueId)).items[0]).toMatchObject({ status: "failed", result: null });
    await db.update(heartbeatRuns).set({ status: "succeeded", resultJson: {} }).where(eq(heartbeatRuns.id, receipt.runId!));
    expect((await listDecisionEvaluations(db, companyId, issueId)).items[0]).toMatchObject({ status: "result_unavailable", result: null });
    expect(wake).toHaveBeenCalledTimes(1);
  });
  it("shows one card per receipt even if historical wake records are duplicated", async () => {
    const svc = decisionEngineService(db); const receipt = await svc.evaluate(context(), input);
    await db.insert(agentWakeupRequests).values({ companyId, agentId: receipt.agentId, source: "on_demand", idempotencyKey: `jev:${receipt.evaluationId}`, status: "skipped" });
    expect((await listDecisionEvaluations(db, companyId, issueId)).items).toHaveLength(1);
  });
  it("paginates without dropping same-timestamp receipts and rejects foreign cursors", async () => {
    const engine = await decisionEngineService(db).ensure(companyId);
    const receipts = await db.insert(decisionEvaluations).values(Array.from({ length: 101 }, (_, i) => ({ ...context(), engineAgentId: engine.id, idempotencyKey: `page-${i}`, inputHash: "hash", createdAt: new Date("2026-10-06T12:00:00Z") }))).returning();
    const first = await listDecisionEvaluations(db, companyId, issueId);
    expect(first.items).toHaveLength(100); expect(first.nextCursor).toBeTruthy();
    const second = await listDecisionEvaluations(db, companyId, issueId, first.nextCursor!);
    expect(second.items).toHaveLength(1); expect(second.nextCursor).toBeNull();
    expect(new Set([...first.items, ...second.items].map(row => row.evaluationId)).size).toBe(receipts.length);
    await expect(listDecisionEvaluations(db, companyId, randomUUID(), first.nextCursor!)).rejects.toMatchObject({ status: 404 });
  });
  it("passes complete referenced descriptions, discussion and current documents separately from concise option labels", async () => {
    const targetId = randomUUID(), documentId = randomUUID();
    await db.insert(issues).values({ id: targetId, companyId, identifier: "TASK-501", title: "Release verification", description: "Authoritative task description with verified prerequisites", status: "blocked" });
    await db.insert(issueComments).values([{ companyId, issueId: targetId, body: "Observed source hash differs from deployed artifact" }, { companyId, issueId: targetId, body: "Deleted unrelated comment", deletedAt: new Date() }]);
    await db.insert(documents).values({ id: documentId, companyId, title: "Release evidence", latestBody: "Complete document body with the actual validation details" });
    await db.insert(issueDocuments).values({ companyId, issueId: targetId, documentId, key: "release" });
    const evaluation = { ...input, taskReferences: ["TASK-501"], questions: { next: { type: "choice", instructions: { question: "Which focus addresses the observed release discrepancy?" }, criteria: { reconcile: { label: "Reconcile the release", definition: "Address a discrepancy demonstrated in source/deployment evidence", taskReferences: ["TASK-501"] }, wait: { label: "Gather missing evidence", definition: "Use when the evidence does not establish a discrepancy" } } } } };
    await decisionEngineService(db).evaluate(context(), evaluation);
    const snapshot = wake.mock.calls[0][1].contextSnapshot;
    const task = snapshot.state.taskContext.tasks.find((row: any) => row.id === targetId);
    expect(task.description).toContain("Authoritative task description");
    expect(task.comments.map((row: any) => row.body)).toEqual(["Observed source hash differs from deployed artifact"]);
    expect(task.documents[0].body).toBe("Complete document body with the actual validation details");
    expect(snapshot.typesafeQuestions.next.criteria.reconcile.label).toBe("Reconcile the release");
    expect(JSON.stringify(snapshot.typesafeQuestions.next.criteria)).not.toContain("Observed source hash");
    expect(snapshot.typesafeQuestions.next.instructions.question).toBe("Which focus addresses the observed release discrepancy?");
    expect(snapshot.typesafeQuestions.next.instructions.evaluationRules).toContain(DECISION_SCOPE_RULE);
    expect(snapshot.state.evaluationPolicy.rules).toContain(DECISION_SCOPE_RULE);
    expect(DECISION_ENGINE_GUIDANCE).toContain(JSON.stringify(DECISION_CLAIM_CRITERIA));
    expect(snapshot.decisionTaskReferences.find((row: any) => row.id === targetId)).toMatchObject({ comments: 1, documents: 1, contextHash: expect.stringMatching(/^[a-f0-9]{64}$/) });
    expect(snapshot.decisionEvidenceHash).toMatch(/^[a-f0-9]{64}$/);
    const read = await listDecisionEvaluations(db, companyId, issueId, undefined, { type: "board", userId: "owner", source: "session", companyIds: [companyId] });
    expect(read.items[0].taskReferences).toContainEqual(expect.objectContaining({ id: targetId, identifier: "TASK-501" }));
    expect(JSON.stringify(read)).not.toContain("Complete document body");
  });
  it("resolves task identifiers in existing option strings, and never dispatches unavailable references", async () => {
    await db.insert(issues).values({ companyId, identifier: "TASK-502", title: "Real task context", description: "Actual context", status: "done" });
    await decisionEngineService(db).evaluate(context(), { ...input, questions: { choice: { type: "choice", instructions: "Which focus?", criteria: { real: "Refer to TASK-502", unknown: "No sufficient evidence" } } } });
    expect(wake.mock.calls[0][1].contextSnapshot.state.taskContext.tasks.some((task: any) => task.identifier === "TASK-502")).toBe(true);
    await expect(decisionEngineService(db).evaluate(context(), { ...input, idempotencyKey: "foreign", taskReferences: [randomUUID()] })).rejects.toMatchObject({ status: 403 });
    await expect(decisionEngineService(db).evaluate({ ...context(), actor: { type: "none" } }, { ...input, idempotencyKey: "no-read" })).rejects.toMatchObject({ status: 403 });
    expect(wake).toHaveBeenCalledTimes(1);
  });
  it("preserves complete selected evidence, records exclusions and rejects invalid evidence selections", async () => {
    const targetId = randomUUID(), documentId = randomUUID(), chosenCommentId = randomUUID();
    await db.insert(issues).values({ id: targetId, companyId, identifier: "TASK-503", title: "Focused evidence", description: "Complete current description" });
    await db.insert(issueComments).values([{ id: chosenCommentId, companyId, issueId: targetId, body: "Current contradictory evidence remains intact" }, { companyId, issueId: targetId, body: "Old archived detail ".repeat(6000) }]);
    await db.insert(documents).values({ id: documentId, companyId, title: "Current result", latestBody: "Full current verification document" });
    await db.insert(issueDocuments).values({ companyId, issueId: targetId, documentId, key: "result" });
    const svc = decisionEngineService(db);
    await expect(svc.evaluate(context(), { ...input, taskReferences: [targetId] })).rejects.toMatchObject({ status: 422 });
    expect(wake).not.toHaveBeenCalled();
    const selected = { ...input, taskEvidence: [{ task: targetId, commentIds: [chosenCommentId], documentKeys: ["result"] }] };
    const receipt = await svc.evaluate(context(), selected);
    const task = wake.mock.calls[0][1].contextSnapshot.state.taskContext.tasks.find((task: any) => task.id === targetId);
    expect(task.description).toBe("Complete current description");
    expect(task.comments).toHaveLength(1); expect(task.comments[0].body).toBe("Current contradictory evidence remains intact");
    expect(task.documents[0].body).toBe("Full current verification document");
    expect(task.completeness).toMatchObject({ excludedComments: 1, excludedDocuments: 0 });
    await expect(svc.evaluate(context(), { ...selected, taskEvidence: [{ task: targetId, commentIds: [], documentKeys: ["result"] }] })).rejects.toMatchObject({ status: 409 });
    expect((await svc.evaluate(context(), selected)).evaluationId).toBe(receipt.evaluationId);
    await expect(svc.evaluate(context(), { ...selected, idempotencyKey: "missing-evidence", taskEvidence: [{ task: targetId, commentIds: [randomUUID()] }] })).rejects.toMatchObject({ status: 422 });
    expect(wake).toHaveBeenCalledTimes(1);
  });
  it("does not include unrelated chat archives merely because a question mentions their identifier", async () => {
    const chatId = randomUUID();
    await db.insert(issues).values({ id: chatId, companyId, identifier: "TASK-504", title: "Previous chat", status: "in_progress", assigneeAgentId: callerAgentId, conversationAgentId: callerAgentId, conversationUserId: "owner", conversationState: "active", description: "Chat archive" });
    await db.insert(issueComments).values({ companyId, issueId: chatId, body: "Unrelated conversation ".repeat(6000), conversationSessionGeneration: 0 });
    const svc = decisionEngineService(db);
    await svc.evaluate(context(), { ...input, state: "The question was discussed in TASK-504; decide only from the supplied current facts." });
    expect(wake.mock.calls[0][1].contextSnapshot.state.taskContext.tasks.some((task: any) => task.id === chatId)).toBe(false);
    await expect(svc.evaluate(context(), { ...input, idempotencyKey: "explicit-large-chat", taskReferences: [chatId] })).rejects.toMatchObject({ status: 422 });
    expect(wake).toHaveBeenCalledTimes(1);
  });
  it("returns safe actionable context failures in receipt and public history without exposing provider bodies", async () => {
    const svc = decisionEngineService(db); const receipt = await svc.evaluate(context(), input);
    await db.update(heartbeatRuns).set({ status: "failed", errorCode: "typesafe_context_too_large", error: "private provider body" }).where(eq(heartbeatRuns.id, receipt.runId!));
    const read = await svc.read(companyId, callerAgentId, receipt.evaluationId, "owner", issueId);
    const history = await listDecisionEvaluations(db, companyId, issueId);
    expect(read.error).toMatchObject({ code: "context_too_large" });
    expect(history.items[0].error).toEqual(read.error);
    expect(JSON.stringify(history)).not.toContain("private provider body");
    expect(history.items[0].result).toBeNull();
  });
  it("refuses oversized full evidence without truncating it, reserving a request, or dispatching", async () => {
    await db.update(issues).set({ description: "x".repeat(910_000) }).where(eq(issues.id, issueId));
    await expect(decisionEngineService(db).evaluate(context(), input)).rejects.toMatchObject({ status: 422 });
    expect(wake).not.toHaveBeenCalled();
    expect(await db.select().from(decisionEvaluations).where(eq(decisionEvaluations.companyId, companyId))).toHaveLength(0);
  });
  it("does not mistake model versions or other hyphenated entities for task references", async () => {
    await decisionEngineService(db).evaluate(context(), { ...input, state: "The caller uses gpt-6 and Jev-1.13.0 to evaluate support messages" });
    expect(wake).toHaveBeenCalledTimes(1);
    expect(wake.mock.calls[0][1].contextSnapshot.state.taskContext.tasks).toHaveLength(1);
  });
  it("keeps unrelated caller chat archives out of a task decision unless explicitly referenced", async () => {
    await db.update(issues).set({ conversationAgentId: callerAgentId, conversationUserId: "owner", conversationState: "active", conversationSessionGeneration: 2 }).where(eq(issues.id, issueId));
    await db.insert(issueComments).values({ companyId, issueId, body: "Unrelated caller chat history", conversationSessionGeneration: 2 });
    const svc = decisionEngineService(db);
    await svc.evaluate(context(), input);
    expect(wake.mock.calls[0][1].contextSnapshot.state.taskContext).toMatchObject({ currentTask: { id: issueId }, tasks: [], unrelatedCallerConversationExcluded: true });
    await svc.evaluate(context(), { ...input, idempotencyKey: "explicit-chat-context", taskReferences: [issueId] });
    expect(wake.mock.calls[1][1].contextSnapshot.state.taskContext.tasks[0].comments[0].body).toBe("Unrelated caller chat history");
  });
  it("rejects task conversations pasted into option labels before provider dispatch", async () => {
    await expect(decisionEngineService(db).evaluate(context(), { ...input, questions: { next: { type: "choice", instructions: "Choose a focus", criteria: { copiedConversation: "Full conversation ".repeat(100), other: "Other focus" } } } })).rejects.toMatchObject({ status: 422 });
    expect(wake).not.toHaveBeenCalled();
  });
  it("keeps the original evidence version for an identical request retry", async () => {
    const svc = decisionEngineService(db), original = await svc.evaluate(context(), input);
    await db.update(issues).set({ description: "Changed since the original request" }).where(eq(issues.id, issueId));
    const repeated = await svc.evaluate(context(), input);
    expect(repeated.evaluationId).toBe(original.evaluationId); expect(repeated.evidenceHash).toBe(original.evidenceHash);
    expect(wake).toHaveBeenCalledTimes(1);
  });
  it("recovers a lost receipt from its durable wake without replay", async () => {
    const svc = decisionEngineService(db); const receipt = await svc.evaluate(context(), input);
    await db.update(decisionEvaluations).set({ runId: null, status: "dispatch_unknown" }).where(eq(decisionEvaluations.id, receipt.evaluationId));
    const retry = await svc.evaluate(context(), input); expect(retry.runId).toBe(receipt.runId); expect(wake).toHaveBeenCalledTimes(1);
  });
  it("does not redispatch an unknown outcome", async () => {
    wake.mockRejectedValueOnce(new Error("Unknown dispatch outcome")); const svc = decisionEngineService(db);
    await expect(svc.evaluate(context(), input)).rejects.toThrow("Unknown dispatch outcome");
    expect(await svc.evaluate(context(), input)).toMatchObject({ status: "dispatch_unknown", runId: null });
    expect(wake).toHaveBeenCalledTimes(1);
  });
  it("rejects human users and static agent keys before dispatch", async () => {
    for (const actor of [{ type: "board", userId: "owner", source: "session" }, { type: "agent", source: "agent_key", agentId: callerAgentId, companyId }]) {
      const app = express(); app.use(express.json()); app.use((req, _res, next) => { req.actor = actor as any; next(); }); app.use(decisionEngineRoutes(db));
      app.use((error: any, _req: any, res: any, _next: any) => res.status(error.status ?? 500).json({ error: error.message }));
      expect((await request(app).post(`/companies/${companyId}/decision-engine/evaluations`).send(input)).status).toBe(403);
    }
    expect(wake).not.toHaveBeenCalled();
  });
  it("exposes structured evaluation tools in every task mode and validates inputs", () => {
    for (const mode of ["standard", "ask", "planning"]) expect(projectToolDefinitions(mode).map(t => t.name)).toEqual(expect.arrayContaining(["evaluate_decision", "get_decision_evaluation"]));
    expect(decisionEvaluationSchema.safeParse({ ...input, questions: {} }).success).toBe(false);
    expect(decisionEvaluationSchema.safeParse({ ...input, companyId: randomUUID() }).success).toBe(false);
    expect(decisionEvaluationSchema.safeParse({ ...input, questions: { x: { type: "choice", instructions: "Pick", criteria: {} } } }).success).toBe(false);
  });
});
