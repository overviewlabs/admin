import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.', testMatch: '*.spec.ts', timeout: 45_000, workers: 1, retries: 0,
  use: { baseURL: 'http://127.0.0.1:3218', headless: true, screenshot: 'only-on-failure', trace: 'off' },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    { name: 'webkit', use: { browserName: 'webkit' } },
  ],
  webServer: { command: 'node server.mjs', url: 'http://127.0.0.1:3218/TEST/chats/agent', timeout: 60_000, reuseExistingServer: false },
  outputDir: '/tmp/overview-labs-voice-browser-results', reporter: 'list',
});
