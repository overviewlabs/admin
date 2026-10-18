import { it as test } from "vitest";
import assert from "node:assert/strict";
import { inspectBrokerGuide, inspectBrokerProtocol } from "../services/broker-protocol-inspection.js";

type Rpc = { id?: string; method: string; params?: { cursor?: string } };
function fixture(options: {
  capabilities?: Record<string, unknown>;
  initialize?: Record<string, unknown>;
  result?: (request: Rpc) => Record<string, unknown>;
  override?: (request: Rpc) => Response | undefined;
  sse?: boolean;
} = {}) {
  const requests: Rpc[] = [];
  const headers: Headers[] = [];
  return { requests, headers, send: async (init: RequestInit) => {
    const request = JSON.parse(String(init.body)) as Rpc;
    requests.push(request);
    headers.push(new Headers(init.headers));
    const overridden = options.override?.(request);
    if (overridden) return overridden;
    if (request.method === "notifications/initialized") return new Response(null, { status: 202 });
    const result = request.method === "initialize" ? {
      protocolVersion: "2025-06-18", serverInfo: { name: "broker", version: "1" },
      capabilities: options.capabilities ?? { tools: {} }, ...options.initialize,
    } : options.result?.(request) ?? { [request.method.split("/")[0]!]: [] };
    const data = JSON.stringify({ jsonrpc: "2.0", id: request.id, result });
    return new Response(options.sse ? `event: message\ndata: ${data}\n\n` : data, {
      headers: { "content-type": options.sse ? "text/event-stream" : "application/json", "mcp-session-id": "session-private" },
    });
  } };
}

test("captures initialize instructions and advertised list metadata with session/auth headers", async () => {
  const f = fixture({ capabilities: { tools: {}, resources: { subscribe: true }, prompts: {} },
    initialize: { instructions: "Omitted fields are unknown. Use advanced orders to check all pending exposure." },
    result: rpc => ({ [rpc.method.split("/")[0]!]: rpc.method === "tools/list" ? [{ name: "get_advanced_orders", inputSchema: { type: "object" }, outputSchema: { type: "object", properties: { orders: { type: "array" } } } }] : [] }),
  });
  const evidence = await inspectBrokerProtocol({ send: f.send, headers: { Authorization: "Bearer private" } });
  assert.deepEqual(f.requests.map(r => r.method), ["initialize", "notifications/initialized", "tools/list", "resources/list", "prompts/list"]);
  assert.equal(evidence.initialization.status, "complete");
  assert.equal(evidence.financialReadiness, "unverified");
  assert.equal(evidence.lists["tools/list"].status, "complete");
  assert.equal((evidence.lists["tools/list"].items[0] as Record<string, unknown>).outputSchemaPresent, true);
  assert.match(JSON.stringify(evidence), /Omitted fields are unknown/);
  for (const h of f.headers.slice(1)) {
    assert.equal(h.get("authorization"), "Bearer private");
    assert.equal(h.get("mcp-session-id"), "session-private");
    assert.equal(h.get("accept"), "application/json, text/event-stream");
  }
  assert.doesNotMatch(JSON.stringify(evidence), /session-private|Bearer private/);
});

test("does not request unadvertised lists or infer completeness from an empty tool list", async () => {
  const f = fixture({ capabilities: { tools: {} } });
  const e = await inspectBrokerProtocol({ send: f.send });
  assert.deepEqual(f.requests.map(r => r.method), ["initialize", "notifications/initialized", "tools/list"]);
  assert.equal(e.lists["resources/list"].status, "not_advertised");
  assert.equal(e.lists["prompts/list"].status, "not_advertised");
  assert.equal(e.financialReadiness, "unverified");
  assert.equal("exposureComplete" in e, false);
});

