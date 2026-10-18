import { expect, it } from 'vitest';
import { VoiceConference } from '../services/voice-conference.js';
it('counts pending reservations and rejects duplicates and a sixth agent', () => {
 const call = new VoiceConference('ceo', 'anchor');
 for (let i = 0; i < 4; i++) expect(call.reserve(String(i))).toBeTruthy();
 expect(() => call.reserve('0')).toThrow('already'); expect(() => call.reserve('fifth')).toThrow('five');
});
it('fences stale invitations with unique reservation tokens', () => {
 const call = new VoiceConference('ceo', 'anchor'); const old = call.reserve('it'); call.members.delete('it');
 expect(call.reserve('it')).not.toBe(old); call.closed = true; expect(() => call.reserve('design')).toThrow('ended');
});
it('upserts partial speech without duplicating turns and attributes each speaker', () => {
 const call = new VoiceConference('ceo', 'anchor'); call.record('1','You','Invite IT'); call.record('2','IT','Checking');
 const body = call.record('2','IT','Checking the server now.');
 expect(body).toContain('### Conference Call'); expect(body.match(/\*\*IT\*\*/g)).toHaveLength(1);
 expect(body).toContain('**You**'); expect(body).toContain('Checking the server now.');
});
