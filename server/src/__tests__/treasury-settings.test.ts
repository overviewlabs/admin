import express, { type Request } from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { TREASURY_COMPANY_ID, saveTreasurySettingsSchema } from "@whoxos/shared";
import { treasurySettingsOwner, treasurySettingsRoutes } from "../routes/treasury-settings.js";
import type { Db } from "@whoxos/db";

vi.mock("../services/activity-log.js", () => ({ persistActivity: vi.fn(async () => ({ publication: {} })), publishActivity: vi.fn() }));
const limits = { currency: "USD", totalCapitalCents: 100000, maximumTradeCents: 10000, dailyLossLimitCents: 5000,
  permittedAssetClasses: ["equity"], permittedSymbols: ["SPY"] };
const human: Request["actor"] = { type: "board", source: "session", userId: "user-a", companyIds: [TREASURY_COMPANY_ID], isInstanceAdmin: true };
const agent: Request["actor"] = { type: "agent", source: "agent_jwt", runId: "run", companyId: TREASURY_COMPANY_ID,
  agentId: "agent", onBehalfOfUserId: "user-a", onBehalfOfMemberships: [{ companyId: TREASURY_COMPANY_ID, status: "active", membershipRole: "member" }] };
function app(actor = human, execute = vi.fn(async () => [])) {
  const db = { execute, transaction: async (callback: (tx: unknown) => unknown) => callback({ execute }) } as unknown as Db;
  const app = express(); app.use(express.json()); app.use((req, _res, next) => { req.actor = actor; next(); });
  app.use(treasurySettingsRoutes(db));
  app.use((err: { status?: number; message: string }, _req: Request, res: express.Response, _next: express.NextFunction) => res.status(err.status ?? 500).json({ error: err.message }));
  return { app, execute };
}
const path = `/companies/${TREASURY_COMPANY_ID}/treasury/settings`;
describe("personal Treasury settings", () => {
  it("has no default capital and derives ownership from the session", async () => {
    const { app: api } = app();
    const response = await request(api).get(path + "?userId=user-b");
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ userId: "user-a", limits: null, revision: null, liveEnabled: false });
  });
  it("rejects agent mutations before reading or writing settings", async () => {
    const fixture = app(agent);
    expect((await request(fixture.app).put(path).send({ expectedRevision: null, limits })).status).toBe(403);
    expect(fixture.execute).not.toHaveBeenCalled();
  });
  it("rejects another organization and caller-selected ownership", async () => {
    const fixture = app();
    expect((await request(fixture.app).get("/companies/other/treasury/settings")).status).toBe(403);
    expect((await request(fixture.app).put(path).send({ expectedRevision: null, limits, userId: "user-b" })).status).toBe(400);
    expect(fixture.execute).not.toHaveBeenCalled();
  });
  it("requires positive exact cents, an explicit allowlist and limits within allocated capital", () => {
    const check = (changes: object) => saveTreasurySettingsSchema.safeParse({ expectedRevision: null, limits: { ...limits, ...changes } }).success;
    for (const change of [{ totalCapitalCents: 0 }, { maximumTradeCents: 1.5 }, { maximumTradeCents: 100001 },
      { dailyLossLimitCents: 100001 }, { permittedSymbols: [] }, { permittedAssetClasses: [] }, { permittedSymbols: ["*"] }, { liveEnabled: true }]) expect(check(change)).toBe(false);
    expect(check({ permittedSymbols: [" spy ", "SPY"] })).toBe(true);
  });
  it("refuses stale saves rather than overwriting a newer revision", async () => {
    const fixture = app();
    const response = await request(fixture.app).put(path).send({ expectedRevision: "a1e5d3c9-b0ac-45b3-863c-6936f630137d", limits });
    expect(response.status).toBe(409);
    expect(fixture.execute).toHaveBeenCalledTimes(1);
  });
  it("saves a human's personal settings without enabling trading", async () => {
    const execute = vi.fn(async () => [{ revision: "fixture", limits, updated_at: new Date("2026-10-11T00:00:00Z") }]);
    const fixture = app(human, execute as ReturnType<typeof vi.fn>);
    const response = await request(fixture.app).put(path).send({ expectedRevision: null, limits });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ userId: "user-a", limits, liveEnabled: false });
    expect(response.body.revision).toMatch(/^[a-f0-9-]{36}$/);
  });
  it("uses a verified active responsible user and rejects mismatched, viewer and static-key identities", () => {
    expect(treasurySettingsOwner(agent, { responsible_user_id: "user-a", status: "running" })).toBe("user-a");
    for (const run of [{ responsible_user_id: "user-b", status: "running" }, { responsible_user_id: "user-a", status: "succeeded" }])
      expect(() => treasurySettingsOwner(agent, run)).toThrow();
    expect(() => treasurySettingsOwner({ ...agent, source: "agent_key" }, { responsible_user_id: "user-a", status: "running" })).toThrow();
    expect(() => treasurySettingsOwner({ ...agent, onBehalfOfMemberships: [] }, { responsible_user_id: "user-a", status: "running" })).toThrow();
    expect(() => treasurySettingsOwner({ ...human, source: "board_key" })).toThrow();
  });
});
