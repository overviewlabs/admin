import { randomUUID } from "node:crypto";
import express from "express";
import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { activityLog, companies, createDb, invites, joinRequests } from "@whoxos/db";
import { getEmbeddedPostgresTestSupport, startEmbeddedPostgresTestDatabase } from "./helpers/embedded-postgres.js";
import { accessRoutes } from "../routes/access.js";
import { errorHandler } from "../middleware/index.js";

vi.mock("../services/index.js", () => ({
  accessService: () => ({
    isInstanceAdmin: vi.fn(),
    canUser: vi.fn(),
    hasPermission: vi.fn(),
  }),
  agentService: () => ({
    getById: vi.fn(),
  }),
  boardAuthService: () => ({
    createChallenge: vi.fn(),
    resolveBoardAccess: vi.fn(),
    assertCurrentBoardKey: vi.fn(),
    revokeBoardApiKey: vi.fn(),
  }),
  deduplicateAgentName: vi.fn(),
  logActivity: vi.fn(),
  notifyHireApproved: vi.fn(),
}));

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

if (!embeddedPostgresSupport.supported) {
  console.warn(
    `Skipping embedded Postgres invite list route tests on this host: ${embeddedPostgresSupport.reason ?? "unsupported environment"}`,
  );
}

describeEmbeddedPostgres("GET /companies/:companyId/invites", () => {
  let db!: ReturnType<typeof createDb>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;
  let companyId!: string;

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("whoxos-invite-list-route-");
    db = createDb(tempDb.connectionString);
  }, 20_000);

  beforeEach(async () => {
    companyId = randomUUID();
    await db.insert(companies).values({
      id: companyId,
      name: "WHOXOS",
      issuePrefix: `T${companyId.replace(/-/g, "").slice(0, 6).toUpperCase()}`,
      requireBoardApprovalForNewAgents: false,
    });
  });

  afterEach(async () => {
    await db.delete(activityLog);
    await db.delete(joinRequests);
    await db.delete(invites);
    await db.delete(companies);
  });

  afterAll(async () => {
    await tempDb?.cleanup();
  });

  function createApp(currentCompanyId: string) {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      (req as any).actor = {
        type: "board",
        source: "local_implicit",
        userId: null,
        companyIds: [currentCompanyId],
      };
      next();
    });
    app.use(
      "/api",
      accessRoutes(db, {
        deploymentMode: "local_trusted",
        deploymentExposure: "private",
        bindHost: "127.0.0.1",
        allowedHostnames: [],
      }),
    );
    app.use(errorHandler);
    return app;
  }

  it("includes saved recipients and historical email results without mixing organizations", async () => {
    const sentId = randomUUID(), uncertainId = randomUUID(), linkId = randomUUID();
    const otherCompanyId = randomUUID();
    await db.insert(companies).values({ id: otherCompanyId, name: "Other", issuePrefix: "OTHER" });
    await db.insert(invites).values([
      { id: sentId, companyId, tokenHash: "sent", allowedJoinTypes: "human", defaultsPayload: { recipientEmail: "sent@example.com" }, expiresAt: new Date("2027-01-01"), revokedAt: new Date() },
      { id: uncertainId, companyId, tokenHash: "uncertain", allowedJoinTypes: "human", expiresAt: new Date("2027-01-01") },
      { id: linkId, companyId, tokenHash: "link", allowedJoinTypes: "human", expiresAt: new Date("2027-01-01") },
      { companyId: otherCompanyId, tokenHash: "other-org", allowedJoinTypes: "human", defaultsPayload: { recipientEmail: "hidden@example.com" }, expiresAt: new Date("2027-01-01") },
    ]);
    const log = (inviteId: string, status: string, recipient: string, createdAt: string, scope = companyId) => ({ companyId: scope, actorType: "user", actorId: "inviter", action: "invite.email_delivery", entityType: "invite", entityId: inviteId, details: { status, recipient }, createdAt: new Date(createdAt) });
    await db.insert(activityLog).values([
      log(sentId, "unconfirmed", "sent@example.com", "2026-09-20T10:00:00Z"),
      log(sentId, "sent", "sent@example.com", "2026-09-20T11:00:00Z"),
      log(uncertainId, "unconfirmed", "legacy@example.com", "2026-09-20T12:00:00Z"),
      log(sentId, "unconfirmed", "wrong-org@example.com", "2026-09-21T12:00:00Z", otherCompanyId),
    ]);
    const response = await request(createApp(companyId)).get(`/api/companies/${companyId}/invites?limit=10`);
    expect(response.status).toBe(200);
    expect(response.body.invites).toHaveLength(3);
    const sent = response.body.invites.find((row: { id: string }) => row.id === sentId);
    expect(sent).toMatchObject({ state: "revoked", recipientEmail: "sent@example.com", emailDelivery: { status: "sent", recipient: "sent@example.com", attemptedAt: "2026-09-20T11:00:00.000Z" } });
    const uncertain = response.body.invites.find((row: { id: string }) => row.id === uncertainId);
    expect(uncertain).toMatchObject({ recipientEmail: "legacy@example.com", emailDelivery: { status: "unconfirmed" } });
    expect(response.body.invites.find((row: { id: string }) => row.id === linkId)).toMatchObject({ recipientEmail: null, emailDelivery: null });
    expect(JSON.stringify(response.body)).not.toContain("wrong-org@example.com");
    expect(JSON.stringify(response.body)).not.toContain("hidden@example.com");
  });

  it("returns invite history in descending pages with nextOffset", async () => {
    const inviteOneId = randomUUID();
    const inviteTwoId = randomUUID();
    const inviteThreeId = randomUUID();

    await db.insert(invites).values([
      {
        id: inviteOneId,
        companyId,
        inviteType: "company_join",
        tokenHash: "invite-token-1",
        allowedJoinTypes: "human",
        defaultsPayload: { humanRole: "viewer" },
        expiresAt: new Date("2026-04-20T00:00:00.000Z"),
        createdAt: new Date("2026-04-10T00:00:00.000Z"),
        updatedAt: new Date("2026-04-10T00:00:00.000Z"),
      },
      {
        id: inviteTwoId,
        companyId,
        inviteType: "company_join",
        tokenHash: "invite-token-2",
        allowedJoinTypes: "human",
        defaultsPayload: { humanRole: "operator" },
        expiresAt: new Date("2026-04-21T00:00:00.000Z"),
        createdAt: new Date("2026-04-11T00:00:00.000Z"),
        updatedAt: new Date("2026-04-11T00:00:00.000Z"),
      },
      {
        id: inviteThreeId,
        companyId,
        inviteType: "company_join",
        tokenHash: "invite-token-3",
        allowedJoinTypes: "human",
        defaultsPayload: { humanRole: "admin" },
        expiresAt: new Date("2026-04-22T00:00:00.000Z"),
        createdAt: new Date("2026-04-12T00:00:00.000Z"),
        updatedAt: new Date("2026-04-12T00:00:00.000Z"),
      },
    ]);

    await db.insert(joinRequests).values({
      id: randomUUID(),
      inviteId: inviteThreeId,
      companyId,
      requestType: "human",
      status: "pending_approval",
      requestIp: "127.0.0.1",
      requestEmailSnapshot: "person@example.com",
      createdAt: new Date("2026-04-12T00:05:00.000Z"),
      updatedAt: new Date("2026-04-12T00:05:00.000Z"),
    });

    const app = createApp(companyId);

    const firstPage = await request(app).get(`/api/companies/${companyId}/invites?limit=2`);

    expect(firstPage.status).toBe(200);
    expect(firstPage.body.invites).toHaveLength(2);
    expect(firstPage.body.invites.map((invite: { id: string }) => invite.id)).toEqual([inviteThreeId, inviteTwoId]);
    expect(firstPage.body.invites[0].relatedJoinRequestId).toBeTruthy();
    expect(firstPage.body.nextOffset).toBe(2);

    const secondPage = await request(app).get(`/api/companies/${companyId}/invites?limit=2&offset=2`);

    expect(secondPage.status).toBe(200);
    expect(secondPage.body.invites).toHaveLength(1);
    expect(secondPage.body.invites[0].id).toBe(inviteOneId);
    expect(secondPage.body.nextOffset).toBeNull();
  });
});
