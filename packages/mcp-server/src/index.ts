import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { WHOXOSApiClient } from "./client.js";
import { readConfigFromEnv, type WHOXOSMcpConfig } from "./config.js";
import { createToolDefinitions } from "./tools.js";

export function createWHOXOSMcpServer(config: WHOXOSMcpConfig = readConfigFromEnv()) {
  const server = new McpServer({
    name: "whoxos",
    version: "0.1.0",
  });

  const client = new WHOXOSApiClient(config);
  const tools = createToolDefinitions(client);
  for (const tool of tools) {
    server.tool(tool.name, tool.description, tool.schema.shape, tool.execute);
  }

  return {
    server,
    tools,
    client,
  };
}

export async function runServer(config: WHOXOSMcpConfig = readConfigFromEnv()) {
  const { server } = createWHOXOSMcpServer(config);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
