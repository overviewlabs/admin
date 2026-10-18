import {afterEach, expect, it, vi} from 'vitest';
import {resumeVoiceAudio, voiceStartupStep} from './voice-startup';
afterEach(()=>vi.useRealTimers());
it('does not resume an already-running context when Safari resume would hang', async()=>{
 const resume=vi.fn(()=>new Promise<void>(()=>{}));
 await resumeVoiceAudio({state:'running',resume} as unknown as AudioContext);
 expect(resume).not.toHaveBeenCalled();
});
it('bounds a suspended audio context rather than hanging the connection', async()=>{
 vi.useFakeTimers();
 const promise=resumeVoiceAudio({state:'suspended',resume:()=>new Promise<void>(()=>{})} as AudioContext);
 const rejected=expect(promise).rejects.toThrow('Safari has not enabled audio');
 await vi.advanceTimersByTimeAsync(8000);await rejected;
});
it('clears its deadline on success',async()=>{
 vi.useFakeTimers();expect(await voiceStartupStep(Promise.resolve('ready'),'timed out')).toBe('ready');
 expect(vi.getTimerCount()).toBe(0);
});
