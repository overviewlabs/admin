import { randomUUID } from "node:crypto";
import express from "express";
import request from "supertest";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { agents, companies, createDb, issues, issueComments, issueThreadInteractions, activityLog, heartbeatRuns } from "@whoxos/db";
import { issueRoutes } from "../routes/issues.js";
import { errorHandler } from "../middleware/index.js";
import { issueService } from "../services/issues.js";
import { instanceSettingsService } from "../services/instance-settings.js";
import { conversationQuickAnswer, quickAnswerIntent } from "../services/conversation-quick-answer.js";
import { deliverConversationComments, settleConversationTurn, undeliveredConversationComments } from "../services/agent-conversations.js";
import { getEmbeddedPostgresTestSupport, startEmbeddedPostgresTestDatabase } from "./helpers/embedded-postgres.js";

const { wakeup } = vi.hoisted(() => ({ wakeup: vi.fn(async () => null) }));
vi.mock("../services/heartbeat.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../services/heartbeat.js")>();
  return { ...original, heartbeatService: (...args: Parameters<typeof original.heartbeatService>) => ({ ...original.heartbeatService(...args), wakeup }) };
});

describe("direct answer routing", () => {
  it.each(["how many agents are there", "How many agents do we have?", "what's our agent count?", "List all agents", "What are you working on right now?", "Which tasks are assigned to you?"])("recognizes a complete factual request: %s", (body) => {
    expect(quickAnswerIntent(body)).not.toBeNull();
  });
  it.each(["how many agents are there and create another", "how many agents are there? Delete the idle ones", "list agents from another organization", "how many agents were there yesterday", "how many agents are running", "what are you working on and stop it", "Create a project", "/new", "Who are you?", "Yes", "how many agents are there in Acme?"])("keeps other requests with the runtime: %s", (body) => {
    expect(quickAnswerIntent(body)).toBeNull();
  });
});

