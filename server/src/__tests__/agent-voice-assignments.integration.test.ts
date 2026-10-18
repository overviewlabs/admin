import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import express from "express";
import request from "supertest";
import { and, eq, ne, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { activityLog, agents, authUsers, companies, companyMemberships, createDb, issues, startEmbeddedPostgresTestDatabase } from "@whoxos/db";
import { MAX_AGENTS_PER_ORGANIZATION, readVoiceSettings, VOICE_NAMES } from "@whoxos/shared/agent-voice";
import { agentVoiceRoutes } from "../routes/agent-voice.js";
import { agentService } from "../services/agents.js";
import { instanceSettingsService } from "../services/instance-settings.js";

const policy = vi.hoisted(() => ({ decide: vi.fn() }));
const connection = vi.hoisted(() => ({ selectVoice: vi.fn(), credential: vi.fn() }));
vi.mock("../services/access.js", () => ({ accessService: () => ({ decide: policy.decide }) }));
vi.mock("../services/ai-connections.js", () => ({ aiConnectionService: () => connection }));
vi.mock("../services/live-events.js", () => ({ publishLiveEvent: vi.fn() }));

// A fresh, disposable PostgreSQL cluster exercises the database guards and
// normal route transactions; no production database or provider is contacted.
describe("unique organization voice assignments", () => {
  let temporary: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>>;
  let db: ReturnType<typeof createDb>;
  let app: express.Express;
  let companyId: string;
  let otherCompanyId: string;

  beforeAll(async () => {
    temporary = await startEmbeddedPostgresTestDatabase("voice-assignment-");
    db = createDb(temporary.connectionString);
    await db.insert(authUsers).values({ id: "owner", name: "Fixture owner", email: "voice-fixture@example.test", emailVerified: true, createdAt: new Date(), updatedAt: new Date() });
    await instanceSettingsService(db).updateExperimental({ enableAgentChat: true });
  }, 90_000);
  afterAll(async () => { await temporary?.cleanup(); });
  afterEach(() => vi.unstubAllGlobals());
  beforeEach(async () => {
    policy.decide.mockReset().mockResolvedValue({ allowed: true });
    connection.selectVoice.mockReset().mockResolvedValue({ connection: { id: randomUUID() }, grant: { id: randomUUID(), kind: "user", subjectUserId: "owner" } });
    connection.credential.mockReset().mockResolvedValue("fixture-not-a-real-provider-key");
    companyId = randomUUID(); otherCompanyId = randomUUID();
    await db.insert(companies).values([companyId, otherCompanyId].map(id => ({ id, name: "Voice assignment fixture", issuePrefix: `V${id.replaceAll("-", "").slice(0, 12)}` })));
    await db.insert(companyMemberships).values({ companyId, principalType: "user", principalId: "owner", membershipRole: "owner", status: "active" });
    app = express(); app.use(express.json());
    app.use((req, _res, next) => {
      req.actor = req.headers["x-agent"]
        ? { type: "agent", agentId: String(req.headers["x-agent"]), companyId }
        : { type: "board", userId: "owner", source: "session", companyIds: [companyId] };
      next();
    });
    app.use(agentVoiceRoutes(db));
    app.use((error: any, _req: any, res: any, _next: any) => res.status(error.status ?? 500).json({ error: error.message, details: error.details }));
  });

  async function createAgent(name: string, options: { company?: string; status?: string; voice?: typeof VOICE_NAMES[number] } = {}) {
    const [agent] = await db.insert(agents).values({ companyId: options.company ?? companyId, name, status: options.status ?? "idle", metadata: { fixture: name, voice: settings(options.voice ?? "Kore") } }).returning();
    return agent;
  }
  function settings(voice: typeof VOICE_NAMES[number]) {
    const value = readVoiceSettings(null);
    for (const profile of Object.values(value.profiles)) profile.voice = voice;
    return value;
  }
  async function row(id: string) {
    return (await db.select().from(agents).where(eq(agents.id, id)))[0];
  }
  function put(id: string, voice: typeof VOICE_NAMES[number], extra: Record<string, unknown> = {}) {
    return request(app).put(`/companies/${companyId}/agents/${id}/voice`).send({ ...settings(voice), ...extra });
  }
  function canonical(agent: typeof agents.$inferSelect) {
    return (agent as typeof agent & { voiceName: typeof VOICE_NAMES[number] | null }).voiceName;
  }
  function expectCanonicalProfiles(agent: typeof agents.$inferSelect) {
    expect(VOICE_NAMES).toContain(canonical(agent));
    expect(Object.values(readVoiceSettings(agent.metadata).profiles).map(profile => profile.voice)).toEqual([canonical(agent), canonical(agent)]);
  }

  it("assigns distinct voices to copied/default profiles while allowing reuse in another organization", async () => {
    const first = await createAgent("Original");
    const second = await createAgent("Copied profile");
    const foreign = await createAgent("Other organization", { company: otherCompanyId });
    expect(canonical(first)).not.toBe(canonical(second));
    expect(canonical(foreign)).toBe(canonical(first));
    for (const agent of [first, second, foreign]) expectCanonicalProfiles(agent);
  });

  it("serializes 50 concurrent admissions while keeping unique voices and text-only overflow", async () => {
    const created = await Promise.all(Array.from({ length: MAX_AGENTS_PER_ORGANIZATION }, (_voice, index) => createAgent(`Concurrent ${index}`)));
    const voiced = created.map(canonical).filter(voice => voice !== null);
    expect(new Set(voiced).size).toBe(VOICE_NAMES.length);
    expect(voiced.sort()).toEqual([...VOICE_NAMES].sort());
    expect(created.filter(agent => !canonical(agent))).toHaveLength(20);
    for (const agent of created.filter(agent => !canonical(agent))) expect(readVoiceSettings(agent.metadata, agent.voiceName).enabled).toBe(false);
    await expect(createAgent("Over capacity")).rejects.toThrow();
    expect(await db.select().from(agents).where(eq(agents.companyId, companyId))).toHaveLength(50);
    await expect(agentService(db).create(companyId, { name: "Service over capacity" })).rejects.toThrow("limit of 50 agents");
  }, 30_000);

  it("frees a terminated agent's slot and blocks reactivation when it has been taken", async () => {
    const created = await Promise.all(Array.from({ length: MAX_AGENTS_PER_ORGANIZATION }, (_voice, index) => createAgent(`Member ${index}`)));
    const retired = created[0];
    await db.update(agents).set({ status: "terminated" }).where(eq(agents.id, retired.id));
    expect(canonical(await row(retired.id))).toBeNull();
    const replacement = await agentService(db).create(companyId, { name: "Replacement" });
    expect(canonical(replacement)).toBe(canonical(retired));
    await expect(db.update(agents).set({ status: "idle" }).where(eq(agents.id, retired.id))).rejects.toThrow();
    expect((await row(retired.id)).status).toBe("terminated");
  }, 30_000);

  it("admits only one concurrent reactivation into the last available slot", async () => {
    await Promise.all(Array.from({ length: 49 }, (_, index) => createAgent(`Member ${index}`)));
    const first = await createAgent("Retired one", { status: "terminated" });
    const second = await createAgent("Retired two", { status: "terminated" });
    const attempts = await Promise.allSettled([first, second].map(agent => db.update(agents).set({ status: "idle" }).where(eq(agents.id, agent.id))));
    expect(attempts.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(await db.select().from(agents).where(and(eq(agents.companyId, companyId), ne(agents.status, "terminated")))).toHaveLength(50);
  }, 30_000);

  it("reassigns an occupied voice to an unvoiced agent with both owners authorized", async () => {
    await Promise.all(VOICE_NAMES.map((_, index) => createAgent(`Voice owner ${index}`)));
    const extra = await createAgent("Text-only member");
    expect(canonical(extra)).toBeNull();
    const [owner] = await db.select().from(agents).where(and(eq(agents.companyId, companyId), eq(agents.voiceName, "Kore")));
    const response = await put(extra.id, "Kore", { expectedCurrentVoice: null, expectedVoiceOwnerId: owner.id });
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(canonical(await row(extra.id))).toBe("Kore");
    expect(canonical(await row(owner.id))).toBeNull();
    expect(readVoiceSettings((await row(owner.id)).metadata, null).enabled).toBe(false);
    expect(policy.decide.mock.calls.filter(([input]) => input.action === "agent_config:update").map(([input]) => input.resource.agentId)).toEqual(expect.arrayContaining([extra.id, owner.id]));
  });

  it("reassigns a reactivated agent when its old voice belongs to a replacement", async () => {
    const retired = await createAgent("Retired");
    await db.update(agents).set({ status: "terminated" }).where(eq(agents.id, retired.id));
    const replacement = await createAgent("Replacement");
    expect(canonical(replacement)).toBe(canonical(retired));
    await db.update(agents).set({ status: "idle" }).where(eq(agents.id, retired.id));
    const restored = await row(retired.id);
    expect(restored.status).toBe("idle");
    expect(canonical(restored)).not.toBe(canonical(replacement));
    expectCanonicalProfiles(restored);
  });

  it("repairs stale metadata writes without changing the assigned voice or discarding preferences", async () => {
    await createAgent("Original");
    const agent = await createAgent("Imported copy");
    const stale = settings("Kore");
    for (const profile of Object.values(stale.profiles)) profile.instructions = "Keep answers short.";
    await db.update(agents).set({ metadata: { imported: true, voice: stale } }).where(eq(agents.id, agent.id));
    const updated = await row(agent.id);
    expect(canonical(updated)).toBe(canonical(agent));
    expectCanonicalProfiles(updated);
    expect(updated.metadata?.imported).toBe(true);
    expect(Object.values(readVoiceSettings(updated.metadata).profiles).every(profile => profile.instructions === "Keep answers short.")).toBe(true);
    await db.update(agents).set({ metadata: null }).where(eq(agents.id, agent.id));
    expectCanonicalProfiles(await row(agent.id));
  });

  it("keeps the assigned voice when a pending hire replays its original metadata on approval", async () => {
    await createAgent("First");
    const pending = await createAgent("Pending hire", { status: "pending_approval" });
    const activated = await agentService(db).activatePendingApproval(pending.id, { metadata: { voice: settings("Kore") } });
    expect(activated?.activated).toBe(true);
    const updated = await row(pending.id);
    expect(canonical(updated)).toBe(canonical(pending));
    expectCanonicalProfiles(updated);
  });

  it("rejects direct duplicate canonical writes and rolls a failed transaction back completely", async () => {
    const first = await createAgent("First"), second = await createAgent("Second");
    await expect(db.execute(sql`update agents set voice_name = ${canonical(first)} where id = ${second.id}::uuid`)).rejects.toThrow();
    expect(canonical(await row(second.id))).toBe(canonical(second));
    await expect(db.transaction(async tx => {
      await tx.execute(sql`set constraints agents_company_voice_uq deferred`);
      await tx.execute(sql`update agents set voice_name = ${canonical(second)} where id = ${first.id}::uuid`);
      await tx.execute(sql`update agents set voice_name = ${canonical(first)} where id = ${second.id}::uuid`);
      throw new Error("Fixture rollback");
    })).rejects.toThrow("Fixture rollback");
    expect(canonical(await row(first.id))).toBe(canonical(first));
    expect(canonical(await row(second.id))).toBe(canonical(second));
    expectCanonicalProfiles(await row(first.id));
  });

  it("lists only the current organization's nonterminated assignments with no private configuration", async () => {
    const first = await createAgent("Visible");
    await createAgent("Terminated", { status: "terminated" });
    await createAgent("Foreign", { company: otherCompanyId });
    await db.update(agents).set({ adapterConfig: { privateCredential: "fixture-private" } }).where(eq(agents.id, first.id));
    const response = await request(app).get(`/companies/${companyId}/voice-assignments`);
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body.capacity).toBe(MAX_AGENTS_PER_ORGANIZATION);
    expect(response.body.assignments).toEqual([{ agentId: first.id, agentName: first.name, status: first.status, voice: canonical(first) }]);
    expect(JSON.stringify(response.body)).not.toMatch(/fixture-private|adapterConfig|metadata/);
    expect((await request(app).get(`/companies/${otherCompanyId}/voice-assignments`)).status).toBe(403);
    expect((await request(app).get(`/companies/${companyId}/voice-assignments`).set("x-agent", first.id)).status).toBe(403);
  });

  it("swaps both voices atomically, preserves the other agent's preferences, and audits both changes", async () => {
    const first = await createAgent("First"), second = await createAgent("Second");
    const preferences = readVoiceSettings(second.metadata);
    for (const profile of Object.values(preferences.profiles)) profile.instructions = "Keep my distinct delivery.";
    await db.update(agents).set({ metadata: { ...second.metadata, voice: preferences } }).where(eq(agents.id, second.id));
    const response = await put(first.id, canonical(second)!, { expectedCurrentVoice: canonical(first), expectedVoiceOwnerId: second.id });
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body.swappedWith).toMatchObject({ agentId: second.id, agentName: second.name, voice: canonical(first) });
    const updatedFirst = await row(first.id), updatedSecond = await row(second.id);
    expect(canonical(updatedFirst)).toBe(canonical(second));
    expect(canonical(updatedSecond)).toBe(canonical(first));
    expectCanonicalProfiles(updatedFirst); expectCanonicalProfiles(updatedSecond);
    expect(readVoiceSettings(updatedSecond.metadata).profiles[preferences.model].instructions).toBe("Keep my distinct delivery.");
    expect(policy.decide.mock.calls.filter(([input]) => input.action === "agent_config:update").map(([input]) => input.resource.agentId)).toEqual(expect.arrayContaining([first.id, second.id]));
    const audit = await db.select().from(activityLog).where(eq(activityLog.companyId, companyId));
    expect(audit.filter(event => event.action === "agent.voice.updated").map(event => event.entityId).sort()).toEqual([first.id, second.id].sort());
  });

  it.each(["requested agent", "current voice owner"])("rejects a swap lacking permission for the %s without a partial change", async denied => {
    const first = await createAgent("First"), second = await createAgent("Second");
    const deniedId = denied === "requested agent" ? first.id : second.id;
    policy.decide.mockImplementation(async input => ({ allowed: input.resource.agentId !== deniedId, explanation: "Fixture permission denied" }));
    const response = await put(first.id, canonical(second)!, { expectedCurrentVoice: canonical(first), expectedVoiceOwnerId: second.id });
    expect(response.status).toBe(403);
    expect(canonical(await row(first.id))).toBe(canonical(first));
    expect(canonical(await row(second.id))).toBe(canonical(second));
    expect(await db.select().from(activityLog).where(eq(activityLog.companyId, companyId))).toEqual([]);
  });

  it("does not modify a foreign agent even when the permission policy allows it", async () => {
    const foreign = await createAgent("Foreign", { company: otherCompanyId });
    const response = await put(foreign.id, "Puck");
    expect(response.status).toBe(404);
    expect(canonical(await row(foreign.id))).toBe(canonical(foreign));
  });

  it("rolls back both assignments and both audit entries when audit persistence fails", async () => {
    const first = await createAgent("First"), second = await createAgent("Second");
    const name = `voice_audit_failure_${randomUUID().replaceAll("-", "")}`;
    // Generated names and UUIDs only; the fixture affects this disposable DB.
    await db.execute(sql.raw(`CREATE FUNCTION ${name}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Fixture audit failure'; END $$`));
    await db.execute(sql.raw(`CREATE TRIGGER ${name} BEFORE INSERT ON activity_log FOR EACH ROW WHEN (NEW.company_id = '${companyId}'::uuid AND NEW.entity_id = '${second.id}') EXECUTE FUNCTION ${name}()`));
    try {
      const response = await put(first.id, canonical(second)!);
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(canonical(await row(first.id))).toBe(canonical(first));
      expect(canonical(await row(second.id))).toBe(canonical(second));
      expect(await db.select().from(activityLog).where(eq(activityLog.companyId, companyId))).toEqual([]);
    } finally {
      await db.execute(sql.raw(`DROP TRIGGER ${name} ON activity_log`));
      await db.execute(sql.raw(`DROP FUNCTION ${name}()`));
    }
  });

  it.each(["current voice", "voice owner"])("rejects stale %s preconditions before changing either assignment", async stale => {
    const first = await createAgent("First"), second = await createAgent("Second");
    const response = await put(first.id, canonical(second)!, {
      expectedCurrentVoice: stale === "current voice" ? canonical(second) : canonical(first),
      expectedVoiceOwnerId: stale === "voice owner" ? null : second.id,
    });
    expect(response.status).toBe(409);
    expect(canonical(await row(first.id))).toBe(canonical(first));
    expect(canonical(await row(second.id))).toBe(canonical(second));
  });

  it("accepts exactly one of two simultaneous swaps against the same prior assignments", async () => {
    const first = await createAgent("First"), second = await createAgent("Second");
    const precondition = { expectedCurrentVoice: canonical(first), expectedVoiceOwnerId: second.id };
    const responses = await Promise.all([put(first.id, canonical(second)!, precondition), put(first.id, canonical(second)!, precondition)]);
    expect(responses.map(response => response.status).sort()).toEqual([200, 409]);
    const assigned = await db.select().from(agents).where(and(eq(agents.companyId, companyId), ne(agents.status, "terminated")));
    expect(new Set(assigned.map(canonical)).size).toBe(assigned.length);
  });

  it("does not deadlock a voice swap against a simultaneous termination", async () => {
    const first = await createAgent("First"), second = await createAgent("Second");
    let rowLocked!: () => void, companyLocked!: () => void, finishTermination!: () => void;
    const rowReady = new Promise<void>(resolve => { rowLocked = resolve; });
    const companyReady = new Promise<void>(resolve => { companyLocked = resolve; });
    const releaseRow = new Promise<void>(resolve => { finishTermination = resolve; });
    let sourcePermissionChecks = 0;
    policy.decide.mockImplementation(async input => {
      // The route checks once, then the transaction rechecks after acquiring
      // the organization lock and before it locks the other voice owner.
      if (input.action === "agent_config:update" && input.resource.agentId === first.id && ++sourcePermissionChecks === 2) companyLocked();
      return { allowed: true };
    });
    const terminate = db.transaction(async tx => {
      await tx.execute(sql`SELECT id FROM agents WHERE id = ${second.id}::uuid FOR UPDATE`);
      rowLocked();
      await releaseRow;
      await tx.update(agents).set({ status: "terminated" }).where(eq(agents.id, second.id));
    });
    await rowReady;
    const swap = put(first.id, canonical(second)!, { expectedCurrentVoice: canonical(first), expectedVoiceOwnerId: second.id }).then(response => response);
    try {
      await companyReady;
    } finally {
      finishTermination();
    }
    const [, response] = await Promise.all([terminate, swap]);
    expect(response.status).toBe(409);
    expect(canonical(await row(second.id))).toBeNull();
    expect((await row(second.id)).status).toBe("terminated");
    expect(canonical(await row(first.id))).toBe(canonical(first));
  });

  it("does not mint a fallback voice token for a text-only agent", async () => {
    await Promise.all(VOICE_NAMES.map((_, index) => createAgent(`Voice owner ${index}`)));
    const extra = await createAgent("Text-only member");
    const [chat] = await db.insert(issues).values({ companyId, title: "Text-only chat", status: "in_review", assigneeAgentId: extra.id, conversationAgentId: extra.id, conversationUserId: "owner", conversationState: "waiting" }).returning();
    const provider = vi.fn(); vi.stubGlobal("fetch", provider);
    const response = await request(app).post(`/companies/${companyId}/voice-sessions`).send({ agentIds: [extra.id], issueId: chat.id });
    expect(response.status).toBe(409);
    expect(response.body.details.code).toBe("voice_assignment_required");
    expect(provider).not.toHaveBeenCalled();
  });

  it("uses the canonical assignment for new sessions and changes the active revision after a swap", async () => {
    await createAgent("Default voice owner");
    const first = await createAgent("First"), second = await createAgent("Second");
    // Invalid legacy metadata must never send the profile fallback (Kore) when
    // another agent already owns that voice.
    await db.update(agents).set({ metadata: { voice: { model: "unknown-model", profiles: "malformed" } } }).where(eq(agents.id, first.id));
    const [chat] = await db.insert(issues).values({ companyId, title: "Voice chat", status: "in_review", assigneeAgentId: first.id, conversationAgentId: first.id, conversationUserId: "owner", conversationState: "waiting" }).returning();
    const provider = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ name: "fixture-token" }) });
    vi.stubGlobal("fetch", provider);
    const start = () => request(app).post(`/companies/${companyId}/voice-sessions`).send({ agentIds: [first.id], issueId: chat.id });
    const initial = await start();
    expect(initial.status, JSON.stringify(initial.body)).toBe(200);
    expect(initial.body[0].setup.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName).toBe(canonical(first));
    expect((await put(first.id, canonical(second)!)).status).toBe(200);
    const revision = await request(app).get(`/companies/${companyId}/voice-sessions/${initial.body[0].sessionId}/instructions-revision`);
    expect(revision.status).toBe(200);
    expect(revision.body.revision).not.toBe(initial.body[0].instructionsRevision);
    const restarted = await start();
    expect(restarted.status, JSON.stringify(restarted.body)).toBe(200);
    expect(restarted.body[0].setup.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName).toBe(canonical(second));
    expect(restarted.body[0].instructionsRevision).toBe(revision.body.revision);
  });

  it("withholds a token minted with an assignment that changed during provider issuance", async () => {
    const first = await createAgent("First"), second = await createAgent("Second");
    const [chat] = await db.insert(issues).values({ companyId, title: "Voice chat", status: "in_review", assigneeAgentId: first.id, conversationAgentId: first.id, conversationUserId: "owner", conversationState: "waiting" }).returning();
    vi.stubGlobal("fetch", vi.fn(async () => {
      expect((await put(first.id, canonical(second)!)).status).toBe(200);
      return { ok: true, json: async () => ({ name: "stale-voice-token-must-not-return" }) };
    }));
    const response = await request(app).post(`/companies/${companyId}/voice-sessions`).send({ agentIds: [first.id], issueId: chat.id });
    expect(response.status).toBe(409);
    expect(JSON.stringify(response.body)).not.toContain("stale-voice-token-must-not-return");
  });

  it("migrates duplicate legacy profiles deterministically while preserving explicit unique choices", async () => {
    const migration = await readFile(new URL("../../../packages/db/src/migrations/0282_unique_agent_voices.sql", import.meta.url), "utf8");
    const ids = Array.from({ length: 7 }, () => randomUUID());
    await expect(db.transaction(async tx => {
      // Test the actual migration against isolated legacy tables. The whole
      // schema is rolled back without changing even the disposable app tables.
      const schema = `voice_migration_${randomUUID().replaceAll("-", "")}`;
      await tx.execute(sql.raw(`CREATE SCHEMA ${schema}`));
      await tx.execute(sql.raw(`SET LOCAL search_path TO ${schema}`));
      await tx.execute(sql`CREATE TABLE companies (id uuid PRIMARY KEY)`);
      await tx.execute(sql`CREATE TABLE agents (id uuid PRIMARY KEY, company_id uuid NOT NULL, name text, status text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), metadata jsonb)`);
      await tx.execute(sql`INSERT INTO companies (id) VALUES (${companyId}::uuid)`);
      await tx.execute(sql`INSERT INTO agents (id, company_id, name, status, created_at, metadata) VALUES
        (${ids[0]}::uuid, ${companyId}::uuid, 'Older default', 'idle', '2020-01-01', NULL),
        (${ids[1]}::uuid, ${companyId}::uuid, 'Explicit Kore', 'idle', '2020-01-02', ${JSON.stringify({ keep: "preference", voice: settings("Kore") })}::jsonb),
        (${ids[2]}::uuid, ${companyId}::uuid, 'Explicit Zephyr', 'paused', '2020-01-03', ${JSON.stringify({ voice: settings("Zephyr") })}::jsonb),
        (${ids[3]}::uuid, ${companyId}::uuid, 'Duplicate Kore', 'pending_approval', '2020-01-04', ${JSON.stringify({ voice: settings("Kore") })}::jsonb),
        (${ids[4]}::uuid, ${companyId}::uuid, 'Malformed', 'error', '2020-01-05', '{"voice":{"profiles":"invalid"}}'::jsonb),
        (${ids[5]}::uuid, ${companyId}::uuid, 'Terminated', 'terminated', '2020-01-06', ${JSON.stringify({ voice: settings("Kore") })}::jsonb),
        (${ids[6]}::uuid, ${companyId}::uuid, 'Later explicit Puck', 'idle', '2020-01-07', ${JSON.stringify({ voice: settings("Puck") })}::jsonb)`);
      for (const statement of migration.split("--> statement-breakpoint").map(value => value.trim()).filter(Boolean)) await tx.execute(sql.raw(statement));
      const migrated = await tx.execute<{ id: string; status: string; voiceName: string | null; metadata: Record<string, unknown> }>(sql`SELECT id, status, voice_name AS "voiceName", metadata FROM agents`);
      const byId = new Map(migrated.map(agent => [agent.id, agent]));
      expect(byId.get(ids[1])!.voiceName).toBe("Kore");
      expect(byId.get(ids[2])!.voiceName).toBe("Zephyr");
      expect(byId.get(ids[5])!.voiceName).toBeNull();
      expect(byId.get(ids[6])!.voiceName).toBe("Puck");
      const active = migrated.filter(agent => agent.status !== "terminated");
      expect(new Set(active.map(agent => agent.voiceName)).size).toBe(6);
      expect(byId.get(ids[1])!.metadata?.keep).toBe("preference");
      for (const agent of active) expect(Object.values(readVoiceSettings(agent.metadata).profiles).map(profile => profile.voice)).toEqual([agent.voiceName, agent.voiceName]);
      throw new Error("Fixture migration rollback");
    })).rejects.toThrow("Fixture migration rollback");
  });

  it("refuses an over-capacity legacy organization without deleting or terminating any agents", async () => {
    const migration = await readFile(new URL("../../../packages/db/src/migrations/0282_unique_agent_voices.sql", import.meta.url), "utf8");
    await expect(db.transaction(async tx => {
      const schema = `voice_capacity_${randomUUID().replaceAll("-", "")}`;
      await tx.execute(sql.raw(`CREATE SCHEMA ${schema}`));
      await tx.execute(sql.raw(`SET LOCAL search_path TO ${schema}`));
      await tx.execute(sql`CREATE TABLE companies (id uuid PRIMARY KEY)`);
      await tx.execute(sql`CREATE TABLE agents (id uuid PRIMARY KEY, company_id uuid NOT NULL, status text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), metadata jsonb)`);
      await tx.execute(sql`INSERT INTO companies (id) VALUES (${companyId}::uuid)`);
      await tx.execute(sql`INSERT INTO agents (id, company_id, status) SELECT gen_random_uuid(), ${companyId}::uuid, 'idle' FROM generate_series(1, ${VOICE_NAMES.length + 1})`);
      await tx.execute(sql`SAVEPOINT before_voice_migration`);
      const failure = await (async () => {
        for (const statement of migration.split("--> statement-breakpoint").map(value => value.trim()).filter(Boolean)) await tx.execute(sql.raw(statement));
      })().catch(error => error);
      expect(failure?.cause?.message).toContain("exceeds the available unique agent voices");
      await tx.execute(sql`ROLLBACK TO SAVEPOINT before_voice_migration`);
      const [remaining] = await tx.execute<{ count: number; terminated: number }>(sql`SELECT count(*)::integer AS count, count(*) FILTER (WHERE status = 'terminated')::integer AS terminated FROM agents`);
      expect(remaining).toEqual({ count: VOICE_NAMES.length + 1, terminated: 0 });
      throw new Error("Fixture capacity rollback");
    })).rejects.toThrow("Fixture capacity rollback");
  });
});
