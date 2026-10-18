import { afterEach, expect, it, vi } from "vitest";
import type { VoiceSession } from "@whoxos/shared/agent-voice";
import { AgentVoiceLive } from "./agent-voice-live";

vi.mock("./voice-playback", () => ({ VoicePlayback: class {} }));
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
const roster = { organization: { id: "company" } };
function fixture(authorize = vi.fn(async (_signal: AbortSignal) => roster)) {
  vi.useFakeTimers(); vi.stubGlobal("WebSocket", { OPEN: 1 });
  const live = new AgentVoiceLive({ context: [], setup: {
    model: "models/gemini-3.8-live-extended-thinking",
    realtimeInputConfig: { automaticActivityDetection: { disabled: true } },
  } } as unknown as VoiceSession, { getTracks: () => [] } as unknown as MediaStream,
  { currentTime: 0, state: "running", close: vi.fn().mockResolvedValue(undefined) } as unknown as AudioContext,
  vi.fn(), vi.fn(), vi.fn(), undefined, undefined, undefined, undefined, authorize);
  const state = live as any;
  state.socket = { readyState: 1, send: vi.fn(), close: vi.fn() };
  state.onToolCall = vi.fn(async () => ({ provider: "searxng", query: "lunar eclipse", category: "general",
    results: [{ title: "NASA", url: "https://science.nasa.gov/moon/", snippet: "Earth casts its shadow on the Moon." }], sources: [],
  }));
  state.readRecovery.beginTurn();
  state.receive({ serverContent: { inputTranscription: { text: "Search for a lunar eclipse.", finished: true } } });
  return { live, state, authorize };
}
const frames = (state: any) => state.socket.send.mock.calls.map(([value]: [string]) => JSON.parse(value));
const corrections = (state: any) => frames(state).filter((frame: any) => frame.clientContent?.turnComplete === true);
async function deliverRead(state: any) {
  state.receive({ toolCall: { functionCalls: [{ id: "search", name: "search_web", args: { query: "lunar eclipse", category: "general" } }] } });
  await vi.advanceTimersByTimeAsync(0);
}
async function claimFailure(state: any) {
  state.receive({ serverContent: { outputTranscription: { text: "A system error occurred.", finished: true }, turnComplete: true, interactionStatus: "IDLE" } });
  await vi.advanceTimersByTimeAsync(0);
}
function speech(state: any, type: "start" | "end") {
  state.inputActivity.active = type === "start";
  state.inputActivity.emit({ type });
}
function write(state: any, id: string) {
  state.receive({ toolCall: { functionCalls: [{ id, name: "organization_api", args: { action: "create_task", data: '{"title":"Requested task"}' } }] } });
}

it.each([
  ["GoAway", { goAway: { timeLeft: "30s" } }],
  ["interruption", { serverContent: { interrupted: true } }],
  ["background thinking", { serverContent: { interactionStatus: "IN_PROGRESS" } }],
  ["new output", { serverContent: { outputTranscription: { text: "Here are the results." } } }],
  ["new tool", { toolCall: { functionCalls: [{ id: "new-read", name: "search_web", args: { query: "different", category: "general" } }] } }],
  ["late cancellation", { toolCallCancellation: { ids: ["search"] } }],
])("cancels pending recovery authorization when %s invalidates the idle response", async (_name, event) => {
  const pending = deferred<typeof roster>();
  const { live, state, authorize } = fixture(vi.fn((_signal: AbortSignal) => pending.promise));
  await deliverRead(state); await claimFailure(state);
  const signal = authorize.mock.calls[0][0];
  expect(signal.aborted).toBe(false); expect(live.canRefreshInstructions).toBe(false);
  state.receive(event);
  expect(signal.aborted).toBe(true);
  pending.resolve(roster); await vi.advanceTimersByTimeAsync(0);
  expect(corrections(state)).toHaveLength(0); live.stop();
});

it("does not recover a delivered read that the provider subsequently cancels", async () => {
  const { live, state, authorize } = fixture();
  await deliverRead(state);
  expect(state.toolControllers.size).toBe(0);
  state.receive({ toolCallCancellation: { ids: ["search"] } });
  await claimFailure(state);
  expect(authorize).not.toHaveBeenCalled(); expect(corrections(state)).toHaveLength(0); live.stop();
});

