/** Read-only provider diagnostic. Never contacts WHOXOS or executes a real action.
 * GEMINI_API_KEY=... node scripts/diagnose-gemini-live-tools.mjs
 * Requires Node 22+. The API key is never printed.
 */
const key = process.env.GEMINI_API_KEY;
if (!key) throw new Error('Set GEMINI_API_KEY to run this optional live diagnostic.');
const model = 'models/gemini-3.8-live-extended-thinking';
const started = Date.now();
let calls = 0;
let transcript = '';
let finished = false;
const socket = new WebSocket(`wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${encodeURIComponent(key)}`);
function finish(reason) {
  if (finished) return;
  finished = true;
  clearTimeout(timer);
  const passed = reason === 'idle' && calls > 0 && /\b17\b|seventeen/i.test(transcript) && !/system error/i.test(transcript);
  console.log(JSON.stringify({ model, reason, passed, calls, transcript: transcript.slice(0, 1500), elapsedMs: Date.now() - started }));
  process.exitCode = passed ? 0 : 1;
  socket.close();
}
const timer = setTimeout(() => finish('timeout'), 45_000);
socket.onopen = () => socket.send(JSON.stringify({ setup: {
  model,
  generationConfig: { responseModalities: ['AUDIO'], thinkingConfig: { thinkingLevel: 'HIGH' } },
  systemInstruction: { parts: [{ text: 'This is a test. Use get_count to answer the count question and report its result.' }] },
  tools: [{ functionDeclarations: [{ name: 'get_count', description: 'Get the test agent count.', behavior: 'NON_BLOCKING', parameters: { type: 'OBJECT', properties: {} } }] }],
  outputAudioTranscription: {},
} }));
socket.onmessage = async event => {
  if (finished) return;
  try {
    const message = JSON.parse(typeof event.data === 'string' ? event.data : await event.data.text());
    if (message.setupComplete) socket.send(JSON.stringify({ clientContent: { turns: [{ role: 'user', parts: [{ text: 'How many agents are there?' }] }], turnComplete: true } }));
    for (const call of message.toolCall?.functionCalls ?? []) {
      if (call.name !== 'get_count') { finish('unexpected_tool'); return; }
      calls++;
      socket.send(JSON.stringify({ toolResponse: { functionResponses: [{ id: call.id, name: call.name, response: { result: { count: 17 }, scheduling: 'INTERRUPT' } }] } }));
    }
    transcript += message.serverContent?.outputTranscription?.text ?? '';
    if (message.error) { finish('provider_error'); return; }
    // turnComplete may finish only an interim utterance in Extended Thinking.
    if ((message.interactionStatus ?? message.serverContent?.interactionStatus) === 'IDLE') finish('idle');
  } catch { finish('invalid_message'); }
};
socket.onerror = () => finish('socket_error');
socket.onclose = () => finish('socket_closed');
