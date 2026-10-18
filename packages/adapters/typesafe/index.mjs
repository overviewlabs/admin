import { setTimeout as delay } from "node:timers/promises";

const ENDPOINT = "https://api.typesafe.ai/v1/systemone";
const MAX_BYTES = 1_048_576;
export const models = [
  { id: "jev-latest", label: "Jev — latest stable" },
  { id: "jev-preview", label: "Jev — preview" },
  { id: "jev-1.13.0", label: "Jev 1.13.0" },
];

class AdapterError extends Error {
  constructor(code, message, extra = {}) {
    super(message);
    this.code = code;
    this.extra = extra;
  }
}
const record = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const description = (value) => (typeof value === "string" && value.trim().length > 0) || record(value) || Array.isArray(value);
const probability = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
const fail = (message) => { throw new AdapterError("typesafe_invalid_configuration", message); };

export function parseQuestions(config) {
  let questions = config.questions;
  if (typeof config.questionsJson === "string" && config.questionsJson.trim()) {
    try { questions = JSON.parse(config.questionsJson); }
    catch { fail("Questions must be a JSON object containing Choice, Score, or Noul questions."); }
  }
  if (!record(questions) || Object.keys(questions).length === 0) fail("Configure at least one TypeSafe question before running this adapter.");
  if (Object.keys(questions).length > 256) fail("This adapter supports up to 256 questions per evaluation.");
  for (const q of Object.values(questions)) {
    if (!record(q) || !["choice", "score", "noul"].includes(q.type) || !description(q.instructions)) fail("Each question needs a supported type and nonempty instructions.");
    if (Object.keys(q).some((key) => !["type", "instructions", "criteria"].includes(key))) fail("Questions contain an unsupported field; use type, instructions, and criteria.");
    if (q.type === "choice") {
      if (!record(q.criteria) || Object.keys(q.criteria).length < 1 || Object.keys(q.criteria).length > 255 || Object.values(q.criteria).some((v) => v !== null && !description(v))) fail("Choice criteria must contain 1–255 named options with descriptions or null values.");
    } else if (q.type === "score") {
      if (!Array.isArray(q.criteria) || q.criteria.length < 2 || q.criteria.length > 10 || !q.criteria.every(description)) fail("Score criteria must contain 2–10 ordered descriptions.");
    } else if (q.criteria !== undefined) {
      if (!record(q.criteria) || Object.keys(q.criteria).some((key) => !["true", "false"].includes(key)) || !Object.values(q.criteria).every(description)) fail("Noul criteria may only contain true and false descriptions.");
    }
  }
  return questions;
}

function apiKey(config) {
  const key = config.env?.TYPESAFE_API_KEY;
  if (typeof key !== "string" || !key.trim() || key === "***REDACTED***") {
    throw new AdapterError("typesafe_auth_missing", "Set TYPESAFE_API_KEY in this agent's Environment variables using an WHOXOS secret reference.");
  }
  return key.trim();
}

function settings(config) {
  const model = typeof config.model === "string" && config.model.trim() ? config.model.trim() : "jev-latest";
  if (!/^jev-(?:latest|preview|\d+\.\d+\.\d+)$/.test(model)) fail("Select a Jev model ID, such as jev-latest, jev-preview, or jev-1.13.0.");
  const timeout = config.timeoutSec ?? 45;
  if (!Number.isFinite(timeout) || timeout < 1 || timeout > 120) fail("Timeout must be between 1 and 120 seconds.");
  const retries = config.maxRetries ?? 2;
  if (!Number.isInteger(retries) || retries < 0 || retries > 3) fail("Retry count must be an integer between 0 and 3.");
  if (config.networkScope === "deny") fail("TypeSafe evaluations require network access to api.typesafe.ai.");
  if (config.networkScope === "allowlist" && !(Array.isArray(config.networkAllowlist) && config.networkAllowlist.some((host) => ["api.typesafe.ai", "api.typesafe.ai:443", "https://api.typesafe.ai"].includes(host)))) fail("The network allowlist must permit api.typesafe.ai.");
  return { model, timeoutMs: timeout * 1000, retries };
}

