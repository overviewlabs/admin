import test from "node:test";
import assert from "node:assert/strict";
import { createServerAdapter, models, parseQuestions, validateResponse } from "./index.mjs";
import { parseStdoutLine } from "./ui-parser.mjs";

const key = "test-typesafe-secret-material";
const questions = {
  urgent: { type: "noul", instructions: "Is this urgent?" },
  team: { type: "choice", instructions: "Which team?", criteria: { technical: null, billing: "Payments" } },
  frustration: { type: "score", instructions: "How frustrated?", criteria: ["Calm", "Frustrated"] },
};
function payload() {
  return {
    model: "jev-1.13.0",
    answers: {
      urgent: { type: "noul", noul: 0.9 },
      team: { type: "choice", choice: "technical", confidence: 0.8, probabilities: { technical: 0.9, billing: 0.1 } },
      frustration: { type: "score", score: 0.75, confidence: 0.5, probabilities: { "0": 0.25, "1": 0.75 }, legend: { "0": "Calm", "1": "Frustrated" } },
    },
    usage: { input_tokens: 300, output_tokens: 42 },
  };
}
function context(config = {}, rest = {}) {
  const logs = [];
  return {
    runId: "run-1", agent: { id: "agent-1", name: "Classifier", companyId: "company-1" },
    runtime: {}, context: { state: "Help with my integration", authToken: "private-context-token" },
    config: { env: { TYPESAFE_API_KEY: key }, questions, ...config },
    onLog: async (_stream, text) => logs.push(text), logs,
    ...rest,
  };
}
const success = () => Response.json(payload());

test("context-limit rejection is actionable, does not expose the provider body, and is never retried", async () => {
  let calls = 0;
  const adapter = createServerAdapter({ fetchImpl: async () => { calls++; return Response.json({ detail: { error_type: "max_tokens_exceeded", privateContext: key } }, { status: 400 }); } });
  const result = await adapter.execute(context());
  assert.equal(calls, 1);
  assert.equal(result.errorCode, "typesafe_context_too_large");
  assert.match(result.errorMessage, /taskEvidence/);
  assert.equal(result.errorMessage.includes(key), false);
  assert.equal(result.resultJson, undefined);
});

test("agent-only execution refuses direct runs before contacting the provider", async () => {
  let called = false;
  const adapter = createServerAdapter({ fetchImpl: async () => { called = true; return success(); } });
  const result = await adapter.execute(context({ agentOnly: true }));
  assert.equal(result.exitCode, 1); assert.equal(result.errorCode, "typesafe_agent_only"); assert.equal(called, false);
});

test("delegated questions and state override a stale fixed configuration", async () => {
  let sent;
  const adapter = createServerAdapter({ fetchImpl: async (_url, init) => { sent = JSON.parse(init.body); return success(); } });
  const ctx = context({ agentOnly: true, questionsJson: '{"old":{}}', stateJson: '"stale input"' }, { context: {
    decisionEvaluationId: "verified-receipt", decisionEngineCallerAgentId: "caller", state: "Current task facts", typesafeQuestions: questions,
  } });
  assert.equal((await adapter.execute(ctx)).exitCode, 0);
  assert.deepEqual(sent, { model: "jev-latest", state: "Current task facts", questions });
});

test("advertises documented model IDs and the native configuration schema", () => {
  const adapter = createServerAdapter();
  assert.deepEqual(models.map((m) => m.id), ["jev-latest", "jev-preview", "jev-1.13.0"]);
  assert.equal(adapter.supportsInstructionsBundle, false);
  assert.equal(adapter.supportsLocalAgentJwt, false);
  assert.deepEqual(adapter.getConfigSchema().fields.find((f) => f.key === "model").options.map((o) => o.value), models.map((m) => m.id));
});

test("sends the typed API request, records usage and resolved model, and renders a result", async () => {
  let sent, readiness = false, dispatched = false;
  const adapter = createServerAdapter({ fetchImpl: async (url, init) => {
    assert.equal(url, "https://api.typesafe.ai/v1/systemone");
    assert.equal(init.headers.Authorization, `Bearer ${key}`);
    assert.equal(init.redirect, "error");
    assert.equal(readiness, true); assert.equal(dispatched, true);
    sent = JSON.parse(init.body); return success();
  } });
  const ctx = context({}, { onCancellationReady: async () => { readiness = true; }, onDispatch: () => { dispatched = true; } });
  const result = await adapter.execute(ctx);
  assert.equal(result.exitCode, 0);
  assert.deepEqual(sent, { state: "Help with my integration", model: "jev-latest", questions });
  assert.equal(result.model, "jev-1.13.0");
  assert.deepEqual(result.usage, { inputTokens: 300, outputTokens: 42 });
  assert.equal(result.usageBasis, "per_run");
  assert.equal(result.costUsd, undefined);
  assert.deepEqual(result.resultJson, payload());
  assert.equal(ctx.logs.length, 1);
  assert.equal(ctx.logs.join("").includes(key), false);
  assert.equal(ctx.logs.join("").includes("private-context-token"), false);
  assert.equal(parseStdoutLine(ctx.logs[0], "now")[0].kind, "assistant");
  assert.match(result.summary, /team: technical/);
});

