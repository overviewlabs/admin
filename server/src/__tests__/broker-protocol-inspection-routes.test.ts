import type { Request, Response } from "express";
import type { Db } from "@whoxos/db";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getConnection: vi.fn(), inspectProtocol: vi.fn(), hasPermission: vi.fn(), logActivity: vi.fn(),
  databaseAccess: vi.fn(() => { throw new Error("Unexpected database operation"); }),
}));
vi.mock("../services/index.js", () => ({
  toolAccessService: () => ({ getConnection: mocks.getConnection, inspectProtocol: mocks.inspectProtocol }),
  toolAccessPolicyService: () => ({}),
  accessService: () => ({ hasPermission: mocks.hasPermission }),
  logActivity: mocks.logActivity,
  vercelConnectIntegrationStatus: vi.fn(),
}));
vi.mock("../services/connection-intents.js", () => ({ connectionIntentService: () => ({}) }));
import { toolAccessRoutes } from "../routes/tool-access.js";

const companyId = "11111111-1111-4111-8111-111111111111";
const connectionId = "22222222-2222-4222-8222-222222222222";
const connection = { id: connectionId, companyId, createdByUserId: "creator", credentialPolicy: "shared", status: "active", enabled: true };
const evidence = { version: 1, kind: "provider_protocol_metadata", financialReadiness: "unverified",
  initialization: { status: "complete", metadata: { instructions: "PRIVATE PROVIDER TEXT" } },
  lists: { "tools/list": { status: "complete", pages: 1, items: [] } } };
function board(userId = "creator", membershipRole = "member"): Express.Request["actor"] {
  return { type: "board", userId, source: "session", companyIds: [companyId],
    memberships: [{ companyId, membershipRole, status: "active" }] } as Express.Request["actor"];
}

// Invoke the actual Express router directly: no listener/network or external DB.
async function invoke(actor: Express.Request["actor"], body: unknown = {}) {
  const db = { select: mocks.databaseAccess, insert: mocks.databaseAccess, update: mocks.databaseAccess } as unknown as Db;
  const router = toolAccessRoutes(db);
  const req = { method: "POST", url: `/tool-connections/${connectionId}/protocol-inspection`,
    headers: {}, body, actor } as Request;
  return new Promise<{ status: number; body: unknown }>((resolve, reject) => {
    const res = { statusCode: 200,
      status(status: number) { this.statusCode = status; return this; },
      json(value: unknown) { resolve({ status: this.statusCode, body: value }); return this; },
    } as unknown as Response;
    router.handle(req, res, error => {
      if (error) resolve({ status: error.status ?? (error.name === "ZodError" ? 400 : 500), body: { error: error.message } });
      else reject(new Error("Inspection route did not respond"));
    });
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getConnection.mockResolvedValue(connection);
  mocks.inspectProtocol.mockResolvedValue(evidence);
  mocks.hasPermission.mockResolvedValue(false);
  mocks.logActivity.mockResolvedValue(undefined);
});

describe("broker protocol inspection route authority", () => {
  it.each([
    { type: "none", source: "none" },
    { type: "agent", source: "agent_jwt", agentId: "agent", companyId },
    { type: "agent", source: "agent_key", agentId: "agent", companyId },
  ])("rejects non-Board actor $type/$source before connection or credential access", async actor => {
    expect((await invoke(actor as Express.Request["actor"])).status).toBe(403);
    expect(mocks.getConnection).not.toHaveBeenCalled();
    expect(mocks.inspectProtocol).not.toHaveBeenCalled();
    expect(mocks.databaseAccess).not.toHaveBeenCalled();
  });
  it("conceals cross-company connections and never invokes inspection", async () => {
    const result = await invoke({ ...board(), companyIds: ["different-company"] });
    expect(result.status).toBe(404);
    expect(result.body).toEqual({ error: "Tool connection not found" });
    expect(mocks.inspectProtocol).not.toHaveBeenCalled();
    expect(mocks.hasPermission).not.toHaveBeenCalled();
  });
  it("returns the same not-found response for an absent connection", async () => {
    mocks.getConnection.mockRejectedValueOnce(Object.assign(new Error("Tool connection not found"), { status: 404 }));
    expect(await invoke(board())).toEqual({ status: 404, body: { error: "Tool connection not found" } });
    expect(mocks.inspectProtocol).not.toHaveBeenCalled();
  });
  it("rejects viewers even when they created the connection", async () => {
    expect((await invoke(board("creator", "viewer"))).status).toBe(403);
    expect(mocks.inspectProtocol).not.toHaveBeenCalled();
    expect(mocks.hasPermission).not.toHaveBeenCalled();
  });
  it("rejects inactive membership and non-manager/non-creator users", async () => {
    const inactive = { ...board(), memberships: [{ companyId, membershipRole: "member", status: "suspended" }] } as Express.Request["actor"];
    expect((await invoke(inactive)).status).toBe(403);
    expect((await invoke(board("other-user"))).status).toBe(403);
    expect(mocks.inspectProtocol).not.toHaveBeenCalled();
    expect(mocks.databaseAccess).not.toHaveBeenCalled();
  });
  it.each(["creator", "connection-manager"])("allows %s under existing configure permissions and returns evidence", async userId => {
    mocks.hasPermission.mockResolvedValue(userId === "connection-manager");
    const result = await invoke(board(userId));
    expect(result).toEqual({ status: 200, body: evidence });
    expect(mocks.inspectProtocol).toHaveBeenCalledWith(connectionId, expect.objectContaining({ actorType: "user", actorId: userId }));
    expect(mocks.hasPermission).toHaveBeenCalledWith(companyId, "user", userId, "tools:manage_connections");
    const activity = mocks.logActivity.mock.calls[0]?.[1];
    expect(activity).toMatchObject({ companyId, action: "tool_connection.protocol_inspection", entityId: connectionId });
    expect(JSON.stringify(activity)).not.toContain("PRIVATE PROVIDER TEXT");
  });
  it("preserves local Board operator context without an impersonated user ID", async () => {
    const result = await invoke({ type: "board", source: "local_implicit" } as Express.Request["actor"]);
    expect(result.status).toBe(200);
    expect(mocks.inspectProtocol).toHaveBeenCalledWith(connectionId, expect.objectContaining({ actorType: "user", actorId: "board", actorSource: "local_implicit" }));
  });
  it("rejects caller methods, URLs and headers instead of expanding inspection scope", async () => {
    expect((await invoke(board(), { method: "tools/call", url: "https://invalid.example", headers: { Authorization: "other-token" } })).status).toBe(400);
    expect(mocks.inspectProtocol).not.toHaveBeenCalled();
    expect(mocks.getConnection).not.toHaveBeenCalled();
  });
  it("does not return evidence when service audit or activity logging fails", async () => {
    mocks.inspectProtocol.mockRejectedValueOnce(new Error("Audit unavailable"));
    const serviceFailure = await invoke(board());
    expect(serviceFailure.status).toBe(500);
    expect(serviceFailure.body).not.toEqual(evidence);
    expect(mocks.logActivity).not.toHaveBeenCalled();
    mocks.logActivity.mockRejectedValueOnce(new Error("Activity unavailable"));
    const activityFailure = await invoke(board());
    expect(activityFailure.status).toBe(500);
    expect(activityFailure.body).not.toEqual(evidence);
  });
});
