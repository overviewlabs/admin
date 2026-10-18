import { randomUUID } from "node:crypto";
import express, { type Request } from "express";
import request from "supertest";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { agents, companies, companyMemberships, createDb, heartbeatRuns, instanceUserRoles, startEmbeddedPostgresTestDatabase } from "@whoxos/db";
import * as root from "./production-root.js";
import { productionRootRoutes } from "../routes/production-root.js";
import { errorHandler } from "../middleware/error-handler.js";

const enabled = { available: true, enabled: true, target: "production", uid: 0 };
describe("production root authorization", () => {
  let temporary: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>>;
  let db: ReturnType<typeof createDb>;
  beforeAll(async () => { temporary = await startEmbeddedPostgresTestDatabase("production-root-"); db = createDb(temporary.connectionString); }, 90000);
  afterAll(async () => temporary?.cleanup());
  afterEach(() => vi.restoreAllMocks());
  async function fixture(eligible = true, treasury = false) {
    const companyId = treasury ? root.TREASURY_ROOT_COMPANY_ID : eligible ? root.PRODUCTION_ROOT_COMPANY_ID : randomUUID(), agentId = treasury ? root.TREASURY_ROOT_AGENT_ID : randomUUID(), runId = randomUUID(), userId = randomUUID();
    await db.insert(companies).values({ id: companyId, name: "WHOXOS", issuePrefix: `RT${companyId.slice(0,8)}` }).onConflictDoNothing();
    await db.insert(agents).values({ id: agentId, companyId, name: "IT", role: "ceo", status: "running" });
    await db.insert(companyMemberships).values([
      { companyId, principalType: "user", principalId: userId, membershipRole: "owner" },
      { companyId, principalType: "agent", principalId: agentId, membershipRole: "member" },
    ]);
    await db.insert(instanceUserRoles).values({ userId, role: "instance_admin" });
    await db.insert(heartbeatRuns).values({ id: runId, companyId, agentId, status: "running", responsibleUserId: userId });
    const board = { type: "board", userId, isInstanceAdmin: true, companyIds: [companyId] };
    const agent = { type: "agent", companyId, agentId, runId };
    return { companyId, agentId, runId, userId, board, agent };
  }
  function req(actor: unknown) { return { actor, method: "POST" } as Request; }
  function app(actor: unknown) {
    const app = express(); app.use(express.json());
    app.use((r, _s, next) => { r.actor = actor as Request["actor"]; next(); });
    app.use(productionRootRoutes(db)); app.use(errorHandler); return app;
  }
  it("permits server admins with current owner/admin membership and honors demotion immediately", async () => {
    const f = await fixture();
    await expect(root.assertProductionRootManager(db, req(f.board), f.companyId)).resolves.toBeUndefined();
    await db.update(companyMemberships).set({ membershipRole: "admin" }).where(eq(companyMemberships.principalId, f.userId));
    await expect(root.assertProductionRootManager(db, req(f.board), f.companyId)).resolves.toBeUndefined();
    for (const role of ["operator", "viewer"]) {
      await db.update(companyMemberships).set({ membershipRole: role }).where(eq(companyMemberships.principalId, f.userId));
      await expect(root.assertProductionRootManager(db, req(f.board), f.companyId)).rejects.toMatchObject({ status: 403 });
    }
  });
  it("does not confuse organization ownership or a cached admin flag with server authority", async () => {
    const f = await fixture();
    await db.delete(instanceUserRoles).where(eq(instanceUserRoles.userId, f.userId));
    await expect(root.assertProductionRootManager(db, req(f.board), f.companyId)).rejects.toMatchObject({ status: 403 });
    await expect(root.assertProductionRootExecution(db, req(f.agent), f.companyId, f.agentId)).rejects.toMatchObject({ status: 403 });
  });
  it("requires the agent's own running execution, active status and standard credential", async () => {
    const f = await fixture(), other = await fixture(false);
    await expect(root.assertProductionRootExecution(db, req(f.agent), f.companyId, f.agentId)).resolves.toBeUndefined();
    for (const change of [{ runId: undefined }, { runId: other.runId }, { agentId: other.agentId }, { companyId: other.companyId }, { keyScope: { kind: "restricted" } }]) {
      await expect(root.assertProductionRootExecution(db, req({ ...f.agent, ...change }), f.companyId, f.agentId)).rejects.toMatchObject({ status: 403 });
    }
    await db.update(heartbeatRuns).set({ status: "succeeded" }).where(eq(heartbeatRuns.id, f.runId));
    await expect(root.assertProductionRootExecution(db, req(f.agent), f.companyId, f.agentId)).rejects.toMatchObject({ status: 403 });
    await db.update(heartbeatRuns).set({ status: "running" }).where(eq(heartbeatRuns.id, f.runId));
    await db.update(agents).set({ status: "terminated" }).where(eq(agents.id, f.agentId));
    await expect(root.assertProductionRootExecution(db, req(f.agent), f.companyId, f.agentId)).rejects.toMatchObject({ status: 403 });
  });
  it("intersects voice's human authority with the active selected agent", async () => {
    const f = await fixture();
    await expect(root.assertProductionRootExecution(db, req(f.board), f.companyId, f.agentId, true)).resolves.toBeUndefined();
    await db.update(companyMemberships).set({ status: "inactive" }).where(eq(companyMemberships.principalId, f.agentId));
    await expect(root.assertProductionRootExecution(db, req(f.board), f.companyId, f.agentId, true)).rejects.toMatchObject({ status: 403 });
  });
  it("allows leadership to grant and revoke children using a current authorized run", async () => {
    const f = await fixture();
    const childId = randomUUID();
    await db.insert(agents).values({ id: childId, companyId: f.companyId, name: "Child", role: "engineer", reportsTo: f.agentId });
    const broker = vi.spyOn(root.rootExecutorTransport, "call").mockImplementation(async body => ({ ...enabled, canDelegate: true, enabled: body.operation === "grant" ? body.enabled : true }) as never);
    for (const enabled of [true, false]) {
      const response = await request(app(f.agent)).patch(`/companies/${f.companyId}/agents/${childId}/production-root`).send({ enabled });
      expect(response.status).toBe(200);
      expect(broker).toHaveBeenLastCalledWith({ operation: "grant", companyId: f.companyId, agentId: childId, enabled, actorId: f.agentId, managerAgentId: f.agentId });
    }
    await db.update(heartbeatRuns).set({ status: "succeeded" }).where(eq(heartbeatRuns.id, f.runId));
    broker.mockClear();
    expect((await request(app(f.agent)).patch(`/companies/${f.companyId}/agents/${childId}/production-root`).send({ enabled: true })).status).toBe(403);
    expect(broker).not.toHaveBeenCalled();
  });
  it("keeps grants independent of agent JSON and retains required leadership access", async () => {
    const f = await fixture(); const childId = randomUUID();
    await db.insert(agents).values({ id: childId, companyId: f.companyId, name: "Child", role: "engineer", reportsTo: f.agentId, permissions: { unrestrictedSystemAccess: true } });
    const broker = vi.spyOn(root.rootExecutorTransport, "call").mockImplementation(async body => ({ ...enabled, enabled: body.operation === "grant" ? body.enabled : false }) as never);
    for (const enabled of [true, false]) {
      const response = await request(app(f.board)).patch(`/companies/${f.companyId}/agents/${childId}/production-root`).send({ enabled });
      expect(response.status).toBe(200); expect(response.body.enabled).toBe(enabled);
    }
    expect((await request(app(f.board)).get(`/companies/${f.companyId}/agents/${childId}/production-root`)).body.enabled).toBe(false);
    expect((await request(app(f.board)).patch(`/companies/${f.companyId}/agents/${f.agentId}/production-root`).send({ enabled: false })).status).toBe(403);
  });
  it("never calls the executor for cross-company grant requests or a terminated target", async () => {
    const f = await fixture(), other = await fixture(false);
    const broker = vi.spyOn(root.rootExecutorTransport, "call");
    expect((await request(app(f.board)).patch(`/companies/${other.companyId}/agents/${other.agentId}/production-root`).send({ enabled: true })).status).toBe(403);
    expect((await request(app(f.board)).patch(`/companies/${f.companyId}/agents/${other.agentId}/production-root`).send({ enabled: true })).status).toBe(404);
    await db.update(agents).set({ status: "terminated" }).where(eq(agents.id, f.agentId));
    expect((await request(app(f.board)).patch(`/companies/${f.companyId}/agents/${f.agentId}/production-root`).send({ enabled: true })).status).toBe(403);
    expect(broker).not.toHaveBeenCalled();
  });
  it("supports other organizations without allowing cross-company delegation", async () => {
    const f = await fixture(false), other = await fixture(false);
    const broker = vi.spyOn(root.rootExecutorTransport, "call").mockResolvedValue(enabled as never);
    expect((await request(app(f.board)).get(`/companies/${f.companyId}/agents/${f.agentId}/production-root`)).body).toMatchObject({ eligible: true, available: true, canManage: true });
    expect((await request(app(f.board)).patch(`/companies/${f.companyId}/agents/${f.agentId}/production-root`).send({ enabled: true })).status).toBe(200);
    broker.mockClear();
    expect((await request(app(f.agent)).patch(`/companies/${other.companyId}/agents/${other.agentId}/production-root`).send({ enabled: true })).status).toBe(403);
    expect(broker).not.toHaveBeenCalled();
  });
  it("denies ordinary agents grant authority while enabling top-level managers", async () => {
    const f = await fixture(true, true);
    const parentId = randomUUID();
    await db.insert(agents).values({ id: parentId, companyId: f.companyId, name: "CEO", role: "ceo" });
    await db.update(agents).set({ role: "engineer", reportsTo: parentId }).where(eq(agents.id, f.agentId));
    const broker = vi.spyOn(root.rootExecutorTransport, "call").mockResolvedValue(enabled as never);
    expect((await request(app(f.agent)).patch(`/companies/${f.companyId}/agents/${parentId}/production-root`).send({ enabled: true })).status).toBe(403);
    expect(broker).not.toHaveBeenCalled();
    await db.update(agents).set({ reportsTo: null }).where(eq(agents.id, f.agentId));
    expect((await request(app(f.agent)).patch(`/companies/${f.companyId}/agents/${parentId}/production-root`).send({ enabled: true })).status).toBe(200);
  });
  it("automatically provisions leadership grants for an authorized owner", async () => {
    const f = await fixture(false);
    await db.update(companies).set({ defaultResponsibleUserId: f.userId }).where(eq(companies.id, f.companyId));
    const broker = vi.spyOn(root.rootExecutorTransport, "call").mockImplementation(async body => ({ ...enabled, enabled: body.operation !== "status", canDelegate: false }) as never);
    await root.ensureLeadershipRootAccess(db, f.companyId, f.agentId);
    expect(broker).toHaveBeenCalledWith({ operation: "leadership", companyId: f.companyId, agentId: f.agentId, enabled: true, actorId: f.userId });
    const [agent] = await db.select().from(agents).where(eq(agents.id, f.agentId));
    expect(agent.permissions.canCreateAgents).toBe(true);
  });
  it("executes root commands only for the authorized current run and redacts its bearer", async () => {
    const f = await fixture(false); const requestId = randomUUID();
    const broker = vi.spyOn(root.rootExecutorTransport, "call").mockResolvedValue({ requestId, exitCode: 0, output: "0\nsecret-bearer", timedOut: false, revoked: false, truncated: false, target: "production", uid: 0 } as never);
    const endpoint = `/companies/${f.companyId}/agents/${f.agentId}/production-root/commands`;
    const response = await request(app(f.agent)).post(endpoint).set("Authorization", "Bearer secret-bearer").send({ requestId, command: "id -u" });
    expect(response.status).toBe(200); expect(response.body.output).not.toContain("secret-bearer");
    expect(broker).toHaveBeenCalledWith({ operation: "execute", companyId: f.companyId, agentId: f.agentId, actorId: f.agentId, requestId, command: "id -u", timeoutMs: 30000 }, 50000);
    broker.mockClear();
    expect((await request(app(f.board)).post(endpoint).send({ requestId: randomUUID(), command: "id -u" })).status).toBe(403);
    expect(broker).not.toHaveBeenCalled();
  });
  it("reports an unbound broker without claiming root is ready", async () => {
    const f = await fixture();
    vi.spyOn(root.rootExecutorTransport, "call").mockRejectedValue(new Error("unbound"));
    const response = await request(app(f.board)).get(`/companies/${f.companyId}/agents/${f.agentId}/production-root`);
    expect(response.body).toMatchObject({ available: false, enabled: false, canManage: true });
  });
});

