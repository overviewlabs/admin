import { describe, expect, it } from 'vitest';
import { voiceDeletionRequested, voiceDeletionTarget } from '../services/voice-action-intent.js';
describe('voice organization deletion intent', () => {
  it.each(['Can you delete any of them or no?', 'No, stop.', 'Can you hear me?', 'Delete the other one', 'Do not delete WHOX', 'Delete WHOX if possible', ''])('does not authorize from %s', text => {
    expect(voiceDeletionRequested(text, 'WHOX')).toBe(false);
  });
  it.each(['Can you delete WHOX?', 'Could you please terminate WHOX?', 'Delete WHOX', 'Please terminate WHOX.', 'I want you to delete WHOX'])('accepts explicit named instruction %s', text => {
    expect(voiceDeletionRequested(text, 'WHOX')).toBe(true);
  });
  it('covers both direct and server API deletion routes', () => {
    expect(voiceDeletionTarget({action:'terminate_organization',data:'{"confirmationName":"WHOX"}'})).toBe('WHOX');
    expect(voiceDeletionTarget({action:'server_api',data:JSON.stringify({method:'POST',path:'/api/companies/id/terminate',body:{confirmationName:'WHOX'}})})).toBe('WHOX');
    expect(voiceDeletionTarget({action:'server_api',data:JSON.stringify({method:'DELETE',path:'/api/companies/id'})})).toBe('');
    expect(voiceDeletionTarget({action:'list_agents'})).toBeUndefined();
  });
});
