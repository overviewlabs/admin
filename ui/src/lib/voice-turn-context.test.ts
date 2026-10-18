import { afterEach, expect, it, vi } from "vitest";
import { VoiceTurnContext } from "./voice-turn-context";
import type { VoiceInputEvent } from "./voice-input-activity";

afterEach(() => vi.useRealTimers());
function deferred() {
  let resolve!: (value: unknown) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
async function settle() { for (let i = 0; i < 5; i++) await Promise.resolve(); }
const audio = (size = 640): VoiceInputEvent => ({ type: "audio", data: new ArrayBuffer(size) });
function fixture() {
  const request = deferred();
  const events: unknown[] = [];
  const fetch = vi.fn((_signal: AbortSignal) => request.promise);
  const context = vi.fn((value: unknown) => { events.push(value); return true; });
  const input = vi.fn((value: VoiceInputEvent) => { events.push(value); return true; });
  return { request, events, fetch, context, input, gate: new VoiceTurnContext(fetch, context, input) };
}

it("does not fetch or transmit anything until speech starts", async () => {
  vi.useFakeTimers(); const f = fixture();
  await vi.advanceTimersByTimeAsync(10_000);
  expect(f.fetch).not.toHaveBeenCalled(); expect(f.events).toEqual([]); f.gate.stop();
});

it("sends realtime start, context, PCM and end without replaying frames", async () => {
  const f = fixture(), frame = audio(), snapshot = { count: 13 };
  f.gate.push({ type: "start" }); f.gate.push(frame); f.gate.push({ type: "end" }); await settle();
  expect(f.events).toEqual([]); f.request.resolve(snapshot); await settle();
  expect(f.events).toEqual([{ type: "start" }, snapshot, frame, { type: "end" }]);
  expect(f.gate.isPending).toBe(false); f.gate.stop(); expect(f.events).toHaveLength(4);
});

it("releases speech at 750ms, aborts the read and ignores its late context", async () => {
  vi.useFakeTimers(); const f = fixture(), frame = audio();
  f.gate.push({ type: "start" }); f.gate.push(frame); await settle();
  await vi.advanceTimersByTimeAsync(749); expect(f.events).toEqual([]);
  await vi.advanceTimersByTimeAsync(1);
  expect(f.fetch.mock.calls[0][0].aborted).toBe(true);
  expect(f.events).toEqual([{ type: "start" }, { available: false }, frame]);
  f.request.resolve({ count: 1 }); await settle(); f.gate.push({ type: "end" });
  expect(f.context).toHaveBeenCalledExactlyOnceWith({ available: false }); expect(f.events).toEqual([{ type: "start" }, { available: false }, frame, { type: "end" }]);
});

it("flushes at the byte cap without losing or duplicating the frame that exceeds it", async () => {
  const f = fixture(), first = audio(64 * 1024), extra = audio();
  f.gate.push({ type: "start" }); await settle(); f.gate.push(first);
  expect(f.input).not.toHaveBeenCalled(); f.gate.push(extra);
  expect(f.events).toEqual([{ type: "start" }, { available: false }, first, extra]);
  expect(f.fetch.mock.calls[0][0].aborted).toBe(true);
  f.request.resolve({ count: 1 }); await settle(); expect(f.context).toHaveBeenCalledExactlyOnceWith({ available: false });
});

it.each(["reject", "throw"])("falls through without stale data when the context fetch %s fails", async mode => {
  const f = fixture(); if (mode === "throw") f.fetch.mockImplementationOnce(() => { throw new Error("offline"); });
  f.gate.push({ type: "start" }); await settle();
  if (mode === "reject") f.request.reject(new Error("offline")); await settle();
  expect(f.context).toHaveBeenCalledExactlyOnceWith({ available: false }); expect(f.events).toEqual([{ type: "start" }, { available: false }]);
});

it("discards an unreleased turn and ignores its response when a newer turn replaces it", async () => {
  const f = fixture(), second = deferred(), firstFrame = audio(), nextFrame = audio();
  f.fetch.mockReturnValueOnce(f.request.promise).mockReturnValueOnce(second.promise);
  f.gate.push({ type: "start" }); f.gate.push(firstFrame); f.gate.push({ type: "end" }); await settle();
  f.gate.push({ type: "start" }); f.gate.push(nextFrame); await settle();
  expect(f.fetch.mock.calls[0][0].aborted).toBe(true);
  f.request.resolve({ count: 1 }); await settle(); expect(f.events).toEqual([]);
  second.resolve({ count: 2 }); await settle();
  expect(f.events).toEqual([{ type: "start" }, { count: 2 }, nextFrame]);
});

it("fetches independently for the next completed turn", async () => {
  const f = fixture(), second = deferred(); f.fetch.mockReturnValueOnce(f.request.promise).mockReturnValueOnce(second.promise);
  f.gate.push({ type: "start" }); await settle(); f.request.resolve({ count: 1 }); await settle(); f.gate.push({ type: "end" });
  f.gate.push({ type: "start" }); await settle(); second.resolve({ count: 2 }); await settle();
  expect(f.context.mock.calls).toEqual([[{ count: 1 }], [{ count: 2 }]]); expect(f.fetch).toHaveBeenCalledTimes(2);
});

it("stop aborts and discards buffered audio, and late completion cannot revive it", async () => {
  vi.useFakeTimers(); const f = fixture(); f.gate.push({ type: "start" }); f.gate.push(audio()); await settle();
  f.gate.stop(); expect(f.fetch.mock.calls[0][0].aborted).toBe(true);
  f.request.resolve({ count: 1 }); await settle(); await vi.advanceTimersByTimeAsync(1000); f.gate.push({ type: "start" });
  expect(f.events).toEqual([]); expect(f.fetch).toHaveBeenCalledOnce();
});

it("does not release buffered audio when the socket rejects the context send", async () => {
  const f = fixture(); f.context.mockReturnValueOnce(false);
  f.gate.push({ type: "start" }); f.gate.push(audio()); await settle(); f.request.resolve({ count: 1 }); await settle();
  expect(f.context).toHaveBeenCalledOnce(); expect(f.input).toHaveBeenCalledExactlyOnceWith({ type: "start" });
});
