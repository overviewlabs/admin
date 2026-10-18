import { randomUUID } from "node:crypto";
import express from "express";
import request from "supertest";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { activityLog, agents, companies, companyMemberships, createDb, heartbeatRuns, startEmbeddedPostgresTestDatabase } from "@whoxos/db";
import * as diagnostics from "./it-diagnostics.js";
import { itDiagnosticsRoutes } from "../routes/it-diagnostics.js";
import { errorHandler } from "../middleware/error-handler.js";

function report() {
  const now = new Date().toISOString();
  return { version: 1, generatedAt: now, window: { since: now, until: now, minutes: 30 },
    sources: [{ id: "whoxos", available: true, status: "ok", scannedEntries: 5, matchedEvents: 1, truncated: false,
      events: [{ timestamp: now, severity: "warning", code: "dns_failure", unit: "whoxos.service", count: 1 }] }] };
}
describe("sanitized IT diagnostic payload", () => {
  it("removes raw strings and unknown fields at every level", () => {
    const value = report();
    const result = diagnostics.parseItDiagnostics({ ...value, secret: "private", sources: [{ ...value.sources[0], path: "/private", events: [{ ...value.sources[0]!.events[0], message: "raw SQL or credential" }] }] });
    expect(JSON.stringify(result)).not.toMatch(/private|credential|raw SQL/);
  });
  it("rejects stale/future metadata, unknown units/codes, and excessive events", () => {
    expect(() => diagnostics.parseItDiagnostics({ ...report(), generatedAt: new Date(Date.now() - 6 * 60_000).toISOString() })).toThrow(/recent report/);
    expect(() => diagnostics.parseItDiagnostics({ ...report(), generatedAt: new Date(Date.now() + 2 * 60_000).toISOString() })).toThrow(/recent report/);
    for (const bad of [{ unit: "customer-private-service" }, { code: "raw message" }]) {
      const value = report(); Object.assign(value.sources[0]!.events[0]!, bad);
      expect(() => diagnostics.parseItDiagnostics(value)).toThrow();
    }
    const value = report(); value.sources[0]!.events = Array.from({ length: 101 }, () => value.sources[0]!.events[0]!);
    expect(() => diagnostics.parseItDiagnostics(value)).toThrow();
  });
});

