import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from '../../ui/node_modules/vite/dist/node/index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let version = 'one';
const server = await createServer({
  configFile: path.join(root, 'ui/vite.config.ts'),
  root: path.join(root, 'ui'),
  // Browser assertions exercise a loaded app version. Hot replacement during
  // unrelated workspace edits would remount the root and invalidate sessions.
  server: { host: '127.0.0.1', port: 3218, strictPort: true, hmr: false, proxy: {}, fs: { allow: [root] } },
  plugins: [{
    name: 'isolated-voice-browser-fixture',
    configureServer(vite) {
      vite.middlewares.use((req, res, next) => {
        const url = new URL(req.url, 'http://127.0.0.1:3218');
        const send = (body, type = 'text/plain') => {
          res.setHeader('Content-Type', type); res.setHeader('Cache-Control', 'no-store'); res.end(body);
        };
        if (url.pathname === '/__voice-fixture__/version' && req.method === 'POST') {
          version = version === 'one' ? 'two' : 'one'; send(version); return;
        }
        if (url.pathname === '/fixture-asset.txt') { send(version); return; }
        if (url.pathname === '/sw.js') {
          void fs.readFile(path.join(root, 'ui/public/sw.js'), 'utf8')
            .then(source => send(source.replace('__WHOXOS_BUILD_ID__', `voice-test-${version}`), 'application/javascript'));
          return;
        }
        if (url.pathname.startsWith('/TEST/') || url.pathname === '/auth' || url.pathname === '/') {
          void vite.transformIndexHtml(req.url, `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module" src="/@fs${root}/tests/voice-browser/fixture.tsx"></script></body></html>`)
            .then(html => send(html, 'text/html')).catch(next);
          return;
        }
        // WebKit forwards worker fetches outside Playwright's page routing.
        // Fixed, synthetic defaults support the worker suite only; controlled
        // tool responses in navigation tests still use page interception.
        const apiPath = url.pathname.replace(/^\/api/, '');
        let body;
        if (apiPath === '/companies/company/chats/agent' || apiPath === '/issues/chat') body = { id: 'chat', companyId: 'company', conversationSessionGeneration: 0, status: 'in_progress', conversationState: 'idle' };
        if (apiPath === '/companies/company/voice-sessions' && req.method === 'POST') body = [{ sessionId: 'fixture-worker-session', agentId: 'agent', name: 'Test Agent', issueId: 'chat', token: 'fixture-token-not-a-credential', instructionsRevision: 'fixture-revision', context: [], setup: { model: 'models/gemini-3.8-live-extended-thinking', generationConfig: { responseModalities: ['AUDIO'] }, realtimeInputConfig: { automaticActivityDetection: { disabled: true } } } }];
        if (apiPath.endsWith('/instructions-revision')) body = { revision: 'fixture-revision' };
        if (/\/issues\/chat\/(comments|interactions|live-runs)$/.test(apiPath)) body = [];
        if (url.pathname.startsWith('/api/') && apiPath.endsWith('/diagnostics')) { res.statusCode = 204; send(''); return; }
        if (body !== undefined && url.pathname.startsWith('/api/')) { send(JSON.stringify(body), 'application/json'); return; }
        // Never proxy fixture requests into a running organization server.
        if (url.pathname.startsWith('/api/')) { res.statusCode = 501; send('Unhandled isolated fixture request'); return; }
        next();
      });
    },
  }],
});
await server.listen();
