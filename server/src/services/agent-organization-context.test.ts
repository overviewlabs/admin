import { randomUUID } from "node:crypto";
import express from "express";
import request from "supertest";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { agents, authUsers, companies, companyMemberships, createDb, projects, startEmbeddedPostgresTestDatabase } from "@whoxos/db";
import { loadAgentOrganizationContext } from "./agent-organization-context.js";
import type { AuthorizationActor } from "./authorization.js";

describe("agent organization context with canonical authorization and PostgreSQL", () => {
  let temporary: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>>;
  let db: ReturnType<typeof createDb>;
  beforeAll(async () => {
    temporary = await startEmbeddedPostgresTestDatabase("organization-context-");
    db = createDb(temporary.connectionString);
  }, 90_000);
  afterAll(async () => { await temporary?.cleanup(); });

  async function fixture() {
    const companyId = randomUUID(), agentId = randomUUID();
    await db.insert(companies).values({ id: companyId, name: "Treasury", description: "Organization purpose", issuePrefix: `C${companyId.slice(0, 8)}` });
    const users: Record<string, string> = {};
    for (const role of ["owner", "admin", "operator", "viewer", "member", "unrecognized"]) {
      const id = randomUUID(); users[role] = id;
      await db.insert(authUsers).values({ id, name: `${role} person`, email: `${id}@private.example`, image: "https://private.example/avatar", createdAt: new Date(), updatedAt: new Date() });
      await db.insert(companyMemberships).values({ companyId, principalId: id, principalType: "user", membershipRole: role, status: "active" });
    }
    await db.insert(agents).values({ id: agentId, companyId, name: "CEO", role: "ceo", title: "Team lead", capabilities: "Coordinate work", adapterConfig: { apiKey: "never-project-secret" }, runtimeConfig: { private: "never-project-runtime" }, metadata: { private: "never-project-metadata" } });
    const board: AuthorizationActor = { type: "board", source: "session", userId: users.owner, companyIds: [companyId] };
    const agent: AuthorizationActor = { type: "agent", source: "agent_key", agentId, companyId, onBehalfOfUserId: users.owner, onBehalfOfMemberships: [{ companyId, status: "active", membershipRole: "owner" }] };
    const load = (overrides: Partial<Parameters<typeof loadAgentOrganizationContext>[1]> = {}) => loadAgentOrganizationContext(db, { companyId, agentId, actors: [board, agent], currentUserId: users.owner, ...overrides });
    return { companyId, agentId, users, board, agent, load };
  }

  it("projects active roles, owner designation, organization and discovery without private account/config fields", async () => {
    const test = await fixture();
    const result = await test.load();
    expect(result.organization).toEqual({ id: test.companyId, name: "Treasury", description: "Organization purpose", status: "active" });
    expect(result.currentHuman).toMatchObject({ id: test.users.owner, name: "owner person", membershipRole: "owner", designation: "Founder / Owner" });
    expect(result.humans.map(human => [human.membershipRole, human.designation])).toEqual(expect.arrayContaining([
      ["admin", "Administrator"], ["operator", "Operator"], ["viewer", "Viewer"], ["unknown", "Unknown role"],
    ]));
    expect(result.owners.map(human => human.id)).toEqual([test.users.owner]);
    expect(result.agents).toEqual([{ id: test.agentId, name: "CEO", role: "ceo", title: "Team lead", status: "idle", reportsTo: null, capabilities: "Coordinate work" }]);
    expect(result.counts).toEqual({ humans: 6, agents: 1 });
    expect(result.dataAccess.resources.tasks).toBe(`/api/companies/${test.companyId}/issues`);
    expect(result.dataAccess.refreshPath).toBe(`/api/companies/${test.companyId}/organization-context`);
    expect(result.roleGuidance.enforcement).toContain("not permission grants");
    const serialized = JSON.stringify(result);
    for (const privateValue of ["private.example", "never-project", "adapterConfig", "runtimeConfig", '"email":', '"image":', "grantScope"]) {
      expect(serialized).not.toContain(privateValue);
    }
    expect(Object.keys(result.humans[0]!)).toEqual(["id", "name", "membershipRole", "status", "designation"]);
  });

  it("keeps authenticated speaker, responsible human and verified message authors distinct", async () => {
    const test = await fixture();
    const result = await test.load({ currentUserId: test.users.viewer, responsibleUserId: test.users.owner, messageAuthorUserIds: [test.users.admin, test.users.admin, "missing"] });
    expect(result.currentHuman?.membershipRole).toBe("viewer");
    expect(result.responsibleHuman?.membershipRole).toBe("owner");
    expect(result.messageAuthors.map(human => human.id)).toEqual([test.users.admin]);
    const background = await test.load({ currentUserId: null, responsibleUserId: test.users.owner });
    expect(background.currentHuman).toBeNull();
    expect(background.responsibleHuman?.id).toBe(test.users.owner);
  });

  it("never joins another organization's humans, owners or agents", async () => {
    const first = await fixture(), second = await fixture();
    const result = await first.load({ currentUserId: second.users.owner, responsibleUserId: second.users.admin, messageAuthorUserIds: [second.users.owner] });
    expect(result.currentHuman).toBeNull(); expect(result.responsibleHuman).toBeNull(); expect(result.messageAuthors).toEqual([]);
    expect(JSON.stringify(result)).not.toContain(second.companyId);
    expect(JSON.stringify(result)).not.toContain(second.agentId);
    expect(JSON.stringify(result)).not.toContain(second.users.owner!);
    await expect(first.load({ actors: [second.board] })).rejects.toMatchObject({ status: 403 });
    await expect(first.load({ actors: [second.agent] })).rejects.toMatchObject({ status: 403 });
    await expect(first.load({ agentId: second.agentId })).rejects.toMatchObject({ status: 403 });
  });

  it.each(["pending", "suspended", "archived"])("excludes %s memberships and rechecks access despite stale actor metadata", async status => {
    const test = await fixture();
    await db.update(companyMemberships).set({ status }).where(and(eq(companyMemberships.companyId, test.companyId), eq(companyMemberships.principalId, test.users.admin!)));
    const result = await test.load({ currentUserId: test.users.admin, messageAuthorUserIds: [test.users.admin!] });
    expect(result.humans.some(human => human.id === test.users.admin)).toBe(false);
    expect(result.currentHuman).toBeNull(); expect(result.messageAuthors).toEqual([]);
    await expect(test.load({ actors: [{ ...test.board, userId: test.users.admin, memberships: [{ companyId: test.companyId, status: "active", membershipRole: "owner" }], isInstanceAdmin: true }] })).rejects.toMatchObject({ status: 403 });
    await expect(test.load({ actors: [{ ...test.agent, onBehalfOfUserId: test.users.admin }] })).rejects.toMatchObject({ status: 403 });
  });

  it("intersects every actor's canonical roster access and removes hidden manager references", async () => {
    const test = await fixture();
    const hiddenId = randomUUID(), visibleId = randomUUID(), projectId = randomUUID();
    await db.insert(projects).values({ id: projectId, companyId: test.companyId, name: "Review scope" });
    await db.insert(agents).values([{ id: hiddenId, companyId: test.companyId, name: "Hidden manager" }, { id: visibleId, companyId: test.companyId, name: "Visible colleague", reportsTo: hiddenId }]);
    await db.update(agents).set({ permissions: { trustPreset: "low_trust_review", authorizationPolicy: { trustBoundary: { mode: "low_trust_review", projectIds: [projectId], allowedAgentIds: [visibleId] } } } }).where(eq(agents.id, test.agentId));
    const result = await test.load();
    expect(result.agents.map(agent => agent.id).sort()).toEqual([test.agentId, visibleId].sort());
    expect(result.agents.find(agent => agent.id === visibleId)?.reportsTo).toBeNull();
    expect(JSON.stringify(result)).not.toContain(hiddenId);
    expect(JSON.stringify(result)).not.toContain("Hidden manager");
    expect(result.counts.agents).toBe(2);
    await expect(test.load({ agentId: hiddenId })).rejects.toMatchObject({ status: 403 });
    const boardOnly = await test.load({ agentId: null, actors: [test.board] });
    expect(boardOnly.counts.agents).toBe(3);
  });

  it("refreshes names, membership roles and agents on each call while excluding terminated employees", async () => {
    const test = await fixture();
    const old = await test.load();
    await db.update(authUsers).set({ name: "Updated name" }).where(eq(authUsers.id, test.users.viewer!));
    await db.update(companyMemberships).set({ membershipRole: "admin" }).where(and(eq(companyMemberships.companyId, test.companyId), eq(companyMemberships.principalId, test.users.viewer!)));
    await db.insert(agents).values([{ companyId: test.companyId, name: "Paused colleague", status: "paused" }, { companyId: test.companyId, name: "Former colleague", status: "terminated" }]);
    const fresh = await test.load();
    expect(old.counts.agents).toBe(1); expect(fresh.counts.agents).toBe(2);
    expect(fresh.humans.find(human => human.id === test.users.viewer)).toMatchObject({ name: "Updated name", membershipRole: "admin" });
    expect(fresh.agents.some(agent => agent.name === "Former colleague")).toBe(false);
  });

  it.each(["terminated", "pending_approval"])("rejects %s selected/executing agents", async status => {
    const test = await fixture();
    await db.update(agents).set({ status }).where(eq(agents.id, test.agentId));
    await expect(test.load()).rejects.toMatchObject({ status: 403 });
    await expect(test.load({ actors: [test.board] })).rejects.toMatchObject({ status: 403 });
  });

  it("rejects missing actors and anonymous access, without treating an AI CEO as human owner", async () => {
    const test = await fixture();
    await expect(test.load({ actors: [] })).rejects.toMatchObject({ status: 403 });
    await expect(test.load({ actors: [{ type: "none" }] })).rejects.toMatchObject({ status: 403 });
    const result = await test.load({ actors: [test.agent], currentUserId: null });
    expect(result.currentHuman).toBeNull(); expect(result.owners.some(human => human.id === test.agentId)).toBe(false);
  });

  it.each(["skill_test", "task_bridge"] as const)("preserves the %s key's canonical directory restriction", async kind => {
    const test = await fixture();
    const keyScope = kind === "skill_test" ? { kind, issueId: randomUUID() } : { kind, parentIssueId: randomUUID() };
    await expect(test.load({ actors: [{ ...test.agent, keyId: randomUUID(), keyScope }] })).rejects.toMatchObject({ status: 403 });
  });

  it("serves the authenticated directory without caching or accepting identity overrides", async () => {
    const test = await fixture();
    const { accessRoutes } = await import("../routes/access.js");
    const app = express(); let actor = test.board;
    app.use((req, _res, next) => { req.actor = actor as express.Request["actor"]; next(); });
    app.use("/api", accessRoutes(db, { deploymentMode: "authenticated", deploymentExposure: "private", bindHost: "127.0.0.1", allowedHostnames: [] }));
    app.use((error: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => res.status(error.status ?? 500).json({ error: error.message }));
    const response = await request(app).get(`/api/companies/${test.companyId}/organization-context?currentUserId=${test.users.viewer}`);
    expect(response.status).toBe(200); expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.body.currentHuman.id).toBe(test.users.owner);
    actor = test.agent;
    const agentResponse = await request(app).get(`/api/companies/${test.companyId}/organization-context`);
    expect(agentResponse.status).toBe(200); expect(agentResponse.body.currentHuman).toBeNull();
    expect(agentResponse.body.responsibleHuman.id).toBe(test.users.owner);
    for (const keyScope of [{ kind: "skill_test" as const, issueId: randomUUID() }, { kind: "task_bridge" as const, parentIssueId: randomUUID() }]) {
      actor = { ...test.agent, keyId: randomUUID(), keyScope };
      expect((await request(app).get(`/api/companies/${test.companyId}/organization-context`)).status).toBe(403);
    }
    actor = { ...test.board, companyIds: [] };
    expect((await request(app).get(`/api/companies/${test.companyId}/organization-context`)).status).toBe(403);
  }, 30_000);
});
