import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { isUuidLike } from "@whoxos/shared";
import { z } from "zod";

export const REA_VERSION = "6.4.0";
export const REA_PACKAGE_ROOT = process.env.OVERVIEW_REA_PACKAGE_ROOT ??
  `/.WHOX/.System/overview-labs/tools/rea/${REA_VERSION}/node_modules`;
const stateRoot = process.env.OVERVIEW_REA_STATE_ROOT ??
  "/.WHOX/.System/overview-labs/home/.whox/rea";

export function reaEnabled(runtimeConfig: Record<string, unknown> | null | undefined) {
  return runtimeConfig?.reaMode === true;
}


type Tool = { name: string; description?: string; inputSchema: Record<string, unknown>; annotations?: { readOnlyHint?: boolean } };
type Result = { content?: unknown[]; isError?: boolean; [key: string]: unknown };
type Client = {
  connect(transport: unknown, options: { timeout: number }): Promise<void>;
  listTools(params?: { cursor: string }): Promise<{ tools: Tool[]; nextCursor?: string }>;
  callTool(params: { name: string; arguments: Record<string, unknown> }, options: { timeout: number }): Promise<Result>;
  close(): Promise<void>;
};
export type ReaSession = { tools: Tool[]; client: Client; close(): Promise<void> };

/** SDK comes from the same immutable, lockfile-backed REA installation as the server. */
export async function startReaSession(input: { companyId: string; agentId: string; runId: string }): Promise<ReaSession> {
  if (![input.companyId, input.agentId, input.runId].every(isUuidLike)) throw new Error("Invalid REA run identity");
  const home = path.join(stateRoot, input.companyId, input.agentId, input.runId);
  await fs.mkdir(home, { recursive: true, mode: 0o700 });
  const [{ Client }, { StdioClientTransport }] = await Promise.all([
    import(pathToFileURL(path.join(REA_PACKAGE_ROOT, "@modelcontextprotocol/client/dist/index.mjs")).href),
    import(pathToFileURL(path.join(REA_PACKAGE_ROOT, "@modelcontextprotocol/client/dist/stdio.mjs")).href),
  ]);
  // Do not pass database, provider or platform credentials to the analysis subprocess.
  const env: Record<string, string> = { HOME: home, XDG_CONFIG_HOME: path.join(home, ".config"),
    XDG_CACHE_HOME: path.join(home, ".cache"), PATH: process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin", LANG: "C.UTF-8" };
  for (const key of ["JAVA_HOME", "GHIDRA_INSTALL_DIR", "HOPPER_LAUNCHER_PATH", "REA_IDA_MCP_CONFIG", "PLAYWRIGHT_BROWSERS_PATH", "PLAYWRIGHT_HOST_PLATFORM_OVERRIDE"])
    if (process.env[key]) env[key] = process.env[key]!;
  const transport = new StdioClientTransport({ command: process.execPath,
    args: [path.join(REA_PACKAGE_ROOT, "rea-agents/scripts/rea.mjs"), "mcp"], env, cwd: home, stderr: "pipe" });
  transport.stderr?.resume();
  const client: Client = new Client({ name: "overview-labs-rea", version: "1" });
  try {
    await client.connect(transport, { timeout: 30_000 });
    const tools: Tool[] = [];
    let cursor: string | undefined;
    do { const page = await client.listTools(cursor ? { cursor } : undefined); tools.push(...page.tools); cursor = page.nextCursor; } while (cursor);
    return { client, tools, close: () => client.close() };
  } catch (error) { await client.close().catch(() => undefined); throw error; }
}

export function searchReaTools(tools: Tool[], query: string, limit = 5) {
  const words = query.toLowerCase().split(/\W+/).filter(Boolean);
  return tools.map(tool => ({ tool, score: words.reduce((n, word) =>
    n + (tool.name.toLowerCase().includes(word) ? 3 : 0) + ((tool.description ?? "").toLowerCase().includes(word) ? 1 : 0), 0) }))
    .filter(entry => !words.length || entry.score > 0).sort((a, b) => b.score - a.score)
    .slice(0, Math.min(10, Math.max(1, limit))).map(entry => entry.tool);
}

export function assertReaToolMode(tool: Tool | undefined, workMode: string) {
  if (!tool) throw new Error("Unknown REA tool; search the current catalog first");
  if (!["standard", "skill_test"].includes(workMode) && tool.annotations?.readOnlyHint !== true)
    throw new Error("This REA operation requires standard execution mode");
}

/** One ordered stateful REA session per company/agent/run; never share target state. */
export class ReaSessions {
  private sessions = new Map<string, { session: Promise<ReaSession>; queue: Promise<unknown> }>();
  constructor(private start = startReaSession) {}
  async use<T>(input: { companyId: string; agentId: string; runId: string }, fn: (session: ReaSession) => Promise<T>) {
    const key = `${input.companyId}/${input.agentId}/${input.runId}`;
    let entry = this.sessions.get(key);
    if (!entry) { entry = { session: this.start(input), queue: Promise.resolve() }; this.sessions.set(key, entry); }
    const current = entry;
    const result = current.queue.then(async () => fn(await current.session));
    current.queue = result.catch(() => undefined);
    try { return await result; }
    catch (error) {
      // A startup failure must be retryable without keeping a rejected promise.
      if (await current.session.then(() => false, () => true) && this.sessions.get(key) === current) this.sessions.delete(key);
      throw error;
    }
  }
  async close(runId: string) {
    await Promise.all([...this.sessions].filter(([key]) => key.endsWith(`/${runId}`)).map(async ([key, entry]) => {
      this.sessions.delete(key);
      await entry.session.then(session => session.close()).catch(() => undefined);
    }));
  }
}
export const reaSessions = new ReaSessions();

const searchInput = z.object({ query: z.string().max(500), limit: z.number().int().min(1).max(10).optional() }).strict();
const callInput = z.object({ name: z.string().min(1).max(200), arguments: z.record(z.string(), z.unknown()) }).strict();
export async function executeReaTool(input: { companyId: string; agentId: string; runId: string; workMode?: string }, name: string, value: unknown) {
  if (!reaToolDefinitions.some(tool => tool.name === name)) throw new Error("Unknown REA operation");
  const parsed = name === "rea_search_tools" ? searchInput.parse(value) : callInput.parse(value);
  return reaSessions.use(input, async session => {
    if ("query" in parsed) {
      const tools = searchReaTools(session.tools, parsed.query, parsed.limit);
      return { content: [{ type: "text", text: JSON.stringify({ tools }) }], structuredContent: { tools } };
    }
    assertReaToolMode(session.tools.find(tool => tool.name === parsed.name), input.workMode ?? "ask");
    return session.client.callTool(parsed, { timeout: 300_000 });
  });
}

export const reaToolDefinitions = [
  { name: "rea_search_tools", description: "Find REA reverse-engineering tools and their exact input schemas. Search by target, operation or tool name.", inputSchema: {
    type: "object", properties: { query: { type: "string" }, limit: { type: "integer", minimum: 1, maximum: 10 } }, required: ["query"], additionalProperties: false } },
  { name: "rea_call_tool", description: "Run a REA operation discovered through rea_search_tools. Returns original analysis evidence and errors; target session persists for this run.", inputSchema: {
    type: "object", properties: { name: { type: "string" }, arguments: { type: "object", additionalProperties: true } }, required: ["name", "arguments"], additionalProperties: false } },
];
