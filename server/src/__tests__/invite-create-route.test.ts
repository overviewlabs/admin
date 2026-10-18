import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const logActivityMock = vi.fn();
const sendInvitationEmailMock = vi.fn();

function registerModuleMocks() {
  vi.doMock("../services/invitation-email.js", () => ({ sendInvitationEmail: (...args: unknown[]) => sendInvitationEmailMock(...args) }));
  vi.doMock("../services/index.js", () => ({
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
    logActivity: (...args: unknown[]) => logActivityMock(...args),
    notifyHireApproved: vi.fn(),
  }));
}

function createDbStub() {
  const createdInvite = {
    id: "invite-1",
    companyId: "company-1",
    inviteType: "company_join",
    allowedJoinTypes: "human",
    tokenHash: "hash",
    defaultsPayload: { human: { role: "viewer" } },
    expiresAt: new Date("2027-03-10T00:00:00.000Z"),
    invitedByUserId: null,
    revokedAt: null,
    acceptedAt: null,
    createdAt: new Date("2026-03-07T00:00:00.000Z"),
    updatedAt: new Date("2026-03-07T00:00:00.000Z"),
  };

  return {
    insert() {
      return {
        values(input: Record<string, unknown>) {
          return {
            returning() {
              return Promise.resolve([{ ...createdInvite, ...input }]);
            },
          };
        },
      };
    },
    select(_shape?: unknown) {
      return {
        from() {
          const query = {
            leftJoin() {
              return query;
            },
            where() {
              return Promise.resolve([{
                name: "Acme Robotics",
                logoAssetId: "logo-1",
              }]);
            },
          };
          return query;
        },
      };
    },
  };
}

async function createApp(authPublicBaseUrl?: string) {
  const [{ accessRoutes }, { errorHandler }] = await Promise.all([
    import("../routes/access.js"),
    import("../middleware/index.js"),
  ]);
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).actor = {
      type: "board",
      source: "local_implicit",
      userId: null,
      companyIds: ["company-1"],
    };
    next();
  });
  app.use(
    "/api",
    accessRoutes(createDbStub() as any, {
      deploymentMode: "local_trusted",
      deploymentExposure: "private",
      bindHost: "127.0.0.1",
      allowedHostnames: [],
      authPublicBaseUrl,
    }),
  );
  app.use(errorHandler);
  return app;
}

describe("POST /companies/:companyId/invites", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doUnmock("../services/index.js");
    vi.doUnmock("../routes/access.js");
    vi.doUnmock("../routes/authz.js");
    vi.doUnmock("../middleware/index.js");
    registerModuleMocks();
    vi.clearAllMocks();
    logActivityMock.mockReset();
    sendInvitationEmailMock.mockReset();
  });

  it("returns an absolute invite URL using the request base URL", async () => {
    const app = await createApp();

    const res = await request(app)
      .post("/api/companies/company-1/invites")
      .set("host", "whoxos.example")
      .set("x-forwarded-proto", "https")
      .send({
        allowedJoinTypes: "human",
        humanRole: "viewer",
      });

    expect(res.status).toBe(201);
    expect(res.body.companyName).toBe("Acme Robotics");
    expect(res.body.invitePath).toMatch(/^\/invite\/pcp_invite_/);
    expect(res.body.inviteUrl).toMatch(/^https:\/\/whoxos\.example\/invite\/pcp_invite_/);
  });
  it("sends an email with the persisted invitation's trusted public link", async () => {
    const app = await createApp("https://overviewlabs.ai");
    const response = await request(app).post("/api/companies/company-1/invites")
      .set("host", "untrusted.example").send({ allowedJoinTypes: "human", humanRole: "viewer", recipientEmail: "person@example.com" });
    expect(response.status).toBe(201);
    expect(response.body.emailDelivery).toEqual({ status: "sent", recipient: "person@example.com" });
    expect(sendInvitationEmailMock).toHaveBeenCalledWith(expect.objectContaining({ to: "person@example.com", inviteUrl: response.body.inviteUrl, companyName: "Acme Robotics", role: "viewer" }));
    expect(response.body.inviteUrl).toMatch(/^https:\/\/overviewlabs.ai\/invite\//);
  });
  it("persists the canonical recipient and prevents agent joins or caller metadata overrides", async () => {
    const app = await createApp("https://overviewlabs.ai");
    const response = await request(app).post("/api/companies/company-1/invites").send({
      allowedJoinTypes: "both", recipientEmail: " Person@Example.COM ",
      defaultsPayload: { recipientEmail: "attacker@example.com" },
    });
    expect(response.status).toBe(201);
    expect(response.body.recipientEmail).toBe("person@example.com");
    expect(response.body.allowedJoinTypes).toBe("human");
    const unbound = await request(app).post("/api/companies/company-1/invites").send({
      allowedJoinTypes: "human", defaultsPayload: { recipientEmail: "attacker@example.com" },
    });
    expect(unbound.body.recipientEmail).toBeNull();
  });
  it("preserves the invitation link when SMTP cannot confirm delivery without leaking credentials", async () => {
    sendInvitationEmailMock.mockRejectedValue(new Error("AUTH secret-password failed"));
    const app = await createApp("https://overviewlabs.ai");
    const response = await request(app).post("/api/companies/company-1/invites")
      .send({ allowedJoinTypes: "human", recipientEmail: "person@example.com" });
    expect(response.status).toBe(201); expect(response.body.emailDelivery.status).toBe("unconfirmed");
    expect(response.body.inviteUrl).toContain("https://overviewlabs.ai/invite/");
    expect(JSON.stringify(response.body)).not.toContain("secret-password");
    expect(sendInvitationEmailMock).toHaveBeenCalledTimes(1);
  });
  it("rejects invalid recipients and agent-only email invitations before sending", async () => {
    const app = await createApp("https://overviewlabs.ai");
    expect((await request(app).post("/api/companies/company-1/invites").send({ recipientEmail: "bad email" })).status).toBe(400);
    expect((await request(app).post("/api/companies/company-1/invites").send({ allowedJoinTypes: "agent", recipientEmail: "person@example.com" })).status).toBe(400);
    expect(sendInvitationEmailMock).not.toHaveBeenCalled();
  });

});
