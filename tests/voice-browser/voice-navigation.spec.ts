import { expect, test } from '@playwright/test';
import { emit, installBrowserVoiceFixture, snapshot, startVoice, stats } from './helpers';

// Worker lifecycle has its own suite. Page-level API interception is not
// available for requests forwarded through a worker in WebKit.
test.use({ serviceWorkers: 'block' });

test('one voice session survives navigation, pane replacement, mobile resize, and clean end', async ({ page }) => {
  const requests = await installBrowserVoiceFixture(page);
  await startVoice(page);
  const heading = await page.getByTestId('page-heading').boundingBox();
  expect(await stats(page)).toMatchObject({ microphones: 1, setupCount: 1, openSockets: 1 });
  for (const destination of ['tasks', 'projects', 'agents', 'Connectors', 'Detached shell']) {
    await page.getByRole('link', { name: destination, exact: true }).click();
    await expect(page.getByLabel('Voice conversation')).toBeVisible();
    await expect(page.locator('.global-voice-overlay')).toHaveCount(1);
    expect(await stats(page)).toMatchObject({ microphones: 1, stoppedMicrophones: 0, setupCount: 1, openSockets: 1 });
    expect((await snapshot(page)).active).toBe(true);
  }
  await expect(page.locator('.global-voice-overlay')).toHaveAttribute('data-fullscreen', 'true');
  await page.getByRole('link', { name: 'Return to chat with Test Agent' }).click();
  await expect(page).toHaveURL('/TEST/chats/agent');
  await expect(page.locator('.global-voice-overlay')).toHaveAttribute('data-fullscreen', 'false');
  expect((await page.getByTestId('page-heading').boundingBox())?.y).toBe(heading?.y);
  await page.setViewportSize({ width: 390, height: 844 });
  const controls = page.getByLabel('Voice conversation');
  await expect(controls).toBeVisible();
  const bounds = await controls.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0); expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(391);
  await page.getByRole('button', { name: 'End voice', exact: true }).click();
  await expect(page.locator('.global-voice-overlay')).toHaveCount(0);
  await expect.poll(() => stats(page)).toMatchObject({ stoppedMicrophones: 1, openSockets: 0, runningContexts: 0 });
  expect((await snapshot(page)).lease).toBe(false);
  expect(requests.sessions).toBe(1); expect(requests.unknown).toEqual([]);
});

test('search activity remains across routes without a popup; source state clears on interruption', async ({ page }) => {
  const requests = await installBrowserVoiceFixture(page); requests.holdTool = true;
  await startVoice(page);
  await emit(page, { toolCall: { functionCalls: [{ id: 'fixture-search', name: 'search_web', args: { query: 'Public fixture search', category: 'news' } }] } });
  await expect(page.getByLabel('Voice conversation')).toContainText('Searching the web');
  await page.getByRole('link', { name: 'projects', exact: true }).click();
  await expect(page.getByLabel('Voice conversation')).toContainText('Searching the web');
  await expect.poll(() => requests.tools).toBe(1);
  requests.releaseTool!();
  await expect.poll(async () => (await snapshot(page)).sources).toBe(1);
  await expect(page.locator('.global-voice-search-card,[role="dialog"],iframe')).toHaveCount(0);
  await expect(page.getByLabel('Voice conversation')).not.toContainText('Fixture source');
  await expect.poll(async () => (await snapshot(page)).activity).toBeNull();
  await page.evaluate(() => { (window as any).__voiceBrowser.speechProbability = 1; });
  await expect.poll(async () => (await stats(page)).activityStart).toBeGreaterThan(0);
  await expect.poll(async () => (await snapshot(page)).sources).toBe(0);
  await page.evaluate(() => { (window as any).__voiceBrowser.speechProbability = 0; });
  await page.getByRole('button', { name: 'End voice', exact: true }).click();
  expect(requests.unknown).toEqual([]);
});

test('sign-out route releases microphone and provider instead of retaining a hidden call', async ({ page }) => {
  await installBrowserVoiceFixture(page); await startVoice(page);
  await page.getByRole('link', { name: 'Sign out fixture' }).click();
  await expect(page.locator('.global-voice-overlay')).toHaveCount(0);
  await expect.poll(() => stats(page)).toMatchObject({ stoppedMicrophones: 1, openSockets: 0, runningContexts: 0 });
  expect((await snapshot(page)).lease).toBe(false);
});