function stateForRun(config, context) {
  let state;
  if (typeof config.stateJson === "string" && config.stateJson.trim()) {
    try { state = JSON.parse(config.stateJson); }
    catch { fail("State must be valid JSON: a quoted string, object, or array."); }
  } else {
    // Only explicit evaluation inputs are sent. Never serialize the full run,
    // config, credentials, managed MCP tokens, or injected control-plane JWT.
    state = context.state ?? context.message ?? context.prompt;
  }
  if (!(typeof state === "string" || record(state) || Array.isArray(state))) fail("Supply stateJson in configuration or state/message/prompt in the wake context. Jev cannot hold a free-form conversation or perform coding tasks.");
  if (typeof state === "string" && !state.trim()) fail("The evaluation state must not be empty.");
  return state;
}

function equalKeys(value, keys) {
  return record(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}
function distribution(value, keys) {
  return equalKeys(value, keys) && Object.values(value).every(probability) && Math.abs(Object.values(value).reduce((a, b) => a + b, 0) - 1) <= 0.001;
}

export function validateResponse(response, questions) {
  const invalid = () => { throw new AdapterError("typesafe_invalid_response", "TypeSafe returned incomplete or invalid typed answers; no decision was accepted."); };
  if (!record(response) || typeof response.model !== "string" || !/^jev-\d+\.\d+\.\d+$/.test(response.model) || !equalKeys(response.answers, Object.keys(questions))) invalid();
  if (!record(response.usage) || !Number.isSafeInteger(response.usage.input_tokens) || response.usage.input_tokens < 0 || !Number.isSafeInteger(response.usage.output_tokens) || response.usage.output_tokens < 0) invalid();
  for (const [id, q] of Object.entries(questions)) {
    const a = response.answers[id];
    if (!record(a) || a.type !== q.type) invalid();
    if (q.type === "noul") {
      if (!probability(a.noul)) invalid();
    } else if (q.type === "choice") {
      const keys = Object.keys(q.criteria);
      if (typeof a.choice !== "string" || !keys.includes(a.choice) || !probability(a.confidence) || !distribution(a.probabilities, keys)) invalid();
    } else {
      const keys = q.criteria.map((_, i) => String(i));
      if (typeof a.score !== "number" || !Number.isFinite(a.score) || a.score < 0 || a.score > q.criteria.length - 1 || !probability(a.confidence) || !distribution(a.probabilities, keys) || !equalKeys(a.legend, keys) || !Object.values(a.legend).every((v) => typeof v === "string")) invalid();
    }
  }
  return response;
}

async function boundedJson(response) {
  if (!response.body) throw new AdapterError("typesafe_invalid_response", "TypeSafe returned an empty response.");
  const reader = response.body.getReader();
  const chunks = []; let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_BYTES) throw new AdapterError("typesafe_response_too_large", "TypeSafe response exceeded the adapter's 1 MiB limit.");
      chunks.push(Buffer.from(value));
    }
    try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
    catch { throw new AdapterError("typesafe_invalid_response", "TypeSafe returned invalid JSON."); }
  } finally { await reader.cancel().catch(() => {}); }
}

function retryDelay(response, attempt) {
  const raw = response.headers.get("retry-after");
  const seconds = raw !== null && /^\d+(?:\.\d+)?$/.test(raw) ? Number(raw) * 1000 : Date.parse(raw ?? "") - Date.now();
  return Math.max(0, Math.min(8_640_000_000_000_000 - Date.now() - 1000, Number.isFinite(seconds) ? seconds : Math.min(8000, 1000 * 2 ** attempt)));
}

function httpFailure(status, retryAt, providerType) {
  if (providerType === "max_tokens_exceeded") return new AdapterError("typesafe_context_too_large", "Jev rejected this evaluation because its task context exceeded the model token limit. Choose fewer tasks or explicitly select relevant comments and documents with taskEvidence, then submit a new evidence version. No answer was produced.");
  const message = status === 401 ? "TypeSafe rejected TYPESAFE_API_KEY. Check or rotate the agent's secret." : status === 403 ? "This TypeSafe account cannot access the selected Jev model." : status === 422 ? "TypeSafe rejected the state or typed questions. Check the configuration and context limits." : status === 429 ? "TypeSafe rate limit reached. Retry after the provider's waiting period." : status === 529 ? "TypeSafe is temporarily overloaded." : `TypeSafe evaluation failed with HTTP ${status}.`;
  return new AdapterError(status === 401 || status === 403 ? "typesafe_auth_rejected" : `typesafe_http_${status}`, message, {
    ...(status === 429 ? { errorFamily: "provider_quota" } : status === 529 || status >= 500 ? { errorFamily: "transient_upstream" } : {}),
    ...(retryAt ? { retryNotBefore: retryAt } : {}),
  });
}