it.each(["activeTools", "playback", "context", "socket"])("rechecks %s after the asynchronous authorization", async changed => {
  const pending = deferred<typeof roster>();
  const { live, state } = fixture(vi.fn((_signal: AbortSignal) => pending.promise));
  await deliverRead(state); await claimFailure(state);
  if (changed === "activeTools") state.activeTools = 1;
  if (changed === "playback") state.playbackEndsAt = 10;
  if (changed === "context") state.turnContext = { isPending: true, stop: vi.fn() };
  if (changed === "socket") state.socket.readyState = 0;
  pending.resolve(roster); await vi.advanceTimersByTimeAsync(0);
  expect(corrections(state)).toHaveLength(0); live.stop();
});

it("keeps runtime progress queued while recovery authorization is pending", async () => {
  const pending = deferred<typeof roster>();
  const { live, state } = fixture(vi.fn((_signal: AbortSignal) => pending.promise));
  await deliverRead(state); await claimFailure(state);
  live.updateAgentProgress({ status: "running", stateChanged: true, replies: [], questions: [], pendingQuestionIds: [] });
  expect(frames(state).filter((frame: any) => frame.realtimeInput?.text)).toHaveLength(0);
  pending.resolve(roster); await vi.advanceTimersByTimeAsync(0);
  expect(corrections(state)).toHaveLength(1); expect(state.pendingProgress).toBeDefined(); live.stop();
});

it.each(["interrupted", "IDLE"] as const)("holds recovery writes until fresh speech finishes and the provider reports %s", async boundary => {
  const { live, state } = fixture();
  await deliverRead(state); await claimFailure(state);
  expect(corrections(state)).toHaveLength(1);
  // Isolate the speech boundary from the separately tested roster prefetch.
  state.turnContext = undefined;
  speech(state, "start"); write(state, "before-transcription"); await vi.advanceTimersByTimeAsync(0);
  state.receive({ serverContent: { inputTranscription: { text: "Create the requested task.", finished: true } } });
  write(state, "during-speech"); await vi.advanceTimersByTimeAsync(0);
  speech(state, "end"); write(state, "before-provider-boundary");
  // Captured policy must stay denied even if the boundary arrives before the
  // queued executor runs its microtask.
  state.receive({ serverContent: boundary === "interrupted" ? { interrupted: true } : { interactionStatus: "IDLE" } });
  await vi.advanceTimersByTimeAsync(0);
  expect(state.onToolCall).toHaveBeenCalledOnce();
  const rejected = frames(state).flatMap((frame: any) => frame.toolResponse?.functionResponses ?? []).filter((response: any) => response.response.error);
  expect(rejected).toHaveLength(3);
  write(state, "fresh-request"); await vi.advanceTimersByTimeAsync(0);
  expect(state.onToolCall).toHaveBeenCalledTimes(2); live.stop();
});

it("does not release the write fence at a provider boundary without a transcribed fresh utterance", async () => {
  const { live, state } = fixture();
  await deliverRead(state); await claimFailure(state);
  state.receive({ serverContent: { interactionStatus: "IDLE" } });
  state.turnContext = undefined; speech(state, "start"); speech(state, "end");
  write(state, "untranscribed"); await vi.advanceTimersByTimeAsync(0);
  expect(state.onToolCall).toHaveBeenCalledOnce();
  state.receive({ serverContent: { inputTranscription: { text: "Create the requested task.", finished: true } } });
  write(state, "transcribed"); await vi.advanceTimersByTimeAsync(0);
  expect(state.onToolCall).toHaveBeenCalledTimes(2); live.stop();
});

it("keeps thinking while a tool is active and restores listening after a cancelled tool finishes", async () => {
  const pending = deferred<unknown>();
  const { live, state } = fixture();
  state.onToolCall.mockReturnValueOnce(pending.promise);
  await deliverRead(state);
  state.receive({ serverContent: { interactionStatus: "IDLE" } });
  await vi.advanceTimersByTimeAsync(0);
  expect(state.activeTools).toBe(1); expect(state.onPhase).toHaveBeenLastCalledWith("thinking");
  state.receive({ toolCallCancellation: { ids: ["search"] } });
  pending.resolve({ cancelled: true }); await vi.advanceTimersByTimeAsync(0);
  expect(state.activeTools).toBe(0); expect(state.onPhase).toHaveBeenLastCalledWith("listening");
  expect(frames(state).filter((frame: any) => frame.toolResponse)).toHaveLength(0); live.stop();
});

