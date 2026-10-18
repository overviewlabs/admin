import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { agents, heartbeatRuns } from "@whoxos/db";
import { createLocalAgentJwt } from "../agent-auth-jwt.js";
import { startRunnerApiTestServer } from "./helpers/runner-api-server.js";
import { getEmbeddedPostgresTestSupport } from "./helpers/embedded-postgres.js";
import { resolveConnectorAssignments, applyConnectorSkills, executeConnectorTool } from "../services/connector-runtime.js";
import { reaSessions } from "../services/rea-runtime.js";

const support = await getEmbeddedPostgresTestSupport();
(support.supported ? describe : describe.skip)("REA company/run integration", () => {
  let server: Awaited<ReturnType<typeof startRunnerApiTestServer>>;
  const originalSecret = process.env.WHOXOS_AGENT_JWT_SECRET;
  beforeAll(async () => { process.env.WHOXOS_AGENT_JWT_SECRET = randomUUID(); server = await startRunnerApiTestServer(); }, 60_000);
  afterAll(async () => { await server?.close(); if (originalSecret === undefined) delete process.env.WHOXOS_AGENT_JWT_SECRET; else process.env.WHOXOS_AGENT_JWT_SECRET = originalSecret; });
  it("delivers the opt-in skill and native tools, rejects other companies and revokes retained access", async () => {
    const f = await server.fixture();
    expect((await resolveConnectorAssignments(server.db, f)).some(x => x.key === "rea")).toBe(false);
    await server.db.update(agents).set({ runtimeConfig: { reaMode: true } }).where(eq(agents.id, f.agentId));
    const assignments = await resolveConnectorAssignments(server.db, f);
    const rea = assignments.find(x => x.key === "rea")!;
    expect(rea.tools.map(t => t.name)).toEqual(["rea_search_tools", "rea_call_tool"]);
    const config = await applyConnectorSkills({}, [], [rea]);
    expect(config.whoxosRuntimeSkills).toContainEqual(expect.objectContaining({ runtimeName: "rea", sourceStatus: "available" }));
    expect((await resolveConnectorAssignments(server.db, { ...f, companyId: f.foreignCompanyId })).some(x => x.key === "rea")).toBe(false);
    await server.db.update(agents).set({ runtimeConfig: { reaMode: false } }).where(eq(agents.id, f.agentId));
    await expect(executeConnectorTool(server.db, f, "rea_search_tools", { query: "javascript" })).rejects.toThrow("no longer assigned");
  });
  it("exposes live REA only to enabled, active task-bound run credentials", async () => {
    const f = await server.fixture();
    const token = createLocalAgentJwt(f.agentId, f.companyId, "whoxos_runner", f.runId, f.responsibleUserId)!;
    const request = (tokenValue: string | null, method = "tools/list", params?: unknown) => fetch(`${server.apiUrl}/api/mcp/rea`, {
      method: "POST", headers: { ...(tokenValue ? { Authorization: `Bearer ${tokenValue}` } : {}), "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    expect([401, 403]).toContain((await request(null)).status);
    expect((await request(token)).status).toBe(403);
    await server.db.update(agents).set({ runtimeConfig: { reaMode: true } }).where(eq(agents.id, f.agentId));
    const list = await request(token);
    expect(list.status).toBe(200);
    expect((await list.json()).result.tools.map((t: { name: string }) => t.name)).toContain("rea_call_tool");
    // Actual installed REA server, not a fake tool catalog.
    const search = await request(token, "tools/call", { name: "rea_search_tools", arguments: { query: "analyze_javascript_application", limit: 1 } });
    const result = await search.json();
    expect(result.result.isError, JSON.stringify(result)).not.toBe(true);
    expect(result.result.structuredContent.tools[0].name).toBe("analyze_javascript_application");
    await writeFile(path.join(f.workspace, "sample.mjs"), 'export function shippingCost(quantity) { return quantity > 10 ? 0 : 5; }\n');
    const analysis = await request(token, "tools/call", { name: "rea_call_tool", arguments: { name: "analyze_javascript_application", arguments: { input_path: f.workspace, detail: "summary" } } });
    const evidence = await analysis.json();
    expect(evidence.result.isError, JSON.stringify(evidence)).not.toBe(true);
    expect(evidence.result.content.length).toBeGreaterThan(0);
    await server.db.update(agents).set({ runtimeConfig: { reaMode: false } }).where(eq(agents.id, f.agentId));
    expect((await request(token)).status).toBe(403);
    await server.db.update(agents).set({ runtimeConfig: { reaMode: true } }).where(eq(agents.id, f.agentId));
    await server.db.update(heartbeatRuns).set({ status: "succeeded", finishedAt: new Date() }).where(eq(heartbeatRuns.id, f.runId));
    expect((await request(token)).status).toBe(403);
    await reaSessions.close(f.runId);
  }, 30_000);
});
