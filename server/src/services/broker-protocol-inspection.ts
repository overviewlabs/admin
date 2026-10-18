import { initializeMcpHttpSession, mcpHttpRequestHeaders, parseMcpHttpResponseBody } from "./mcp-http.js";

// Operator-only implementation. The sender must be the existing guarded
// connection transport after Board/company/connection authorization and normal
// credential resolution. This helper does not resolve credentials or fetch URLs.
type ListMethod = "tools/list" | "resources/list" | "prompts/list";
const LISTS = ["tools/list", "resources/list", "prompts/list"] as const;
const ALLOWED = new Set<string>(["initialize", "notifications/initialized", ...LISTS]);
const MAX_BYTES = 1024 * 1024;
const MAX_PAGES = 16;
const MAX_ITEMS = 2048;
const MAX_CURSOR_LENGTH = 16_384;
const MAX_TOTAL_INPUT_BYTES = 4 * 1024 * 1024;
const MAX_EVIDENCE_BYTES = 1024 * 1024;
const MAX_SCHEMA_NODES = 16_384;
const MAX_DURATION_MS = 30_000;
type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type Failure = { kind: "http" | "provider" | "invalid_response" | "transport" | "limit" | "deadline"; httpStatus: number | null; providerCode: number | null };
type ListEvidence = {
  status: "not_advertised" | "complete" | "incomplete" | "error";
  pages: number;
  items: Json[];
  failure?: Failure;
};
export type ProtocolEvidence = {
  version: 1;
  kind: "provider_protocol_metadata";
  financialReadiness: "unverified";
  initialization: { status: "complete"; metadata: Json } | { status: "error"; failure: Failure };
  lists: Record<ListMethod, ListEvidence>;
};

class ProtocolFailure extends Error {
  constructor(readonly evidence: Failure) { super("MCP protocol inspection failed"); }
}
function fail(kind: Failure["kind"], httpStatus: number | null = null, providerCode: number | null = null): never {
  throw new ProtocolFailure({ kind, httpStatus, providerCode });
}
function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function failure(error: unknown): Failure {
  return error instanceof ProtocolFailure ? error.evidence : { kind: "transport", httpStatus: null, providerCode: null };
}

class InspectionBudget {
  private outputBytes = 4096; // reserve the fixed envelope and all failure receipts
  private constructionBytes = 0;
  private nodes = 0;
  private inputBytes = 0;
  private exhausted = false;
  readonly controller = new AbortController();
  private readonly expiresAt: number;
  private timer!: ReturnType<typeof setTimeout>;
  private readonly deadline: Promise<never>;
  constructor(durationMs: number) {
    this.expiresAt = performance.now() + durationMs;
    this.deadline = new Promise<never>((_, reject) => {
      this.timer = setTimeout(() => {
        this.controller.abort();
        reject(new ProtocolFailure({ kind: "deadline", httpStatus: null, providerCode: null }));
      }, durationMs);
    });
    // The global deadline may fire between individual awaits.
    void this.deadline.catch(() => {});
  }
  check() {
    if (this.controller.signal.aborted || performance.now() >= this.expiresAt) fail("deadline");
    if (this.exhausted) fail("limit");
  }
  async wait<T>(promise: Promise<T>): Promise<T> {
    this.check();
    return Promise.race([promise, this.deadline]);
  }
  private limit() { this.exhausted = true; fail("limit"); }
  input(bytes: number) {
    this.check();
    this.inputBytes += bytes;
    if (this.inputBytes > MAX_TOTAL_INPUT_BYTES) this.limit();
  }
  reserve(value: Json) {
    this.check();
    this.outputBytes += Buffer.byteLength(JSON.stringify(value)) + 1; // array separator
    if (this.outputBytes > MAX_EVIDENCE_BYTES) this.limit();
  }
  text(value: string | null) {
    this.check();
    if (value !== null) this.constructionBytes += Buffer.byteLength(value);
    // Charge free-text expansion during construction, before a whole schema
    // descriptor is materialized and serialized by reserve().
    if (this.constructionBytes > MAX_EVIDENCE_BYTES) this.limit();
  }
  visitSchema() {
    this.check();
    if (++this.nodes > MAX_SCHEMA_NODES) this.limit();
  }
  close() { clearTimeout(this.timer); this.controller.abort(); }
}

