import { randomUUID } from "node:crypto";
import express from "express";
import request from "supertest";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { activityLog, agents, companies, companyMemberships, createDb, heartbeatRuns, issueThreadInteractions, issues, startEmbeddedPostgresTestDatabase } from "@whoxos/db";
import { updateCompanySchema } from "@whoxos/shared";
import { getActiveExecutiveDelegation, resolveExecutiveInteractionAuthority, setExecutiveDelegation } from "./executive-delegation.js";
import { companyService } from "./companies.js";
import { issueThreadInteractionService } from "./issue-thread-interactions.js";
import { companyRoutes } from "../routes/companies.js";
import { errorHandler } from "../middleware/error-handler.js";

describe("organization executive delegation with PostgreSQL", () => {
  let temporary: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>>;
  let db: ReturnType<typeof createDb>;
  beforeAll(async () => { temporary = await startEmbeddedPostgresTestDatabase("executive-delegation-"); db = createDb(temporary.connectionString); }, 90_000);
  afterAll(async () => { await temporary?.cleanup(); });
  async function fixture() {
    const companyId = randomUUID(), agentId = randomUUID(), issueId = randomUUID(), owner = randomUUID(), admin = randomUUID(), operator = randomUUID();
    await db.insert(companies).values({ id: companyId, name: "Delegation fixture", issuePrefix: `D${companyId.slice(0,8)}` });
    await db.insert(agents).values({ id: agentId, companyId, name: "CEO", role: "ceo" });
    await db.insert(companyMemberships).values([
      { companyId, principalType: "user", principalId: owner, membershipRole: "owner" },
      { companyId, principalType: "user", principalId: admin, membershipRole: "admin" },
      { companyId, principalType: "user", principalId: operator, membershipRole: "operator" },
      { companyId, principalType: "agent", principalId: agentId, membershipRole: "operator" },
    ]);
    await db.insert(issues).values({ id: issueId, companyId, title: "Operational task", status: "in_progress" });
    const actor = { type: "agent", agentId, runId: randomUUID() } as const;
    const input = { companyId, issueId, actor, interaction: { kind: "ask_user_questions", effectiveResolverPolicy: "human_only" } };
    return { companyId, agentId, issueId, owner, admin, operator, actor, input };
  }
  it.each(["owner", "admin"] as const)("allows a live %s to grant and revoke with server attribution", async role => {
    const f = await fixture();
    const updated = await setExecutiveDelegation(db, { companyId: f.companyId, userId: f[role], agentId: f.agentId });
    expect(updated.interactionResolverGovernance.executiveDelegation).toMatchObject({ agentId: f.agentId, grantedByUserId: f[role] });
    expect(Number.isFinite(Date.parse(updated.interactionResolverGovernance.executiveDelegation!.grantedAt))).toBe(true);
    expect(await resolveExecutiveInteractionAuthority(db, f.input)).toMatchObject({ kind: "delegated_ceo", agentId: f.agentId, grantedByUserId: f[role] });
    await setExecutiveDelegation(db, { companyId: f.companyId, userId: f[role], agentId: null });
    expect(await getActiveExecutiveDelegation(db, f.companyId)).toBeNull();
    const events = await db.select().from(activityLog).where(eq(activityLog.companyId, f.companyId));
    expect(events.map(e => [e.action, e.actorType, e.actorId])).toEqual([
      ["company.executive_delegation_granted", "user", f[role]], ["company.executive_delegation_revoked", "user", f[role]],
    ]);
  });
  it("rejects operator, missing membership, and cross-company CEO grants", async () => {
    const f = await fixture(), other = await fixture();
    for (const userId of [f.operator, randomUUID(), other.owner]) await expect(setExecutiveDelegation(db, { companyId: f.companyId, userId, agentId: f.agentId })).rejects.toMatchObject({ status: 403 });
    await expect(setExecutiveDelegation(db, { companyId: f.companyId, userId: f.owner, agentId: other.agentId })).rejects.toMatchObject({ status: 403 });
    expect(await getActiveExecutiveDelegation(db, f.companyId)).toBeNull();
  });
  it("accepts the active lifecycle status for a CEO and revalidates that delegation", async () => {
    const f = await fixture();
    await db.update(agents).set({ status: "active" }).where(eq(agents.id, f.agentId));
    await setExecutiveDelegation(db, { companyId: f.companyId, userId: f.owner, agentId: f.agentId });
    expect(await getActiveExecutiveDelegation(db, f.companyId)).toMatchObject({ agentId: f.agentId });
    expect(await resolveExecutiveInteractionAuthority(db, f.input)).toMatchObject({ kind: "delegated_ceo", agentId: f.agentId });
  });
  it.each(["paused", "terminated", "pending_approval"])("rejects %s CEOs", async status => {
    const f = await fixture(); await db.update(agents).set({ status }).where(eq(agents.id, f.agentId));
    await expect(setExecutiveDelegation(db, { companyId: f.companyId, userId: f.owner, agentId: f.agentId })).rejects.toMatchObject({ status: 403 });
  });
  it.each(["grantor membership", "grantor role", "agent membership", "agent role", "agent status"])("revalidates %s on every use", async changed => {
    const f = await fixture(); await setExecutiveDelegation(db, { companyId: f.companyId, userId: f.owner, agentId: f.agentId });
    if (changed === "grantor membership") await db.update(companyMemberships).set({ status: "suspended" }).where(eq(companyMemberships.principalId, f.owner));
    if (changed === "grantor role") await db.update(companyMemberships).set({ membershipRole: "operator" }).where(eq(companyMemberships.principalId, f.owner));
    if (changed === "agent membership") await db.update(companyMemberships).set({ status: "suspended" }).where(eq(companyMemberships.principalId, f.agentId));
    if (changed === "agent role") await db.update(agents).set({ role: "general" }).where(eq(agents.id, f.agentId));
    if (changed === "agent status") await db.update(agents).set({ status: "paused" }).where(eq(agents.id, f.agentId));
    expect(await resolveExecutiveInteractionAuthority(db, f.input)).toBeNull();
  });
  it("does not delegate private chats, governed actions, personal addressees, or independent reviews", async () => {
    const f = await fixture(); await setExecutiveDelegation(db, { companyId: f.companyId, userId: f.owner, agentId: f.agentId });
    for (const interaction of [
      { ...f.input.interaction, kind: "connection_intent" },
      { ...f.input.interaction, kind: "request_confirmation", payload: { toolAction: { actionRequestId: randomUUID() } } },
      { ...f.input.interaction, kind: "request_confirmation", payload: { secretProposal: {} } },
      { ...f.input.interaction, addresseeUserId: f.owner },
    ]) expect(await resolveExecutiveInteractionAuthority(db, { ...f.input, interaction })).toBeNull();
    expect(await resolveExecutiveInteractionAuthority(db, { ...f.input, additionalRestriction: "human_only" })).toBeNull();
    await db.update(issues).set({ conversationAgentId: f.agentId, conversationUserId: f.owner, assigneeAgentId: f.agentId, conversationState: "active" }).where(eq(issues.id, f.issueId));
    expect(await resolveExecutiveInteractionAuthority(db, f.input)).toBeNull();
  });
  it("requires the current administrator role for ordinary human audience override", async () => {
    const f = await fixture();
    const input = { ...f.input, interaction: { ...f.input.interaction, effectiveResolverPolicy: "not_creator" }, actor: { type: "user" as const, userId: f.admin } };
    expect(await resolveExecutiveInteractionAuthority(db, input)).toEqual({ kind: "organization_admin", userId: f.admin });
    expect(await resolveExecutiveInteractionAuthority(db, { ...input, actor: { type: "user", userId: f.operator } })).toBeNull();
    await db.update(companyMemberships).set({ status: "suspended" }).where(eq(companyMemberships.principalId, f.admin));
    expect(await resolveExecutiveInteractionAuthority(db, input)).toBeNull();
  });
  it("rejects grant stamping in the ordinary HTTP settings schema", () => {
    expect(updateCompanySchema.safeParse({ interactionResolverGovernance: { executiveDelegation: { agentId: randomUUID(), grantedByUserId: "forged", grantedAt: new Date().toISOString() } } }).success).toBe(false);
  });
  it("ordinary service updates preserve only the current grant and cannot restore a revoked or imported grant", async () => {
    const f = await fixture(); await setExecutiveDelegation(db, { companyId: f.companyId, userId: f.owner, agentId: f.agentId });
    const saved = await getActiveExecutiveDelegation(db, f.companyId);
    const svc = companyService(db);
    await svc.update(f.companyId, { interactionResolverGovernance: { ask_user_questions: { defaultPolicy: "anyone" }, executiveDelegation: { ...saved!, grantedByUserId: "forged" } } });
    expect(await getActiveExecutiveDelegation(db, f.companyId)).toEqual(saved);
    await setExecutiveDelegation(db, { companyId: f.companyId, userId: f.owner, agentId: null });
    await svc.update(f.companyId, { interactionResolverGovernance: { executiveDelegation: saved! } });
    const [row] = await db.select().from(companies).where(eq(companies.id, f.companyId));
    expect(row!.interactionResolverGovernance.executiveDelegation).toBeUndefined();
  });
  it("serves only the owner/admin dedicated grant endpoint and rejects client-stamped metadata", async () => {
    const f = await fixture();
    const appFor = (userId: string, type = "board") => {
      const app = express(); app.use(express.json());
      app.use((req, _res, next) => { (req as any).actor = type === "board"
        ? { type, source: "session", userId, companyIds: [f.companyId], memberships: [{ companyId: f.companyId, status: "active", membershipRole: "owner" }] }
        : { type, companyId: f.companyId, agentId: f.agentId }; next(); });
      app.use("/api/companies", companyRoutes(db)); app.use(errorHandler); return app;
    };
    const path = `/api/companies/${f.companyId}/executive-delegation`;
    expect((await request(appFor(f.operator)).patch(path).send({ agentId: f.agentId })).status).toBe(403);
    expect((await request(appFor(f.owner, "agent")).patch(path).send({ agentId: f.agentId })).status).toBe(403);
    expect((await request(appFor(f.owner)).patch(path).send({ agentId: f.agentId, grantedByUserId: f.admin })).status).toBe(400);
    const granted = await request(appFor(f.owner)).patch(path).send({ agentId: f.agentId });
    expect(granted.status).toBe(200);
    expect(granted.body.interactionResolverGovernance.executiveDelegation).toMatchObject({ agentId: f.agentId, grantedByUserId: f.owner });
    const revoked = await request(appFor(f.admin)).patch(path).send({ agentId: null });
    expect(revoked.status).toBe(200); expect(revoked.body.interactionResolverGovernance.executiveDelegation).toBeUndefined();
  });
  it("answers with real agent/run attribution and audits delegated authority inside the mutation", async () => {
    const f = await fixture();
    await setExecutiveDelegation(db, { companyId: f.companyId, userId: f.owner, agentId: f.agentId });
    await db.insert(heartbeatRuns).values({ id: f.actor.runId, companyId: f.companyId, agentId: f.agentId, status: "running", responsibleUserId: f.owner });
    const [interaction] = await db.insert(issueThreadInteractions).values({
      companyId: f.companyId, issueId: f.issueId, kind: "ask_user_questions", requestedResolverPolicy: "human_only", effectiveResolverPolicy: "human_only",
      payload: { version: 1, questions: [{ id: "operation", prompt: "Proceed with the operational repair?", selectionMode: "single", options: [{ id: "yes", label: "Proceed" }] }] },
    }).returning();
    const result = await issueThreadInteractionService(db).answerQuestions({ id: f.issueId, companyId: f.companyId }, interaction!.id, { answers: [{ questionId: "operation", optionIds: ["yes"] }] }, { agentId: f.agentId, runId: f.actor.runId });
    expect(result).toMatchObject({ status: "answered", resolvedByAgentId: f.agentId, resolvedByRunId: f.actor.runId, resolvedByUserId: null });
    const [event] = await db.select().from(activityLog).where(and(eq(activityLog.companyId, f.companyId), eq(activityLog.action, "issue.thread_interaction_authority_used")));
    expect(event).toMatchObject({ actorType: "agent", actorId: f.agentId, runId: f.actor.runId, details: { decisionBasis: { kind: "delegated_ceo", grantedByUserId: f.owner }, authorizationReason: "allow_delegated_ceo" } });
  });
  it("rechecks a revoked grant after the initial audience check and rolls back the answer", async () => {
    const f = await fixture();
    await setExecutiveDelegation(db, { companyId: f.companyId, userId: f.owner, agentId: f.agentId });
    await db.insert(heartbeatRuns).values({ id: f.actor.runId, companyId: f.companyId, agentId: f.agentId, status: "running" });
    const [interaction] = await db.insert(issueThreadInteractions).values({ companyId: f.companyId, issueId: f.issueId, kind: "ask_user_questions", effectiveResolverPolicy: "human_only", payload: { version: 1, questions: [{ id: "q", prompt: "Repair?", selectionMode: "single", options: [{ id: "yes", label: "Proceed" }] }] } }).returning();
    await expect(issueThreadInteractionService(db).answerQuestions({ id: f.issueId, companyId: f.companyId }, interaction!.id, { answers: [{ questionId: "q", optionIds: ["yes"] }] }, { agentId: f.agentId, runId: f.actor.runId }, {
      beforeResolveInTransaction: async () => { await setExecutiveDelegation(db, { companyId: f.companyId, userId: f.owner, agentId: null }); },
    })).rejects.toMatchObject({ status: 403 });
    const [saved] = await db.select().from(issueThreadInteractions).where(eq(issueThreadInteractions.id, interaction!.id));
    expect(saved!.status).toBe("pending");
    const used = await db.select().from(activityLog).where(and(eq(activityLog.companyId, f.companyId), eq(activityLog.action, "issue.thread_interaction_authority_used")));
    expect(used).toHaveLength(0);
  });

  it("rechecks personal addressing at write time and does not use a stale delegation decision", async () => {
    const f = await fixture();
    await setExecutiveDelegation(db, { companyId: f.companyId, userId: f.owner, agentId: f.agentId });
    await db.insert(heartbeatRuns).values({ id: f.actor.runId, companyId: f.companyId, agentId: f.agentId, status: "running" });
    const [interaction] = await db.insert(issueThreadInteractions).values({ companyId: f.companyId, issueId: f.issueId, kind: "ask_user_questions", effectiveResolverPolicy: "human_only", payload: { version: 1, questions: [{ id: "q", prompt: "Repair?", selectionMode: "single", options: [{ id: "yes", label: "Proceed" }] }] } }).returning();
    await expect(issueThreadInteractionService(db).answerQuestions({ id: f.issueId, companyId: f.companyId }, interaction!.id, { answers: [{ questionId: "q", optionIds: ["yes"] }] }, { agentId: f.agentId, runId: f.actor.runId }, {
      beforeResolveInTransaction: async tx => { await tx.update(issueThreadInteractions).set({ addresseeUserId: f.owner }).where(eq(issueThreadInteractions.id, interaction!.id)); },
    })).rejects.toMatchObject({ status: 403 });
    const [saved] = await db.select().from(issueThreadInteractions).where(eq(issueThreadInteractions.id, interaction!.id));
    expect(saved!.status).toBe("pending");
  });

  it("retains requested not-creator separation under a human-only company cap", async () => {
    const f = await fixture();
    await setExecutiveDelegation(db, { companyId: f.companyId, userId: f.owner, agentId: f.agentId });
    const interaction = { ...f.input.interaction, requestedResolverPolicy: "not_creator", effectiveResolverPolicy: "human_only", createdByAgentId: f.agentId, sourceRunId: randomUUID() };
    expect(await resolveExecutiveInteractionAuthority(db, { ...f.input, interaction })).toBeNull();
    expect(await resolveExecutiveInteractionAuthority(db, { ...f.input, interaction: { ...interaction, createdByAgentId: randomUUID(), sourceRunId: f.actor.runId } })).toBeNull();
    expect(await resolveExecutiveInteractionAuthority(db, { ...f.input, interaction: { ...interaction, createdByAgentId: randomUUID(), sourceRunId: randomUUID() } })).toMatchObject({ kind: "delegated_ceo", agentId: f.agentId });
    // An authenticated human administrator's ordinary override is separate.
    expect(await resolveExecutiveInteractionAuthority(db, { ...f.input, actor: { type: "user", userId: f.admin }, interaction: { ...interaction, effectiveResolverPolicy: "not_creator", createdByUserId: f.admin } })).toMatchObject({ kind: "organization_admin", userId: f.admin });
  });

});