test('actual Web Audio suspension recovers without replacing the call; provider failure allows a clean retry', async ({ page }) => {
  const requests = await installBrowserVoiceFixture(page); await startVoice(page);
  await page.evaluate(async () => { await (window as any).__voiceBrowser.contexts.find((c: any) => c.fixtureCapture).suspend(); });
  await expect.poll(() => page.evaluate(() => (window as any).__voiceBrowser.contexts.find((c: any) => c.fixtureCapture).state)).toBe('running');
  expect(await stats(page)).toMatchObject({ microphones: 1, setupCount: 1, stoppedMicrophones: 0 });
  await emit(page, { error: { message: 'Fixture connection failed' } });
  await expect(page.getByRole('alert')).toBeVisible();
  await expect.poll(() => stats(page)).toMatchObject({ stoppedMicrophones: 1, openSockets: 0, runningContexts: 0 });
  await page.getByRole('link', { name: 'tasks', exact: true }).click();
  await page.getByRole('button', { name: 'Try voice again' }).click();
  await expect(page.locator('.global-voice-overlay')).toHaveAttribute('data-phase', 'listening');
  expect(await stats(page)).toMatchObject({ microphones: 2, setupCount: 2, openSockets: 1, openContexts: 3 });
  await page.getByRole('button', { name: 'End voice', exact: true }).click();
  await expect.poll(() => stats(page)).toMatchObject({ stoppedMicrophones: 2, openSockets: 0, runningContexts: 0, openContexts: 1 });
  expect(requests.unknown).toEqual([]);
});

test('natural speech interrupts real scheduled playback and discards a slow research result', async ({ page }) => {
  const requests = await installBrowserVoiceFixture(page); requests.holdTool = true;
  await startVoice(page);
  const before = await stats(page);
  // A synthetic 3-second PCM tone exercises real browser buffers/playback.
  const audio = Buffer.alloc(24_000 * 2 * 3);
  for (let i = 0; i < audio.length / 2; i++) audio.writeInt16LE(Math.round(Math.sin(i * Math.PI / 60) * 500), i * 2);
  await emit(page, { serverContent: { modelTurn: { parts: [{ inlineData: { data: audio.toString('base64'), mimeType: 'audio/pcm;rate=24000' } }] } } });
  await expect.poll(async () => (await stats(page)).playbackStarts).toBeGreaterThan(before.playbackStarts);
  await expect(page.locator('.global-voice-overlay')).toHaveAttribute('data-phase', 'speaking');
  await emit(page, { toolCall: { functionCalls: [{ id: 'slow-interrupted-search', name: 'search_web', args: { query: 'Public fixture search', category: 'news' } }] } });
  await expect.poll(() => requests.tools).toBe(1);
  await page.evaluate(() => { (window as any).__voiceBrowser.speechProbability = 1; });
  await expect.poll(async () => (await stats(page)).activityStart).toBeGreaterThan(0);
  await expect.poll(async () => (await stats(page)).playbackStops).toBeGreaterThan(before.playbackStops);
  await expect(page.locator('.global-voice-overlay')).toHaveAttribute('data-phase', 'listening');
  requests.releaseTool!();
  await expect.poll(async () => (await snapshot(page)).activity).toBeNull();
  expect((await stats(page)).toolResponses).toBe(0);
  expect((await snapshot(page)).sources).toBe(0);
  await page.getByRole('button', { name: 'End voice', exact: true }).click();
});

test('failed tools return a failure without stopping voice; an ended session cannot speak after restart', async ({ page }) => {
  const requests = await installBrowserVoiceFixture(page); requests.failTool = true;
  await startVoice(page);
  await emit(page, { toolCall: { functionCalls: [{ id: 'failed-search', name: 'search_web', args: { query: 'Public fixture search', category: 'news' } }] } });
  await expect.poll(async () => (await stats(page)).toolResponses).toBe(1);
  await expect.poll(async () => (await snapshot(page)).activity).toBeNull();
  expect((await snapshot(page)).active).toBe(true);
  expect((await snapshot(page)).sources).toBe(0);
  await expect(page.getByRole('alert')).toHaveCount(0);
  requests.failTool = false; requests.holdTool = true;
  await emit(page, { toolCall: { functionCalls: [{ id: 'ended-search', name: 'search_web', args: { query: 'Public fixture search', category: 'news' } }] } });
  await expect.poll(() => requests.tools).toBe(2);
  await page.getByRole('button', { name: 'End voice', exact: true }).click();
  await page.getByRole('button', { name: 'Start test voice' }).click();
  await expect(page.locator('.global-voice-overlay')).toHaveAttribute('data-phase', 'listening');
  const before = await stats(page);
  requests.releaseTool!();
  // Simulate a buffered old provider callback even after its socket closed.
  await page.evaluate(() => {
    (window as any).__voiceBrowser.sockets[0].onmessage?.({ data: JSON.stringify({ serverContent: { modelTurn: { parts: [{ inlineData: { data: 'AAAAAA==' } }] } } }) });
  });
  await page.waitForTimeout(200);
  expect(await stats(page)).toMatchObject({ toolResponses: before.toolResponses, playbackStarts: before.playbackStarts, openSockets: 1 });
  expect((await snapshot(page)).sources).toBe(0);
  await page.getByRole('button', { name: 'End voice', exact: true }).click();
  await expect.poll(() => stats(page)).toMatchObject({ stoppedMicrophones: 2, openSockets: 0, runningContexts: 0 });
  expect(requests.unknown).toEqual([]);
});
