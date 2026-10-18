import { expect, test, type Page } from '@playwright/test';
import { emit, installBrowserVoiceFixture, snapshot, startVoice, stats } from './helpers';

test.use({ serviceWorkers: 'block' });

const question = 'Search NASA lunar eclipse';
const failure = 'I apologize, a system error occurred.';
const corrected = 'NASA explains that Earth blocks sunlight from reaching the Moon during a lunar eclipse. Source: https://science.nasa.gov/moon/lunar-eclipses/';
const searchResult = {
  provider: 'searxng', query: question, category: 'general',
  results: [{ title: 'NASA lunar eclipses', url: 'https://science.nasa.gov/moon/lunar-eclipses/', snippet: 'A lunar eclipse occurs when Earth blocks sunlight from reaching the Moon.' }],
  sources: [{ title: 'NASA lunar eclipses', uri: 'https://science.nasa.gov/moon/lunar-eclipses/' }],
};

const recoveryFrames = (page: Page) => page.evaluate(() => (window as any).__voiceBrowser.clientContentFrames.filter((frame: any) => frame.turnComplete === true));

function pcm(seconds: number) {
  const audio = Buffer.alloc(Math.round(24_000 * 2 * seconds));
  for (let index = 0; index < audio.length / 2; index++) audio.writeInt16LE(Math.round(Math.sin(index * Math.PI / 60) * 500), index * 2);
  return { data: audio.toString('base64'), mimeType: 'audio/pcm;rate=24000' };
}

async function speak(page: Page, text = question) {
  const before = await stats(page);
  await page.evaluate(() => { (window as any).__voiceBrowser.speechProbability = 1; });
  await expect.poll(async () => (await stats(page)).activityStart).toBeGreaterThan(before.activityStart);
  await emit(page, { serverContent: { inputTranscription: { text } } });
  await page.evaluate(() => { (window as any).__voiceBrowser.speechProbability = 0; });
  await expect.poll(async () => (await stats(page)).activityEnd).toBeGreaterThan(before.activityEnd);
}

async function successfulSearch(page: Page) {
  await emit(page, { toolCall: { functionCalls: [{ id: 'recovery-search', name: 'search_web', args: { query: question, category: 'general' } }] } });
  await expect.poll(async () => (await stats(page)).toolResponses).toBe(1);
}

test('background News evidence follows voice across pages without a popup or an automatic write', async ({ page }) => {
  const requests = await installBrowserVoiceFixture(page);
  const now = new Date();
  const query = '"Hamilton" "Ohio" crime';
  const result = {
    provider: 'searxng', query, category: 'news', timeRange: 'week',
    dateFilter: { appliedBy: 'server', rollingDays: 7, since: new Date(now.getTime() - 7 * 86400000).toISOString(), until: now.toISOString() },
    results: [{ title: 'Hamilton public safety briefing', url: 'https://example.org/news', snippet: 'A dated public report for Hamilton, Ohio.', publishedAt: now.toISOString() }],
    sources: [{ title: 'Hamilton public safety briefing', uri: 'https://example.org/news' }],
  };
  requests.newsResult = { matched: true, request: { query, category: 'news', count: 3, timeRange: 'week' }, location: { name: 'Hamilton', state: 'Ohio' }, result, asOf: now.toISOString() };
  await startVoice(page);
  await page.getByRole('link', { name: 'projects', exact: true }).click();
  await speak(page, 'Any recent crime activity in Hamilton Ohio?');
  await expect.poll(() => recoveryFrames(page)).toHaveLength(1);
  const frame = (await recoveryFrames(page))[0];
  expect(JSON.stringify(frame)).toContain('Hamilton public safety briefing');
  expect(requests.news).toHaveLength(1);
  expect(requests.news[0].text).toBe('Any recent crime activity in Hamilton Ohio?');
  expect((await snapshot(page)).sources).toBe(1);
  expect(requests.tools).toBe(0);
  await expect(page.locator('.global-voice-search-card,[role="dialog"],iframe')).toHaveCount(0);
  await emit(page, { toolCall: { functionCalls: [{ id: 'news-unrequested-write', name: 'organization_api', args: { action: 'create_task', data: '{"title":"Do not create"}' } }] } });
  await expect.poll(async () => (await stats(page)).toolResponses).toBe(1);
  expect(requests.tools).toBe(0);
  await emit(page, { serverContent: { outputTranscription: { text: 'The dated Hamilton report is available from the public safety briefing.' }, modelTurn: { parts: [{ inlineData: pcm(0.1) }] }, turnComplete: true, interactionStatus: 'IDLE' } });
  await expect.poll(async () => (await snapshot(page)).phase).toBe('listening');
  await page.getByRole('link', { name: 'tasks', exact: true }).click();
  await speak(page, 'Any recent crime updates?');
  await expect.poll(() => recoveryFrames(page)).toHaveLength(2);
  expect(requests.news[1].previousLocation).toEqual({ name: 'Hamilton', state: 'Ohio' });
  expect(requests.sessions).toBe(1);
  expect(await stats(page)).toMatchObject({ setupCount: 1, openSockets: 1, microphones: 1 });
  await page.getByRole('button', { name: 'End voice', exact: true }).click();
  await expect.poll(() => stats(page)).toMatchObject({ stoppedMicrophones: 1, openSockets: 0, runningContexts: 0 });
  expect(requests.unknown).toEqual([]);
});