const support = await getEmbeddedPostgresTestSupport();
(support.supported ? describe : describe.skip)("direct answers through the authenticated chat API", () => {
  let database: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>>;
  let db: ReturnType<typeof createDb>;
  let companyId: string;
  let agentId: string;
  beforeAll(async () => {
    database = await startEmbeddedPostgresTestDatabase("whoxos-quick-chat-");
    db = createDb(database.connectionString); companyId = randomUUID(); agentId = randomUUID();
    await db.insert(companies).values({ id: companyId, name: "Quick", issuePrefix: "QUICK" });
    await db.insert(agents).values([
      { id: agentId, companyId, name: "CEO", status: "idle", adapterType: "process" },
      { companyId, name: "Engineer", status: "paused", adapterType: "process" },
      { companyId, name: "Former", status: "terminated", adapterType: "process" },
    ]);
    const other = randomUUID();
    await db.insert(companies).values({ id: other, name: "Other", issuePrefix: "OTHER" });
    await db.insert(agents).values({ companyId: other, name: "Private outsider", adapterType: "process" });
    await instanceSettingsService(db).updateExperimental({ enableAgentChat: true });
  }, 90000);
  afterAll(async () => { await db?.$client.end({ timeout: 0 }); await database?.cleanup(); });
  function appFor(userId: string) {
    const app = express(); app.use(express.json());
    app.use((req, _res, next) => { req.actor = { type: "board", source: "local_implicit", userId, isInstanceAdmin: true }; next(); });
    app.use("/api", issueRoutes(db)); app.use(errorHandler); return app;
  }
  async function chat() {
    const userId = randomUUID();
    const row = await issueService(db).create(companyId, { title: "Chat", conversationAgentId: agentId, conversationUserId: userId, assigneeAgentId: agentId, status: "in_review", conversationState: "waiting" });
    return { row, app: appFor(userId) };
  }
  async function messages(id: string) { return db.select().from(issueComments).where(eq(issueComments.issueId, id)).orderBy(issueComments.createdAt); }
  it("answers from live company data and persists both messages without queueing a run", async () => {
    const { row, app } = await chat(); wakeup.mockClear();
    const start = performance.now();
    const sent = await request(app).post(`/api/issues/${row.id}/comments`).send({ body: "how many agents are there", clientRequestId: randomUUID() });
    console.log(`Direct chat count round trip: ${Math.round(performance.now() - start)}ms`);
    expect(sent.status).toBe(201);
    const saved = await messages(row.id); expect(saved).toHaveLength(2);
    expect(saved[0].authorType).toBe("user"); expect(saved[0].body).toBe("how many agents are there");
    expect(saved[1].authorAgentId).toBe(agentId); expect(saved[1].body).toContain("There are 2 agents");
    expect(saved[1].body).toContain("CEO — idle"); expect(saved[1].body).not.toMatch(/Former|Private outsider/);
    expect(wakeup).not.toHaveBeenCalled();
    expect(await undeliveredConversationComments(db, companyId, row.id)).toHaveLength(0);
    await deliverConversationComments(db, row, wakeup); expect(wakeup).not.toHaveBeenCalled();
    const [current] = await db.select().from(issues).where(eq(issues.id, row.id));
    expect(current.conversationState).toBe("waiting"); expect(current.conversationSessionGeneration).toBe(row.conversationSessionGeneration);
    expect(await db.select().from(activityLog).where(and(eq(activityLog.entityId, row.id), eq(activityLog.action, "issue.comment_added")))).toHaveLength(2);
  });
  it("deduplicates concurrent retries, rejects different content, and preserves active state", async () => {
    const { row, app } = await chat();
    await db.update(issues).set({ conversationState: "active", status: "in_progress" }).where(eq(issues.id, row.id));
    const body = { body: "list agents", clientRequestId: randomUUID() }; wakeup.mockClear();
    const sent = await Promise.all(Array.from({ length: 4 }, () => request(app).post(`/api/issues/${row.id}/comments`).send(body)));
    expect(sent.map((res) => res.status)).toEqual([201, 201, 201, 201]); expect(new Set(sent.map((res) => res.body.id)).size).toBe(1);
    expect(await messages(row.id)).toHaveLength(2); expect(wakeup).not.toHaveBeenCalled();
    const [current] = await db.select().from(issues).where(eq(issues.id, row.id));
    expect(current.conversationState).toBe("active"); expect(current.status).toBe("in_progress");
    expect((await request(app).post(`/api/issues/${row.id}/comments`).send({ ...body, body: "different" })).status).toBe(409);
  });
  it("denies another user access to a private conversation", async () => {
    const { row } = await chat();
    expect((await request(appFor(randomUUID())).post(`/api/issues/${row.id}/comments`).send({ body: "how many agents are there", clientRequestId: randomUUID() })).status).toBe(403);
    expect(await messages(row.id)).toHaveLength(0);
  });
  it("does not keep a completed runtime turn active because a later quick question was already answered", async () => {
    const { row, app } = await chat();
    const input = await issueService(db).addComment(row.id, "Build it", { userId: row.conversationUserId! }, { clientRequestId: randomUUID() });
    const [run] = await db.insert(heartbeatRuns).values({ companyId, agentId, status: "succeeded", contextSnapshot: {
      issueId: row.id, wakeCommentId: input.id, conversationSessionGeneration: row.conversationSessionGeneration,
    } }).returning();
    await db.update(issues).set({ executionRunId: run.id, status: "in_progress", conversationState: "active" }).where(eq(issues.id, row.id));
    await db.insert(issueComments).values({ companyId, issueId: row.id, authorType: "agent", authorAgentId: agentId, createdByRunId: run.id, body: "Built it" });
    expect((await request(app).post(`/api/issues/${row.id}/comments`).send({ body: "how many agents are there", clientRequestId: randomUUID() })).status).toBe(201);
    expect(await settleConversationTurn(db, run)).toBe(true);
    const [current] = await db.select().from(issues).where(eq(issues.id, row.id));
    expect(current.conversationState).toBe("waiting"); expect(current.status).toBe("in_review");
  });
  it("keeps compound requests and pending clarifications on the normal execution path", async () => {
    const first = await chat(); wakeup.mockClear();
    const response = await request(first.app).post(`/api/issues/${first.row.id}/comments`).send({ body: "how many agents are there and create another", clientRequestId: randomUUID() });
    expect(response.status).toBe(201); expect(wakeup).toHaveBeenCalledTimes(1); expect(await messages(first.row.id)).toHaveLength(1);
    const next = await chat(); wakeup.mockClear();
    await db.insert(issueThreadInteractions).values({ companyId, issueId: next.row.id, kind: "request_confirmation", status: "pending", payload: { version: 1, prompt: "Proceed?" } });
    await request(next.app).post(`/api/issues/${next.row.id}/comments`).send({ body: "how many agents are there", clientRequestId: randomUUID() });
    expect(wakeup).toHaveBeenCalledTimes(1); expect(await messages(next.row.id)).toHaveLength(1);
  });
  it("reports actual own assignments with their state and excludes completed, hidden and other work", async () => {
    const { row, app } = await chat();
    await db.insert(issues).values([
      { companyId, title: "Implement login", status: "in_progress", assigneeAgentId: agentId },
      { companyId, title: "Waiting for credentials", status: "blocked", assigneeAgentId: agentId },
      { companyId, title: "Finished task", status: "done", assigneeAgentId: agentId },
      { companyId, title: "Hidden task", status: "todo", hiddenAt: new Date(), assigneeAgentId: agentId },
      { companyId, title: "Unassigned task", status: "todo" },
    ]);
    wakeup.mockClear();
    expect((await request(app).post(`/api/issues/${row.id}/comments`).send({ body: "What are you working on right now?", clientRequestId: randomUUID() })).status).toBe(201);
    const saved = await messages(row.id);
    expect(saved[1].body).toContain("I have 2 open assigned tasks; 1 is marked in progress");
    expect(saved[1].body).toContain("Waiting for credentials — blocked");
    expect(saved[1].body).not.toMatch(/Finished task|Hidden task|Unassigned task|Chat/); expect(wakeup).not.toHaveBeenCalled();
  });
  it("filters unauthorized records and never drops attachments", async () => {
    const { row } = await chat();
    const input = { body: "list agents", companyId, agentId, issueId: row.id, actor: { type: "board" as const, source: "session" as const, userId: randomUUID(), companyIds: [] } };
    const answer = await conversationQuickAnswer(db, input);
    expect(answer).toContain("0 agents"); expect(answer).not.toMatch(/CEO|Engineer/);
    expect(await conversationQuickAnswer(db, { ...input, attachmentIds: [randomUUID()] })).toBeNull();
  });
});
