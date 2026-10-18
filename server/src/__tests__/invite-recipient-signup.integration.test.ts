import { accessRoutes } from "../routes/access.js";
import { errorHandler } from "../middleware/error-handler.js";
import { createHash } from "node:crypto";
import express from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { authUsers, companies, companyMemberships, joinRequests, invites, createDb, closeRegisteredClients } from "@whoxos/db";
import { eq } from "drizzle-orm";
import { getEmbeddedPostgresTestSupport, startEmbeddedPostgresTestDatabase } from "./helpers/embedded-postgres.js";
import { createBetterAuthHandler, createBetterAuthInstance, resolveBetterAuthSession } from "../auth/better-auth.js";
import { inviteOnlySignup } from "../middleware/invite-only-signup.js";
import type { Config } from "../config.js";

const ORIGIN = "http://127.0.0.1:41999";
const TOKEN = "pcp_invite_recipient_integration_test";
const support = await getEmbeddedPostgresTestSupport();
(support.supported ? describe : describe.skip)("recipient-bound signup with real authentication and database", () => {
  let database: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>>;
  let db: ReturnType<typeof createDb>;
  let app: express.Express;
  let inviteId: string;
  let invitedCookie: string;
  let invitedUserId: string;
  const oldSecret = process.env.BETTER_AUTH_SECRET;
  const oldRateLimit = process.env.WHOXOS_AUTH_RATE_LIMIT_ENABLED;
  beforeAll(async () => {
    process.env.BETTER_AUTH_SECRET = "recipient-signup-integration-secret-for-tests";
    process.env.WHOXOS_AUTH_RATE_LIMIT_ENABLED = "false";
    database = await startEmbeddedPostgresTestDatabase("recipient-signup-");
    db = createDb(database.connectionString);
    const [company] = await db.insert(companies).values({ name: "Invitation test", issuePrefix: "INV" }).returning();
    const [invite] = await db.insert(invites).values({
      companyId: company.id, tokenHash: createHash("sha256").update(TOKEN).digest("hex"),
      allowedJoinTypes: "human", defaultsPayload: { recipientEmail: "invited@example.com", human: { role: "viewer" } },
      expiresAt: new Date(Date.now() + 60_000),
    }).returning();
    inviteId = invite.id;
    const auth = createBetterAuthInstance(db, {
      deploymentMode: "authenticated", deploymentExposure: "private", authBaseUrlMode: "explicit",
      authPublicBaseUrl: ORIGIN, authDisableSignUp: false, allowedHostnames: ["127.0.0.1"], port: 41999,
    } as Config, [ORIGIN]);
    app = express();
    app.use(express.json());
    app.use("/api/auth", inviteOnlySignup(db));
    app.all("/api/auth/{*authPath}", createBetterAuthHandler(auth));
    app.use(async (req, _res, next) => {
      const session = await resolveBetterAuthSession(auth, req);
      req.actor = session ? { type: "board", source: "session", userId: session.user.id, companyIds: [] } : { type: "none" };
      next();
    });
    app.use("/api", accessRoutes(db, { deploymentMode: "authenticated", deploymentExposure: "private", bindHost: "127.0.0.1", allowedHostnames: [] }));
    app.use(errorHandler);
  }, 30_000);
  afterAll(async () => {
    if (database) { await closeRegisteredClients(database.connectionString); await database.cleanup(); }
    if (oldSecret === undefined) delete process.env.BETTER_AUTH_SECRET; else process.env.BETTER_AUTH_SECRET = oldSecret;
    if (oldRateLimit === undefined) delete process.env.WHOXOS_AUTH_RATE_LIMIT_ENABLED; else process.env.WHOXOS_AUTH_RATE_LIMIT_ENABLED = oldRateLimit;
  });
  const signup = (email: string, token = TOKEN) => request(app).post("/api/auth/sign-up/email").set("origin", ORIGIN)
    .send({ email, password: "correct-horse-battery-staple", name: "Invited", inviteToken: token });
  it("blocks changed emails, plus aliases, missing tokens before creating accounts", async () => {
    for (const email of ["attacker@example.com", "invited+other@example.com"]) {
      expect((await signup(email)).status).toBe(403);
    }
    expect((await signup("invited@example.com", "")).status).toBe(403);
    expect(await db.select().from(authUsers)).toHaveLength(0);
    expect((await db.select().from(invites))[0].acceptedAt).toBeNull();
  });
  it("creates and signs in only the invited account with the chosen password", async () => {
    const result = await signup("Invited@Example.COM");
    expect(result.status).toBe(200);
    expect(result.body.user.email).toBe("invited@example.com");
    invitedCookie = (result.headers["set-cookie"] as unknown as string[]).map(cookie => cookie.split(";")[0]).join("; ");
    invitedUserId = result.body.user.id;
    expect(result.headers["set-cookie"]).toBeTruthy();
    expect(await db.select().from(authUsers)).toHaveLength(1);
    const login = await request(app).post("/api/auth/sign-in/email").set("origin", ORIGIN)
      .send({ email: "invited@example.com", password: "correct-horse-battery-staple" });
    expect(login.status).toBe(200);
  });
  it("rejects a real session for another email without consuming the invite, then grants only the recipient membership", async () => {
    const otherToken = "pcp_invite_other_recipient_test";
    const [original] = await db.select().from(invites).where(eq(invites.id, inviteId));
    await db.insert(invites).values({ companyId: original.companyId,
      tokenHash: createHash("sha256").update(otherToken).digest("hex"), allowedJoinTypes: "human",
      defaultsPayload: { recipientEmail: "other@example.com" }, expiresAt: new Date(Date.now() + 60_000) });
    const other = await signup("other@example.com", otherToken);
    expect(other.status).toBe(200);
    const otherCookie = (other.headers["set-cookie"] as unknown as string[]).map(cookie => cookie.split(";")[0]).join("; ");
    const denied = await request(app).post(`/api/invites/${TOKEN}/accept`).set("cookie", otherCookie)
      .send({ requestType: "human", email: "invited@example.com" });
    expect(denied.status).toBe(403);
    expect(await db.select().from(companyMemberships)).toHaveLength(0);
    expect(await db.select().from(joinRequests)).toHaveLength(0);
    expect((await db.select().from(invites).where(eq(invites.id, inviteId)))[0].acceptedAt).toBeNull();
    const accepted = await request(app).post(`/api/invites/${TOKEN}/accept`).set("cookie", invitedCookie)
      .send({ requestType: "human" });
    expect(accepted.status).toBe(202);
    expect(accepted.body.status).toBe("approved");
    const memberships = await db.select().from(companyMemberships);
    expect(memberships).toHaveLength(1);
    expect(memberships[0]).toMatchObject({ principalId: invitedUserId, membershipRole: "viewer", status: "active" });
    expect((await request(app).post(`/api/invites/${TOKEN}/accept`).set("cookie", otherCookie).send({ requestType: "human" })).status).toBe(403);
  });
  it("does not allow signup against revoked, expired or consumed invitations", async () => {
    for (const patch of [{ revokedAt: new Date() }, { revokedAt: null, expiresAt: new Date(0) }, { expiresAt: new Date(Date.now() + 60_000), acceptedAt: new Date() }]) {
      await db.update(invites).set(patch).where(eq(invites.id, inviteId));
      expect((await signup("invited@example.com")).status).toBe(403);
    }
  });
});