test("respects explicit state JSON and the pinned model", async () => {
  let sent;
  const adapter = createServerAdapter({ fetchImpl: async (_u, init) => { sent = JSON.parse(init.body); return success(); } });
  const ctx = context({ model: "jev-1.13.0", stateJson: '{"ticket":"Urgent"}', questionsJson: JSON.stringify(questions) });
  assert.equal((await adapter.execute(ctx)).exitCode, 0);
  assert.equal(sent.model, "jev-1.13.0");
  assert.deepEqual(sent.state, { ticket: "Urgent" });
});

test("does not inherit a host API key across agent/company boundaries", async () => {
  const previous = process.env.TYPESAFE_API_KEY;
  process.env.TYPESAFE_API_KEY = "unrelated-host-secret";
  try {
    let calls = 0;
    const adapter = createServerAdapter({ fetchImpl: async () => { calls++; return success(); } });
    const result = await adapter.execute(context({ env: {} }));
    assert.equal(result.errorCode, "typesafe_auth_missing");
    assert.equal(calls, 0);
  } finally { if (previous === undefined) delete process.env.TYPESAFE_API_KEY; else process.env.TYPESAFE_API_KEY = previous; }
});

test("Test performs an actual synthetic evaluation using the selected model", async () => {
  let sent;
  const adapter = createServerAdapter({ fetchImpl: async (_u, init) => {
    sent = JSON.parse(init.body);
    return Response.json({ model: "jev-1.13.0", answers: { connection_test: { type: "noul", noul: 1 } }, usage: { input_tokens: 30, output_tokens: 3 } });
  } });
  const result = await adapter.testEnvironment({ config: { model: "jev-preview", env: { TYPESAFE_API_KEY: key } } });
  assert.equal(result.status, "pass"); assert.equal(sent.model, "jev-preview");
  assert.equal(sent.state, "TypeSafe connection test");
});

test("missing credentials fail Test without sending any request", async () => {
  let calls = 0;
  const adapter = createServerAdapter({ fetchImpl: async () => { calls++; return success(); } });
  const result = await adapter.testEnvironment({ config: {} });
  assert.equal(result.status, "fail"); assert.equal(result.checks[0].code, "typesafe_auth_missing"); assert.equal(calls, 0);
});

for (const bad of [
  {}, { q: { type: "chat", instructions: "Write code" } },
  { q: { type: "noul", instructions: "" } },
  { q: { type: "noul", instructions: "Question", criteria: { yes: "Invalid field" } } },
  { q: { type: "choice", instructions: "Question", criteria: {} } },
  { q: { type: "score", instructions: "Question", criteria: ["Only one"] } },
  { q: { type: "score", instructions: "Question", criteria: Array(11).fill("Level") } },
  { q: { type: "noul", instructions: "Question", apiKey: key } },
]) test(`invalid questions are rejected before dispatch: ${JSON.stringify(bad).slice(0, 70)}`, () => {
  assert.throws(() => parseQuestions({ questions: bad }), /question|criteria|instructions|supported/i);
});

test("supports structured instructions and criteria", () => {
  assert.deepEqual(parseQuestions({ questions: { q: { type: "choice", instructions: { question: "Select a team" }, criteria: { support: { rubric: "Help" } } } } }).q.instructions, { question: "Select a team" });
});

test("invalid state and absent input do not become fabricated successful decisions", async () => {
  let calls = 0;
  const adapter = createServerAdapter({ fetchImpl: async () => { calls++; return success(); } });
  for (const ctx of [context({ stateJson: "not JSON" }), context({}, { context: { issueId: "no-actual-state" } })]) {
    assert.equal((await adapter.execute(ctx)).errorCode, "typesafe_invalid_configuration");
  }
  assert.equal(calls, 0);
});

test("remote environment and denied network policies do not silently dispatch from the host", async () => {
  let calls = 0;
  const adapter = createServerAdapter({ fetchImpl: async () => { calls++; return success(); } });
  for (const ctx of [context({}, { executionTarget: { kind: "remote" } }), context({ networkScope: "deny" }), context({ networkScope: "allowlist", networkAllowlist: ["other.example"] })]) assert.equal((await adapter.execute(ctx)).exitCode, 1);
  assert.equal(calls, 0);
});

