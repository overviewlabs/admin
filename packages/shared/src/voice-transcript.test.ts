import { expect, it } from 'vitest';
import { isNonSpeechVoiceTranscript } from './voice-transcript.js';
it.each(['<no speech>', '<NO_SPEECH>', '[silence]', '<noise> <no speech>', '&lt;no speech&gt;', '<no', '<no spe', '', ' '])('rejects a provider marker or incomplete marker: %s', value => {
  expect(isNonSpeechVoiceTranscript(value)).toBe(true);
});
it.each(['Hello', 'No speech was detected by that system.', 'Please print <no speech>.', 'Yes.', 'No.', 'Ken Oaks'])('retains actual words: %s', value => {
  expect(isNonSpeechVoiceTranscript(value)).toBe(false);
});