it("recovers a zero-tool failure once with a fresh authorized private read, without caching private results", async () => {
  const { live, state, authorize } = fixture();
  await claimFailure(state);
  expect(authorize).toHaveBeenCalledOnce();
  expect(corrections(state)).toHaveLength(1);
  expect(JSON.stringify(corrections(state))).toContain("No tool operation was observed");
  state.onToolCall.mockResolvedValue({ count: 13, agents: [] });
  for (const id of ["roster-one", "roster-two"]) {
    state.receive({ toolCall: { functionCalls: [{ id, name: "get_organization_agents", args: {} }] } });
    await vi.advanceTimersByTimeAsync(0);
  }
  expect(state.onToolCall).toHaveBeenCalledTimes(2);
  expect(state.readRecovery.cachedResponse("get_organization_agents", {})).toBeUndefined();
  await claimFailure(state);
  expect(corrections(state)).toHaveLength(1);
  expect(state.socket.close).not.toHaveBeenCalled(); live.stop();
});

it.each([
  ["missing ID", { name: "get_organization_agents", args: {} }],
  ["missing name", { id: "malformed", args: {} }],
  ["null call", null],
  ["unknown tool", { id: "unknown", name: "unknown_tool", args: {} }],
  ["private read", { id: "private", name: "get_organization_agents", args: {} }],
  ["mutation", { id: "write", name: "organization_api", args: { action: "create_task" } }],
])("does not mistake %s for a zero-tool failure", async (_label, call) => {
  const { live, state, authorize } = fixture();
  state.receive({ toolCall: { functionCalls: [call] } });
  await vi.advanceTimersByTimeAsync(0); await claimFailure(state);
  expect(authorize).not.toHaveBeenCalled(); expect(corrections(state)).toHaveLength(0); live.stop();
});

it("does not recover after a duplicate delivered call or a previously cancelled call", async () => {
  const { live, state, authorize } = fixture();
  await deliverRead(state);
  await deliverRead(state);
  await claimFailure(state);
  expect(authorize).not.toHaveBeenCalled();
  state.readRecovery.beginTurn(); state.readRecovery.input("Check the agents.");
  state.cancelledTools.add("cancelled");
  state.receive({ toolCall: { functionCalls: [{ id: "cancelled", name: "get_organization_agents", args: {} }] } });
  await claimFailure(state);
  expect(corrections(state)).toHaveLength(0); live.stop();
});

it("disqualifies a new speech turn while an older tool is still pending", async () => {
  const pending = deferred<unknown>();
  const { live, state } = fixture();
  state.onToolCall.mockReturnValueOnce(pending.promise);
  state.receive({ toolCall: { functionCalls: [{ id: "older", name: "get_organization_agents", args: {} }] } });
  await vi.advanceTimersByTimeAsync(0);
  state.turnContext = undefined; speech(state, "start"); speech(state, "end");
  state.receive({ serverContent: { inputTranscription: { text: "Check tasks.", finished: true } } });
  pending.resolve({ count: 13 }); await vi.advanceTimersByTimeAsync(0);
  await claimFailure(state);
  expect(corrections(state)).toHaveLength(0); live.stop();
});

it("executes at most three recovery reads and rejects later reads and writes before dispatch", async () => {
  const { live, state } = fixture();
  await claimFailure(state);
  state.onToolCall.mockResolvedValue({ count: 13 });
  for (let index = 0; index < 5; index++) {
    state.receive({ toolCall: { functionCalls: [{ id: `read-${index}`, name: "get_organization_agents", args: {} }] } });
  }
  await vi.advanceTimersByTimeAsync(0);
  expect(state.onToolCall).toHaveBeenCalledTimes(3);
  const responses = frames(state).flatMap((frame: any) => frame.toolResponse?.functionResponses ?? []);
  expect(responses).toHaveLength(5);
  expect(responses.filter((response: any) => response.response.error)).toHaveLength(2);
  write(state, "late-write"); await vi.advanceTimersByTimeAsync(0);
  expect(state.onToolCall).toHaveBeenCalledTimes(3);
  await claimFailure(state); expect(corrections(state)).toHaveLength(1); live.stop();
});

it("bounds hanging recovery reads, returns one specific timeout and discards late results", async () => {
  const { live, state } = fixture();
  await claimFailure(state);
  const pending = deferred<unknown>();
  state.onToolCall.mockReturnValueOnce(pending.promise);
  state.receive({ toolCall: { functionCalls: [{ id: "hung", name: "get_organization_agents", args: {} }] } });
  await vi.advanceTimersByTimeAsync(0);
  const signal = state.onToolCall.mock.calls[0][3] as AbortSignal;
  expect(state.activeTools).toBe(1);
  await vi.advanceTimersByTimeAsync(20_000);
  expect(signal.aborted).toBe(true); expect(state.activeTools).toBe(0);
  const responses = () => frames(state).flatMap((frame: any) => frame.toolResponse?.functionResponses ?? []);
  expect(responses()).toHaveLength(1);
  expect(responses()[0]).toMatchObject({ id: "hung", response: { error: expect.stringContaining("timed out") } });
  pending.resolve({ count: 13 }); await vi.advanceTimersByTimeAsync(0);
  expect(responses()).toHaveLength(1);
  state.receive({ toolCall: { functionCalls: [{ id: "after-deadline", name: "get_organization_agents", args: {} }] } });
  write(state, "after-deadline-write"); await vi.advanceTimersByTimeAsync(0);
  expect(state.onToolCall).toHaveBeenCalledOnce();
  expect(state.socket.close).not.toHaveBeenCalled(); live.stop();
});