test("retains absent outputSchema as absent and returns only sanitized schema shapes", async () => {
  const f = fixture({ result: () => ({ tools: [{ name: "get_positions", inputSchema: { type: "object", properties: { account: { type: "string", default: "private-account", examples: ["private-example"], enum: ["private-enum"] } }, examples: ["private-data"] } }] }) });
  const e = await inspectBrokerProtocol({ send: f.send });
  assert.equal((e.lists["tools/list"].items[0] as Record<string, unknown>).outputSchemaPresent, false);
  assert.doesNotMatch(JSON.stringify(e), /private-account|private-example|private-enum|private-data/);
});

test("scrubs credentials, URLs, email, UUIDs and account identifiers without returning resource URI", async () => {
  const f = fixture({ capabilities: { resources: {}, prompts: {} }, initialize: { instructions: "account_id=12345678 https://secret.example/path?token=x jane@example.com password=hunter2 abcdefghijklmnopqrstuvwxyz0123456789 secret-from-header" },
    result: rpc => ({ [rpc.method.split("/")[0]!]: [{ name: "read_help", uri: "broker://accounts/12345678", description: "Account: 12345678 secret-from-header", arguments: [{ name: "topic", default: "private-default", description: "https://secret.example" }] }] }),
  });
  const e = await inspectBrokerProtocol({ send: f.send, headers: { "X-Api-Key": "secret-from-header" } });
  assert.doesNotMatch(JSON.stringify(e), /12345678|secret\.example|jane@example|hunter2|abcdefghijklmnopqrstuvwxyz|secret-from-header|broker:\/\/|private-default/);
  assert.equal((e.lists["resources/list"].items[0] as Record<string, unknown>).uriPresent, true);
});

test("retains initialize provider error code and never sends initialized or fallback calls", async () => {
  const f = fixture({ override: r => r.method === "initialize" ? new Response(JSON.stringify({ jsonrpc: "2.0", id: r.id, error: { code: -32001, message: "SECRET_ACCOUNT", data: { token: "SECRET" } } })) : undefined });
  const e = await inspectBrokerProtocol({ send: f.send });
  assert.deepEqual(f.requests.map(r => r.method), ["initialize"]);
  assert.deepEqual(e.initialization, { status: "error", failure: { kind: "provider", httpStatus: 200, providerCode: -32001 } });
  assert.doesNotMatch(JSON.stringify(e), /SECRET/);
});

test("HTTP 401 is preserved without retries, OAuth mutation or probing other methods", async () => {
  const f = fixture({ override: r => r.method === "initialize" ? new Response("private-error", { status: 401 }) : undefined });
  const e = await inspectBrokerProtocol({ send: f.send });
  assert.deepEqual(e.initialization, { status: "error", failure: { kind: "http", httpStatus: 401, providerCode: null } });
  assert.equal(f.requests.length, 1);
});

test("resource method-not-found is provider evidence and does not authorize resources/read fallback", async () => {
  const f = fixture({ capabilities: { tools: {}, resources: {}, prompts: {} }, override: r => r.method === "resources/list" ? new Response(JSON.stringify({ jsonrpc: "2.0", id: r.id, error: { code: -32601, message: "private" } })) : undefined });
  const e = await inspectBrokerProtocol({ send: f.send });
  assert.equal(e.lists["resources/list"].status, "error");
  assert.equal(e.lists["resources/list"].failure?.providerCode, -32601);
  assert.equal(e.lists["prompts/list"].status, "complete");
  assert.equal(f.requests.some(r => ["resources/read", "prompts/get", "tools/call"].includes(r.method)), false);
});

test("bounds pagination and does not return provider cursors", async () => {
  const f = fixture({ result: r => ({ tools: [{ name: "get_positions" }], ...(r.params?.cursor ? {} : { nextCursor: "secret-cursor" }) }) });
  const e = await inspectBrokerProtocol({ send: f.send });
  assert.equal(e.lists["tools/list"].pages, 2);
  assert.equal(e.lists["tools/list"].items.length, 2);
  assert.equal(f.requests.at(-1)?.params?.cursor, "secret-cursor");
  assert.doesNotMatch(JSON.stringify(e), /secret-cursor/);
});