function cancelBody(response: Response) {
  // Cancellation can itself stall in a malicious stream; never await it.
  void response.body?.cancel().catch(() => {});
}

// Free text is untrusted metadata. Do not retain URLs, account identifiers,
// email addresses, header credentials, tokens, examples, defaults or error data.
function scrubber(sensitive: string[]) {
  const secrets = sensitive.filter(Boolean).sort((a, b) => b.length - a.length);
  return (value: unknown): string | null => {
    if (typeof value !== "string") return null;
    let text = value;
    for (const secret of secrets) text = text.split(secret).join("[redacted]");
    text = text
      .replace(/(?:https?|wss?|file):\/\/[^\s<>"']+/gi, "[url redacted]")
      .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, "[email redacted]")
      .replace(/\b(?:Bearer|Basic)\s+\S+/gi, "[credential redacted]")
      .replace(/\b(?:account(?:[_ -]?(?:id|number))?|token|secret|password|api[_ -]?key|authorization)\s*[:=]\s*[^\s,;]+/gi, "[sensitive field redacted]")
      .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "[identifier redacted]")
      .replace(/\b[A-Za-z0-9_+/=-]{32,}\b/g, "[identifier redacted]")
      .replace(/\b\d{6,}\b/g, "[identifier redacted]")
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "");
    return text.slice(0, 8192);
  };
}

type Scrub = ReturnType<typeof scrubber>;
function schemaShape(raw: unknown, scrub: Scrub, budget: InspectionBudget, depth = 0): Json {
  budget.visitSchema();
  const source = record(raw);
  if (!source || depth >= 8) return null;
  const out: Record<string, Json> = {};
  const types = new Set(["null", "boolean", "object", "array", "number", "integer", "string"]);
  if (typeof source.type === "string" && types.has(source.type)) out.type = source.type;
  if (Array.isArray(source.type)) out.type = source.type.filter((v): v is string => typeof v === "string" && types.has(v));
  if (typeof source.description === "string") out.description = scrub(source.description);
  const properties = record(source.properties);
  if (properties) out.properties = Object.fromEntries(Object.entries(properties).slice(0, 128)
    .map(([name, child]) => [scrub(name) ?? "[redacted]", schemaShape(child, scrub, budget, depth + 1)]));
  if (Array.isArray(source.required)) out.required = source.required.filter(v => typeof v === "string").slice(0, 128).map(v => scrub(v));
  if (source.items) out.items = schemaShape(source.items, scrub, budget, depth + 1);
  for (const key of ["oneOf", "anyOf", "allOf"] as const) {
    if (Array.isArray(source[key])) out[key] = source[key].slice(0, 32).map(child => schemaShape(child, scrub, budget, depth + 1));
  }
  if (typeof source.additionalProperties === "boolean") out.additionalProperties = source.additionalProperties;
  // This is intentionally a sanitized shape, not a callable JSON schema.
  return out;
}
function descriptor(raw: unknown, method: ListMethod, scrub: Scrub, budget: InspectionBudget): Json {
  budget.check();
  const source = record(raw);
  if (!source || typeof source.name !== "string") fail("invalid_response");
  const out: Record<string, Json> = { name: scrub(source.name), title: scrub(source.title), description: scrub(source.description) };
  if (method === "tools/list") {
    out.inputSchemaPresent = record(source.inputSchema) !== null;
    out.outputSchemaPresent = record(source.outputSchema) !== null;
    out.inputSchemaShape = schemaShape(source.inputSchema, scrub, budget);
    out.outputSchemaShape = schemaShape(source.outputSchema, scrub, budget);
    const annotations = record(source.annotations);
    if (annotations) out.annotations = Object.fromEntries(["readOnlyHint", "destructiveHint", "idempotentHint", "openWorldHint"]
      .filter(key => typeof annotations[key] === "boolean").map(key => [key, annotations[key] as boolean]));
  } else if (method === "resources/list") {
    out.uriPresent = typeof source.uri === "string";
    out.mimeType = scrub(source.mimeType);
  } else if (Array.isArray(source.arguments)) {
    out.arguments = source.arguments.slice(0, 128).map(rawArgument => {
      const arg = record(rawArgument);
      return { name: scrub(arg?.name), description: scrub(arg?.description), required: arg?.required === true };
    });
  }
  return out;
}

