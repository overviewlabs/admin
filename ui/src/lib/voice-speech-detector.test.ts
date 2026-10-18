import { afterEach, expect, it, vi } from 'vitest';
import { VoiceSpeechDetector } from './voice-speech-detector';
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
function fixture() {
  let worker: any;
  vi.stubGlobal('Worker', class {
    onmessage: any; onerror: any; postMessage = vi.fn(); terminate = vi.fn();
    constructor() { worker = this; }
  });
  const frame = vi.fn(), error = vi.fn();
  const detector = new VoiceSpeechDetector(frame, error);
  const started = detector.start();
  return { detector, started, worker, frame, error };
}
it('does not deliver stale inference after playback resets or shutdown', async () => {
  const {detector, started, worker, frame} = fixture();
  worker.onmessage({data:{type:'ready'}}); await started;
  detector.push(new ArrayBuffer(640)); detector.reset();
  worker.onmessage({data:{type:'frame',epoch:0,probability:.99,data:new ArrayBuffer(1024)}});
  expect(frame).not.toHaveBeenCalled();
  worker.onmessage({data:{type:'frame',epoch:1,probability:.9,data:new ArrayBuffer(1024)}});
  expect(frame).toHaveBeenCalledOnce();
  detector.stop(); worker.onmessage({data:{type:'frame',epoch:1,probability:.9,data:new ArrayBuffer(1024)}});
  expect(frame).toHaveBeenCalledOnce(); expect(worker.terminate).toHaveBeenCalledOnce();
});
it('fails closed when the model cannot load rather than forwarding noise', async () => {
  const {started,worker,frame,error}=fixture();
  const rejected=expect(started).rejects.toThrow('Speech detection stopped');
  worker.onmessage({data:{type:'error'}}); await rejected;
  expect(error).toHaveBeenCalledOnce();expect(frame).not.toHaveBeenCalled();expect(worker.terminate).toHaveBeenCalledOnce();
});
it('stops a stalled classifier instead of forwarding old audio',async()=>{
  vi.useFakeTimers();
  const {detector,started,worker,error}=fixture();worker.onmessage({data:{type:'ready'}});await started;
  for(let i=0;i<101;i++)detector.push(new ArrayBuffer(640));
  await vi.advanceTimersByTimeAsync(250);
  expect(error).toHaveBeenCalledWith(expect.stringContaining('falling behind'));expect(worker.terminate).toHaveBeenCalledOnce();
});
it('bounds model loading time and releases a cancelled load',async()=>{
  vi.useFakeTimers();const {started,worker,error}=fixture();
  const rejected=expect(started).rejects.toThrow();await vi.advanceTimersByTimeAsync(30_000);await rejected;
  expect(error).toHaveBeenCalledOnce();expect(worker.terminate).toHaveBeenCalledOnce();
});

it('accepts queued worker results after a burst of microphone frames',async()=>{
  vi.useFakeTimers();const {detector,started,worker,error,frame}=fixture();
  worker.onmessage({data:{type:'ready'}});await started;
  for(let i=0;i<110;i++)detector.push(new ArrayBuffer(640));
  expect(error).not.toHaveBeenCalled();
  for(let i=0;i<68;i++)worker.onmessage({data:{type:'frame',epoch:0,probability:.99,data:new ArrayBuffer(1024)}});
  await vi.advanceTimersByTimeAsync(250);
  expect(error).not.toHaveBeenCalled();expect(frame).toHaveBeenCalledTimes(68);
  detector.stop();
});
