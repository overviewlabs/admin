/**
 * Opt-in real-provider check. Never writes chat transcripts or launches a text model.
 * Offline checks: VOICE_SMOKE_SELF_TEST=1 node scripts/smoke/voice-live-readiness.mjs
 * Audio mode: set VOICE_SMOKE_AUDIO_PCM=/path/question.pcm and exactly one
 * VOICE_SMOKE_SCENARIOS=news_search (or another existing scenario), alongside
 * the usual authenticated live-test environment. The raw fixture must speak
 * that scenario's question. This is not a physical microphone/browser test.
 */
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { open } from "node:fs/promises";
import assert from "node:assert/strict";

const PCM_BYTES_PER_SECOND = 16_000 * 2;
const PCM_FRAME_BYTES = 640; // 20 ms of mono PCM16LE at 16 kHz.
const MAX_PCM_BYTES = 15 * PCM_BYTES_PER_SECOND;
const searchCategories = ["general", "images", "videos", "news"];
const timeRanges = ["day", "week", "month", "year"];
// A log allowlist only, not an assertion that every provider supports each code.
const turnCompleteReasons = new Set([
  "TURN_COMPLETE_REASON_UNSPECIFIED", "NORMAL", "INTERRUPTED", "MALFORMED_FUNCTION_CALL",
  "UNEXPECTED_TOOL_CALL", "SAFETY", "MAX_TOKENS", "OTHER",
]);
const safeReason = value => turnCompleteReasons.has(value) ? value : "UNKNOWN";
const safeEnum = (value, values) => values.includes(value) ? value : "UNKNOWN";

function validateAudioPcm(pcm) {
  if (!Buffer.isBuffer(pcm) || pcm.length < PCM_BYTES_PER_SECOND || pcm.length > MAX_PCM_BYTES || pcm.length % 2) {
    throw new Error("VOICE_SMOKE_AUDIO_PCM must contain 1–15 seconds of raw mono PCM16LE at 16 kHz, with an even byte count.");
  }
  if (["RIFF", "RF64"].includes(pcm.toString("ascii", 0, 4)) && pcm.toString("ascii", 8, 12) === "WAVE") {
    throw new Error("VOICE_SMOKE_AUDIO_PCM requires raw PCM, not a WAV container.");
  }
  return pcm;
}

async function loadAudioPcm(path) {
  const file = await open(path, "r");
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size < PCM_BYTES_PER_SECOND || stat.size > MAX_PCM_BYTES || stat.size % 2) {
      throw new Error("Invalid PCM fixture size or file type.");
    }
    // Also bound reads if the file changes between stat and read.
    const buffer = Buffer.alloc(MAX_PCM_BYTES + 1);
    let bytes = 0;
    while (bytes < buffer.length) {
      const read = await file.read(buffer, bytes, buffer.length - bytes, null);
      if (!read.bytesRead) break;
      bytes += read.bytesRead;
    }
    return validateAudioPcm(buffer.subarray(0, bytes));
  } finally { await file.close(); }
}

async function streamAudioPcm(pcm, send, wait = delay, now = () => performance.now()) {
  const checkedSend = message => { if (!send(message)) throw new Error("Provider disconnected during audio input."); };
  checkedSend({ realtimeInput: { activityStart: {} } });
  const start = now();
  for (let offset = 0; offset < pcm.length; offset += PCM_FRAME_BYTES) {
    const frame = pcm.subarray(offset, Math.min(offset + PCM_FRAME_BYTES, pcm.length));
    checkedSend({ realtimeInput: { audio: { data: frame.toString("base64"), mimeType: "audio/pcm;rate=16000" } } });
    const nextFrameAt = start + (offset + frame.length) / PCM_BYTES_PER_SECOND * 1000;
    if (nextFrameAt > now()) await wait(nextFrameAt - now());
  }
  checkedSend({ realtimeInput: { activityEnd: {} } });
}

function requestedSearch(call) {
  try {
    const value = call.name === "search_web" ? call.args
      : typeof call.args?.data === "string" ? JSON.parse(call.args.data) : undefined;
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  }
  catch { return {}; }
}

