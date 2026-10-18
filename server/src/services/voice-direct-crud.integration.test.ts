import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import express, { type Request } from "express";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { agents, agentWakeupRequests, authUsers, companies, companyMemberships, createDb, heartbeatRuns, issues, startEmbeddedPostgresTestDatabase } from "@whoxos/db";
import { issueRoutes } from "../routes/issues.js";
import { actorMiddleware } from "../middleware/auth.js";
import { errorHandler } from "../middleware/index.js";
import { createStorageService } from "../storage/service.js";
import { createLocalDiskStorageProvider } from "../storage/local-disk-provider.js";
import { callVoiceApi } from "./voice-direct-api.js";
import { voiceDirectMiddleware } from "./voice-direct-context.js";

// Real SQL, permission policy, signed agent JWT, HTTP routes, and document
// revisions. The direct-voice permit must suppress every model dispatch.
describe("voice task and document operations through the real application routes", () => {
  let temporary: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>>;
  let db: ReturnType<typeof createDb>;
  let server: Server;
  let home: string;
  let req: Request;
  const companyId = randomUUID(), agentId = randomUUID(), issueId = randomUUID(), userId = randomUUID();
  const scope = { companyId, agentId, issueId, userId };
  beforeAll(async () => {
    home = await mkdtemp(path.join(tmpdir(), "voice-crud-home-"));
    vi.stubEnv("WHOXOS_HOME", home);
    vi.stubEnv("WHOXOS_INSTANCE_ID", "voice-crud-fixture");
    vi.stubEnv("WHOXOS_AGENT_JWT_SECRET", "voice-crud-fixture-jwt-secret");
    temporary = await startEmbeddedPostgresTestDatabase("voice-crud-");
    db = createDb(temporary.connectionString);
    await db.insert(companies).values({ id: companyId, name: "Voice CRUD fixture", issuePrefix: "VCR" });
    await db.insert(authUsers).values({ id: userId, name: "Fixture owner", email: `${userId}@example.test`, createdAt: new Date(), updatedAt: new Date() });
    await db.insert(companyMemberships).values({ companyId, principalType: "user", principalId: userId, status: "active", membershipRole: "owner" });
    await db.insert(agents).values({ id: agentId, companyId, name: "Fixture CEO", role: "ceo", status: "idle" });
    await db.insert(issues).values({ id: issueId, companyId, title: "Voice chat", status: "in_review", conversationState: "waiting", conversationAgentId: agentId, conversationUserId: userId, assigneeAgentId: agentId });
    const app = express();
    app.use(express.json());
    app.use(actorMiddleware(db, { deploymentMode: "authenticated" }));
    app.use(voiceDirectMiddleware);
    app.use("/api", issueRoutes(db, createStorageService(createLocalDiskStorageProvider(path.join(home, "storage")))));
    app.use(errorHandler);
    server = await new Promise<Server>(resolve => { const listening = app.listen(0, "127.0.0.1", () => resolve(listening)); });
    const port = (server.address() as { port: number }).port;
    req = { actor: { type: "board", userId, source: "session", companyIds: [companyId], memberships: [{ companyId, membershipRole: "owner", status: "active" }] }, app, socket: { localPort: port } } as unknown as Request;
  }, 90_000);
  afterAll(async () => {
    await new Promise<void>(resolve => server ? server.close(() => resolve()) : resolve());
    await temporary?.cleanup();
    vi.unstubAllEnvs();
    if (home) await rm(home, { recursive: true, force: true });
  });

  it("creates, updates, comments and saves a revisioned document without launching a model", async () => {
    const task = await callVoiceApi(db, req, scope, { action: "create_task", data: JSON.stringify({ title: "Build a checked calculation", assigneeAgentId: agentId }) }) as any;
    expect(task).toMatchObject({ title: "Build a checked calculation", status: "backlog", assigneeAgentId: agentId });
    expect((await db.select().from(issues).where(eq(issues.id, task.id)))[0]?.assigneeAdapterOverrides).toMatchObject({ adapterConfig: { voiceExecutionOnly: true } });
    expect(await callVoiceApi(db, req, scope, { action: "update_task", id: task.id, data: JSON.stringify({ description: "Compute 6 × 7, then save the evidence.", priority: "high" }) })).toMatchObject({ id: task.id, priority: "high" });
    expect(await callVoiceApi(db, req, scope, { action: "add_comment", id: task.id, data: JSON.stringify({ body: "Verified result: 42." }) })).toMatchObject({ body: "Verified result: 42." });
    const doc = await callVoiceApi(db, req, scope, { action: "put_document", id: task.id, key: "result", data: JSON.stringify({ title: "Calculation", format: "markdown", body: "# Result\n\n42" }) }) as any;
    expect(doc).toMatchObject({ body: "# Result\n\n42", latestRevisionNumber: 1 });
    expect(await callVoiceApi(db, req, scope, { action: "get_document", id: task.id, key: "result" })).toMatchObject({ body: "# Result\n\n42" });
    expect(await callVoiceApi(db, req, scope, { action: "put_document", id: task.id, key: "result", data: JSON.stringify({ format: "markdown", body: "# Result\n\nVerified: 42", baseRevisionId: doc.latestRevisionId }) })).toMatchObject({ latestRevisionNumber: 2 });
    await expect(callVoiceApi(db, req, scope, { action: "put_document", id: task.id, key: "result", data: JSON.stringify({ format: "markdown", body: "Stale update", baseRevisionId: doc.latestRevisionId }) })).rejects.toMatchObject({ status: 409 });
    expect(await callVoiceApi(db, req, scope, { action: "update_task", id: task.id, data: JSON.stringify({ status: "done" }) })).toMatchObject({ status: "done" });
    expect(await db.select().from(agentWakeupRequests).where(eq(agentWakeupRequests.companyId, companyId))).toHaveLength(0);
    const runs = await db.select().from(heartbeatRuns).where(eq(heartbeatRuns.companyId, companyId));
    expect(runs.length).toBeGreaterThan(0);
    expect(runs.every(run => run.runtimeMode === "voice_direct" && run.usageJson?.modelInvocations === 0)).toBe(true);
  });

  it("rejects cross-organization resources and runtime reconfiguration before forwarding", async () => {
    const foreignCompany = randomUUID(), foreignTask = randomUUID(), foreignAgent = randomUUID();
    await db.insert(companies).values({ id: foreignCompany, name: "Other fixture", issuePrefix: "VFR" });
    await db.insert(agents).values({ id: foreignAgent, companyId: foreignCompany, name: "Other agent" });
    await db.insert(issues).values({ id: foreignTask, companyId: foreignCompany, title: "Private foreign task" });
    await expect(callVoiceApi(db, req, scope, { action: "get_task", id: foreignTask })).rejects.toMatchObject({ status: 404 });
    await expect(callVoiceApi(db, req, scope, { action: "create_task", data: JSON.stringify({ title: "Invalid", assigneeAgentId: foreignAgent }) })).rejects.toMatchObject({ status: 404 });
    await expect(callVoiceApi(db, req, scope, { action: "create_task", data: JSON.stringify({ title: "Invalid", adapterConfig: { command: "sh" } }) })).rejects.toMatchObject({ status: 400 });
  });

  it("requires explicit idle-task adoption and never converts a task with an active run", async () => {
    const taskId = randomUUID();
    await db.insert(issues).values({ id: taskId, companyId, title: "Existing text task", status: "todo", assigneeAgentId: agentId, assigneeAdapterOverrides: { adapterConfig: { preservedSetting: "keep" } } });
    await expect(callVoiceApi(db, req, scope, { action: "update_task", id: taskId, data: JSON.stringify({ title: "Changed without adoption" }) })).rejects.toMatchObject({ status: 403 });
    const [active] = await db.insert(heartbeatRuns).values({ companyId, agentId, status: "running", invocationSource: "on_demand", contextSnapshot: { issueId: taskId } }).returning();
    await expect(callVoiceApi(db, req, scope, { action: "adopt_task", id: taskId })).rejects.toMatchObject({ status: 403 });
    expect((await db.select().from(issues).where(eq(issues.id, taskId)))[0]?.assigneeAdapterOverrides?.adapterConfig).not.toHaveProperty("voiceExecutionOnly");
    await db.update(heartbeatRuns).set({ status: "succeeded" }).where(eq(heartbeatRuns.id, active!.id));
    expect(await callVoiceApi(db, req, scope, { action: "adopt_task", id: taskId })).toMatchObject({ id: taskId, status: "todo", execution: "gemini_live_only" });
    expect((await db.select().from(issues).where(eq(issues.id, taskId)))[0]).toMatchObject({ status: "todo", assigneeAgentId: agentId, assigneeAdapterOverrides: { adapterConfig: { preservedSetting: "keep", voiceExecutionOnly: true } } });
    expect(await callVoiceApi(db, req, scope, { action: "update_task", id: taskId, data: JSON.stringify({ priority: "high" }) })).toMatchObject({ priority: "high" });
    expect(await db.select().from(agentWakeupRequests).where(eq(agentWakeupRequests.companyId, companyId))).toHaveLength(0);
  });

  it("retains the human member's write restrictions even when the agent can write", async () => {
    await db.update(companyMemberships).set({ membershipRole: "viewer" }).where(eq(companyMemberships.principalId, userId));
    try {
      const viewerReq = { ...req, actor: { ...req.actor, memberships: [{ companyId, membershipRole: "viewer", status: "active" }] } } as Request;
      await expect(callVoiceApi(db, viewerReq, scope, { action: "create_task", data: JSON.stringify({ title: "Forbidden write" }) })).rejects.toMatchObject({ status: 403 });
    } finally {
      await db.update(companyMemberships).set({ membershipRole: "owner" }).where(eq(companyMemberships.principalId, userId));
    }
  });
});
