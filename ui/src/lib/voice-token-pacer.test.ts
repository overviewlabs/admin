import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const post = vi.hoisted(() => vi.fn());
vi.mock('@/api/client', () => ({ api: { post } }));
import { VoiceTokenPacer } from './voice-token-pacer';
function setup() { const write = vi.fn(), waiting = vi.fn(), failed = vi.fn(); return { write, waiting, failed, pacer: new VoiceTokenPacer({url:'/allowance',setupTokens:2000}, write, waiting, failed) }; }
beforeEach(() => { vi.useFakeTimers(); post.mockReset().mockResolvedValue({allowed:true,retryAfterMs:0}); });
afterEach(() => vi.useRealTimers());
it('waits without sending and preserves setup, context and input ordering', async () => {
  post.mockResolvedValueOnce({allowed:false,retryAfterMs:1000}); const f=setup();
  f.pacer.enqueue({setup:{}}); f.pacer.enqueue({clientContent:{turns:[]}}); f.pacer.enqueue({realtimeInput:{activityStart:{}}});
  await vi.advanceTimersByTimeAsync(0); expect(f.write).not.toHaveBeenCalled(); expect(f.waiting).toHaveBeenCalledWith(true);
  await vi.advanceTimersByTimeAsync(1000); expect(f.write.mock.calls.map(c=>Object.keys(c[0])[0])).toEqual(['setup','clientContent','realtimeInput']);
  expect(f.waiting).toHaveBeenLastCalledWith(false); expect(f.failed).not.toHaveBeenCalled(); f.pacer.stop();
});
it('hangup aborts quota waits and discards all queued sends', async () => {
  post.mockResolvedValue({allowed:false,retryAfterMs:10000}); const f=setup(); f.pacer.enqueue({setup:{}});
  await vi.advanceTimersByTimeAsync(0); f.pacer.stop(); await vi.advanceTimersByTimeAsync(20000);
  expect(f.write).not.toHaveBeenCalled(); expect(f.failed).not.toHaveBeenCalled(); expect(post).toHaveBeenCalledTimes(1);
});
it('uses provider prompt usage for the next turn and batches small audio frames', async () => {
  const f=setup(); f.pacer.usage({promptTokenCount:9000}); f.pacer.enqueue({realtimeInput:{activityStart:{}}});
  for(let i=0;i<10;i++) f.pacer.enqueue({realtimeInput:{audio:{data:'AAAA'.repeat(320)}}});
  f.pacer.enqueue({realtimeInput:{activityEnd:{}}});
  await vi.advanceTimersByTimeAsync(0); expect(post.mock.calls.at(-1)![1].tokens).toBeGreaterThan(9000); expect(post.mock.calls.length).toBeLessThan(4); f.pacer.stop();
});
it('does not deliver queued microphone input after the floor is removed', async () => {
  post.mockResolvedValueOnce({allowed:false,retryAfterMs:1000}); const f=setup(); f.pacer.enqueue({realtimeInput:{activityStart:{}}});
  await vi.advanceTimersByTimeAsync(0); f.pacer.cancelInput(); await vi.advanceTimersByTimeAsync(1000);
  expect(f.write).not.toHaveBeenCalled(); f.pacer.stop();
});
it('fails closed when allowance cannot be checked', async () => {
  post.mockRejectedValue(new Error('Unavailable')); const f=setup(); f.pacer.enqueue({setup:{}}); await vi.advanceTimersByTimeAsync(0);
  expect(f.write).not.toHaveBeenCalled(); expect(f.failed).toHaveBeenCalledOnce();
});

it('reserves generation once at the end of an activity containing organization context', async () => {
  const f=setup(); f.pacer.usage({promptTokenCount:20000});
  f.pacer.enqueue({realtimeInput:{activityStart:{}}});
  f.pacer.enqueue({realtimeInput:{text:'snapshot '.repeat(1500)}});
  f.pacer.enqueue({realtimeInput:{audio:{data:'AAAA'}}});
  f.pacer.enqueue({realtimeInput:{activityEnd:{}}});
  await vi.advanceTimersByTimeAsync(0);
  const reservations=post.mock.calls.map(call=>call[1].tokens);
  expect(reservations.filter(tokens=>tokens>=20000)).toHaveLength(1);
  expect(reservations.reduce((a,b)=>a+b,0)).toBeLessThan(26000);
  expect(f.write.mock.calls.map(call=>Object.keys(call[0].realtimeInput)[0])).toEqual(['activityStart','text','audio','activityEnd']);
  expect(f.failed).not.toHaveBeenCalled();f.pacer.stop();
});

it('does not charge a large setup twice before the first reply', async () => {
  const write=vi.fn(),failed=vi.fn();
  const pacer=new VoiceTokenPacer({url:'/allowance',setupTokens:36200},write,vi.fn(),failed);
  pacer.enqueue({setup:{}});pacer.enqueue({realtimeInput:{activityStart:{}}});
  pacer.enqueue({realtimeInput:{activityEnd:{}}});
  await vi.advanceTimersByTimeAsync(0);
  expect(post.mock.calls.reduce((sum,call)=>sum+call[1].tokens,0)).toBeLessThan(37000);
  expect(write).toHaveBeenCalledTimes(3);expect(failed).not.toHaveBeenCalled();pacer.stop();
});
it('uses the real provider prompt count after context compression', async () => {
  const f=setup(); f.pacer.usage({promptTokenCount:500});
  f.pacer.enqueue({realtimeInput:{activityStart:{}}});f.pacer.enqueue({realtimeInput:{activityEnd:{}}});
  await vi.advanceTimersByTimeAsync(0);
  expect(post.mock.calls.at(-1)![1].tokens).toBeLessThan(1000);f.pacer.stop();
});

it('large first-turn snapshots fit without waiting for their own earlier reservation', async () => {
  const write=vi.fn();const pacer=new VoiceTokenPacer({url:'/allowance',setupTokens:36200},write,vi.fn(),vi.fn());
  pacer.enqueue({setup:{}});pacer.enqueue({clientContent:{turns:[{role:'user',parts:[{text:'history '.repeat(1100)}]}]}});
  pacer.enqueue({realtimeInput:{activityStart:{}}});pacer.enqueue({realtimeInput:{text:'snapshot '.repeat(3000)}});
  pacer.enqueue({realtimeInput:{activityEnd:{}}});await vi.advanceTimersByTimeAsync(0);
  expect(post.mock.calls.reduce((sum,call)=>sum+call[1].tokens,0)).toBeLessThan(50000);
  expect(write).toHaveBeenCalledTimes(5);pacer.stop();
});
