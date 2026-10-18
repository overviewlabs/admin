import { expect, it, vi } from 'vitest';
import { configureVoiceMicrophone, voiceMicrophoneFailure } from './voice-microphone';
it('requests all-output echo cancellation only when the microphone advertises it', async () => {
  const applyConstraints = vi.fn(async () => {});
  await configureVoiceMicrophone({ getAudioTracks: () => [{getCapabilities: () => ({echoCancellation:[true,false,'all']}),applyConstraints}] } as unknown as MediaStream);
  expect(applyConstraints).toHaveBeenCalledWith({echoCancellation:{exact:'all'}});
});
it('retains browser AEC on older browsers and when all-output mode cannot be applied', async () => {
  const applyConstraints = vi.fn(async () => {throw new Error('Unsupported')});
  await configureVoiceMicrophone({getAudioTracks:()=>[{getCapabilities:()=>({echoCancellation:[true,false]}),applyConstraints}]} as unknown as MediaStream);
  expect(applyConstraints).not.toHaveBeenCalled();
  await expect(configureVoiceMicrophone({getAudioTracks:()=>[{getCapabilities:()=>({echoCancellation:['all']}),applyConstraints}]} as unknown as MediaStream)).resolves.toBeUndefined();
});

it('gives Safari permission recovery instructions without exposing the raw browser error', () => {
 const denied=new DOMException('The request is not allowed by the user agent', 'NotAllowedError');
 expect(voiceMicrophoneFailure(denied,'Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/605.1.15 Version/18.6 Safari/605.1.15')).toContain('Settings → Websites → Microphone');
 expect(voiceMicrophoneFailure(denied,'Mozilla/5.0 Chrome/130 Safari/537.36')).toContain('browser’s website permissions');
 expect(voiceMicrophoneFailure(denied,'Mozilla/5.0 (iPhone) Safari/605.1.15')).not.toContain('Settings → Websites');
});