it("does not extend the recovery deadline when another tool is cancelled", async () => {
  const { live, state } = fixture(); await claimFailure(state);
  const pending = deferred<unknown>();
  state.onToolCall.mockReturnValue(pending.promise);
  state.receive({ toolCall: { functionCalls: [
    { id: "cancelled-read", name: "get_organization_agents", args: {} },
    { id: "hanging-read", name: "get_organization_agents", args: {} },
  ] } });
  await vi.advanceTimersByTimeAsync(0);
  state.receive({ toolCallCancellation: { ids: ["cancelled-read"] } });
  await vi.advanceTimersByTimeAsync(20_000);
  expect(state.activeTools).toBe(0);
  const responses = frames(state).flatMap((frame: any) => frame.toolResponse?.functionResponses ?? []);
  expect(responses).toHaveLength(1); expect(responses[0].id).toBe("hanging-read");
  pending.resolve({ count: 13 }); await vi.advanceTimersByTimeAsync(0);
  live.stop();
});

it.each(["speech", "stop"] as const)("cancels in-flight verification immediately on %s, even if the read ignores AbortSignal", async action => {
  const { live, state } = fixture(); await claimFailure(state);
  const pending = deferred<unknown>(); state.onToolCall.mockReturnValue(pending.promise);
  state.receive({ toolCall: { functionCalls: [{ id: "read", name: "get_organization_agents", args: {} }] } });
  await vi.advanceTimersByTimeAsync(0);
  if (action === "speech") { state.turnContext = undefined; speech(state, "start"); } else live.stop();
  await vi.advanceTimersByTimeAsync(0);
  expect(state.activeTools).toBe(0);
  pending.resolve({ count: 13 }); await vi.advanceTimersByTimeAsync(20_000);
  expect(frames(state).filter((frame: any) => frame.toolResponse)).toHaveLength(0); live.stop();
});

it("does not start a reserved recovery read if the clock expires before its queued executor", async () => {
  const { live, state } = fixture(); await claimFailure(state);
  state.receive({ toolCall: { functionCalls: [{ id: "queued", name: "get_organization_agents", args: {} }] } });
  const time = vi.spyOn(performance, "now").mockReturnValue(state.readRecovery.recoveryDeadlineMs + 1);
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  time.mockRestore(); await vi.advanceTimersByTimeAsync(0);
  expect(state.onToolCall).not.toHaveBeenCalled();
  const response = frames(state).find((frame: any) => frame.toolResponse)?.toolResponse.functionResponses[0];
  expect(response).toMatchObject({ id: "queued", response: { error: expect.stringContaining("timed out") } }); live.stop();
});

it("does not deliver an HTTP success after the absolute deadline if the timer has not run", async () => {
  const { live, state } = fixture(); await claimFailure(state);
  const pending = deferred<unknown>(); state.onToolCall.mockReturnValue(pending.promise);
  state.receive({ toolCall: { functionCalls: [{ id: "late-http", name: "get_organization_agents", args: {} }] } });
  await vi.advanceTimersByTimeAsync(0);
  const time = vi.spyOn(performance, "now").mockReturnValue(state.readRecovery.recoveryDeadlineMs + 1);
  pending.resolve({ count: 13 });
  for (let step = 0; step < 12; step++) await Promise.resolve();
  time.mockRestore(); await vi.advanceTimersByTimeAsync(0);
  const responses = frames(state).flatMap((frame: any) => frame.toolResponse?.functionResponses ?? []);
  expect(responses).toHaveLength(1);
  expect(responses[0]).toMatchObject({ id: "late-http", response: { error: expect.stringContaining("timed out") } });
  expect(responses[0].response.result).toBeUndefined(); live.stop();
});