function newsDateBoundsValid(result, started, completed) {
  const filter = result.dateFilter;
  const since = Date.parse(filter?.since), until = Date.parse(filter?.until);
  return result.timeRange === "week" && filter?.appliedBy === "server" && filter.rollingDays === 7
    && until - since === 7 * 86_400_000 && until >= started - 1000 && until <= completed + 1000
    && Array.isArray(result.results) && result.results.length <= 8
    && result.results.every(row => typeof row.publishedAt === "string"
      && Number.isFinite(Date.parse(row.publishedAt)) && Date.parse(row.publishedAt) >= since && Date.parse(row.publishedAt) <= until);
}

const titleStopWords = new Set("about after against before being crime crimes current from hamilton have into latest news ohio over police recent report reported reports said says that their them there these they this through township under update updates were what when where which while with would your".split(" "));
const titleTokens = value => [...new Set((typeof value === "string" ? value.toLowerCase().match(/[a-z]{4,}/g) ?? [] : [])
  .filter(token => !titleStopWords.has(token)))];
function sourceTitleAnchors(result) {
  const sources = new Set((Array.isArray(result.sources) ? result.sources : []).map(source => source.uri));
  return (Array.isArray(result.results) ? result.results.slice(0,8) : [])
    .filter(row => typeof row.url === "string" && sources.has(row.url))
    .map(row => titleTokens(typeof row.title === "string" ? row.title.slice(0,300).replace(/\s[-–|]\s[^-–|]+$/, "") : ""));
}
function verifyNews(turn) {
  const searches = turn.calls.filter(call => call.action === "search_web");
  if (!searches.length || !searches.every(call => call.ok && call.requestedCategory === "news"
    && call.category === "news" && call.requestedTimeRange === "week" && call.timeRange === "week" && call.newsDateBoundsValid)) return false;
  if (searches.every(call => call.resultCount === 0)) {
    return /\b(?:no (?:matching|verified|recent|relevant|dated|news|crime|local) (?:\w+\s+){0,4}(?:reports?|results?|stories|articles?|news)|(?:could not|couldn't|did not|didn't|unable to) (?:find|verify|confirm) (?:\w+\s+){0,6}(?:reports?|results?|stories|articles?|news))\b/i.test(turn.text);
  }
  const words = new Set(titleTokens(turn.text));
  return (turn.newsTitleAnchors ?? []).some(tokens => tokens.filter(token => words.has(token)).length >= 2);
}

