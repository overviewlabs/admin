import { expect, test } from '@playwright/test';
import { emit, installBrowserVoiceFixture, stats } from './helpers';
test.use({ serviceWorkers: 'block' });
test('Admin voice uses its native chat, speaks and saves transcripts, then releases the microphone', async ({ page }) => {
  await installBrowserVoiceFixture(page);
  const writes: unknown[] = [];
  await page.route('**/admin-portal/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/auth')) return route.fulfill({ json: { authenticated: true } });
    if (path.endsWith('/audio/live/prepare')) return route.fulfill({ json: { setup: { model: 'models/gemini-3.8-live-extended-thinking', generationConfig: { responseModalities: ['AUDIO'] }, realtimeInputConfig: { automaticActivityDetection: { disabled: true } } }, history: [] } });
    if (path.endsWith('/audio/live/transcript')) { writes.push(route.request().postDataJSON()); return route.fulfill({ json: { chat_id: 'admin-chat' } }); }
    return route.fulfill({ status: 501, body: 'Unexpected native Admin request' });
  });
  await page.route('**/api/instance/admin-voice-sessions**', async route => {
    if (route.request().method() === 'POST') return route.fulfill({ json: { sessionId: 'admin-voice-session', token: 'fixture', setup: route.request().postDataJSON().setup, context: [] } });
    if (route.request().method() === 'DELETE') return route.fulfill({ status: 204 });
    return route.fulfill({ json: { available: true } });
  });
  await page.goto('/TEST/admin-voice');
  await page.getByRole('button', { name: 'Start Admin voice' }).click();
  await expect(page.getByRole('status').filter({hasText:/^listening$/})).toHaveText('listening');
  await expect(page.locator('.global-voice-glow')).toHaveCount(4);
  for (const edge of ['top','bottom','left','right']) await expect(page.locator('.global-voice-glow[data-edge='+edge+']')).toHaveCount(1);
  await emit(page, { serverContent: { inputTranscription: { text: 'Hello Admin', finished: true } } });
  const pcm = Buffer.alloc(4800).toString('base64');
  await emit(page, { serverContent: { modelTurn: { parts: [{ inlineData: { data: pcm, mimeType: 'audio/pcm;rate=24000' } }] }, outputTranscription: { text: 'Hello back', finished: true }, turnComplete: true, interactionStatus: 'IDLE' } });
  await expect.poll(async () => (await stats(page)).playbackStarts).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'End Admin voice' }).click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0]).toMatchObject({ chat_id: 'admin-chat', turns: [{ role: 'user', text: 'Hello Admin' }, { role: 'assistant', text: 'Hello back' }] });
  await expect.poll(async () => (await stats(page)).openSockets).toBe(0);
  await expect.poll(async () => (await stats(page)).runningContexts).toBe(0);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.locator('.global-voice-glow')).toHaveCount(0);
});
