# Voice browser regression checks

Run from the repository root:

```sh
node node_modules/@playwright/test/cli.js install chromium webkit
node node_modules/@playwright/test/cli.js test --config tests/voice-browser/playwright.config.ts
```

The suite starts a loopback-only Vite fixture on port 3218. It does not use a
running WHOXOS server, real accounts, API credentials, or organization
data. Unhandled API requests fail locally instead of reaching the application.
Navigation tests intercept APIs in Playwright and block service workers. The
separate worker tests use fixed synthetic server responses where WebKit forwards
worker fetches outside Playwright's interception.
Each test gets an isolated browser context; traces and videos are disabled.

The actual session provider, voice controller, floating indicator, router,
capture AudioWorklet, Web Audio/RTC playback, and service worker run in Chromium
and WebKit. The microphone is a synthetic browser MediaStream. The speech
detector's model result, Gemini WebSocket, authenticated API responses, and page
contents are controlled fixtures. No real provider inference or physical
microphone permission is exercised.

Coverage includes:

- One pinned session through Tasks, Projects, Agents, Connectors, detached shells,
  and Return to chat; portal replacement and mobile resizing do not shift content.
- No floating search popup; ongoing search activity and source state clear at the
  correct lifecycle boundaries.
- Actual Web Audio suspension recovery, scheduled PCM interruption, provider
  failure/retry, sign-out cleanup, and analyzer suspension after End.
- Slow/failed tools and stale provider callbacks cannot speak or publish old
  sources after interruption, End, or a new session.
- One bounded verified-read correction waits for actual audio drain, survives
  route navigation, keeps the original reply visible, and retains the selected
  model/session. A repeated read uses its receipt, a write cannot execute, and
  new speech cancels delayed recovery. These are synthetic provider responses,
  not proof of successful Gemini-generated corrections.
- Actual service-worker updates defer reload during voice, fetch assets from the
  network first, and replace stale caches in both engines. Offline cache fallback
  is tested in Chromium; the WebKit case is explicitly skipped because that
  runner's offline emulation rejects page fetches before the worker can respond.

The navigation pages are deliberately small fixture pages, not the complete
Tasks/Projects/Agents/Connectors screens. These tests verify the common session
and layout lifecycle independently of production data. Simulated document
visibility is not a claim about OS-level background behavior or physical Safari
microphone/speaker hardware. Live Gemini reliability needs separate provider
tests.
