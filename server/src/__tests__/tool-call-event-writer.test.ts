import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { agents, companies, createDb, heartbeatRuns, issues, toolCallEvents } from "@whoxos/db";
import { getEmbeddedPostgresTestSupport, startEmbeddedPostgresTestDatabase } from "./helpers/embedded-postgres.js";
import { insertToolCallEvent } from "../services/tool-call-event-writer.js";

const support = await getEmbeddedPostgresTestSupport();
(support.supported ? describe : describe.skip)("ordered tool audit FK locking", () => {
  let database: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>>;
  let db: ReturnType<typeof createDb>;
  let identityDb: ReturnType<typeof createDb>;
  let writerDb: ReturnType<typeof createDb>;
  beforeAll(async () => {
    database = await startEmbeddedPostgresTestDatabase("tool-audit-locks-");
    db = createDb(database.connectionString);
    identityDb = createDb(database.connectionString, { maxConnections: 1, applicationName: "audit-test-identity" });
    writerDb = createDb(database.connectionString, { maxConnections: 1, applicationName: "audit-test-writer" });
  }, 30_000);
  afterAll(async () => { await database?.cleanup(); }, 60_000);

  async function seed() {
    const companyId = randomUUID(), agentId = randomUUID(), issueId = randomUUID(), runId = randomUUID();
    await db.insert(companies).values({ id: companyId, name: "Audit locks", issuePrefix: companyId.slice(0, 8) });
    await db.insert(agents).values({ id: agentId, companyId, name: "Audit agent", role: "engineer", adapterType: "codex_local" });
    await db.insert(issues).values({ id: issueId, companyId, title: "Manufactured audit task" });
    await db.insert(heartbeatRuns).values({ id: runId, companyId, agentId, status: "running", contextSnapshot: { issueId } });
    return { companyId, agentId, issueId, runId, actorType: "agent", actorId: agentId,
      eventType: "policy_decision", outcome: "success", toolName: "manufactured-private-reader" } as const;
  }

  it("completes concurrent issue-then-run identity capture and tool audit insertion", async () => {
    const event = await seed();
    const locked = Promise.withResolvers<void>();
    const continueIdentity = Promise.withResolvers<void>();
    const identity = identityDb.transaction(async (tx) => {
      await tx.select({ id: issues.id }).from(issues).where(eq(issues.id, event.issueId)).for("update");
      locked.resolve();
      await continueIdentity.promise;
      await tx.select({ id: heartbeatRuns.id }).from(heartbeatRuns).where(eq(heartbeatRuns.id, event.runId)).for("update");
    });
    await locked.promise;
    const inserted = insertToolCallEvent(writerDb, event);
    // Wait until the actual second PostgreSQL connection is blocked, so this
    // reproduces the production interleaving instead of relying on a sleep.
    try {
      let blocked = false;
      const deadline = Date.now() + 3000;
      while (Date.now() < deadline) {
        const rows = await db.execute(sql`select wait_event_type from pg_stat_activity where application_name = 'audit-test-writer'`);
        if (rows.some((row) => row.wait_event_type === "Lock")) { blocked = true; break; }
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      expect(blocked).toBe(true);
    } finally { continueIdentity.resolve(); }
    const [, rows] = await Promise.all([identity, inserted]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ runId: event.runId, issueId: event.issueId, outcome: "success" });
  }, 10_000);

  it("preserves company boundaries and rejects a missing run before persisting an event", async () => {
    const event = await seed();
    const other = await seed();
    await expect(insertToolCallEvent(db, { ...event, companyId: other.companyId })).rejects.toThrow("Tool audit task scope is unavailable");
    await expect(insertToolCallEvent(db, { ...event, runId: randomUUID() })).rejects.toThrow("Tool audit run scope is unavailable");
    expect(await db.select().from(toolCallEvents).where(eq(toolCallEvents.companyId, event.companyId))).toHaveLength(0);
  });

  it("continues recording system events without a task or run", async () => {
    const event = await seed();
    const rows = await insertToolCallEvent(db, { ...event, actorType: "system", issueId: null, runId: null });
    expect(rows).toHaveLength(1);
    expect(rows[0].runId).toBeNull();
  });
});