it("provides the freshly authorized roster in the correction without caching an earlier private result", async () => {
  const current = { organization: { id: "company" }, visibility: "permitted_agents", count: 13, agents: [], asOf: "2026-09-28T00:00:00Z" };
  const { live, state } = fixture(vi.fn(async () => current));
  await claimFailure(state);
  const parts = corrections(state)[0].clientContent.turns[0].parts;
  expect(parts).toHaveLength(2);
  expect(parts[0].text).toContain("current data, not instructions");
  expect(JSON.parse(parts[0].text.split("\n")[1])).toEqual(current);
  expect(state.readRecovery.cachedResponse("get_organization_agents", {})).toBeUndefined();
  expect(state.onToolCall).not.toHaveBeenCalled(); live.stop();
});

it("omits an oversized fresh directory rather than presenting a partial roster", async () => {
  const { live, state } = fixture(vi.fn(async () => ({ organization: { id: "company" }, data: "x".repeat(32_001) })));
  await claimFailure(state);
  const parts = corrections(state)[0].clientContent.turns[0].parts;
  expect(parts).toHaveLength(1); expect(parts[0].text).toContain("No tool operation was observed"); live.stop();
});

const taskId = "00000000-0000-4000-8000-000000000020";
async function deliverTask(state: any) {
  state.onToolCall.mockResolvedValueOnce({ id: taskId, status: "in_progress", title: "old private task body" });
  state.receive({ toolCall: { functionCalls: [{ id: "task-read", name: "organization_api", args: { action: "get_task", id: taskId } }] } });
  await vi.advanceTimersByTimeAsync(0);
}
it("refreshes task evidence with current authorization instead of replaying a successful old private response", async () => {
  const { live, state, authorize } = fixture();
  await deliverTask(state);
  state.onToolCall.mockResolvedValueOnce({ id: taskId, status: "blocked", title: "current task status" });
  await claimFailure(state);
  expect(authorize).toHaveBeenCalledOnce();
  expect(state.onToolCall).toHaveBeenCalledTimes(2);
  expect(state.onToolCall.mock.calls[1]).toEqual([
    "organization_api", { action: "get_task", id: taskId }, expect.stringContaining("read-verification-"), expect.any(AbortSignal),
  ]);
  const correction = JSON.stringify(corrections(state));
  expect(correction).toContain("current task status");
  expect(correction).not.toContain("old private task body");
  expect(correction).toContain("blocked");
  expect(state.readRecovery.cachedResponse("organization_api", { action: "get_task", id: taskId })).toBeUndefined();
  live.stop();
});
it("reports an unavailable private refresh without using its old response", async () => {
  const { live, state } = fixture();
  await deliverTask(state);
  state.onToolCall.mockRejectedValueOnce(new Error("Access denied"));
  await claimFailure(state);
  const correction = JSON.stringify(corrections(state));
  expect(correction).toContain("could not be verified");
  expect(correction).not.toContain("old private task body");
  live.stop();
});
it("discards a fresh private read when the user starts another utterance", async () => {
  const { live, state } = fixture();
  await deliverTask(state);
  const pending = deferred<unknown>();
  state.onToolCall.mockReturnValueOnce(pending.promise);
  await claimFailure(state);
  const signal = state.onToolCall.mock.calls[1][3];
  state.turnContext = undefined;
  speech(state, "start");
  expect(signal.aborted).toBe(true);
  pending.resolve({ id: taskId, status: "blocked" });
  await vi.advanceTimersByTimeAsync(0);
  expect(corrections(state)).toHaveLength(0);
  live.stop();
});
it("bounds a hanging proactive private refresh and returns to listening", async () => {
  const { live, state } = fixture();
  await deliverTask(state);
  const pending = deferred<unknown>();
  state.onToolCall.mockReturnValueOnce(pending.promise);
  await claimFailure(state);
  const signal = state.onToolCall.mock.calls[1][3];
  await vi.advanceTimersByTimeAsync(20_000);
  expect(signal.aborted).toBe(true);
  await vi.advanceTimersByTimeAsync(1);
  expect(state.onPhase).toHaveBeenLastCalledWith("listening");
  pending.resolve({ id: taskId, status: "done" });
  await vi.advanceTimersByTimeAsync(0);
  expect(corrections(state)).toHaveLength(0);
  live.stop();
});
it("includes freshly authorized work state in zero-tool recovery", async () => {
  const current = { ...roster, work: { available: true, asOf: "2026-09-28T09:00:00Z", tasks: [{ id: taskId, title: "Databento research", status: "blocked" }], truncated: false } };
  const { live, state } = fixture(vi.fn(async () => current));
  await claimFailure(state);
  expect(JSON.stringify(corrections(state))).toContain("Databento research");
  expect(JSON.stringify(corrections(state))).toContain("recorded task status");
  expect(state.onToolCall).not.toHaveBeenCalled();
  live.stop();
});
