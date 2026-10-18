import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import express from "express";
import request from "supertest";
import { and, eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { agents, authUsers, companies, companyMemberships, companySecrets, connectionGrants, createDb, issueComments, issues, startEmbeddedPostgresTestDatabase, toolConnections } from "@whoxos/db";
import { agentVoiceRoutes } from "../routes/agent-voice.js";
import { aiConnectionService } from "../services/ai-connections.js";
import { instanceSettingsService } from "../services/instance-settings.js";

// Real route, transactions, schema, and SQL. No production DB or Google calls;
// Only the ordinary permission policy is mocked; credential storage and
// personal-account selection exercise the real encrypted vault and SQL.
const policy = vi.hoisted(() => ({ decide: vi.fn() }));
vi.mock("../services/access.js", () => ({ accessService: () => ({ decide: policy.decide }) }));
vi.mock("../services/activity-log.js", () => ({ logActivity: vi.fn() }));

describe("voice organization and history isolation with real PostgreSQL", () => {
  let temporary: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>>;
  let db: ReturnType<typeof createDb>;
  let app: express.Express;
  let companyId: string;
  let foreignCompanyId: string;
  let agentId: string;
  let issueId: string;
  let foreignIssueId: string;
  let provider: ReturnType<typeof vi.fn>;
  let home: string;
  let accounts: ReturnType<typeof aiConnectionService>;
  let ownerConnection: Awaited<ReturnType<ReturnType<typeof aiConnectionService>["save"]>>;

  beforeAll(async () => {
    // Always start a new disposable cluster, ignoring external database URLs.
    home = await mkdtemp(path.join(os.tmpdir(), "voice-personal-credentials-"));
    vi.stubEnv("WHOXOS_HOME", home);
    vi.stubEnv("WHOXOS_INSTANCE_ID", "voice-fixture");
    temporary = await startEmbeddedPostgresTestDatabase("voice-isolation-");
    db = createDb(temporary.connectionString);
    await db.insert(authUsers).values(["owner", "bob", "unconnected"].map(id => ({ id, name: id, email: `${id}@example.test`, createdAt: new Date(), updatedAt: new Date() })));
    accounts = aiConnectionService(db);
    await instanceSettingsService(db).updateExperimental({ enableAgentChat: true });
  }, 90_000);
  afterAll(async () => {
    await temporary?.cleanup();
    vi.unstubAllEnvs();
    if (home) await rm(home, { recursive: true, force: true });
  });
  afterEach(() => vi.unstubAllGlobals());
  beforeEach(async () => {
    policy.decide.mockReset().mockResolvedValue({ allowed: true });
    companyId = randomUUID(); foreignCompanyId = randomUUID(); agentId = randomUUID(); issueId = randomUUID(); foreignIssueId = randomUUID();
    const secretId = randomUUID();
    await db.insert(companies).values([companyId, foreignCompanyId].map(id => ({ id, name: "Voice fixture", issuePrefix: `V${id.replaceAll("-", "").slice(0, 12)}` })));
    await db.insert(companySecrets).values({ id: secretId, companyId, key: "voice_fixture", name: "Voice fixture" });
    await db.insert(companyMemberships).values(["owner", "bob", "unconnected"].map(principalId => ({ companyId, principalId, principalType: "user", status: "active", membershipRole: "member" })));
    await db.insert(agents).values({ id: agentId, companyId, name: "CEO", status: "idle", metadata: { voice: { enabled: true, secretId } } });
    ownerConnection = await accounts.save(companyId, "owner", { provider: "gemini", method: "api_key", ownership: "personal", name: "Owner Gemini", apiKey: "fixture-owner-gemini-key", allAgents: true, agentIds: [] }, "fixture-owner-gemini-key");
    await db.insert(issues).values([
      { id: issueId, companyId, title: "Voice chat", status: "in_review", assigneeAgentId: agentId, conversationAgentId: agentId, conversationUserId: "owner", conversationState: "waiting", conversationSessionGeneration: 2 },
      { id: foreignIssueId, companyId: foreignCompanyId, title: "Foreign task", status: "todo" },
    ]);
    app = express(); app.use(express.json());
    app.use((req, _res, next) => { req.actor = { type: "board", userId: String(req.headers["x-user"] ?? "owner"), source: "session", companyIds: [companyId], memberships: [{ companyId, status: "active", membershipRole: "member" }] }; next(); });
    app.use(agentVoiceRoutes(db));
    app.use((error: any, _req: any, res: any, _next: any) => res.status(error.status ?? 500).json({ error: error.message, details: error.details }));
    provider = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ name: "fixture-token" }) });
    vi.stubGlobal("fetch", provider);
  });

  const start = () => request(app).post(`/companies/${companyId}/voice-sessions`).send({ issueId, agentIds: [agentId] });

  async function chatFor(userId: string) {
    const id = randomUUID();
    await db.insert(issues).values({ id, companyId, title: `${userId} voice chat`, status: "in_review", assigneeAgentId: agentId, conversationAgentId: agentId, conversationUserId: userId, conversationState: "waiting" });
    return id;
  }

  it("uses each signed-in member's own Gemini account for the same agent", async () => {
    await accounts.save(companyId, "bob", { provider: "gemini", method: "api_key", ownership: "personal", name: "Bob Gemini", apiKey: "fixture-bob-gemini-key", allAgents: true, agentIds: [] }, "fixture-bob-gemini-key");
    const bobIssueId = await chatFor("bob");
    const owner = await start();
    const bob = await request(app).post(`/companies/${companyId}/voice-sessions`).set("x-user", "bob").send({ issueId: bobIssueId, agentIds: [agentId] });
    expect(owner.status, JSON.stringify(owner.body)).toBe(200);
    expect(bob.status, JSON.stringify(bob.body)).toBe(200);
    expect(provider.mock.calls.map(([, init]) => init.headers["x-goog-api-key"])).toEqual(["fixture-owner-gemini-key", "fixture-bob-gemini-key"]);
    for (const response of [owner, bob]) {
      expect(response.headers["cache-control"]).toBe("no-store");
      expect(response.body[0].token).toBe("fixture-token");
      expect(JSON.stringify(response.body)).not.toMatch(/fixture-(?:owner|bob)-gemini-key/);
    }
    expect((await request(app).get(`/companies/${companyId}/voice-sessions/${owner.body[0].sessionId}/context`).set("x-user", "bob")).status).toBe(403);
  });

  it("never uses the agent's legacy organization secret when the member has no Gemini connection", async () => {
    const id = await chatFor("unconnected");
    const result = await request(app).post(`/companies/${companyId}/voice-sessions`).set("x-user", "unconnected").send({ issueId: id, agentIds: [agentId] });
    expect(result.status).toBe(422);
    expect(result.body.details?.code).toBe("gemini_connection_required");
    expect(provider).not.toHaveBeenCalled();
  });

  it("uses the same owner's personal Gemini across their memberships without moving organization data", async () => {
    await db.insert(companyMemberships).values({ companyId: foreignCompanyId, principalId: "unconnected", principalType: "user", status: "active", membershipRole: "member" });
    await accounts.save(foreignCompanyId, "unconnected", { provider: "gemini", method: "api_key", ownership: "personal", name: "Foreign Gemini", apiKey: "fixture-foreign-gemini-key", allAgents: true, agentIds: [] }, "fixture-foreign-gemini-key");
    const id = await chatFor("unconnected");
    const result = await request(app).post(`/companies/${companyId}/voice-sessions`).set("x-user", "unconnected").send({ issueId: id, agentIds: [agentId] });
    expect(result.status).toBe(200);
    expect(provider).toHaveBeenCalledOnce();
    expect(result.body[0].agentId).toBe(agentId);
    expect(result.body[0].issueId).toBe(id);
    expect(JSON.stringify(result.body)).not.toContain("fixture-foreign-gemini-key");
  });

  it("sends credentials only to Google's fixed endpoint in a header and refuses redirects", async () => {
    const result = await start();
    expect(result.status, JSON.stringify(result.body)).toBe(200);
    const [url, options] = provider.mock.calls[0];
    expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/auth_tokens");
    expect(options).toMatchObject({ method: "POST", redirect: "error", headers: { "x-goog-api-key": "fixture-owner-gemini-key" } });
    expect(options.body).not.toContain("fixture-owner-gemini-key");
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  it("allows chat members to use their credentials without secret or agent administration rights", async () => {
    policy.decide.mockImplementation(async ({ action }) => ({ allowed: !["agents:create", "agent_config:read", "agent_config:update", "secrets:read"].includes(action), explanation: "Members cannot administer agents or secrets" }));
    const result = await start();
    expect(result.status, JSON.stringify(result.body)).toBe(200);
    expect(result.body[0].setup.systemInstruction).toBeUndefined();
    expect(JSON.parse(provider.mock.calls[0][1].body).bidiGenerateContentSetup.systemInstruction.parts[0].text).toContain("You are CEO");
    expect((await request(app).get(`/companies/${companyId}/voice-sessions/${result.body[0].sessionId}/instructions-revision`)).status).toBe(200);
    const configured = await request(app).put(`/companies/${companyId}/agents/${agentId}/voice`).send({ enabled: true });
    expect(configured.status).toBe(403);
  });

  it("requires reconnect after revocation, without falling back to another account", async () => {
    await accounts.save(companyId, "owner", { provider: "gemini", method: "api_key", ownership: "personal", name: "Spare Gemini", apiKey: "fixture-spare-gemini-key", allAgents: true, agentIds: [] }, "fixture-spare-gemini-key");
    await db.update(connectionGrants).set({ status: "revoked" }).where(eq(connectionGrants.id, ownerConnection.grantId));
    const result = await start();
    expect(result.status).toBe(422);
    expect(result.body.details?.code).toBe("gemini_connection_required");
    expect(provider).not.toHaveBeenCalled();
  });

  it("pins an active session to its original account and denies its use after revocation", async () => {
    const result = await start();
    expect(result.status, JSON.stringify(result.body)).toBe(200);
    const sessionPath = `/companies/${companyId}/voice-sessions/${result.body[0].sessionId}`;
    const replacement = await accounts.save(companyId, "owner", { provider: "gemini", method: "api_key", ownership: "personal", name: "Replacement Gemini", apiKey: "fixture-replacement-gemini-key", allAgents: true, agentIds: [] }, "fixture-replacement-gemini-key");
    await accounts.setDefault(companyId, "owner", replacement.grantId);
    expect((await request(app).get(`${sessionPath}/context`)).status).toBe(200);
    await db.update(connectionGrants).set({ status: "revoked" }).where(eq(connectionGrants.id, ownerConnection.grantId));
    expect((await request(app).get(`${sessionPath}/context`)).status).toBe(422);
    expect((await request(app).put(`${sessionPath}/messages/${randomUUID()}`).send({ role: "user", text: "Must not persist" })).status).toBe(422);
    expect(await db.select().from(issueComments).where(eq(issueComments.issueId, issueId))).toEqual([]);
    expect(provider).toHaveBeenCalledTimes(1);
  });

  it.each(["grant revoked", "connection disabled", "membership removed"])("withholds a provider token if %s during issuance", async reason => {
    provider.mockImplementationOnce(async () => {
      if (reason === "grant revoked") await db.update(connectionGrants).set({ status: "revoked" }).where(eq(connectionGrants.id, ownerConnection.grantId));
      if (reason === "connection disabled") await db.update(toolConnections).set({ enabled: false }).where(eq(toolConnections.id, ownerConnection.connectionId));
      if (reason === "membership removed") await db.update(companyMemberships).set({ status: "inactive" }).where(and(eq(companyMemberships.companyId, companyId), eq(companyMemberships.principalId, "owner")));
      return { ok: true, json: async () => ({ name: "must-not-return-this-token" }) };
    });
    const result = await start();
    expect(result.status).toBe(422);
    expect(result.body.details?.code).toBe("gemini_connection_required");
    expect(JSON.stringify(result.body)).not.toContain("must-not-return-this-token");
  });

  it("loads only undeleted current-session comments from the exact issue and company", async () => {
    const boundaryId = randomUUID();
    await db.insert(issueComments).values([
      { companyId, issueId, body: "Before reset", createdAt: new Date("2026-09-01T00:00:00Z") },
      { id: boundaryId, companyId, issueId, body: "/new", conversationSessionGeneration: 2, createdAt: new Date("2026-09-01T00:00:01Z") },
      { companyId, issueId, body: "Current user question", authorUserId: "owner", createdAt: new Date("2026-09-01T00:00:02Z") },
      { companyId, issueId, body: "Current agent answer", authorAgentId: agentId, createdAt: new Date("2026-09-01T00:00:03Z") },
      { companyId, issueId, body: "Deleted sensitive content", deletedAt: new Date(), createdAt: new Date("2026-09-01T00:00:04Z") },
      { companyId: foreignCompanyId, issueId: foreignIssueId, body: "Foreign sensitive content", createdAt: new Date("2026-09-01T00:00:05Z") },
    ]);
    await db.update(issues).set({ conversationBoundaryCommentId: boundaryId }).where(eq(issues.id, issueId));
    const result = await start();
    expect(result.status, JSON.stringify(result.body)).toBe(200);
    expect(result.body[0].context).toEqual([
      { role: "user", parts: [{ text: "Current user question" }] },
      { role: "model", parts: [{ text: "Current agent answer" }] },
    ]);
  });

  it("rejects an accessible-company URL carrying a foreign issue ID before credential issuance", async () => {
    const result = await request(app).post(`/companies/${companyId}/voice-sessions`).send({ issueId: foreignIssueId, agentIds: [agentId] });
    expect(result.status).toBe(403);
    expect(provider).not.toHaveBeenCalled();
  });

  it("does not revive pre-reset history when the reset marker is soft-deleted", async () => {
    const boundaryId = randomUUID();
    await db.insert(issueComments).values([
      { companyId, issueId, body: "Old context must stay reset", createdAt: new Date("2026-09-01T00:00:00Z") },
      { id: boundaryId, companyId, issueId, body: "/new", deletedAt: new Date(), conversationSessionGeneration: 2, createdAt: new Date("2026-09-01T00:00:01Z") },
      { companyId, issueId, body: "Fresh context", authorUserId: "owner", createdAt: new Date("2026-09-01T00:00:02Z") },
    ]);
    await db.update(issues).set({ conversationBoundaryCommentId: boundaryId }).where(eq(issues.id, issueId));
    const result = await start();
    expect(result.status, JSON.stringify(result.body)).toBe(200);
    expect(result.body[0].context).toEqual([{ role: "user", parts: [{ text: "Fresh context" }] }]);
  });

  it("rejects another user's own-company conversation before credential issuance", async () => {
    const result = await request(app).post(`/companies/${companyId}/voice-sessions`).set("x-user", "stranger").send({ issueId, agentIds: [agentId] });
    expect(result.status).toBe(403);
    expect(provider).not.toHaveBeenCalled();
  });

  it("upserts one ordinary transcript and rejects stale writes after a reset", async () => {
    const result = await start();
    expect(result.status, JSON.stringify(result.body)).toBe(200);
    const path = `/companies/${companyId}/voice-sessions/${result.body[0].sessionId}/messages/${randomUUID()}`;
    expect((await request(app).put(path).send({ role: "user", text: "Hello" })).status).toBe(200);
    expect((await request(app).put(path).send({ role: "user", text: "Hello there" })).status).toBe(200);
    const rows = await db.select().from(issueComments).where(eq(issueComments.issueId, issueId));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ companyId, issueId, authorUserId: "owner", body: "Hello there", clientRequestId: null, conversationSessionGeneration: null });
    await db.update(issues).set({ conversationSessionGeneration: 3 }).where(eq(issues.id, issueId));
    expect((await request(app).put(path).send({ role: "user", text: "Must not overwrite" })).status).toBe(403);
    expect((await db.select().from(issueComments).where(eq(issueComments.issueId, issueId)))[0].body).toBe("Hello there");
  });
  it("loads only my visible open assignments and refreshes after reassignment", async () => {
    const otherAgentId = randomUUID(), taskId = randomUUID();
    await db.insert(agents).values({ id: otherAgentId, companyId, name: "Other agent" });
    await db.insert(issues).values([
      { id: taskId, companyId, title: "My open task", status: "todo", assigneeAgentId: agentId },
      { companyId, title: "Other agent task", status: "todo", assigneeAgentId: otherAgentId },
      { companyId, title: "Finished task", status: "done", assigneeAgentId: agentId },
      { companyId, title: "Hidden task", status: "todo", assigneeAgentId: agentId, hiddenAt: new Date() },
      { companyId: foreignCompanyId, title: "Foreign task", status: "todo" },
    ]);
    const session = await start();expect(session.status).toBe(200);
    const path = `/companies/${companyId}/voice-sessions/${session.body[0].sessionId}/context`;
    const initial = await request(app).get(path);
    expect(initial.status).toBe(200);
    expect(initial.body.assignedTasks.map((t: any) => t.title)).toEqual(["My open task"]);
    await db.update(issues).set({ assigneeAgentId: otherAgentId }).where(eq(issues.id, taskId));
    expect((await request(app).get(path)).body.assignedTasks).toEqual([]);
  });
  it("rejects delegation to a foreign agent even when policy mocks allow it", async () => {
    const foreignAgentId = randomUUID();
    await db.insert(agents).values({ id: foreignAgentId, companyId: foreignCompanyId, name: "Foreign" });
    const session = await start();expect(session.status).toBe(200);
    const response = await request(app).post(`/companies/${companyId}/voice-sessions/${session.body[0].sessionId}/task-access`).send({ assigneeAgentId: foreignAgentId });
    expect(response.status).toBe(403);
  });

  it("discovers direct tools through the authenticated session without another model", async () => {
    const session = await start(); expect(session.status).toBe(200);
    expect(session.body[0].setup.tools.flatMap((tool: any) => tool.functionDeclarations ?? []).map((tool: any) => tool.name)).toContain("organization_api");
    const endpoint = `/companies/${companyId}/voice-sessions/${session.body[0].sessionId}/tools`;
    const response = await request(app).post(endpoint).send({ name: "organization_api", args: { action: "capabilities" }, callId: "capabilities" });
    expect(response.status).toBe(200);
    expect(response.body.operations).toHaveProperty("put_document");
    expect(response.body.workspace).toContain("no host files, credentials, or network");
    expect(provider).toHaveBeenCalledTimes(1); // Only the Gemini token request.
  });
  it("rejects direct workspace execution when either caller policy denies it", async () => {
    const session = await start(); expect(session.status).toBe(200);
    policy.decide.mockResolvedValue({ allowed: false, explanation: "Denied" });
    const response = await request(app).post(`/companies/${companyId}/voice-sessions/${session.body[0].sessionId}/tools`).send({ name: "voice_workspace", args: { command: "echo forbidden" }, callId: "denied" });
    expect(response.status).toBe(403);
  });

});