function summary(response) {
  const lines = Object.entries(response.answers).map(([id, answer]) => {
    const value = answer.type === "choice" ? answer.choice : answer.type === "score" ? answer.score : answer.noul;
    const confidence = answer.confidence === undefined ? "" : ` (confidence ${answer.confidence})`;
    return `${id}: ${value}${confidence}`;
  });
  return [`TypeSafe ${response.model} evaluation`, ...lines].join("\n");
}

export function createServerAdapter({ fetchImpl = fetch } = {}) {
  async function evaluate(config, state, questions, ctx = {}) {
    if (ctx.executionTarget?.kind === "remote") fail("This API adapter runs on the WHOXOS server. Select the local environment; it cannot silently bypass a remote environment's network policy.");
    const { model, timeoutMs, retries } = settings(config);
    const key = apiKey(config);
    const body = JSON.stringify({ state, model, questions });
    if (Buffer.byteLength(body) > MAX_BYTES) fail("Evaluation request exceeds this adapter's 1 MiB limit. Reduce the state or questions.");
    const deadline = Date.now() + timeoutMs;
    const timeout = AbortSignal.timeout(timeoutMs);
    const signal = ctx.signal ? AbortSignal.any([ctx.signal, timeout]) : timeout;
    await ctx.onCancellationReady?.();
    signal.throwIfAborted();
    ctx.onDispatch?.();
    for (let attempt = 0; ; attempt++) {
      // Never follow redirects with credentials; the provider origin is fixed.
      const response = await fetchImpl(ENDPOINT, { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body, redirect: "error", signal });
      if (response.ok) {
        const payload = validateResponse(await boundedJson(response), questions);
        if (JSON.stringify(payload).includes(key)) throw new AdapterError("typesafe_invalid_response", "TypeSafe returned sensitive credential material; the response was discarded.");
        return payload;
      }
      const wait = retryDelay(response, attempt);
      let providerType;
      if (response.status === 400 || response.status === 422) {
        try { providerType = (await boundedJson(response))?.detail?.error_type; } catch { /* Never expose arbitrary provider error bodies. */ }
      } else await response.body?.cancel();
      if (![429, 529].includes(response.status) || attempt >= retries || wait >= deadline - Date.now()) throw httpFailure(response.status, [429, 529].includes(response.status) ? new Date(Date.now() + wait).toISOString() : undefined, providerType);
      await delay(wait, undefined, { signal });
    }
  }

  async function execute(ctx) {
    try {
      if (ctx.config.agentOnly === true && (!ctx.context.decisionEvaluationId || !ctx.context.decisionEngineCallerAgentId)) {
        throw new AdapterError("typesafe_agent_only", "Real-Time Decision Engine accepts only authenticated agent evaluations; direct chat and manual execution are unavailable.");
      }
      const evaluationConfig = ctx.context.decisionEvaluationId
        ? { ...ctx.config, questionsJson: "", questions: ctx.context.typesafeQuestions, stateJson: "" }
        : ctx.config;
      const questions = parseQuestions(evaluationConfig);
      const state = stateForRun(evaluationConfig, ctx.context);
      const response = await evaluate(ctx.config, state, questions, ctx);
      const text = summary(response);
      await ctx.onLog("stdout", JSON.stringify({ type: "jev.result", text, model: response.model, answers: response.answers, usage: response.usage }) + "\n");
      return { exitCode: 0, signal: null, timedOut: false, summary: text, resultJson: response, model: response.model, provider: "typesafe", biller: "typesafe", billingType: "metered_api", usageBasis: "per_run", usage: { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens } };
    } catch (error) {
      if (ctx.signal?.aborted) return { exitCode: null, signal: "SIGTERM", timedOut: false, errorCode: "cancelled", errorMessage: "TypeSafe evaluation was cancelled; no decision was accepted." };
      if (error?.name === "TimeoutError" || error?.name === "AbortError") return { exitCode: null, signal: null, timedOut: true, errorCode: "timeout", errorMessage: "TypeSafe evaluation timed out; the provider outcome is unknown. No automatic replay was attempted." };
      return { exitCode: 1, signal: null, timedOut: false, errorCode: error instanceof AdapterError ? error.code : "typesafe_connection_failed", errorMessage: error instanceof AdapterError ? error.message : "Could not complete the TypeSafe evaluation; the provider outcome is unknown. No automatic replay was attempted.", ...(error instanceof AdapterError ? error.extra : {}) };
    }
  }

  async function testEnvironment(ctx) {
    try {
      if (ctx.config.questionsJson || ctx.config.questions) parseQuestions(ctx.config);
      const questions = { connection_test: { type: "noul", instructions: "Does the state contain the word TypeSafe?" } };
      const response = await evaluate(ctx.config, "TypeSafe connection test", questions, ctx);
      return { adapterType: "typesafe", status: "pass", testedAt: new Date().toISOString(), checks: [{ code: "typesafe_evaluation_passed", level: "info", message: `Authenticated TypeSafe evaluation succeeded with ${response.model}.` }, { code: "typesafe_decision_adapter", level: "info", message: "Jev evaluates typed questions. It does not generate chat responses, edit files, or execute tools." }] };
    } catch (error) {
      return { adapterType: "typesafe", status: "fail", testedAt: new Date().toISOString(), checks: [{ code: error instanceof AdapterError ? error.code : "typesafe_connection_failed", level: "error", message: error instanceof AdapterError ? error.message : "The TypeSafe connection test did not complete. Check the key and retry." }] };
    }
  }

  return {
    type: "typesafe", models, listModels: async () => models, refreshModels: async () => models,
    execute, testEnvironment,
    supportsLocalAgentJwt: false, supportsInstructionsBundle: false, requiresMaterializedRuntimeSkills: false,
    getConfigSchema: () => ({ fields: [
      { key: "model", label: "Jev model", type: "select", default: "jev-latest", options: models.map((m) => ({ value: m.id, label: m.label })), hint: "A structured decision model for classifications, scoring, and probabilities. This adapter does not provide chat, coding, or tool execution." },
      { key: "questionsJson", label: "Typed questions (JSON)", type: "textarea", required: true, hint: 'Configure named questions, for example {"urgent":{"type":"noul","instructions":"Does this express urgency?"}}. Supports Choice, Score, and Noul. Store TYPESAFE_API_KEY as a secret reference in Environment variables.' },
      { key: "stateJson", label: "Evaluation state (JSON)", type: "textarea", hint: 'Optional quoted text, object, or array. Leave empty to use state, message, or prompt from the wake context. Unrelated run context and credentials are never sent.' },
      { key: "timeoutSec", label: "Request timeout (seconds)", type: "number", default: 45, hint: "1–120 seconds, including rate-limit backoff." },
      { key: "maxRetries", label: "Rate-limit retries", type: "number", default: 2, hint: "0–3 retries, only for explicit HTTP 429 or 529 responses. Timeouts and network errors are not replayed." },
    ] }),
    agentConfigurationDoc: `# TypeSafe Jev decision adapter\n\nAdapter: typesafe\n\nConfigure env.TYPESAFE_API_KEY using an WHOXOS secret reference. Credentials must be explicitly assigned to each agent; host credentials are not inherited.\n\nSelect jev-latest, jev-preview, or jev-1.13.0. questionsJson is a JSON map of Choice, Score, and Noul questions. stateJson is an optional JSON string, object, or array; otherwise a run must supply context.state, context.message, or context.prompt.\n\nEach run performs one structured evaluation and records typed answers, confidence, the resolved model, and per-run token usage. Jev is not a chat or coding model and does not execute tools or place orders. No action is authorized by a classification result. The API runs in the local server environment.\n\nUse Test to perform a small authenticated synthetic evaluation. Missing credentials, unsupported remote execution, invalid questions, and invalid answers fail explicitly. Only provider-declined 429/529 requests are retried, with Retry-After and a bounded deadline. Unknown network outcomes are not retried.\n\nOfficial API: https://docs.typesafe.ai/api\nModels: https://docs.typesafe.ai/models\n`,
  };
}