describe("IT diagnostics authorization with PostgreSQL", () => {
  let temporary: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>>;
  let db: ReturnType<typeof createDb>;
  beforeAll(async () => { temporary = await startEmbeddedPostgresTestDatabase("it-diagnostics-"); db = createDb(temporary.connectionString); }, 90_000);
  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => { await temporary?.cleanup(); });
  async function fixture() {
    const companyId = randomUUID(), agentId = randomUUID(), runId = randomUUID(), userId = randomUUID();
    await db.insert(companies).values({ id: companyId, name: "IT fixture", issuePrefix: `IT${companyId.slice(0,8)}` });
    await db.insert(agents).values({ id: agentId, companyId, name: "IT", role: "engineer", status: "running" });
    await db.insert(companyMemberships).values([
      { companyId, principalType: "user", principalId: userId, membershipRole: "owner" },
      { companyId, principalType: "agent", principalId: agentId, membershipRole: "member" },
    ]);
    await db.insert(heartbeatRuns).values({ id: runId, companyId, agentId, status: "running" });
    return { companyId, agentId, runId, userId };
  }
  it.each(["owner", "admin"])("permits canonical active %s and immediately honors demotion", async role => {
    const f = await fixture();
    await db.update(companyMemberships).set({ membershipRole: role }).where(eq(companyMemberships.principalId, f.userId));
    await expect(diagnostics.assertItDiagnosticsAccess(db, { ...f, type: "board" })).resolves.toBeUndefined();
    await db.update(companyMemberships).set({ membershipRole: "operator" }).where(eq(companyMemberships.principalId, f.userId));
    await expect(diagnostics.assertItDiagnosticsAccess(db, { ...f, type: "board" })).rejects.toMatchObject({ status: 403 });
  });
  it("requires an exact grant, live membership and the agent's own running execution", async () => {
    const f = await fixture(), other = await fixture();
    const grant = vi.fn(async (company: string, agent: string) => company === f.companyId && agent === f.agentId);
    await expect(diagnostics.assertItDiagnosticsAccess(db, { ...f, type: "agent" }, grant)).resolves.toBeUndefined();
    for (const changed of [{ runId: undefined }, { runId: other.runId }, { companyId: other.companyId }]) {
      await expect(diagnostics.assertItDiagnosticsAccess(db, { ...f, ...changed, type: "agent" }, grant)).rejects.toMatchObject({ status: 403 });
    }
    await expect(diagnostics.assertItDiagnosticsAccess(db, { ...f, type: "agent" }, async () => false)).rejects.toMatchObject({ status: 403 });
    await db.update(heartbeatRuns).set({ status: "succeeded" }).where(eq(heartbeatRuns.id, f.runId));
    await expect(diagnostics.assertItDiagnosticsAccess(db, { ...f, type: "agent" }, grant)).rejects.toMatchObject({ status: 403 });
    await db.update(heartbeatRuns).set({ status: "running" }).where(eq(heartbeatRuns.id, f.runId));
    await db.update(companyMemberships).set({ status: "suspended" }).where(eq(companyMemberships.principalId, f.agentId));
    await expect(diagnostics.assertItDiagnosticsAccess(db, { ...f, type: "agent" }, grant)).rejects.toMatchObject({ status: 403 });
  });
  it.each(["paused", "terminated", "pending_approval"])("denies %s agents even with a grant", async status => {
    const f = await fixture(); await db.update(agents).set({ status }).where(eq(agents.id, f.agentId));
    await expect(diagnostics.assertItDiagnosticsAccess(db, { ...f, type: "agent" }, async () => true)).rejects.toMatchObject({ status: 403 });
  });
  it.each(["skill_test", "task_bridge"] as const)("does not expand %s credentials to host diagnostics", async kind => {
    const f = await fixture();
    const keyScope = kind === "skill_test" ? { kind, issueId: randomUUID() } : { kind, projectId: randomUUID() };
    const grant = vi.fn(async () => true);
    await expect(diagnostics.assertItDiagnosticsAccess(db, { ...f, type: "agent", keyScope }, grant)).rejects.toMatchObject({ status: 403 });
    expect(grant).not.toHaveBeenCalled();
  });
  it("HTTP route rejects cross-company/query access and records successful owner reads", async () => {
    const f = await fixture();
    vi.spyOn(diagnostics, "readItDiagnostics").mockResolvedValue(diagnostics.parseItDiagnostics(report()));
    const app = express();
    app.use((req, _res, next) => { (req as any).actor = { type: "board", source: "session", userId: f.userId, companyIds: [f.companyId] }; next(); });
    app.use(itDiagnosticsRoutes(db)); app.use(errorHandler);
    const path = `/companies/${f.companyId}/it-diagnostics`;
    expect((await request(app).get(path)).status).toBe(200);
    expect((await request(app).get(path + "?path=/etc/passwd")).status).toBe(400);
    expect((await request(app).get(`/companies/${randomUUID()}/it-diagnostics`)).status).toBe(403);
    const records = await db.select().from(activityLog).where(eq(activityLog.companyId, f.companyId));
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ action: "system.it_diagnostics_read", actorId: f.userId, details: { scope: "sanitized_service_metadata" } });
  });
  it("HTTP historical reads are bounded, audited and recheck canonical membership after reading", async () => {
    const f = await fixture();
    const until = new Date(Date.now() - 60_000).toISOString();
    const since = new Date(Date.now() - 120_000).toISOString();
    const history = diagnostics.aggregateItDiagnosticsHistory([], { since, until });
    const read = vi.spyOn(diagnostics, "readItDiagnosticsHistory").mockResolvedValue(history);
    const app = express();
    app.use((req, _res, next) => { (req as any).actor = { type: "board", source: "session", userId: f.userId, companyIds: [f.companyId] }; next(); });
    app.use(itDiagnosticsRoutes(db)); app.use(errorHandler);
    const path = `/companies/${f.companyId}/it-diagnostics`;
    const success = await request(app).get(path).query({ since, until });
    expect(success.status).toBe(200);
    expect(success.body.sources.every((source: any) => !source.coverage.complete)).toBe(true);
    expect(read).toHaveBeenCalledWith({ since, until });
    expect((await request(app).get(path).query({ since })).status).toBe(400);
    const records = await db.select().from(activityLog).where(eq(activityLog.companyId, f.companyId));
    expect(records).toHaveLength(1);
    expect(records[0]!.details).toMatchObject({ mode: "history", since, until, scope: "sanitized_service_metadata" });
    read.mockImplementationOnce(async () => {
      await db.update(companyMemberships).set({ status: "suspended" }).where(eq(companyMemberships.principalId, f.userId));
      return history;
    });
    expect((await request(app).get(path).query({ since, until })).status).toBe(403);
    expect((await db.select().from(activityLog).where(eq(activityLog.companyId, f.companyId)))).toHaveLength(1);
  });
  it.each(["skill_test", "task_bridge"] as const)("historical HTTP reads retain %s scope limits before archive access", async kind => {
    const f = await fixture();
    const read = vi.spyOn(diagnostics, "readItDiagnosticsHistory");
    const app = express();
    app.use((req, _res, next) => { (req as any).actor = { type: "agent", companyId: f.companyId, agentId: f.agentId, runId: f.runId,
      keyScope: kind === "skill_test" ? { kind, issueId: randomUUID() } : { kind, projectId: randomUUID() } }; next(); });
    app.use(itDiagnosticsRoutes(db)); app.use(errorHandler);
    const result = await request(app).get(`/companies/${f.companyId}/it-diagnostics`).query({
      since: new Date(Date.now() - 120_000).toISOString(), until: new Date(Date.now() - 60_000).toISOString() });
    expect(result.status).toBe(403);
    expect(read).not.toHaveBeenCalled();
  });

});
