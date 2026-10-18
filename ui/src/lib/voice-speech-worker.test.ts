import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { VoiceSpeechDetector, warmVoiceSpeechDetector, clearVoiceSpeechDetectorWarmup } from './voice-speech-detector';

let workers: any[];
let detectors: VoiceSpeechDetector[];
beforeEach(() => {
  vi.useFakeTimers(); workers = []; detectors = [];
  vi.stubGlobal('Worker', class {
    onmessage: any; onerror: any; postMessage = vi.fn(); terminate = vi.fn();
    constructor() { workers.push(this); }
  });
});
afterEach(() => {
  detectors.forEach(detector => detector.stop()); clearVoiceSpeechDetectorWarmup();
  vi.unstubAllGlobals(); vi.useRealTimers();
});
function detector() {
  const frame = vi.fn(), error = vi.fn();
  const instance = new VoiceSpeechDetector(frame, error); detectors.push(instance);
  return { instance, frame, error };
}
function ready(worker = workers.at(-1)) { worker.onmessage({ data: { type: 'ready' } }); }

it('deduplicates warming and ready requests without posting microphone data', async () => {
  const first = warmVoiceSpeechDetector(), second = warmVoiceSpeechDetector();
  expect(workers).toHaveLength(1); expect(workers[0].postMessage).not.toHaveBeenCalled();
  ready(); await Promise.all([first, second, warmVoiceSpeechDetector()]);
  expect(workers).toHaveLength(1); expect(workers[0].postMessage).not.toHaveBeenCalled();
});

it('adopts an already warm worker without another load and never returns used state to the pool', async () => {
  const warming = warmVoiceSpeechDetector(); ready(); await warming;
  const { instance, frame } = detector(); await instance.start();
  expect(workers).toHaveLength(1);
  instance.push(new ArrayBuffer(640));
  expect(workers[0].postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'frame', epoch: 0 }), expect.any(Array));
  workers[0].onmessage({ data: { type: 'frame', epoch: 0, data: new ArrayBuffer(1024), probability: .9 } });
  expect(frame).toHaveBeenCalledOnce();
  instance.stop(); expect(workers[0].terminate).toHaveBeenCalledOnce();
  const next = warmVoiceSpeechDetector(); expect(workers).toHaveLength(2); ready(); await next;
});

it('adopts an in-flight warmup and waits for its existing ready signal', async () => {
  const warming = warmVoiceSpeechDetector();
  const { instance } = detector(); let started = false;
  const starting = instance.start().then(() => { started = true; });
  await vi.advanceTimersByTimeAsync(1000);
  expect(started).toBe(false); expect(workers).toHaveLength(1);
  ready(); await Promise.all([warming, starting]); expect(started).toBe(true);
});

it('never prewarms another worker while a detector owns the current worker', async () => {
  const { instance } = detector(); const starting = instance.start();
  await warmVoiceSpeechDetector(); expect(workers).toHaveLength(1);
  ready(); await starting; await warmVoiceSpeechDetector(); expect(workers).toHaveLength(1);
  expect(instance.start()).toBe(starting);
});

it('expires an unused ready worker after five minutes and loads a fresh worker on demand', async () => {
  const warming = warmVoiceSpeechDetector(); ready(); await warming;
  await vi.advanceTimersByTimeAsync(299_999); expect(workers[0].terminate).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1); expect(workers[0].terminate).toHaveBeenCalledOnce();
  const { instance } = detector(); const starting = instance.start();
  expect(workers).toHaveLength(2); ready(); await starting;
});

it('cancels the idle TTL upon adoption and does not clear an active detector', async () => {
  const warming = warmVoiceSpeechDetector(); ready(); await warming;
  const { instance, frame } = detector(); await instance.start();
  clearVoiceSpeechDetectorWarmup(); await vi.advanceTimersByTimeAsync(5 * 60_000);
  expect(workers[0].terminate).not.toHaveBeenCalled();
  workers[0].onmessage({ data: { type: 'frame', epoch: 0, data: new ArrayBuffer(1024), probability: .95 } });
  expect(frame).toHaveBeenCalledOnce();
});

it('clears a pending warmup safely and ignores late readiness before a new cold start', async () => {
  const warming = warmVoiceSpeechDetector(); const oldWorker = workers[0];
  clearVoiceSpeechDetectorWarmup(); clearVoiceSpeechDetectorWarmup(); await warming;
  expect(oldWorker.terminate).toHaveBeenCalledOnce(); ready(oldWorker);
  const { instance, frame } = detector(); const starting = instance.start();
  expect(workers).toHaveLength(2); ready(); await starting;
  oldWorker.onmessage({ data: { type: 'frame', epoch: 0, data: new ArrayBuffer(1024), probability: 1 } });
  expect(frame).not.toHaveBeenCalled();
});

it('terminates a cancelled adoption before ready without resurrecting it or delivering old frames', async () => {
  const warming = warmVoiceSpeechDetector();
  const { instance, frame, error } = detector(); const starting = instance.start();
  const rejected = expect(starting).rejects.toThrow('Speech detection stopped');
  instance.stop(); await Promise.all([warming, rejected]); ready();
  workers[0].onmessage({ data: { type: 'frame', epoch: 0, data: new ArrayBuffer(1024), probability: 1 } });
  expect(workers[0].terminate).toHaveBeenCalledOnce(); expect(frame).not.toHaveBeenCalled(); expect(error).not.toHaveBeenCalled();
  await expect(instance.start()).rejects.toThrow('Speech detection stopped'); expect(workers).toHaveLength(1);
});

it.each(['onerror', 'message'])('silently retires speculative %s failure and permits a fresh cold load', async mode => {
  const warming = warmVoiceSpeechDetector();
  if (mode === 'onerror') workers[0].onerror(); else workers[0].onmessage({ data: { type: 'error' } });
  await warming; expect(workers[0].terminate).toHaveBeenCalledOnce();
  const { instance, error } = detector(); const starting = instance.start();
  expect(workers).toHaveLength(2); ready(); await starting; expect(error).not.toHaveBeenCalled();
});

it('bounds speculative loading at thirty seconds and leaves no idle expiry timer', async () => {
  const warming = warmVoiceSpeechDetector();
  await vi.advanceTimersByTimeAsync(30_000); await warming;
  expect(workers[0].terminate).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
});

it('fails a claimed warmup exactly once if the model errors before ready', async () => {
  const warming = warmVoiceSpeechDetector();
  const { instance, error } = detector(); const starting = instance.start();
  const rejected = expect(starting).rejects.toThrow('Speech detection stopped');
  workers[0].onmessage({ data: { type: 'error' } }); await Promise.all([warming, rejected]);
  workers[0].onerror(); ready();
  expect(error).toHaveBeenCalledOnce(); expect(workers[0].terminate).toHaveBeenCalledOnce();
});

it('keeps prewarming best effort when the browser cannot construct a worker', async () => {
  vi.stubGlobal('Worker', class { constructor() { throw new Error('Worker unavailable'); } });
  await expect(warmVoiceSpeechDetector()).resolves.toBeUndefined(); expect(vi.getTimerCount()).toBe(0);
});
