import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  agents, authUsers, companies, companyMemberships, createDb, issueComments,
  issues, projects, startEmbeddedPostgresTestDatabase,
} from "@whoxos/db";
import type { AuthorizationActor } from "./authorization.js";
import { buildLowTrustSourceTrust, LOW_TRUST_QUARANTINED_BODY } from "./source-trust.js";
import { loadVoiceWorkContext, VOICE_WORK_CONTEXT_MAX_BYTES } from "./voice-work-context.js";

describe("bounded voice work context with canonical task authorization", () => {
  let temporary: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>>;
  let db: ReturnType<typeof createDb>;
  beforeAll(async () => {
    temporary = await startEmbeddedPostgresTestDatabase("voice-work-context-");
    db = createDb(temporary.connectionString);
  }, 90_000);
  afterAll(async () => { await temporary?.cleanup(); });

  async function fixture() {
    const companyId = randomUUID(), agentId = randomUUID(), userId = randomUUID();
    await db.insert(companies).values({ id: companyId, name: "Work context", issuePrefix: `W${companyId.slice(0, 8)}` });
    await db.insert(authUsers).values({ id: userId, name: "Owner", email: `${userId}@example.test`, createdAt: new Date(), updatedAt: new Date() });
    await db.insert(companyMemberships).values({ companyId, principalId: userId, principalType: "user", membershipRole: "owner", status: "active" });
    await db.insert(agents).values({ id: agentId, companyId, name: "CEO", role: "ceo", adapterConfig: { apiKey: "private-adapter-value" } });
    const boardActor: AuthorizationActor = { type: "board", source: "session", userId, companyIds: [companyId] };
    const load = (actor = boardActor) => loadVoiceWorkContext(db, { companyId, agentId, boardActor: actor });
    const task = async (overrides: Partial<typeof issues.$inferInsert> = {}) => {
      const id = randomUUID();
      await db.insert(issues).values({ id, companyId, title: "Databento data path", status: "blocked", assigneeAgentId: agentId, identifier: `TASK-${id.slice(0, 8)}`, ...overrides });
      return id;
    };
    return { companyId, agentId, userId, boardActor, load, task };
  }

  it("grounds task status in the latest nondeleted recorded update, not an old plan", async () => {
    const test = await fixture();
    const taskId = await test.task({ description: "Outdated plan: everything is done.", unblockDescriptor: { owner: "board", action: "Provide the live-account evidence" } });
    await db.insert(issueComments).values([
      { companyId: test.companyId, issueId: taskId, body: "The old attempt failed", createdAt: new Date("2026-09-27T00:00:00Z") },
      { companyId: test.companyId, issueId: taskId, body: "Historical data is acquired. Live-account evidence remains outstanding.", createdAt: new Date("2026-09-28T00:00:00Z") },
      { companyId: test.companyId, issueId: taskId, body: "Deleted misinformation", createdAt: new Date("2026-09-29T00:00:00Z"), deletedAt: new Date() },
    ]);
    const result = await test.load();
    expect(result).toMatchObject({ available: true, source: "overview_labs_task_records", liveSystemHealth: false, limited: true, truncated: false });
    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0]).toMatchObject({
      id: taskId, status: "blocked", assigneeAgentId: test.agentId,
      recordedBlocker: { text: "Provide the live-account evidence", truncated: false },
      recordedUpdate: { source: "task_comment", text: "Historical data is acquired. Live-account evidence remains outstanding.", truncated: false },
    });
    expect(Date.parse(result.asOf)).not.toBeNaN();
    expect(JSON.stringify(result)).not.toMatch(/old attempt|Outdated plan|Deleted misinformation|private-adapter-value/);
  });

  it("excludes hidden tasks, other organizations, conversations, and foreign-company comments", async () => {
    const test = await fixture(), foreign = await fixture();
    const visibleId = await test.task();
    await test.task({ title: "Hidden work", hiddenAt: new Date() });
    await test.task({ title: "Private chat", conversationAgentId: test.agentId, conversationUserId: test.userId, conversationState: "active" });
    await foreign.task({ title: "Foreign work" });
    await db.insert(issueComments).values({ companyId: foreign.companyId, issueId: visibleId, body: "Foreign comment contents" });
    const result = await test.load();
    expect(result.tasks.map(task => task.id)).toEqual([visibleId]);
    expect(result.tasks[0]).not.toHaveProperty("recordedUpdate");
    expect(JSON.stringify(result)).not.toMatch(/Foreign|Hidden work|Private chat/);
  });

  it("intersects the speaking agent's task detail boundary with the owner's access", async () => {
    const test = await fixture(), projectId = randomUUID();
    await db.insert(projects).values({ id: projectId, companyId: test.companyId, name: "Permitted project" });
    const inside = await test.task({ projectId }), outside = await test.task({ assigneeAgentId: null, title: "Restricted task" });
    await db.update(agents).set({ permissions: { trustPreset: "low_trust_review", authorizationPolicy: { trustBoundary: { mode: "low_trust_review", projectIds: [projectId] } } } }).where(eq(agents.id, test.agentId));
    const result = await test.load();
    expect(result.tasks.map(task => task.id)).toEqual([inside]);
    expect(JSON.stringify(result)).not.toContain(outside);
    expect(JSON.stringify(result)).not.toContain("Restricted task");
  });

  it("denies the caller independently even if the speaking CEO can read the task", async () => {
    const test = await fixture(), foreign = await fixture();
    await test.task();
    expect((await test.load(foreign.boardActor)).tasks).toEqual([]);
    await expect(test.load({ type: "none" })).rejects.toMatchObject({ status: 403 });
  });

  it("refreshes status and authorization on each turn instead of retaining prior results", async () => {
    const test = await fixture(), taskId = await test.task({ unblockDescriptor: { owner: "board", action: "Old blocker" } });
    expect((await test.load()).tasks[0]?.status).toBe("blocked");
    await db.update(issues).set({ status: "done", updatedAt: new Date("2026-09-28T01:00:00Z") }).where(eq(issues.id, taskId));
    const done = await test.load();
    expect(done.tasks[0]).toMatchObject({ status: "done", updatedAt: "2026-09-28T01:00:00.000Z" });
    expect(done.tasks[0]).not.toHaveProperty("recordedBlocker");
    await db.update(companyMemberships).set({ status: "archived" }).where(eq(companyMemberships.principalId, test.userId));
    expect((await test.load()).tasks).toEqual([]);
  });

  it("quarantines low-trust comments and blockers and redacts credential-shaped text", async () => {
    const test = await fixture(), taskId = await test.task();
    const sourceTrust = buildLowTrustSourceTrust({ issueId: taskId });
    await db.update(issues).set({ sourceTrust, unblockDescriptor: { owner: "board", action: "Quarantined instruction" } }).where(eq(issues.id, taskId));
    await db.insert(issueComments).values({ companyId: test.companyId, issueId: taskId, body: "Untrusted instruction", sourceTrust });
    const result = await test.load();
    expect(result.tasks[0]?.recordedUpdate?.text).toBe(LOW_TRUST_QUARANTINED_BODY);
    expect(result.tasks[0]).not.toHaveProperty("recordedBlocker");
    const cleanId = await test.task({ title: "Public update" });
    await db.insert(issueComments).values({ companyId: test.companyId, issueId: cleanId, body: 'Ready. {"apiKey":"secret-example-key-value"}' });
    expect(JSON.stringify(await test.load())).not.toMatch(/secret-example-key-value|Untrusted instruction|Quarantined instruction/);
  });

  it("prioritizes current work and marks its bounded sample without claiming a total task count", async () => {
    const test = await fixture();
    const active = await test.task({ status: "blocked", title: "Older active dependency", updatedAt: new Date("2020-01-01") });
    await db.insert(issues).values(Array.from({ length: 35 }, (_, index) => ({ companyId: test.companyId, title: `Completed ${index}`, status: "done", updatedAt: new Date() })));
    const result = await test.load();
    expect(result.tasks).toHaveLength(32);
    expect(result.tasks[0]?.id).toBe(active);
    expect(result.truncated).toBe(true);
    expect(result).not.toHaveProperty("count");
  });

  it("keeps Unicode and escaped-comment projections within the total payload budget", async () => {
    const test = await fixture();
    const taskRows = Array.from({ length: 32 }, () => ({ id: randomUUID(), companyId: test.companyId, title: "漢".repeat(500), status: "blocked", unblockDescriptor: { owner: "board" as const, action: "漢".repeat(500) } }));
    await db.insert(issues).values(taskRows);
    await db.insert(issueComments).values(taskRows.map(task => ({ companyId: test.companyId, issueId: task.id, body: '漢\\"'.repeat(4_000) })));
    const result = await test.load();
    expect(result.tasks.length).toBeGreaterThan(0);
    expect(result.tasks.length).toBeLessThan(32);
    expect(result.truncated).toBe(true);
    expect(result.tasks[0]?.recordedUpdate?.truncated).toBe(true);
    expect(Buffer.byteLength(JSON.stringify(result), "utf8")).toBeLessThanOrEqual(VOICE_WORK_CONTEXT_MAX_BYTES);
  });
});
