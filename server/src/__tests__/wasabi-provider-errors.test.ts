import { describe, expect, it } from 'vitest';
import { providerValue, WasabiProbeError } from '../services/wasabi-private-probe.js';

describe('Wasabi application errors inside successful MCP responses', () => {
  const privateMessage = 'PRIVATE_PROVIDER_MESSAGE_CANARY';
  for (const structured of [true, false]) {
    for (const isError of [true, false]) {
      it(`classifies reauthorization without leaking provider text (structured=${structured}, isError=${isError})`, () => {
        const value = { error: 'reauth_required', message: privateMessage, url: 'PRIVATE_URL_CANARY' };
        const raw = { data: { isError, ...(structured ? { structuredContent: value } : {}) }, content: JSON.stringify(value) };
        try { providerValue(raw); throw new Error('expected denial'); }
        catch (error) {
          expect(error).toBeInstanceOf(WasabiProbeError);
          expect((error as WasabiProbeError).code).toBe('provider_reauthentication_required');
          expect((error as Error).message).toBe('provider_reauthentication_required');
          expect(JSON.stringify(error)).not.toContain('PRIVATE_');
        }
      });
    }
  }
  it('rejects other application errors even with isError=false', () => {
    for (const error of ['permission_denied', { code: 'provider_secret', message: privateMessage }]) {
      expect(() => providerValue({ data: { isError: false, structuredContent: { error } } })).toThrow('provider_operation_failed');
    }
  });
  it('retains normal structured and JSON results without bypassing later validators', () => {
    const value = { url: 'https://example.invalid/', expiresIn: 60 };
    expect(providerValue({ data: { structuredContent: value, isError: false } })).toEqual(value);
    expect(providerValue({ content: JSON.stringify(value) })).toEqual(value);
  });
  it('rejects malformed and explicitly failed provider responses', () => {
    expect(() => providerValue({ content: privateMessage })).toThrow('provider_result_invalid');
    expect(() => providerValue({ data: { isError: true }, content: privateMessage })).toThrow('provider_operation_failed');
    expect(() => providerValue({ data: { isError: true, structuredContent: { url: privateMessage } } })).toThrow('provider_operation_failed');
  });
});
