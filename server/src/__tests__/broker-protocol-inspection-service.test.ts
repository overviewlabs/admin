import { randomUUID } from "node:crypto";
import type { Db } from "@whoxos/db";
import { toolConnections, toolAccessAuditEvents, toolRuntimeMetricCounters } from "@whoxos/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toolAccessService } from "../services/tool-access.js";

const actor = { actorType: "user" as const, actorId: "board-user", actorSource: "board_key" as const };

function harness(options: { failAction?: string; patch?: Record<string, unknown> } = {}) {
  const connection = {
    id: randomUUID(), companyId: randomUUID(), applicationId: randomUUID(), uid: "fixture-broker",
    name: "Fixture Broker", transport: "mcp_remote", authKind: "none", credentialPolicy: "shared",
    connectionPurpose: "tools", credentialSource: "whoxos_vault", status: "active", enabled: true,
    config: { url: "https://fixture-broker.example/mcp" }, credentialRefs: [], credentialSecretRefs: [],
    ...options.patch,
  };
  const receipts: Record<string, unknown>[] = [];
  const metricWrites: unknown[] = [];
  const insert = vi.fn((table: unknown) => ({ values: (value: Record<string, unknown>) => {
    if (table === toolAccessAuditEvents) {
      receipts.push(value);
      return options.failAction === value.action ? Promise.reject(new Error("Audit unavailable")) : Promise.resolve();
    }
    if (table === toolRuntimeMetricCounters) return { onConflictDoUpdate: async () => { metricWrites.push(value); } };
    throw new Error("Unexpected insert");
  } }));
  const select = vi.fn(() => ({ from: (table: unknown) => {
    if (table !== toolConnections) throw new Error("Unexpected credential/grant database read");
    return { where: async () => [connection] };
  } }));
  const update = vi.fn(() => { throw new Error("Inspection must not mutate grants/configuration"); });
  const remote = vi.fn(async (_url: string, init: RequestInit) => {
    const rpc = JSON.parse(String(init.body));
    if (rpc.method === "notifications/initialized") return new Response(null, { status: 202 });
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: rpc.id, result: rpc.method === "initialize" ? {
      protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "fixture", version: "1" },
      instructions: "PRIVATE PROVIDER TEXT",
    } : { tools: [] } }));
  });
  const db = { select, insert, update } as unknown as Db;
  const service = toolAccessService(db, { remoteHttpRequest: remote,
    remoteHttpEndpointLookup: async () => [{ address: "8.8.8.8", family: 4 }], vercelConnectClient: null });
  return { connection, receipts, metricWrites, insert, select, update, remote, service };
}

beforeEach(() => vi.restoreAllMocks());

describe("broker inspection service audit boundary", () => {
  it("fails before transport when the start audit cannot persist", async () => {
    const h = harness({ failAction: "tool_connection.protocol_inspection_started" });
    await expect(h.service.inspectProtocol(h.connection.id, actor)).rejects.toThrow("Audit unavailable");
    expect(h.remote).not.toHaveBeenCalled();
    expect(h.metricWrites).toHaveLength(1);
    expect(h.update).not.toHaveBeenCalled();
  });
  it("start-audit failure also prevents vault credential access", async () => {
    const h = harness({ failAction: "tool_connection.protocol_inspection_started", patch: {
      authKind: "api_key", credentialRefs: [{ secretId: randomUUID(), placement: "header", key: "Authorization", prefix: "Bearer " }],
    } });
    await expect(h.service.inspectProtocol(h.connection.id, actor)).rejects.toThrow("Audit unavailable");
    expect(h.select).toHaveBeenCalledTimes(1); // connection only; no secret/grant read
    expect(h.remote).not.toHaveBeenCalled();
    expect(h.metricWrites).toHaveLength(1);
  });
  it("withholds collected evidence when the completion audit cannot persist", async () => {
    const h = harness({ failAction: "tool_connection.protocol_inspection" });
    await expect(h.service.inspectProtocol(h.connection.id, actor)).rejects.toThrow("Audit unavailable");
    expect(h.remote).toHaveBeenCalledTimes(3);
    expect(h.metricWrites).toHaveLength(1);
    expect(h.update).not.toHaveBeenCalled();
  });
  it("uses the normal guarded request seam, writes minimal receipts and does not update connection/catalog state", async () => {
    const h = harness();
    const e = await h.service.inspectProtocol(h.connection.id, actor);
    expect(e.financialReadiness).toBe("unverified");
    expect(h.remote.mock.calls.map(([, init]) => JSON.parse(String(init.body)).method)).toEqual(["initialize", "notifications/initialized", "tools/list"]);
    expect(h.receipts.map(receipt => receipt.action)).toEqual(["tool_connection.protocol_inspection_started", "tool_connection.protocol_inspection"]);
    for (const receipt of h.receipts) {
      expect(receipt).toMatchObject({ companyId: h.connection.companyId, connectionId: h.connection.id, actorType: "user", actorId: "board-user" });
      expect(JSON.stringify(receipt)).not.toMatch(/PRIVATE PROVIDER TEXT|fixture-broker\.example/);
    }
    expect(h.update).not.toHaveBeenCalled();
  });
  it("denies non-user service callers before any database or transport operation", async () => {
    const h = harness();
    await expect(h.service.inspectProtocol(h.connection.id, { actorType: "agent", actorId: "agent" })).rejects.toThrow("Board access");
    expect(h.select).not.toHaveBeenCalled();
    expect(h.insert).not.toHaveBeenCalled();
    expect(h.remote).not.toHaveBeenCalled();
  });
  it.each([{ enabled: false }, { status: "archived" }, { status: "draft" }, { transport: "local_stdio" }, { connectionPurpose: "ai" }])("denies unsupported or inactive connections before credentials/transport: %j", async patch => {
    const h = harness({ patch });
    await expect(h.service.inspectProtocol(h.connection.id, actor)).rejects.toThrow();
    expect(h.select).toHaveBeenCalledTimes(1);
    expect(h.insert).not.toHaveBeenCalled();
    expect(h.remote).not.toHaveBeenCalled();
  });
});
