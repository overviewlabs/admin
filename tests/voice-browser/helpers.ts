import { expect, type Page } from '@playwright/test';

/** Synthetic media + provider transport; all other voice/browser code is real. */
export async function installBrowserVoiceFixture(page: Page, model: 'gemini-3.8-live' | 'gemini-3.8-live-extended-thinking' = 'gemini-3.8-live-extended-thinking') {
  await page.addInitScript(() => {
    const NativeAudioContext = window.AudioContext;
    const NativeWebSocket = window.WebSocket;
    const NativeWorker = window.Worker;
    const mediaDevices = navigator.mediaDevices;
    const state: any = (window as any).__voiceBrowser = {
      microphones: 0, stoppedMicrophones: 0, contexts: [], sockets: [], workers: [], microphoneTracks: [],
      speechProbability: 0, setupCount: 0, activityStart: 0, activityEnd: 0, toolResponses: 0,
      playbackStarts: 0, playbackStops: 0,
      clientContentFrames: [], realtimeInputFrames: [], toolResponseFrames: [], setups: [],
      // WebKit can replace an unreferenced WebIDL wrapper and lose expandos.
      // Retain the exact fixture wrapper for this document's lifetime.
      mediaDevices,
    };
    window.AudioContext = class extends NativeAudioContext {
      constructor(options?: AudioContextOptions) { super(options); state.contexts.push(this); }
      createMediaStreamSource(stream: MediaStream) { (this as any).fixtureCapture = true; return super.createMediaStreamSource(stream); }
      createBufferSource() {
        const source = super.createBufferSource();
        const start = source.start.bind(source), stop = source.stop.bind(source);
        source.start = (...args: Parameters<AudioBufferSourceNode['start']>) => { state.playbackStarts++; start(...args); };
        source.stop = (...args: Parameters<AudioBufferSourceNode['stop']>) => { state.playbackStops++; stop(...args); };
        return source;
      }
    };
    Object.defineProperty(mediaDevices, 'getUserMedia', { configurable: true, value: async () => {
      state.microphones++;
      try {
        state.microphoneStage = 'context';
        const context = new NativeAudioContext(); await context.resume();
        state.microphoneStage = 'destination';
        const destination = context.createMediaStreamDestination();
        const source = context.createConstantSource(); source.offset.value = 0; source.connect(destination); source.start();
        for (const track of destination.stream.getTracks()) {
          state.microphoneTracks.push(track);
          const stop = track.stop.bind(track); let stopped = false;
          track.stop = () => { if (stopped) return; stopped = true; state.stoppedMicrophones++; stop(); source.stop(); void context.close(); };
        }
        state.microphoneStage = 'ready';
        return destination.stream;
      } catch (error) {
        state.microphoneFailure = { name: (error as Error).name, message: (error as Error).message };
        throw error;
      }
    } });
    Object.defineProperty(mediaDevices, 'enumerateDevices', { configurable: true, value: async () => [{ kind: 'audioinput', deviceId: 'fixture-mic', label: 'Synthetic microphone' }] });
    window.Worker = class {
      onmessage: ((event: MessageEvent) => void) | null = null;
      onerror = null;
      terminated = false;
      constructor(url: string | URL, options?: WorkerOptions) {
        if (!String(url).includes('/voice-speech-worker.js')) return new NativeWorker(url, options) as any;
        state.workers.push(this);
        setTimeout(() => { if (!this.terminated) this.onmessage?.({ data: { type: 'ready' } } as MessageEvent); }, 10);
      }
      postMessage(message: any) {
        if (message.type !== 'frame' || this.terminated) return;
        queueMicrotask(() => { if (!this.terminated) this.onmessage?.({ data: { ...message, probability: state.speechProbability } } as MessageEvent); });
      }
      terminate() { this.terminated = true; }
    } as any;
    window.WebSocket = class {
      static OPEN = 1; static CLOSED = 3; static CONNECTING = 0; static CLOSING = 2;
      readyState = 0; bufferedAmount = 0; binaryType = 'arraybuffer';
      onopen: (() => void) | null = null; onclose: ((event: any) => void) | null = null;
      onmessage: ((event: any) => void) | null = null; onerror = null;
      constructor(url: string | URL, protocols?: string | string[]) {
        if (!String(url).startsWith('wss://generativelanguage.googleapis.com/')) return new NativeWebSocket(url, protocols) as any;
        state.sockets.push(this);
        setTimeout(() => { if (this.readyState !== 3) { this.readyState = 1; this.onopen?.(); } }, 5);
      }
      emit(message: unknown) { if (this.readyState === 1) this.onmessage?.({ data: JSON.stringify(message) }); }
      send(value: string) {
        const message = JSON.parse(value);
        if (message.setup) { state.setupCount++; state.setups.push(message.setup); setTimeout(() => this.emit({ setupComplete: {} }), 5); }
        if (message.clientContent) state.clientContentFrames.push(message.clientContent);
        if (message.realtimeInput) state.realtimeInputFrames.push(message.realtimeInput);
        if (message.realtimeInput?.activityStart) state.activityStart++;
        if (message.realtimeInput?.activityEnd) state.activityEnd++;
        if (message.toolResponse) { state.toolResponses++; state.toolResponseFrames.push(message.toolResponse); }
      }
      close() { this.readyState = 3; }
    } as any;
    state.emit = (message: unknown) => state.sockets.at(-1)?.emit(message);
    state.stats = () => ({ microphones: state.microphones, stoppedMicrophones: state.microphoneTracks.filter((track: MediaStreamTrack) => track.readyState === 'ended').length,
      openSockets: state.sockets.filter((socket: any) => socket.readyState === 1).length,
      setupCount: state.setupCount, activityStart: state.activityStart, activityEnd: state.activityEnd, toolResponses: state.toolResponses,
      playbackStarts: state.playbackStarts, playbackStops: state.playbackStops,
      runningContexts: state.contexts.filter((context: AudioContext) => context.state === 'running').length,
      openContexts: state.contexts.filter((context: AudioContext) => context.state !== 'closed').length,
    });
  });
  const requests = { budgetWait: false, budgetRequests: 0, sessions: 0, tools: 0, transcripts: 0, roster: 0, rosterResult: null as unknown, toolRequests: [] as Array<{ name: string; args: Record<string, unknown>; callId: string }>, news: [] as any[], newsResult: null as unknown, unknown: [] as string[], releaseTool: null as null | (() => void), holdTool: false, failTool: false, toolResult: null as unknown };
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    if (!url.pathname.startsWith('/api/')) return route.continue();
    const path = url.pathname.replace(/^\/api/, '');
    const method = route.request().method();
    const json = async (body: unknown) => route.fulfill({ json: body });
    if (path === '/auth/get-session') return json({
      session: { id: 'fixture-auth-session', userId: 'fixture-owner' },
      user: { id: 'fixture-owner', name: 'Fixture Owner', email: null, image: null },
      sentryDsn: null,
    });
    if (path === '/companies') return json([{ id: 'company', name: 'Voice Test Organization', issuePrefix: 'TEST', status: 'active' }]);
    if (path === '/companies/company/chats/agent' || path === '/issues/chat') return json({ id: 'chat', companyId: 'company', conversationSessionGeneration: 0, status: 'in_progress', conversationState: 'idle' });
    if (path === '/companies/company/agents') return json(Array.from({ length: 6 }, (_, i) => ({ id: i ? `agent${i}` : 'agent', name: i ? `Agent ${i}` : 'Test Agent', status: 'idle' })));
    if (path.startsWith('/companies/company/voice-sessions/') && method === 'DELETE') return json({ ended: true, removed: true });
    if (path.endsWith('/token-budget')) { requests.budgetRequests++; return json(requests.budgetWait ? {allowed:false,retryAfterMs:250} : {allowed:true,retryAfterMs:0}); }
    if (path === '/companies/company/voice-sessions' && method === 'POST') {
      requests.sessions++;
      const agentId = route.request().postDataJSON().agentIds[0];
      return json([{ sessionId: `fixture-session-${requests.sessions}`, agentId, name: agentId === 'agent' ? 'Test Agent' : `Agent ${agentId.replace('agent', '')}`, issueId: 'chat', token: 'fixture-token-not-a-credential', instructionsRevision: 'fixture-revision', context: [], tokenBudget: {url:`/companies/company/voice-sessions/fixture-session-${requests.sessions}/token-budget`,setupTokens:2000,tokensPerMinute:65000}, setup: {
        model: `models/${model}`, generationConfig: { responseModalities: ['AUDIO'], ...(model.endsWith('extended-thinking') ? { thinkingConfig: { thinkingLevel: 'HIGH' } } : {}) },
        realtimeInputConfig: { automaticActivityDetection: { disabled: true } }, tools: [{ functionDeclarations: [{ name: 'search_web' }] }],
      } }]);
    }
    if (path.endsWith('/diagnostics')) return route.fulfill({ status: 204, body: '' });
    if (path.endsWith('/instructions-revision')) return json({ revision: 'fixture-revision' });
    if (path.endsWith('/roster')) {
      requests.roster++;
      return json(requests.rosterResult ?? { asOf: new Date().toISOString(), organization: { id: 'company', name: 'Voice Test Organization' }, visibility: 'permitted_agents', count: 1, agents: [{ id: 'agent', name: 'Test Agent', status: 'active' }] });
    }
    if (path.endsWith('/news-context')) { requests.news.push(route.request().postDataJSON()); return json(requests.newsResult ?? { matched: false }); }
    if (/\/messages\/[^/]+$/.test(path)) {
      requests.transcripts++;
      const { role, text } = route.request().postDataJSON();
      return json({ id: path.split('/').at(-1), companyId: 'company', issueId: 'chat', body: text,
        authorAgentId: role === 'model' ? 'agent' : null, authorUserId: role === 'user' ? 'fixture-owner' : null,
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    }
    if (path.endsWith('/tools')) {
      requests.tools++;
      requests.toolRequests.push(route.request().postDataJSON());
      if (requests.holdTool) await new Promise<void>(resolve => { requests.releaseTool = resolve; });
      if (requests.failTool) return route.fulfill({ status: 502, json: { error: 'The isolated fixture search is temporarily unavailable.' } });
      if (requests.toolResult) return json(requests.toolResult);
      return json({ provider: 'searxng', query: 'Public fixture search', category: 'news', results: [{ title: 'Fixture source', url: 'https://example.org/source', snippet: 'Public fixture result' }], sources: [{ title: 'Fixture source', uri: 'https://example.org/source' }] });
    }
    if (/\/issues\/chat\/(comments|interactions|live-runs)$/.test(path)) return json([]);
    requests.unknown.push(`${method} ${path}`); return route.fulfill({ status: 501, json: { error: 'Unhandled isolated fixture request' } });
  });
  return requests;
}

export const stats = (page: Page) => page.evaluate(() => (window as any).__voiceBrowser.stats());
export const snapshot = (page: Page) => page.evaluate(() => (window as any).__voiceFixture.snapshot());
export const emit = (page: Page, message: unknown) => page.evaluate(value => (window as any).__voiceBrowser.emit(value), message);
export async function startVoice(page: Page) {
  await page.goto('/TEST/chats/agent');
  await page.getByRole('button', { name: 'Start test voice' }).click();
  await expect(page.locator('.global-voice-overlay')).toHaveAttribute('data-phase', 'listening', { timeout: 25_000 });
  await expect(page.getByLabel('Voice conversation')).toContainText('Test Agent · Voice Test Organization');
}