// Bound while reading, rather than after an arbitrarily large body is retained.
async function boundedBody(response: Response, budget: InspectionBudget, controller: AbortController): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const chunk = await budget.wait(reader.read());
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > MAX_BYTES) {
        fail("limit", response.status);
      }
      budget.input(chunk.value.byteLength);
      chunks.push(chunk.value);
    }
    return Buffer.concat(chunks).toString("utf8");
  } catch (error) {
    controller.abort();
    void reader.cancel().catch(() => {});
    throw error;
  } finally { reader.releaseLock(); }
}

function parseResult(body: string, contentType: string | null, status: number, id: string): Record<string, unknown> {
  let payload: Record<string, unknown> | null;
  try { payload = record(parseMcpHttpResponseBody(body, contentType)); }
  catch { return fail("invalid_response", status); }
  if (!payload || payload.jsonrpc !== "2.0" || payload.id !== id) fail("invalid_response", status);
  const error = record(payload.error);
  if (error) fail("provider", status, typeof error.code === "number" && Number.isSafeInteger(error.code) ? error.code : null);
  const result = record(payload.result);
  if (!result) fail("invalid_response", status);
  return result;
}

// This response is rebuilt from an already bounded original transport body.
async function readResult(response: Response, id: string): Promise<Record<string, unknown>> {
  return parseResult(await response.text(), response.headers.get("content-type"), response.status, id);
}

// Existing authorized Board test calls may separately capture provider guides.
// This extractor makes no call and never returns the financial `data` sibling,
// content blocks, terminal values, account identifiers or financial conclusions.
export function inspectBrokerGuide(callResult: unknown, sensitiveValues: string[] = []): {
  kind: "provider_guide_metadata"; guidePresent: boolean; guide: string | null;
  financialReadiness: "unverified"; textSanitized: true;
} {
  const structured = record(record(callResult)?.structuredContent);
  const guide = typeof structured?.guide === "string" ? structured.guide : null;
  return { kind: "provider_guide_metadata", guidePresent: guide !== null,
    guide: scrubber(sensitiveValues)(guide), financialReadiness: "unverified", textSanitized: true };
}