test('verified read recovery waits for playback, preserves replies across navigation, and cannot repeat a write', async ({ page }) => {
  const requests = await installBrowserVoiceFixture(page); requests.toolResult = searchResult;
  await startVoice(page);
  await speak(page);
  await successfulSearch(page);
  const before = await stats(page);
  await emit(page, { serverContent: {
    outputTranscription: { text: failure }, modelTurn: { parts: [{ inlineData: pcm(2) }] },
    turnComplete: true, interactionStatus: 'IDLE',
  } });
  await expect.poll(async () => (await stats(page)).playbackStarts).toBeGreaterThan(before.playbackStarts);
  expect(await recoveryFrames(page)).toHaveLength(0);
  await page.getByRole('link', { name: 'projects', exact: true }).click();
  await expect(page.getByLabel('Voice conversation')).toBeVisible();
  await expect(page.getByTestId('saved-transcripts')).toContainText(failure);
  await expect.poll(() => recoveryFrames(page), { timeout: 10_000 }).toHaveLength(1);
  const [frame] = await recoveryFrames(page);
  expect(JSON.stringify(frame)).toContain('NASA lunar eclipses');
  expect(requests.sessions).toBe(1); expect(requests.tools).toBe(1);
  expect(await stats(page)).toMatchObject({ setupCount: 1, openSockets: 1, microphones: 1 });
  const setups = await page.evaluate(() => (window as any).__voiceBrowser.setups);
  expect(setups).toHaveLength(1);
  expect(setups[0]).toMatchObject({ model: 'models/gemini-3.8-live-extended-thinking', generationConfig: { thinkingConfig: { thinkingLevel: 'HIGH' } } });
  await expect(page.locator('.global-voice-search-card,[role="dialog"],iframe')).toHaveCount(0);

  // Even if the provider repeats the successful read, its existing receipt is
  // delivered again without a second HTTP search.
  await emit(page, { toolCall: { functionCalls: [{ id: 'repeated-recovery-search', name: 'search_web', args: { query: question, category: 'general' } }] } });
  await expect.poll(async () => (await stats(page)).toolResponses).toBe(2);
  expect(requests.tools).toBe(1);

  // A model-generated mutation during the corrective read turn must fail in
  // the browser guard, before any organization HTTP operation can run.
  await emit(page, { toolCall: { functionCalls: [{ id: 'blocked-recovery-write', name: 'organization_api', args: { action: 'create_task', data: '{"title":"Must not be created"}' } }] } });
  await expect.poll(async () => (await stats(page)).toolResponses).toBe(3);
  const response = await page.evaluate(() => (window as any).__voiceBrowser.toolResponseFrames.at(-1));
  expect(response.functionResponses[0].response.error).toBeTruthy();
  expect(requests.tools).toBe(1);

  await emit(page, { serverContent: { outputTranscription: { text: corrected }, modelTurn: { parts: [{ inlineData: pcm(0.1) }] }, turnComplete: true, interactionStatus: 'IDLE' } });
  await expect(page.getByTestId('saved-transcripts')).toContainText(corrected);
  await expect(page.getByTestId('saved-transcripts')).toContainText(failure);
  expect((await snapshot(page)).sources).toBe(1);
  await expect.poll(async () => (await snapshot(page)).phase).toBe('listening');
  expect(await recoveryFrames(page)).toHaveLength(1);
  expect(requests.tools).toBe(1); expect(requests.unknown).toEqual([]);
  await page.getByRole('button', { name: 'End voice', exact: true }).click();
  await expect.poll(() => stats(page)).toMatchObject({ stoppedMicrophones: 1, openSockets: 0, runningContexts: 0 });
});

