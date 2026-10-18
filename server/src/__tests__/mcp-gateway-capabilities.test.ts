import express from "express";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mcpGatewayProtocolRoutes } from "../routes/tool-gateway.js";
import { ToolGatewayHttpError, type ToolGatewayService } from "../services/tool-gateway.js";

describe("MCP discovery follows the bearer action scope", () => {
  let server: Server;
  let url: string;
  let actions: string[] | undefined;
  let token: string;
  const initialize = vi.fn();
  const list = vi.fn();
  const context = vi.fn();

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use(mcpGatewayProtocolRoutes({
      initializeNamedGatewayProtocol: initialize,
      listToolsForNamedGateway: list,
      executeContextForNamedGateway: context,
    } as unknown as ToolGatewayService));
    server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp/gateways/test`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  });

  beforeEach(() => {
    token = `synthetic-test-${randomUUID()}`;
    actions = ["tools/list", "tools/call"];
    initialize.mockReset().mockImplementation(async () => ({ gatewayTokenAllowedActions: actions }));
    list.mockReset().mockResolvedValue([{ name: "existing_tool", displayName: "Existing tool", description: "Existing allowed tool" }]);
    context.mockReset().mockRejectedValue(new ToolGatewayHttpError(403, "Action denied", "gateway_token_action_denied"));
  });

  async function call(method: string, params?: unknown) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    return { status: response.status, body: await response.json() };
  }

  it("does not advertise resource or prompt operations to a tools-only bearer", async () => {
    expect((await call("initialize")).body.result.capabilities).toEqual({ tools: {} });
    const response = await call("tools/list");
    expect(response.status).toBe(200);
    expect(response.body.result.tools.map((tool: { name: string }) => tool.name)).toEqual(["existing_tool"]);
    expect(context).not.toHaveBeenCalled();
    expect(initialize).toHaveBeenCalledTimes(1);
  });

  it("authenticates discovery even when scope metadata was cached by initialize", async () => {
    await call("initialize");
    list.mockRejectedValue(new ToolGatewayHttpError(403, "Token revoked", "gateway_token_revoked"));
    const response = await call("tools/list");
    expect(response.status).toBe(403);
    expect(response.body.result).toBeUndefined();
    expect(initialize).toHaveBeenCalledTimes(1);
  });

  it("preserves all existing capabilities and wrappers for unrestricted sessions", async () => {
    actions = undefined;
    expect((await call("initialize")).body.result.capabilities).toEqual({ tools: {}, resources: {}, prompts: {} });
    expect((await call("tools/list")).body.result.tools.map((tool: { name: string }) => tool.name)).toEqual([
      "existing_tool", "whoxos_list_resources", "whoxos_read_resource", "whoxos_list_prompts", "whoxos_get_prompt",
    ]);
  });

  it("filters each context wrapper using its exact action", async () => {
    actions = ["tools/list", "tools/call", "resources/list", "prompts/get"];
    expect((await call("initialize")).body.result.capabilities).toEqual({ tools: {}, resources: {} });
    expect((await call("tools/list")).body.result.tools.map((tool: { name: string }) => tool.name)).toEqual([
      "existing_tool", "whoxos_list_resources", "whoxos_get_prompt",
    ]);
  });

  it("keeps the authoritative discovery denial if permission changes during the request", async () => {
    list.mockRejectedValue(new ToolGatewayHttpError(403, "Action denied", "gateway_token_action_denied"));
    const response = await call("tools/list");
    expect(response.status).toBe(403);
    expect(response.body.error.data.reasonCode).toBe("gateway_token_action_denied");
    expect(response.body.result).toBeUndefined();
  });

  it("keeps context execution authorization when a client forces an unadvertised tool", async () => {
    const response = await call("tools/call", { name: "whoxos_list_resources", arguments: {} });
    expect(response.status).toBe(403);
    expect(response.body.error.data.reasonCode).toBe("gateway_token_action_denied");
    expect(context).toHaveBeenCalledWith(expect.objectContaining({ method: "resources/list" }));
  });
});