it("validates fixed helpers and stable voice idempotency keys", () => {
  expect(root.productionRootHelperSchema.parse({ helperId: "service.reload", requestId: randomUUID() }).helperId).toBe("service.reload");
  expect(root.productionRootHelperSchema.parse({ helperId: "purpose.v14.synthetic_lifecycle", requestId: randomUUID() }).helperId).toBe("purpose.v14.synthetic_lifecycle");
  for (const body of [{ helperId: "shell", requestId: randomUUID() }, { helperId: "service.reload", requestId: "old" }, { helperId: "service.recover", requestId: randomUUID(), command: "id" }]) {
    expect(() => root.productionRootHelperSchema.parse(body)).toThrow();
  }
  const id = root.voiceRootRequestId("session", "call");
  expect(root.productionRootHelperSchema.parse({ helperId: "service.recover", requestId: id }).requestId).toBe(id);
  expect(root.voiceProductionRootHelperSchema.parse({ helperId: "service.reload" }).helperId).toBe("service.reload");
  expect(() => root.voiceProductionRootHelperSchema.parse({ helperId: "purpose.v14.synthetic_lifecycle" })).toThrow();
  expect(() => root.voiceProductionRootHelperSchema.parse({ helperId: "service.reload", command: "id" })).toThrow();
  expect(root.voiceRootRequestId("session", "call")).toBe(id);
  expect(root.voiceRootRequestId("other-session", "call")).not.toBe(id);
});
