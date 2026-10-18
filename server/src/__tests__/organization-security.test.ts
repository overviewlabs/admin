import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { agents, companies, createDb, closeRegisteredClients } from "@whoxos/db";
import { startEmbeddedPostgresTestDatabase } from "./helpers/embedded-postgres.js";
import { agentService } from "../services/agents.js";
import { applyAgentModelPolicy, securityTeamSize } from "../services/agent-model-policy.js";
import { ensureOrganizationSecurity } from "../services/organization-security.js";

let database: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>>;
let db: ReturnType<typeof createDb>;
beforeAll(async () => { database = await startEmbeddedPostgresTestDatabase("whoxos-security-policy-"); db = createDb(database.connectionString); }, 90_000);
afterAll(async () => { if (database) { await closeRegisteredClients(database.connectionString); await database.cleanup(); } });
async function company(name = "Studio", status = "active") {
  const [row] = await db.insert(companies).values({ name, status, issuePrefix: `S${randomUUID().slice(0, 7)}` }).returning();
  return row;
}
async function rows(companyId: string) { return db.select().from(agents).where(eq(agents.companyId, companyId)); }

describe("organization model and security policy", () => {
  it("defaults ordinary Codex agents and locks security to Daybreak execution", () => {
    expect(applyAgentModelPolicy({}, "codex_local", {})).toEqual({ model: "gpt-6.1-sol" });
    expect(applyAgentModelPolicy({}, "codex_local", { model: "custom" })).toEqual({ model: "custom" });
    expect(applyAgentModelPolicy({}, "typesafe", { model: "jev" })).toEqual({ model: "jev" });
    expect(applyAgentModelPolicy({ role: "security" }, "codex_local", { model: "gpt-6.1-sol", engine: "cli" })).toEqual({ model: "gpt-6-sol", engine: "acp" });
    expect(() => applyAgentModelPolicy({ name: "Security Lead" }, "claude_local", {})).toThrow("Security agents must use Codex");
    expect([securityTeamSize({ name: "Studio" }, 3), securityTeamSize({ name: "Treasury" }, 5), securityTeamSize({ name: "Studio" }, 25)]).toEqual([1, 3, 4]);
  });
  it("creates security coverage on admission, remains idempotent, and protects it from removal and downgrade", async () => {
    const c = await company(); const svc = agentService(db);
    const ceo = await svc.create(c.id, { name: "CEO", role: "ceo", adapterType: "codex_local" });
    expect(ceo.adapterConfig.model).toBe("gpt-6.1-sol");
    await ensureOrganizationSecurity(db, c.id);
    const team = (await rows(c.id)).filter(a => a.metadata?.organizationSecurity);
    expect(team).toHaveLength(1);
    const security = team[0];
    expect(security).toMatchObject({ role: "security", reportsTo: ceo.id, adapterConfig: { model: "gpt-6-sol", engine: "acp" }, runtimeConfig: { heartbeat: { enabled: false, wakeOnDemand: true, maxConcurrentRuns: 1 } } });
    const updated = await svc.update(security.id, { name: "Reviewer", role: "engineer", metadata: {}, adapterConfig: { model: "gpt-6.1-sol", engine: "cli" } });
    expect(updated).toMatchObject({ metadata: { organizationSecurity: true }, adapterConfig: { model: "gpt-6-sol", engine: "acp" } });
    await expect(svc.update(security.id, { adapterType: "claude_local" })).rejects.toThrow("Security agents must use Codex");
    await expect(svc.update(security.id, { status: "terminated" })).rejects.toThrow("replacement security coverage");
    await expect(svc.terminate(security.id)).rejects.toThrow("replacement security coverage");
    await expect(svc.remove(security.id)).rejects.toThrow("replacement security coverage");
  });
  it("expands complex teams and excludes archived organizations and specialized services", async () => {
    const c = await company("Treasury");
    await db.insert(agents).values(Array.from({ length: 5 }, (_, i) => ({ companyId: c.id, name: `Engineer ${i}`, role: "engineer", adapterType: "codex_local" })));
    expect(await ensureOrganizationSecurity(db, c.id)).toEqual({ created: 3, securityAgents: 3 });
    const lead = (await rows(c.id)).find(a => a.name === "Security Lead")!;
    const [specialist] = await db.insert(agents).values({ companyId: c.id, name: "Privacy Reviewer", role: "general", reportsTo: lead.id, adapterType: "codex_local", adapterConfig: { model: "old" } }).returning();
    const [jev] = await db.insert(agents).values({ companyId: c.id, name: "Real-Time Decision Engine", role: "general", reportsTo: lead.id, adapterType: "typesafe", adapterConfig: { model: "jev" } }).returning();
    await ensureOrganizationSecurity(db, c.id);
    expect(await agentService(db).getById(specialist.id)).toMatchObject({ adapterConfig: { model: "gpt-6-sol" }, metadata: { organizationSecurity: true } });
    expect(await agentService(db).getById(jev.id)).toMatchObject({ adapterType: "typesafe", adapterConfig: { model: "jev" } });
    const archived = await company("Archived", "archived");
    expect(await ensureOrganizationSecurity(db, archived.id)).toEqual({ created: 0, securityAgents: 0 });
    expect(await rows(archived.id)).toHaveLength(0);
  });
  it("serializes concurrent removal so at least one security agent remains", async () => {
    const c = await company(); const svc = agentService(db);
    await svc.create(c.id, { name: "CEO", role: "ceo", adapterType: "codex_local" });
    await svc.create(c.id, { name: "Security Replacement", role: "security", adapterType: "codex_local" });
    const team = (await rows(c.id)).filter(a => a.metadata?.organizationSecurity);
    const outcomes = await Promise.allSettled(team.map(a => svc.terminate(a.id)));
    expect(outcomes.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect((await rows(c.id)).filter(a => a.metadata?.organizationSecurity && a.status !== "terminated")).toHaveLength(1);
  });
});
