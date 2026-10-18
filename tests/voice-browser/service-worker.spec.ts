import { expect, test } from '@playwright/test';
import { installBrowserVoiceFixture, startVoice, stats } from './helpers';

async function waitForControl(page: import('@playwright/test').Page) {
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
}

test('a real worker update waits for active voice to end before requesting reload', async ({ page }) => {
  await installBrowserVoiceFixture(page); await startVoice(page); await waitForControl(page);
  await page.evaluate(() => {
    (window as any).__workerChanges = 0;
    navigator.serviceWorker.addEventListener('controllerchange', () => (window as any).__workerChanges++);
    // Model background visibility deterministically; this does not claim to
    // reproduce physical Safari's OS-level background audio suspension.
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.evaluate(async () => {
    await fetch('/__voice-fixture__/version', { method: 'POST' });
    await (await navigator.serviceWorker.ready).update();
  });
  await expect.poll(() => page.evaluate(() => (window as any).__workerChanges)).toBe(1);
  expect(await page.evaluate(() => (window as any).__fixtureReloads || 0)).toBe(0);
  expect(await stats(page)).toMatchObject({ stoppedMicrophones: 0, setupCount: 1, openSockets: 1 });
  await page.getByRole('button', { name: 'End voice', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__fixtureReloads)).toBe(1);
  expect(await stats(page)).toMatchObject({ stoppedMicrophones: 1, openSockets: 0 });
});

test('real service worker fetches current assets first and removes stale build caches', async ({ page }) => {
  await installBrowserVoiceFixture(page); await page.goto('/TEST/chats/agent'); await waitForControl(page);
  const first = await page.evaluate(async () => (await fetch('/fixture-asset.txt')).text());
  await expect.poll(() => page.evaluate(async () => (await caches.match('/fixture-asset.txt'))?.text())).toBe(first);
  const next = await page.evaluate(async () => (await fetch('/__voice-fixture__/version', { method: 'POST' })).text());
  expect(next).not.toBe(first);
  expect(await page.evaluate(async () => (await fetch('/fixture-asset.txt')).text())).toBe(next);
  await expect.poll(() => page.evaluate(async () => (await caches.match('/fixture-asset.txt'))?.text())).toBe(next);
  await page.evaluate(async () => {
    await (await caches.open('whoxos-stale-fixture')).put('/stale-asset.txt', new Response('stale'));
    await (await navigator.serviceWorker.ready).update();
  });
  await expect.poll(() => page.evaluate(async () => (await caches.keys()).includes('whoxos-stale-fixture'))).toBe(false);
});

test('real service worker uses cached assets when Chromium goes offline', async ({ page, context, browserName }) => {
  test.skip(browserName === 'webkit', 'Playwright WebKit offline emulation rejects page fetches before the service worker can provide cached responses.');
  await installBrowserVoiceFixture(page); await page.goto('/TEST/chats/agent'); await waitForControl(page);
  const text = await page.evaluate(async () => (await fetch('/fixture-asset.txt')).text());
  await expect.poll(() => page.evaluate(async () => (await caches.match('/fixture-asset.txt'))?.text())).toBe(text);
  await context.setOffline(true);
  expect(await page.evaluate(async () => (await fetch('/fixture-asset.txt')).text())).toBe(text);
});