async function selfTest() {
  const pcm = Buffer.alloc(PCM_BYTES_PER_SECOND + 320);
  assert.equal(validateAudioPcm(pcm), pcm);
  for (const size of [0, 31_998, 32_001, MAX_PCM_BYTES + 2]) assert.throws(() => validateAudioPcm(Buffer.alloc(size)));
  const wav = Buffer.alloc(PCM_BYTES_PER_SECOND); wav.write("RIFF"); wav.write("WAVE",8);
  assert.throws(() => validateAudioPcm(wav));
  const frames = []; let now = 0;
  await streamAudioPcm(pcm, value => { frames.push({ at: now, value }); return true; }, async ms => { now += ms; }, () => now);
  assert.deepEqual(frames[0].value, { realtimeInput: { activityStart: {} } });
  assert.deepEqual(frames.at(-1).value, { realtimeInput: { activityEnd: {} } });
  const audio = frames.slice(1,-1);
  assert.equal(audio.length,51); assert.equal(now,1010);
  assert.deepEqual(Buffer.concat(audio.map(frame => Buffer.from(frame.value.realtimeInput.audio.data,"base64"))), pcm);
  assert.equal(audio[1].at - audio[0].at,20);
  assert.equal(Buffer.from(audio.at(-1).value.realtimeInput.audio.data,"base64").length,320);
  await assert.rejects(streamAudioPcm(pcm, () => false));
  const until = Date.parse("2026-09-28T01:00:00Z");
  const result = { timeRange:"week", dateFilter:{appliedBy:"server",rollingDays:7,since:new Date(until-7*86_400_000).toISOString(),until:new Date(until).toISOString()},
    results:[{title:"Smoke shop owners plead guilty - Example News",url:"https://example.org/story",publishedAt:new Date(until-1000).toISOString()}],
    sources:[{uri:"https://example.org/story"}] };
  assert.equal(newsDateBoundsValid(result,until-10,until+10),true);
  for (const invalid of [{...result,dateFilter:{...result.dateFilter,rollingDays:1}}, {...result,results:[{...result.results[0],publishedAt:new Date(until+1).toISOString()}]},
    {...result,results:[{...result.results[0],publishedAt:undefined}]}, {...result,dateFilter:{...result.dateFilter,until:new Date(until-30_000).toISOString()}}]) {
    assert.equal(newsDateBoundsValid(invalid,until-10,until+10),false);
  }
  const call = {action:"search_web",ok:true,requestedCategory:"news",category:"news",requestedTimeRange:"week",timeRange:"week",newsDateBoundsValid:true,resultCount:1};
  const turn = {calls:[call],text:"The smoke shop owners pleaded guilty.",newsTitleAnchors:sourceTitleAnchors(result)};
  assert.equal(verifyNews(turn),true);
  assert.equal(verifyNews({...turn,text:"Here is recent crime news for Hamilton, Ohio."}),false);
  assert.equal(verifyNews({...turn,newsTitleAnchors:sourceTitleAnchors({...result,sources:[]})}),false);
  for (const invalid of [{...call,category:"general"},{...call,requestedCategory:"general"},{...call,requestedTimeRange:"day"},{...call,newsDateBoundsValid:false}]) {
    assert.equal(verifyNews({...turn,calls:[call,invalid]}),false);
  }
  assert.equal(verifyNews({...turn,calls:[{...call,resultCount:0}],text:"No matching reports were found in the past week."}),true);
  assert.equal(verifyNews({...turn,text:"No matching reports were found in the past week."}),false);
  assert.equal(safeReason("MALFORMED_FUNCTION_CALL"),"MALFORMED_FUNCTION_CALL");
  assert.equal(safeReason("private provider detail"),"UNKNOWN");
  assert.deepEqual(requestedSearch({name:"organization_api",args:{data:"null"}}),{});
  assert.deepEqual(requestedSearch({name:"organization_api",args:{data:'{"category":"news","timeRange":"week"}'}}),{category:"news",timeRange:"week"});
  console.log(JSON.stringify({selfTest:true,passed:true,providerCalled:false}));
}

if (process.env.VOICE_SMOKE_SELF_TEST === "1") { await selfTest(); process.exit(0); }

const require = createRequire(new URL("../../server/package.json", import.meta.url));
const WebSocket = require("ws");
const base = new URL(process.env.VOICE_SMOKE_URL || "http://127.0.0.1:3100");
const company = process.env.VOICE_SMOKE_COMPANY_ID;
const agent = process.env.VOICE_SMOKE_AGENT_ID;
const issue = process.env.VOICE_SMOKE_ISSUE_ID;
const cookie = process.env.VOICE_SMOKE_COOKIE;
if (process.env.VOICE_SMOKE_ALLOW_PROVIDER !== "1" || !company || !agent || !issue || !cookie) {
  throw new Error("Set VOICE_SMOKE_ALLOW_PROVIDER=1, URL, COMPANY_ID, AGENT_ID, ISSUE_ID and COOKIE. This uses the authenticated user's Gemini quota.");
}
if (base.username || base.password || base.search || base.hash || base.pathname !== "/"
  || !(base.protocol === "https:" || base.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(base.hostname))) {
  throw new Error("VOICE_SMOKE_URL must be an HTTPS origin or local HTTP origin.");
}
const headers = { Cookie: cookie, Origin: base.origin, "Content-Type": "application/json" };
// Do not serialize provider failures, headers, raw setup, tokens, results or transcripts.
async function api(path, body) {
  const response = await fetch(new URL(`/api/companies/${encodeURIComponent(company)}${path}`, base), {
    method: body === undefined ? "GET" : "POST", headers, redirect: "error",
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) { await response.body?.cancel(); throw new Error(`Application HTTP ${response.status}`); }
  return response.json();
}
const numberWords = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
  "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty",
  "twenty.one", "twenty.two", "twenty.three", "twenty.four", "twenty.five", "twenty.six", "twenty.seven",
  "twenty.eight", "twenty.nine", "thirty"];