test('new speech cancels a pending read recovery before the original audio drains', async ({ page }) => {
  const requests = await installBrowserVoiceFixture(page); requests.toolResult = searchResult;
  await startVoice(page); await speak(page); await successfulSearch(page);
  const before = await stats(page);
  // Start barge-in in the same browser task as the playback packet. Separate
  // test-runner round trips can outlast this short clip on a loaded host.
  await page.evaluate(message => {
    (window as any).__voiceBrowser.emit(message);
    (window as any).__voiceBrowser.speechProbability = 1;
  }, { serverContent: { outputTranscription: { text: failure }, modelTurn: { parts: [{ inlineData: pcm(2) }] }, turnComplete: true, interactionStatus: 'IDLE' } });
  await expect.poll(async () => (await stats(page)).playbackStarts).toBeGreaterThan(before.playbackStarts);
  expect(await recoveryFrames(page)).toHaveLength(0);
  await expect.poll(async () => (await stats(page)).activityStart).toBeGreaterThan(before.activityStart);
  await emit(page, { serverContent: { inputTranscription: { text: 'Never mind, wait for me.' } } });
  await page.evaluate(() => { (window as any).__voiceBrowser.speechProbability = 0; });
  await expect.poll(async () => (await stats(page)).activityEnd).toBeGreaterThan(before.activityEnd);
  await emit(page, { serverContent: { interrupted: true, turnComplete: true, interactionStatus: 'IDLE' } });
  // Let the former playback deadline expire; a stale timer must not inject
  // recovery instructions into this new spoken turn.
  await page.waitForTimeout(2_200);
  expect(await recoveryFrames(page)).toHaveLength(0);
  expect(requests.tools).toBe(1); expect(requests.sessions).toBe(1);
  expect((await snapshot(page)).active).toBe(true);
  await page.getByRole('button', { name: 'End voice', exact: true }).click();
  expect(requests.unknown).toEqual([]);
});

test('zero-tool failure gets one same-session correction and a fresh read across navigation', async ({ page }) => {
  const zeroToolFailure = 'I apologize, but a system error occurred.';
  const requests = await installBrowserVoiceFixture(page); requests.toolResult = searchResult;
  await startVoice(page); await speak(page);
  expect(requests.tools).toBe(0);
  expect((await stats(page)).toolResponses).toBe(0);
  const before = await stats(page);
  await emit(page, { serverContent: {
    outputTranscription: { text: zeroToolFailure }, modelTurn: { parts: [{ inlineData: pcm(1) }] },
    turnComplete: true, interactionStatus: 'IDLE',
  } });
  await expect.poll(async () => (await stats(page)).playbackStarts).toBeGreaterThan(before.playbackStarts);
  expect(await recoveryFrames(page)).toHaveLength(0);
  await page.getByRole('link', { name: 'projects', exact: true }).click();
  await expect(page.getByLabel('Voice conversation')).toBeVisible();
  await expect(page.getByTestId('saved-transcripts')).toContainText(zeroToolFailure);
  await expect.poll(() => recoveryFrames(page), { timeout: 10_000 }).toHaveLength(1);
  expect(JSON.stringify((await recoveryFrames(page))[0])).toContain(question);
  expect(requests.sessions).toBe(1); expect(requests.tools).toBe(0);
  expect(await stats(page)).toMatchObject({ setupCount: 1, openSockets: 1, microphones: 1 });
  const setups = await page.evaluate(() => (window as any).__voiceBrowser.setups);
  expect(setups).toHaveLength(1);
  expect(setups[0]).toMatchObject({ model: 'models/gemini-3.8-live-extended-thinking', generationConfig: { thinkingConfig: { thinkingLevel: 'HIGH' } } });

  // With no earlier receipt to replay, recovery must perform an authorized
  // fresh read and deliver its real result on the existing provider socket.
  await successfulSearch(page);
  expect(requests.tools).toBe(1);
  const response = await page.evaluate(() => (window as any).__voiceBrowser.toolResponseFrames.at(-1));
  expect(response.functionResponses[0]).toMatchObject({
    id: 'recovery-search', name: 'search_web', response: { result: searchResult },
  });
  await emit(page, { serverContent: {
    outputTranscription: { text: corrected }, modelTurn: { parts: [{ inlineData: pcm(0.1) }] },
    turnComplete: true, interactionStatus: 'IDLE',
  } });
  await expect(page.getByTestId('saved-transcripts')).toContainText(corrected);
  await expect(page.getByTestId('saved-transcripts')).toContainText(zeroToolFailure);
  await expect.poll(async () => (await snapshot(page)).phase).toBe('listening');
  expect((await snapshot(page)).sources).toBe(1);
  await expect(page.locator('.global-voice-search-card,[role="dialog"],iframe')).toHaveCount(0);

  // A repeated provider failure after that correction cannot start a retry
  // loop, even though the fresh read now provides successful evidence.
  await emit(page, { serverContent: {
    outputTranscription: { text: zeroToolFailure }, modelTurn: { parts: [{ inlineData: pcm(0.1) }] },
    turnComplete: true, interactionStatus: 'IDLE',
  } });
  await expect.poll(async () => (await snapshot(page)).phase).toBe('listening');
  await page.waitForTimeout(500);
  expect(await recoveryFrames(page)).toHaveLength(1);
  expect(requests.sessions).toBe(1); expect(requests.tools).toBe(1); expect(requests.unknown).toEqual([]);
  expect(await stats(page)).toMatchObject({ setupCount: 1, openSockets: 1, microphones: 1 });
  await page.getByRole('button', { name: 'End voice', exact: true }).click();
  await expect.poll(() => stats(page)).toMatchObject({ stoppedMicrophones: 1, openSockets: 0, runningContexts: 0 });
});

