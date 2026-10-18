import { expect, test } from '@playwright/test';
import { emit, installBrowserVoiceFixture, snapshot, startVoice, stats } from './helpers';

test.use({ serviceWorkers: 'block' });

test('standard Live finishes tool turns across navigation without Extended Thinking status frames', async ({ page }) => {
  const requests = await installBrowserVoiceFixture(page, 'gemini-3.8-live');
  requests.holdTool = true;
  requests.toolResult = { provider: 'searxng', category: 'general', query: 'SearXNG documentation', results: [], sources: [] };
  await startVoice(page);
  await emit(page, { serverContent: { inputTranscription: { text: 'Search for SearXNG documentation', finished: true } } });
  await emit(page, { toolCall: { functionCalls: [{ id: 'standard-search', name: 'search_web', args: { query: 'SearXNG documentation', category: 'general' } }] } });
  await expect.poll(() => requests.tools).toBe(1);
  await page.getByRole('link', { name: 'projects', exact: true }).click();
  await expect(page.getByLabel('Voice conversation')).toBeVisible();
  await emit(page, { serverContent: { turnComplete: true } });
  expect((await stats(page)).toolResponses).toBe(0);
  expect((await snapshot(page)).phase).not.toBe('listening');
  await expect.poll(() => requests.releaseTool !== null).toBe(true);
  requests.releaseTool!();
  await expect.poll(async () => (await stats(page)).toolResponses).toBe(1);
  await emit(page, { serverContent: { outputTranscription: { text: 'The search returned no matching results.', finished: true }, turnComplete: true } });
  await expect.poll(async () => (await snapshot(page)).phase).toBe('listening');
  await expect(page.getByTestId('saved-transcripts')).toContainText('The search returned no matching results.');
  await page.getByRole('link', { name: 'tasks', exact: true }).click();
  expect(requests.sessions).toBe(1);
  expect(requests.tools).toBe(1);
  expect(await stats(page)).toMatchObject({ setupCount: 1, openSockets: 1, microphones: 1 });
  const setup = await page.evaluate(() => (window as any).__voiceBrowser.setups[0]);
  expect(setup.model).toBe('models/gemini-3.8-live');
  expect(setup.generationConfig).not.toHaveProperty('thinkingConfig');
  await expect(page.locator('.global-voice-search-card,[role="dialog"],iframe')).toHaveCount(0);
  await page.getByRole('button', { name: 'End voice', exact: true }).click();
  await expect.poll(() => stats(page)).toMatchObject({ stoppedMicrophones: 1, openSockets: 0, runningContexts: 0 });
  expect(requests.unknown).toEqual([]);
});