test("a failed later page is incomplete and retains the provider failure", async () => {
  const f = fixture({ result: () => ({ tools: [{ name: "get_orders" }], nextCursor: "page2" }), override: r => r.params?.cursor ? new Response(JSON.stringify({ jsonrpc: "2.0", id: r.id, error: { code: -32000, message: "private" } })) : undefined });
  const e = await inspectBrokerProtocol({ send: f.send });
  assert.equal(e.lists["tools/list"].status, "incomplete");
  assert.equal(e.lists["tools/list"].pages, 1);
  assert.equal(e.lists["tools/list"].failure?.providerCode, -32000);
});

test("repeated cursor terminates as incomplete", async () => {
  const f = fixture({ result: () => ({ tools: [], nextCursor: "same" }) });
  const e = await inspectBrokerProtocol({ send: f.send });
  assert.equal(e.lists["tools/list"].status, "incomplete");
  assert.equal(e.lists["tools/list"].failure?.kind, "invalid_response");
  assert.equal(f.requests.length, 4);
});

test("infinite distinct pages stop at the page budget", async () => {
  let page = 0;
  const f = fixture({ result: () => ({ tools: [], nextCursor: `page-${++page}` }) });
  const e = await inspectBrokerProtocol({ send: f.send });
  assert.equal(e.lists["tools/list"].pages, 16);
  assert.equal(e.lists["tools/list"].status, "incomplete");
  assert.equal(e.lists["tools/list"].failure?.kind, "limit");
});

test("rejects mismatched IDs and malformed schemas without accepting financial claims", async () => {
  const f = fixture({ override: r => r.method === "tools/list" ? new Response(JSON.stringify({ jsonrpc: "2.0", id: "wrong", result: { tools: [], exposureComplete: true } })) : undefined });
  const e = await inspectBrokerProtocol({ send: f.send });
  assert.equal(e.lists["tools/list"].status, "error");
  assert.equal(e.lists["tools/list"].failure?.kind, "invalid_response");
  assert.equal(e.financialReadiness, "unverified");
});

test("supports SSE metadata and rejects malformed or oversized responses", async () => {
  const sse = fixture({ sse: true });
  assert.equal((await inspectBrokerProtocol({ send: sse.send })).initialization.status, "complete");
  for (const body of ["not-json", "x".repeat(1024 * 1024 + 1)]) {
    const f = fixture({ override: r => r.method === "initialize" ? new Response(body) : undefined });
    assert.equal((await inspectBrokerProtocol({ send: f.send })).initialization.status, "error");
    assert.equal(f.requests.length, 1);
  }
});

test("transport exceptions cannot disclose error messages or exception properties", async () => {
  const e = await inspectBrokerProtocol({ send: async () => { throw new Error("https://secret.example token=private"); } });
  assert.deepEqual(e.initialization, { status: "error", failure: { kind: "transport", httpStatus: null, providerCode: null } });
  assert.doesNotMatch(JSON.stringify(e), /secret\.example|private/);
});

test("invalid list arrays and item floods are failed evidence", async () => {
  for (const tools of [null, [{ description: "missing name" }], Array.from({ length: 2049 }, () => ({ name: "get_order" }))]) {
    const f = fixture({ result: () => ({ tools }) });
    const e = await inspectBrokerProtocol({ send: f.send });
    assert.equal(e.lists["tools/list"].status, "error");
    assert.equal(e.lists["tools/list"].items.length, 0);
  }
});