const privateTaskId = '00000000-0000-4000-8000-000000000020';
function taskSnapshot(status: string, update: string) {
  const asOf = new Date().toISOString();
  return {
    asOf, organization: { id: 'company', name: 'Voice Test Organization' }, visibility: 'permitted_agents',
    count: 1, agents: [{ id: 'agent', name: 'Test Agent', status: 'active' }],
    work: {
      available: true, asOf, source: 'overview_labs_task_records', visibility: 'permitted_task_details',
      liveSystemHealth: false, limited: true, truncated: false,
      tasks: [{ id: privateTaskId, identifier: 'TASK-20', title: 'Databento research data', status, updatedAt: asOf,
        recordedUpdate: { source: 'task_comment', createdAt: asOf, text: update, truncated: false } }],
    },
  };
}

test('zero-tool task-status failure refreshes current work evidence across navigation on the same model', async ({ page }) => {
  const requests = await installBrowserVoiceFixture(page);
  requests.rosterResult = taskSnapshot('blocked', 'Earlier fixture state: awaiting access.');
  await startVoice(page);
  await speak(page, 'Did we get past the Databento issue?');
  const initialFrames = await page.evaluate(() => (window as any).__voiceBrowser.realtimeInputFrames);
  expect(JSON.stringify(initialFrames)).toContain('Earlier fixture state: awaiting access.');
  expect(requests.tools).toBe(0);

  const statusFailure = 'Let me check the task status. I apologize, but a system error occurred.';
  requests.rosterResult = taskSnapshot('in_review', 'Fresh fixture status: sample retrieved; validation is still pending.');
  await emit(page, { serverContent: { outputTranscription: { text: statusFailure, finished: true }, modelTurn: { parts: [{ inlineData: pcm(1) }] }, turnComplete: true, interactionStatus: 'IDLE' } });
  await page.getByRole('link', { name: 'projects', exact: true }).click();
  await expect(page.getByLabel('Voice conversation')).toBeVisible();
  await expect.poll(() => recoveryFrames(page), { timeout: 10_000 }).toHaveLength(1);
  const correctionFrame = JSON.stringify((await recoveryFrames(page))[0]);
  expect(correctionFrame).toContain('Fresh fixture status: sample retrieved; validation is still pending.');
  expect(correctionFrame).toContain('in_review');
  expect(correctionFrame).not.toContain('Earlier fixture state: awaiting access.');
  expect(correctionFrame).toContain('No tool operation was observed');
  expect(requests.roster).toBe(2); expect(requests.tools).toBe(0); expect(requests.sessions).toBe(1);

  const correction = 'The recorded task is in review: the sample was retrieved, and validation is still pending.';
  await emit(page, { serverContent: { outputTranscription: { text: correction }, modelTurn: { parts: [{ inlineData: pcm(0.1) }] }, turnComplete: true, interactionStatus: 'IDLE' } });
  await expect(page.getByTestId('saved-transcripts')).toContainText(correction);
  await expect(page.getByTestId('saved-transcripts')).toContainText(statusFailure);
  await expect.poll(async () => (await snapshot(page)).phase).toBe('listening');
  expect(await recoveryFrames(page)).toHaveLength(1);
  const setups = await page.evaluate(() => (window as any).__voiceBrowser.setups);
  expect(setups).toHaveLength(1);
  expect(setups[0]).toMatchObject({ model: 'models/gemini-3.8-live-extended-thinking', generationConfig: { thinkingConfig: { thinkingLevel: 'HIGH' } } });
  await expect(page.locator('.global-voice-search-card,[role="dialog"],iframe')).toHaveCount(0);
  expect(requests.unknown).toEqual([]);
  await page.getByRole('button', { name: 'End voice', exact: true }).click();
  await expect.poll(() => stats(page)).toMatchObject({ stoppedMicrophones: 1, openSockets: 0, runningContexts: 0 });
});

