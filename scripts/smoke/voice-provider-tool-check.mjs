/** Isolate Gemini tool handling from WHOXOS, with synthetic data only. */
import { createRequire } from "node:module";
import { setTimeout as delay } from "node:timers/promises";

const require = createRequire(new URL("../../server/package.json", import.meta.url));
const WebSocket = require("ws");
const apiKey = process.env.GEMINI_API_KEY;
if (process.env.VOICE_SMOKE_ALLOW_PROVIDER !== "1" || !apiKey) {
  throw new Error("Set VOICE_SMOKE_ALLOW_PROVIDER=1 and GEMINI_API_KEY. This check uses Gemini quota and synthetic flight data only.");
}
const model = "models/gemini-3.8-live-extended-thinking";
const setup = {
  model,
  generationConfig: {
    responseModalities: ["AUDIO"], thinkingConfig: { thinkingLevel: "HIGH" },
    speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Puck" } } },
  },
  outputAudioTranscription: {},
  tools: [{ functionDeclarations: [{
    name: "searchFlights", description: "Searches for flights between cities.", behavior: "NON_BLOCKING",
    parameters: { type: "OBJECT", properties: { destination: { type: "STRING" } }, required: ["destination"] },
  }] }],
  systemInstruction: { parts: [{ text: "You are a travel assistant in a test. Use the provided searchFlights function for flight requests. The function returns simulated fixture data, not live inventory. Do not book anything. Give a concise English answer from the returned result." }] },
};
const report = {
  model, thinking: "HIGH", contextTurns: 0, setupMs: null, firstAudioMs: null,
  toolCalls: 0, toolResponses: 0, unexpectedTool: false, wireError: false,
  audioReceived: false, idle: false, fixtureAnswer: false, claimedSystemError: false, passed: false,
};
const started = Date.now();
let ready = false, closed = false, questionAt = 0, lastOutputAt = 0, text = "";
// Key is sent in the authorization header, not a URL or log message.
const socket = new WebSocket("wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent", {
  headers: { "x-goog-api-key": apiKey },
});
const send = value => {
  if (socket.readyState !== WebSocket.OPEN) return false;
  socket.send(JSON.stringify(value));
  return true;
};
socket.on("open", () => send({ setup }));
socket.on("error", () => { report.wireError = true; });
socket.on("close", () => { closed = true; });
socket.on("message", raw => {
  try {
    const message = JSON.parse(raw.toString());
    if (message.error) report.wireError = true;
    if (message.setupComplete) { ready = true; report.setupMs = Date.now() - started; }
    if (!questionAt) return;
    const content = message.serverContent ?? {};
    const status = content.interactionStatus ?? content.interaction_status ?? message.interactionStatus ?? message.interaction_status;
    if (status) report.idle = status === "IDLE";
    if (typeof content.outputTranscription?.text === "string") {
      text = (text + content.outputTranscription.text).slice(0, 32_000);
      lastOutputAt = Date.now();
    }
    if (content.modelTurn?.parts?.some(part => part.inlineData?.data)) {
      report.audioReceived = true; report.firstAudioMs ??= Date.now() - questionAt; lastOutputAt = Date.now();
    }
    for (const call of message.toolCall?.functionCalls ?? []) {
      report.toolCalls++;
      if (call.name !== "searchFlights" || typeof call.id !== "string" || report.toolCalls > 3) {
        report.unexpectedTool = true; continue;
      }
      if (send({ toolResponse: { functionResponses: [{ id: call.id, name: call.name,
        response: { result: { flight: "DL 145", price: "$145" } },
      }] } })) { report.toolResponses++; report.idle = false; }
    }
  } catch { report.wireError = true; }
});
try {
  const setupDeadline = started + 15_000;
  while (!ready && !closed && !report.wireError && Date.now() < setupDeadline) await delay(50);
  if (ready) {
    questionAt = Date.now();
    send({ clientContent: { turns: [{ role: "user", parts: [{ text: "Find a flight to Seattle using the function, then tell me the flight and price." }] }], turnComplete: true } });
    const deadline = questionAt + 60_000;
    while (!closed && !report.wireError && Date.now() < deadline) {
      if (report.idle && report.audioReceived && Date.now() - lastOutputAt >= 1_500) break;
      await delay(100);
    }
  }
  report.fixtureAnswer = report.toolResponses > 0 && /(?:145|one hundred (?:and )?forty.five)/i.test(text);
  // Assertions only: this diagnostic never filters production audio or text.
  report.claimedSystemError = /system (?:error|issue)/i.test(text);
  report.passed = ready && !closed && !report.wireError && !report.unexpectedTool
    && report.idle && report.audioReceived && report.fixtureAnswer && !report.claimedSystemError;
} finally {
  text = ""; socket.close(); await delay(250);
  if (socket.readyState !== WebSocket.CLOSED) socket.terminate();
  console.log(JSON.stringify({ ...report, elapsedMs: Date.now() - started, syntheticDataOnly: true }, null, 2));
  if (!report.passed) process.exitCode = 1;
}
