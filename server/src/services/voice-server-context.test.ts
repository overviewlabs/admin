import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request } from "express";
import type { Db } from "@whoxos/db";
vi.mock("./production-root.js", () => ({ assertProductionRootExecution: vi.fn(), callRootExecutor: vi.fn() }));
vi.mock("./server-monitor.js", () => ({ getServerMonitor: vi.fn() }));
import { assertProductionRootExecution, callRootExecutor } from "./production-root.js";
import { getServerMonitor } from "./server-monitor.js";
import { readVoiceServerContext } from "./voice-server-context.js";
const scope = { companyId: "main", agentId: "ceo", userId: "owner" };
const req = { actor: { type: "board", userId: "owner" } } as Request;
describe("voice server context", () => {
  beforeEach(() => { vi.resetAllMocks(); vi.mocked(callRootExecutor).mockResolvedValue({ available: true, enabled: true }); });
  it("returns all organizations and distinguishes active count from total", async () => {
    const rows = [{ id: "main", name: "WHOXOS", status: "active" }, { id: "treasury", name: "Treasury", status: "active" }, { id: "old", name: "Old", status: "archived" }];
    const db = { select: vi.fn(() => ({ from: () => ({ orderBy: async () => rows }) })) } as unknown as Db;
    const result = await readVoiceServerContext(db, req, scope, "get_server_context");
    expect(result).toMatchObject({ scope: "server", totalOrganizations: 3, activeOrganizations: 2, organizations: rows });
    expect(assertProductionRootExecution).toHaveBeenCalledWith(db, req, "main", "ceo", true);
    expect(callRootExecutor).toHaveBeenCalledTimes(2);
  });
  it("returns bounded cross-organization summaries using explicit field projections", async () => {
    const batches = [[{ id: "treasury", name: "Treasury", status: "active" }], Array.from({ length: 101 }, (_, id) => ({ id: String(id), name: "Agent" })), [{ id: "task", title: "Research" }], []];
    const select = vi.fn((_projection: unknown) => ({ from: () => ({ where: () => { const rows = batches.shift()!; return Object.assign(Promise.resolve(rows), { limit: async () => rows }); } }) }));
    const result = await readVoiceServerContext({ select } as unknown as Db, req, scope, "get_server_organization", "treasury") as any;
    expect(result.organization.name).toBe("Treasury");
    expect(result.agents).toHaveLength(100);
    expect(result.truncated).toBe(true);
    for (const [projection] of select.mock.calls as any) {
      expect(projection).toBeDefined();
      expect(Object.keys(projection)).not.toEqual(expect.arrayContaining(["adapterConfig"]));
    }
  });
  it("rejects mismatched speakers before checking or reading anything", async () => {
    await expect(readVoiceServerContext({} as Db, req, { ...scope, userId: "other" }, "get_server_context")).rejects.toMatchObject({ status: 403 });
    expect(assertProductionRootExecution).not.toHaveBeenCalled();
  });
  it("honors tenant, human role and active agent authorization failures", async () => {
    vi.mocked(assertProductionRootExecution).mockRejectedValue({ status: 403 });
    await expect(readVoiceServerContext({} as Db, req, scope, "get_server_health")).rejects.toMatchObject({ status: 403 });
    expect(getServerMonitor).not.toHaveBeenCalled();
  });
  it("refuses disabled production grants", async () => {
    vi.mocked(callRootExecutor).mockResolvedValue({ available: true, enabled: false });
    await expect(readVoiceServerContext({} as Db, req, scope, "get_server_health")).rejects.toMatchObject({ status: 403 });
    expect(getServerMonitor).not.toHaveBeenCalled();
  });
  it("withholds telemetry if the grant is revoked during the read", async () => {
    vi.mocked(callRootExecutor).mockResolvedValueOnce({ available: true, enabled: true }).mockResolvedValueOnce({ available: true, enabled: false });
    vi.mocked(getServerMonitor).mockResolvedValue({ sampledAt: "now" } as any);
    await expect(readVoiceServerContext({} as Db, req, scope, "get_server_health")).rejects.toMatchObject({ status: 403 });
  });
});