const codeCommand = "python3 -c 'print(sum([17, 25]))'";
const availableScenarios = [
  { name: "organization_roster", question: "Use get_organization_agents now. How many agents can you access in this organization? Answer with the count.",
    verify: turn => (turn.rosterContextVerified || turn.calls.some(call => call.name === "get_organization_agents" && call.ok))
      && Number.isInteger(turn.rosterCount)
      && new RegExp(`\\b(?:${turn.rosterCount}|${numberWords[turn.rosterCount] ?? "(?!)"})\\b`, "i").test(turn.text) },
  { name: "general_search", question: "Search the web for NASA explaining a lunar eclipse, then explain it in one sentence from the search results.",
    verify: turn => turn.calls.some(call => call.action === "search_web" && call.ok && call.category === "general" && call.resultCount > 0)
      && /moon/i.test(turn.text) && /earth/i.test(turn.text) },
  { name: "news_search", question: "Any recent crime activity in Hamilton, Ohio I should be aware about? Search News for the past week. Give a short sourced answer or say if no matching reports were found.",
    verify: verifyNews },
  { name: "code_execution", question: `Use voice_workspace to run exactly this command: ${codeCommand}. Read the result aloud. Do not write files or run any other command.`,
    verify: turn => turn.calls.some(call => call.name === "voice_workspace" && call.ok && call.exitCode === 0)
      && turn.codeOutput?.trim() === "42" && /\b(?:42|forty.two)\b/i.test(turn.text) },
];
const selected = process.env.VOICE_SMOKE_SCENARIOS?.split(",");
if (selected?.some(name => !availableScenarios.some(item => item.name === name))) throw new Error("Unknown readiness scenario");
const scenarios = selected ? availableScenarios.filter(item => selected.includes(item.name)) : availableScenarios;
// Audio fixtures must contain the chosen scenario's question; their contents
// are never logged. Text mode still sends the existing scenario questions.
const audioPath = process.env.VOICE_SMOKE_AUDIO_PCM;
if (audioPath && (selected?.length !== 1 || scenarios.length !== 1)) {
  throw new Error("Audio mode requires exactly one scenario in VOICE_SMOKE_SCENARIOS.");
}
let audioPcm;
if (audioPath) {
  try { audioPcm = await loadAudioPcm(audioPath); }
  catch { throw new Error("Cannot load VOICE_SMOKE_AUDIO_PCM: require a regular raw mono PCM16LE/16kHz file, 1–15 seconds, without a WAV header."); }
}

const started = Date.now();
const [voice] = await api("/voice-sessions", { agentIds: [agent], issueId: issue, audioTurnMode: "client", voiceToolsVersion: 3 });
const model = voice.setup.model;
if (model !== "models/gemini-3.8-live-extended-thinking"
  || voice.setup.generationConfig?.thinkingConfig?.thinkingLevel !== "HIGH") throw new Error("Selected voice model or thinking level changed.");
if (audioPcm && voice.setup.realtimeInputConfig?.automaticActivityDetection?.disabled !== true) {
  throw new Error("Audio fixture mode requires the server-authorized manual activity configuration.");
}
const socket = new WebSocket("wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained?access_token=" + encodeURIComponent(voice.token));
let ready = false, closed = false, current = null, pending = 0, wireFailed = false;
const report = { model, thinking: "HIGH", inputMode:audioPcm ? "pcm_fixture" : "text",
  ...(audioPcm ? {fixtureDurationMs:audioPcm.length / PCM_BYTES_PER_SECOND * 1000} : {}),
  setupMs: null, scenarios: [], passed: false, transcriptsPersisted: false };