test("401 provider response fails clearly and never leaks a reflected key", async () => {
  let calls = 0;
  const adapter = createServerAdapter({ fetchImpl: async () => { calls++; return new Response(key, { status: 401 }); } });
  const result = await adapter.execute(context());
  assert.equal(result.exitCode, 1); assert.equal(result.errorCode, "typesafe_auth_rejected"); assert.equal(calls, 1);
  assert.equal(JSON.stringify(result).includes(key), false);
});

test("retries explicit rate limits, honoring Retry-After", async () => {
  let calls = 0;
  const adapter = createServerAdapter({ fetchImpl: async () => ++calls === 1 ? new Response("Limited", { status: 429, headers: { "Retry-After": "0" } }) : success() });
  assert.equal((await adapter.execute(context())).exitCode, 0); assert.equal(calls, 2);
});

test("rate-limit retry deadline prevents an unbounded wait", async () => {
  let calls = 0;
  const adapter = createServerAdapter({ fetchImpl: async () => { calls++; return new Response("Limited", { status: 429, headers: { "Retry-After": "1000" } }); } });
  const result = await adapter.execute(context({ timeoutSec: 1 }));
  assert.equal(result.errorCode, "typesafe_http_429"); assert.equal(result.errorFamily, "provider_quota");
  assert.ok(result.retryNotBefore); assert.equal(calls, 1);
});

test("unknown network outcome is not automatically replayed", async () => {
  let calls = 0;
  const adapter = createServerAdapter({ fetchImpl: async () => { calls++; throw Error(key); } });
  const result = await adapter.execute(context());
  assert.equal(result.exitCode, 1); assert.equal(calls, 1);
  assert.equal(JSON.stringify(result).includes(key), false);
});

test("operator cancellation aborts the API request and returns a cancelled run", async () => {
  const controller = new AbortController();
  let calls = 0;
  const adapter = createServerAdapter({ fetchImpl: async (_u, { signal }) => {
    calls++;
    return new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      controller.abort();
    });
  } });
  const result = await adapter.execute(context({}, { signal: controller.signal }));
  assert.equal(result.errorCode, "cancelled"); assert.equal(result.signal, "SIGTERM"); assert.equal(calls, 1);
});

test("pre-dispatch cancellation makes no provider request", async () => {
  const controller = new AbortController(); controller.abort(); let calls = 0;
  const adapter = createServerAdapter({ fetchImpl: async () => { calls++; return success(); } });
  assert.equal((await adapter.execute(context({}, { signal: controller.signal }))).errorCode, "cancelled"); assert.equal(calls, 0);
});

test("request timeout settles without retry or invented answers", async () => {
  const keepAlive = setInterval(() => {}, 1000); let calls = 0;
  try {
    const adapter = createServerAdapter({ fetchImpl: async (_u, { signal }) => {
      calls++; return new Promise((_r, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));
    } });
    const result = await adapter.execute(context({ timeoutSec: 1 }));
    assert.equal(result.timedOut, true); assert.equal(result.resultJson, undefined); assert.equal(calls, 1);
  } finally { clearInterval(keepAlive); }
});

for (const mutate of [
  (p) => { delete p.answers.urgent; },
  (p) => { p.answers.team.choice = "unconfigured"; },
  (p) => { p.answers.team.probabilities.technical = 2; },
  (p) => { p.answers.team.probabilities.technical = 0.4; },
  (p) => { p.answers.frustration.score = 2; },
  (p) => { p.answers.urgent.noul = -1; },
  (p) => { p.usage.input_tokens = -1; },
]) test(`rejects invalid typed answers: ${mutate.toString()}`, () => {
  const p = payload(); mutate(p);
  assert.throws(() => validateResponse(p, questions), /no decision was accepted/);
});

test("bounded response prevents memory exhaustion", async () => {
  const adapter = createServerAdapter({ fetchImpl: async () => new Response("x".repeat(1_048_577)) });
  const ctx = context(); const result = await adapter.execute(ctx);
  assert.equal(result.errorCode, "typesafe_response_too_large"); assert.equal(ctx.logs.length, 0);
});

test("invalid JSON and reflected credentials in results are discarded", async () => {
  for (const response of [new Response("not JSON"), (() => { const p = payload(); p.extra = key; return Response.json(p); })()]) {
    const adapter = createServerAdapter({ fetchImpl: async () => response });
    const ctx = context(); const result = await adapter.execute(ctx);
    assert.equal(result.errorCode, "typesafe_invalid_response"); assert.equal(ctx.logs.length, 0);
  }
});