test('a successful private task read is refreshed across navigation without replaying its old body or a write', async ({ page }) => {
  const requests = await installBrowserVoiceFixture(page);
  requests.toolResult = { id: privateTaskId, status: 'blocked', description: 'Old private fixture body must never be replayed.' };
  await startVoice(page); await speak(page, 'Check TASK-20 status.');
  const read = { name: 'organization_api', args: { action: 'get_task', id: privateTaskId } };
  await emit(page, { toolCall: { functionCalls: [{ id: 'original-task-read', ...read }] } });
  await expect.poll(async () => (await stats(page)).toolResponses).toBe(1);
  expect(requests.tools).toBe(1);

  requests.toolResult = { id: privateTaskId, status: 'in_review', description: 'Fresh private fixture result: awaiting independent validation.' };
  const statusFailure = 'I am checking the task now. A system error occurred.';
  await emit(page, { serverContent: { outputTranscription: { text: statusFailure, finished: true }, modelTurn: { parts: [{ inlineData: pcm(1) }] }, turnComplete: true, interactionStatus: 'IDLE' } });
  await page.getByRole('link', { name: 'Connectors', exact: true }).click();
  await expect.poll(() => recoveryFrames(page), { timeout: 10_000 }).toHaveLength(1);
  const frame = JSON.stringify((await recoveryFrames(page))[0]);
  expect(frame).toContain('Fresh private fixture result: awaiting independent validation.');
  expect(frame).not.toContain('Old private fixture body must never be replayed.');
  expect(requests.tools).toBe(2);
  expect(requests.toolRequests.map(({ name, args }) => ({ name, args }))).toEqual([read, read]);
  expect(requests.toolRequests[1].callId).not.toBe(requests.toolRequests[0].callId);
  // The app's fresh read is real HTTP evidence, not a fabricated Gemini call.
  expect((await stats(page)).toolResponses).toBe(1);
  expect(requests.sessions).toBe(1); expect((await stats(page)).setupCount).toBe(1);

  await emit(page, { toolCall: { functionCalls: [{ id: 'blocked-task-status-write', name: 'organization_api', args: { action: 'update_task', id: privateTaskId, data: '{"status":"done"}' } }] } });
  await expect.poll(async () => (await stats(page)).toolResponses).toBe(2);
  expect(requests.tools).toBe(2);
  const denied = await page.evaluate(() => (window as any).__voiceBrowser.toolResponseFrames.at(-1));
  expect(denied.functionResponses[0].response.error).toBeTruthy();

  const correction = 'TASK-20 is in review and awaiting independent validation.';
  await emit(page, { serverContent: { outputTranscription: { text: correction }, modelTurn: { parts: [{ inlineData: pcm(0.1) }] }, turnComplete: true, interactionStatus: 'IDLE' } });
  await expect(page.getByTestId('saved-transcripts')).toContainText(correction);
  await expect(page.getByTestId('saved-transcripts')).toContainText(statusFailure);
  await expect.poll(async () => (await snapshot(page)).phase).toBe('listening');
  expect(await recoveryFrames(page)).toHaveLength(1);
  expect(requests.unknown).toEqual([]);
  await expect(page.locator('.global-voice-search-card,[role="dialog"],iframe')).toHaveCount(0);
  await page.getByRole('button', { name: 'End voice', exact: true }).click();
  await expect.poll(() => stats(page)).toMatchObject({ stoppedMicrophones: 1, openSockets: 0, runningContexts: 0 });
});