export async function inspectBrokerProtocol(input: {
  send: (init: RequestInit) => Promise<Response>;
  headers?: Record<string, string>;
  // Includes the resolved endpoint and credential-derived values. These stay in
  // memory and are never returned, hashed, logged or used in provider arguments.
  sensitiveValues?: string[];
  // Server-owned setting; callers can shorten, never extend the 30s deadline.
  timeoutMs?: number;
}): Promise<ProtocolEvidence> {
  const budget = new InspectionBudget(Number.isFinite(input.timeoutMs)
    ? Math.max(1, Math.min(MAX_DURATION_MS, input.timeoutMs!)) : MAX_DURATION_MS);
  try {
  const sanitize = scrubber([
    ...(input.sensitiveValues ?? []),
    ...Object.values(input.headers ?? {}),
    ...Object.values(input.headers ?? {}).map(value => value.replace(/^(?:Bearer|Basic)\s+/i, "")),
  ]);
  const scrub: Scrub = value => {
    const text = sanitize(value);
    budget.text(text);
    return text;
  };
  const lists: ProtocolEvidence["lists"] = {
    "tools/list": { status: "not_advertised", pages: 0, items: [] },
    "resources/list": { status: "not_advertised", pages: 0, items: [] },
    "prompts/list": { status: "not_advertised", pages: 0, items: [] },
  };
  let initialized: Record<string, unknown> | null = null;
  const send = async (init: RequestInit): Promise<Response> => {
    const payload = record(JSON.parse(String(init.body)));
    if (!payload || typeof payload.method !== "string" || !ALLOWED.has(payload.method)) fail("invalid_response");
    budget.check();
    const controller = new AbortController();
    const pending = input.send({ ...init, signal: AbortSignal.any([budget.controller.signal, controller.signal]) });
    // A sender may ignore abort and resolve late. Release that response too.
    void pending.then(response => { if (budget.controller.signal.aborted || controller.signal.aborted) cancelBody(response); }, () => {});
    let response: Response | undefined;
    try {
      response = await budget.wait(pending);
      if (!response.ok) {
        cancelBody(response);
        controller.abort();
        fail("http", response.status);
      }
      const body = await boundedBody(response, budget, controller);
      if (payload.method === "initialize") {
        initialized = parseResult(body, response.headers.get("content-type"), response.status, String(payload.id));
        if (typeof initialized.protocolVersion !== "string" || !record(initialized.capabilities) || !record(initialized.serverInfo)) fail("invalid_response", response.status);
      }
      // Never tee the provider stream. Existing initialization parses only this
      // bounded in-memory response; the original body was consumed exactly once.
      return new Response([204, 205, 304].includes(response.status) ? null : body,
        { status: response.status, statusText: response.statusText, headers: response.headers });
    } catch (error) {
      controller.abort();
      if (response && !response.bodyUsed) cancelBody(response);
      throw error;
    }
  };
  let headers: Record<string, string>;
  try {
    headers = await initializeMcpHttpSession({ send, headers: input.headers, requestId: "operator-protocol-inspection" });
  } catch (error) {
    return { version: 1, kind: "provider_protocol_metadata", financialReadiness: "unverified", initialization: { status: "error", failure: failure(error) }, lists };
  }
  const initRecord = initialized as Record<string, unknown> | null;
  if (!initRecord) throw new Error("Initialization metadata was not captured");
  const caps = record(initRecord.capabilities)!;
  const serverInfo = record(initRecord.serverInfo)!;
  let metadata: Json;
  try {
  metadata = {
    protocolVersion: scrub(initRecord.protocolVersion),
    serverInfo: { name: scrub(serverInfo.name), version: scrub(serverInfo.version), title: scrub(serverInfo.title) },
    instructions: scrub(initRecord.instructions),
    capabilities: Object.fromEntries(["tools", "resources", "prompts"].map(key => [key, {
      advertised: record(caps[key]) !== null,
      listChanged: record(caps[key])?.listChanged === true,
      ...(key === "resources" ? { subscribe: record(caps[key])?.subscribe === true } : {}),
    }])),
    textSanitized: true,
    schemasAreSanitizedShapes: true,
  };
  budget.reserve(metadata);
  }
  catch (error) {
    return { version: 1, kind: "provider_protocol_metadata", financialReadiness: "unverified",
      initialization: { status: "error", failure: failure(error) }, lists };
  }
  for (const method of LISTS) {
    const key = method.split("/")[0]!;
    if (!record(caps[key])) continue;
    const list = lists[method];
    list.status = "incomplete";
    let cursor: string | undefined;
    const cursors = new Set<string>();
    try {
      for (let page = 0; page < MAX_PAGES; page++) {
        const id = `operator-protocol-inspection-${key}-${page}`;
        const result = await readResult(await send({
          method: "POST", headers: mcpHttpRequestHeaders(headers),
          body: JSON.stringify({ jsonrpc: "2.0", id, method, params: cursor ? { cursor } : {} }),
        }), id);
        const pageValues = result[key];
        if (!Array.isArray(pageValues)) fail("invalid_response");
        if (list.items.length + pageValues.length > MAX_ITEMS) fail("limit");
        // Validate a whole page before retaining any of its items.
        const pageItems = pageValues.map(item => {
          const itemEvidence = descriptor(item, method, scrub, budget);
          budget.reserve(itemEvidence);
          return itemEvidence;
        });
        list.items.push(...pageItems);
        list.pages++;
        if (result.nextCursor === undefined) {
          list.status = "complete";
          break;
        }
        if (typeof result.nextCursor !== "string" || !result.nextCursor || result.nextCursor.length > MAX_CURSOR_LENGTH || cursors.has(result.nextCursor)) fail("invalid_response");
        cursor = result.nextCursor;
        cursors.add(cursor);
      }
      if (list.status !== "complete") list.failure = { kind: "limit", httpStatus: null, providerCode: null };
    } catch (error) {
      list.status = list.pages > 0 ? "incomplete" : "error";
      list.failure = failure(error);
    }
  }
  return { version: 1, kind: "provider_protocol_metadata", financialReadiness: "unverified", initialization: { status: "complete", metadata }, lists };
  } finally { budget.close(); }
}