test("guide extractor retains explanatory text and never returns financial data siblings", () => {
  const guide = "When next is non-empty more pages exist; keep paging until next is empty. Realized PnL excludes unrealized PnL.";
  const evidence = inspectBrokerGuide({ structuredContent: { guide, data: { account_number: "12345678", orders: [{ order_id: "private-order", fee: "PRIVATE-FEE" }], buying_power: "PRIVATE-CASH" } }, content: [{ text: "PRIVATE-CONTENT" }] });
  assert.equal(evidence.guide, guide);
  assert.equal(evidence.financialReadiness, "unverified");
  assert.doesNotMatch(JSON.stringify(evidence), /12345678|private-order|PRIVATE/);
  assert.equal(inspectBrokerGuide({ content: [{ text: "guide embedded in account JSON" }] }).guidePresent, false);
  assert.equal(inspectBrokerGuide({ structuredContent: { guide: { account: "private" } } }).guidePresent, false);
});

test("null, empty and oversized nextCursor cannot establish a terminal page", async () => {
  for (const nextCursor of [null, "", "x".repeat(16_385)]) {
    const f = fixture({ result: () => ({ tools: [], nextCursor }) });
    const e = await inspectBrokerProtocol({ send: f.send });
    assert.equal(e.lists["tools/list"].status, "incomplete");
    assert.equal(e.lists["tools/list"].failure?.kind, "invalid_response");
    assert.equal(f.requests.length, 3);
  }
  const allowed = fixture({ result: r => ({ tools: [], ...(r.params?.cursor ? {} : { nextCursor: "x".repeat(16_384) }) }) });
  assert.equal((await inspectBrokerProtocol({ send: allowed.send })).lists["tools/list"].status, "complete");
});

test("initialization consumes the original stream once and never clones/tees it", async () => {
  let reads = 0;
  const f = fixture({ override: r => {
    if (r.method !== "initialize") return undefined;
    const response = new Response(new ReadableStream({ pull(controller) {
      reads++;
      controller.enqueue(new TextEncoder().encode(JSON.stringify({ jsonrpc: "2.0", id: r.id, result: { protocolVersion: "2025-06-18", capabilities: {}, serverInfo: { name: "broker", version: "1" } } })));
      controller.close();
    } }));
    response.clone = () => { throw new Error("clone forbidden"); };
    return response;
  } });
  assert.equal((await inspectBrokerProtocol({ send: f.send })).initialization.status, "complete");
  assert.equal(reads, 1);
});

test("oversized initialization stream is canceled and its request aborted", async () => {
  let canceled = false;
  let signal: AbortSignal | null | undefined;
  const e = await inspectBrokerProtocol({ send: async init => {
    signal = init.signal;
    return new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(1024 * 1024 + 1)); }, cancel() { canceled = true; } }));
  } });
  assert.equal(e.initialization.status, "error");
  if (e.initialization.status === "error") assert.equal(e.initialization.failure.kind, "limit");
  assert.equal(canceled, true);
  assert.equal((signal as AbortSignal | null | undefined)?.aborted, true);
});

test("HTTP-error bodies are canceled and aborted without being read", async () => {
  let canceled = false;
  let signal: AbortSignal | null | undefined;
  const e = await inspectBrokerProtocol({ send: async init => {
    signal = init.signal;
    return new Response(new ReadableStream({ cancel() { canceled = true; } }), { status: 403 });
  } });
  assert.deepEqual(e.initialization, { status: "error", failure: { kind: "http", httpStatus: 403, providerCode: null } });
  assert.equal(canceled, true);
  assert.equal((signal as AbortSignal | null | undefined)?.aborted, true);
});

test("stalled stream respects the overall deadline and cancels/aborts", async () => {
  let canceled = false;
  let signal: AbortSignal | null | undefined;
  const before = performance.now();
  const e = await inspectBrokerProtocol({ timeoutMs: 25, send: async init => {
    signal = init.signal;
    return new Response(new ReadableStream({ cancel() { canceled = true; } }));
  } });
  assert.ok(performance.now() - before < 1000);
  assert.deepEqual(e.initialization, { status: "error", failure: { kind: "deadline", httpStatus: null, providerCode: null } });
  assert.equal(canceled, true);
  assert.equal((signal as AbortSignal | null | undefined)?.aborted, true);
});