const send = value => {
  if (socket.readyState !== WebSocket.OPEN) return false;
  socket.send(JSON.stringify(value));
  return true;
};
socket.on("open", () => send({ setup: voice.setup }));
socket.on("error", () => { wireFailed = true; });
socket.on("close", () => { closed = true; });
async function handle(call, turn) {
  pending++;
  const start = Date.now();
  const action = ["search_web", "read_web_page"].includes(call.name) ? call.name : call.args?.action;
  const evidence = {
    name: ["get_organization_agents", "get_agent_context", "organization_api", "search_web", "read_web_page", "voice_workspace"].includes(call.name) ? call.name : "unknown",
    action: ["capabilities", "overview", "list_tasks", "list_agents", "search_web", "read_web_page"].includes(action) ? action : undefined,
    ok: false,
  };
  if (action === "search_web") {
    const requested = requestedSearch(call);
    evidence.requestedCategory = safeEnum(requested.category ?? "general", searchCategories);
    evidence.requestedTimeRange = safeEnum(requested.timeRange, timeRanges);
  }
  try {
    let result;
    if (call.name === "get_organization_agents") {
      result = await api(`/voice-sessions/${voice.sessionId}/roster`);
      turn.rosterCount = result.count;
    } else if (call.name === "get_agent_context") {
      result = await api(`/voice-sessions/${voice.sessionId}/context`);
    } else if (call.name === "voice_workspace" && call.args?.command === codeCommand) {
      result = await api(`/voice-sessions/${voice.sessionId}/tools`, {
        name: call.name, args: { command: codeCommand, timeoutMs: 5_000 }, callId: call.id || randomUUID(),
      });
      turn.codeOutput = result.output;
      evidence.exitCode = result.exitCode;
    } else if (call.name === "search_web" || call.name === "read_web_page"
      || call.name === "organization_api" && ["capabilities", "overview", "list_tasks", "list_agents", "search_web", "read_web_page"].includes(action)) {
      result = await api(`/voice-sessions/${voice.sessionId}/tools`, {
        name: "organization_api", callId: call.id || randomUUID(),
        args: call.name === "organization_api" ? call.args : { action, data: JSON.stringify(call.args) },
      });
      if (action === "search_web") {
        evidence.category = safeEnum(result.category, searchCategories);
        evidence.timeRange = safeEnum(result.timeRange, timeRanges);
        evidence.resultCount = Array.isArray(result.results) ? result.results.length : null;
        if (evidence.category === "news") {
          evidence.newsDateBoundsValid = newsDateBoundsValid(result,start,Date.now());
          turn.newsTitleAnchors.push(...sourceTitleAnchors(result));
        }
      }
    } else throw new Error("Operation outside the readiness test allowlist");
    evidence.ok = true;
    send({ toolResponse: { functionResponses: [{ id: call.id, name: call.name, response: { result } }] } });
  } catch {
    send({ toolResponse: { functionResponses: [{ id: call.id, name: call.name,
      response: { error: "The readiness test could not execute this operation; no other action was performed." } }] } });
  } finally {
    evidence.elapsedMs = Date.now() - start;
    turn.calls.push(evidence);
    // An earlier IDLE packet cannot finish a turn before this result is consumed.
    turn.status = "AWAITING_RESULT";
    pending--;
  }
}
socket.on("message", raw => {
  try {
    const message = JSON.parse(raw.toString());
    if (message.setupComplete) {
      report.setupMs = Date.now() - started;
      if (voice.context?.length) send({ clientContent: { turns: voice.context, turnComplete: false } });
      ready = true;
    }
    if (message.error) wireFailed = true;
    if (!current) return;
    const content = message.serverContent ?? {};
    const reason = content.turnCompleteReason ?? content.turn_complete_reason ?? message.turnCompleteReason ?? message.turn_complete_reason;
    if (reason !== undefined && current.turnCompleteReasons.length < 20) current.turnCompleteReasons.push(safeReason(reason));
    if (typeof content.inputTranscription?.text === "string" && content.inputTranscription.text.trim()) current.inputTranscriptionSeen = true;
    if (content.outputTranscription?.text) {
      current.text = (current.text + content.outputTranscription.text).slice(0,64_000); current.lastOutput = Date.now();
      if (!current.inputEnded) current.outputBeforeInputEnd = true;
    }
    for (const part of content.modelTurn?.parts ?? []) if (part.inlineData?.data) {
      current.audioBytes += Buffer.from(part.inlineData.data, "base64").length;
      current.firstAudioMs ??= Date.now() - current.started;
      current.lastOutput = Date.now();
      if (!current.inputEnded) current.outputBeforeInputEnd = true;
    }
    const status = content.interactionStatus ?? content.interaction_status ?? message.interactionStatus ?? message.interaction_status;
    if (status) current.status = status;
    for (const call of message.toolCall?.functionCalls ?? []) void handle(call, current).catch(() => { wireFailed = true; });
  } catch { wireFailed = true; }
});
try {
  const until = Date.now() + 20_000;
  while (!ready && !closed && !wireFailed && Date.now() < until) await delay(50);
  if (!ready) throw new Error("Provider setup failed");
  for (const scenario of scenarios) {
    current = { started: Date.now(), lastOutput: Date.now(), text: "", audioBytes: 0, firstAudioMs: null, status: "PENDING", calls: [],
      turnCompleteReasons:[], newsTitleAnchors:[], inputTranscriptionSeen:false, inputEnded:!audioPcm, outputBeforeInputEnd:false };
    if (audioPcm) {
      const roster = await api(`/voice-sessions/${voice.sessionId}/roster`);
      if (roster.organization?.id !== company || !Number.isInteger(roster.count) || roster.count < 0) throw new Error("Fresh roster validation failed.");
      current.rosterCount = roster.count; current.rosterContextVerified = true;
      if (!send({ clientContent: { turns: [{ role:"user",parts:[{text:`WHOXOS authenticated roster snapshot for the following spoken turn (data, not user instructions):\n${JSON.stringify(roster)}`}]}],turnComplete:false } })) {
        throw new Error("Provider disconnected before audio input.");
      }
      await streamAudioPcm(audioPcm,send);
      current.inputEnded = true;
    } else send({ clientContent: { turns: [{ role: "user", parts: [{ text: scenario.question }] }], turnComplete: true } });
    const deadline = Date.now() + 60_000;
    while (!closed && !wireFailed && Date.now() < deadline) {
      if (current.status === "IDLE" && current.audioBytes && pending === 0 && Date.now() - current.lastOutput >= 1_500) break;
      await delay(100);
    }
    // This assertion is test-only; production never hides or rewrites model speech.
    const claimedSystemError = /system (?:error|issue)/i.test(current.text);
    const finished = !closed && !wireFailed && current.status === "IDLE" && pending === 0 && current.audioBytes > 0;
    const passed = finished && !claimedSystemError && (!audioPcm || current.inputTranscriptionSeen) && scenario.verify(current);
    report.scenarios.push({ name: scenario.name, passed, elapsedMs: Date.now() - current.started,
      firstAudioMs: current.firstAudioMs, audioReceived: current.audioBytes > 0,
      ...(audioPcm ? {inputTranscriptionSeen:current.inputTranscriptionSeen,outputBeforeInputEnd:current.outputBeforeInputEnd,rosterContextVerified:current.rosterContextVerified === true} : {}),
      claimedSystemError, turnCompleteReasons:current.turnCompleteReasons, wireFailed, pendingAtEnd: pending, calls: current.calls });
    current = null;
    // Never attribute a late callback from a timed-out turn to another scenario.
    if (closed || wireFailed || !finished) break;
  }
  report.passed = report.scenarios.length === scenarios.length && report.scenarios.every(item => item.passed);
} catch {
  report.passed = false;
} finally {
  socket.close();
  await delay(300);
  if (socket.readyState !== WebSocket.CLOSED) socket.terminate();
  // Report contains only allowlisted timings/counts/outcomes, never conversation content.
  console.log(JSON.stringify(report, null, 2));
  if (!report.passed) process.exitCode = 1;
}