test("a sender ignoring abort still returns deadline evidence and a late body is released", async () => {
  let resolve!: (value: Response) => void;
  let canceled = false;
  const pending = new Promise<Response>(done => { resolve = done; });
  const e = await inspectBrokerProtocol({ timeoutMs: 25, send: () => pending });
  assert.equal(e.initialization.status, "error");
  if (e.initialization.status === "error") assert.equal(e.initialization.failure.kind, "deadline");
  resolve(new Response(new ReadableStream({ cancel() { canceled = true; } })));
  await new Promise(done => setTimeout(done, 0));
  assert.equal(canceled, true);
});

test("one deadline spans multiple requests rather than resetting per page", async () => {
  const f = fixture({ result: () => ({ tools: [], nextCursor: "page2" }) });
  const before = performance.now();
  const e = await inspectBrokerProtocol({ timeoutMs: 40, send: async init => {
    const request = JSON.parse(String(init.body)) as Rpc;
    if (request.method === "tools/list") await new Promise(done => setTimeout(done, 25));
    return f.send(init);
  } });
  assert.ok(performance.now() - before < 1000);
  assert.equal(e.lists["tools/list"].status, "incomplete");
  assert.equal(e.lists["tools/list"].failure?.kind, "deadline");
});

test("aggregate output budget spans all advertised lists and prevents further requests", async () => {
  const description = "bounded explanatory prose ".repeat(260);
  const f = fixture({ capabilities: { tools: {}, resources: {}, prompts: {} }, result: r => ({
    [r.method.split("/")[0]!]: Array.from({ length: 100 }, (_, index) => ({ name: `metadata_${index}`, description,
      ...(r.method === "tools/list" ? { inputSchema: { type: "object" } } : {}) })),
  }) });
  const e = await inspectBrokerProtocol({ send: f.send });
  assert.equal(e.lists["tools/list"].status, "complete");
  assert.equal(e.lists["resources/list"].status, "error");
  assert.equal(e.lists["resources/list"].failure?.kind, "limit");
  assert.equal(e.lists["prompts/list"].status, "error");
  assert.equal(f.requests.some(r => r.method === "prompts/list"), false);
  assert.ok(Buffer.byteLength(JSON.stringify(e)) <= 1024 * 1024);
});

test("aggregate input budget counts discarded schema fields across pages", async () => {
  let page = 0;
  const f = fixture({ result: () => ({ tools: [{ name: "shape_only", inputSchema: { type: "object", examples: ["x".repeat(900_000)] } }], nextCursor: `page-${++page}` }) });
  const e = await inspectBrokerProtocol({ send: f.send });
  assert.equal(e.lists["tools/list"].status, "incomplete");
  assert.equal(e.lists["tools/list"].failure?.kind, "limit");
  assert.equal(e.lists["tools/list"].pages, 4);
  assert.ok(Buffer.byteLength(JSON.stringify(e)) <= 1024 * 1024);
});

test("schema construction has an overall node budget independent of its depth", async () => {
  const leafProperties = Object.fromEntries(Array.from({ length: 128 }, (_, i) => [`field_${i}`, { type: "string" }]));
  const f = fixture({ result: () => ({ tools: [{ name: "wide_schema", inputSchema: { type: "object", properties:
    Object.fromEntries(Array.from({ length: 128 }, (_, i) => [`group_${i}`, { type: "object", properties: leafProperties }])) } }] }) });
  const e = await inspectBrokerProtocol({ send: f.send });
  assert.equal(e.lists["tools/list"].status, "error");
  assert.equal(e.lists["tools/list"].failure?.kind, "limit");
  assert.equal(e.lists["tools/list"].items.length, 0);
  assert.ok(Buffer.byteLength(JSON.stringify(e)) <= 1024 * 1024);
});
