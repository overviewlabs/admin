import { beforeEach, afterEach, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ api: { post: vi.fn(), get: vi.fn(), put: vi.fn(), delete: vi.fn() }, list: vi.fn(), lives: [] as any[] }));
vi.mock('@/api/client', () => ({ api: mock.api }));
vi.mock('@/api/agents', () => ({ agentsApi: { list: mock.list } }));
vi.mock('./agent-voice-agent-tools', () => ({ createVoiceAgentTools: () => ({ execute: vi.fn() }) }));
vi.mock('./agent-voice-live', () => ({ AgentVoiceLive: class {
  start = vi.fn(async () => {}); stop = vi.fn(); setConferenceFloor = vi.fn(); conferenceContext = vi.fn();
  constructor(...args: any[]) { Object.assign(this, { args }); mock.lives.push(this); }
} }));
import { VoiceConference } from './voice-conference';
function setup() {
  const track = { stop: vi.fn() }; const stream: any = { clone: () => stream, getTracks: () => [track] };
  const root: any = { stop: vi.fn(), setConferenceFloor: vi.fn(), conferenceContext: vi.fn() };
  const options: any = { companyId: 'org', session: { agentId: 'root', name: 'CEO', sessionId: 'anchor', issueId: 'chat' }, live: root, stream, generation: 0,
    tones: { play: vi.fn() }, change: vi.fn(), phase: vi.fn(), saved: vi.fn(), error: vi.fn(), end: vi.fn() };
  return { call: new VoiceConference(options), options, root, track };
}
beforeEach(() => {
  vi.clearAllMocks(); mock.lives.length = 0;
  vi.stubGlobal('AudioContext', class {});
  mock.list.mockResolvedValue(Array.from({ length: 7 }, (_, i) => ({ id: `agent${i}`, name: `Agent ${i}`, status: 'idle' })));
  mock.api.post.mockImplementation(async (_url, body) => [{ agentId: body.agentIds[0], name: body.agentIds[0], sessionId: body.agentIds[0], issueId: 'chat' }]);
  mock.api.delete.mockResolvedValue({ removed: true }); mock.api.put.mockResolvedValue({ id: 'comment' });
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
it('limits concurrent invitations to five participants including the original agent', async () => {
  const { call } = setup();
  const results = await Promise.allSettled(Array.from({ length: 6 }, (_, i) => call.add(`agent${i}`)));
  expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(4); expect(call.size).toBe(5);
  expect(mock.api.post).toHaveBeenCalledTimes(4); await call.stop();
});
it('sends invites to the original chat and keeps new agents silent until handed the floor', async () => {
  const { call, root, options } = setup(); await call.add('agent0');
  expect(mock.api.post).toHaveBeenCalledWith('/companies/org/voice-sessions', expect.objectContaining({ conferenceSessionId: 'anchor', issueId: 'chat', agentIds: ['agent0'] }));
  expect(mock.lives[0].setConferenceFloor).toHaveBeenCalledWith(false);
  expect(options.tones.play).toHaveBeenCalledWith('join');
  call.handoff('agent0'); expect(root.setConferenceFloor).toHaveBeenCalledWith(false);
  expect(mock.lives[0].setConferenceFloor).toHaveBeenLastCalledWith(true);
  expect(mock.lives[0].conferenceContext).toHaveBeenLastCalledWith(expect.stringContaining('speaking turn'), true);
  await call.stop();
});
it('rejects unavailable agents without minting credentials', async () => {
  const { call } = setup(); await expect(call.add('another-org-agent')).rejects.toThrow('not available');
  expect(mock.api.post).not.toHaveBeenCalled(); await call.stop();
});
it('cancels late invitations after hangup without playing a join tone', async () => {
  let resolve: (v: any) => void = () => {}; mock.api.post.mockReturnValue(new Promise(r => { resolve = r; }));
  const { call, options } = setup(); const addition = call.add('agent0');
  await vi.waitFor(() => expect(mock.api.post).toHaveBeenCalled()); await call.stop();
  resolve([{ sessionId: 'child', agentId: 'agent0', issueId: 'chat' }]);
  await expect(addition).rejects.toThrow('ended'); expect(options.tones.play).not.toHaveBeenCalledWith('join');
  expect(mock.api.delete).toHaveBeenCalledWith('/companies/org/voice-sessions/anchor/conference/agent0');
});
it('uses exact names for spoken invitations and asks when they are ambiguous', async () => {
  const { call } = setup();
  expect(await call.control('root', { action: 'add', agent: 'Agent 0' })).toMatchObject({ added: true });
  expect(await call.control('root', { action: 'add', agent: 'agent' })).toMatchObject({ clarificationRequired: true });
  await call.stop();
});
it('removal stops the participant and returns the floor to a connected agent', async () => {
  const { call, root } = setup(); await call.add('agent0'); call.handoff('agent0');
  await call.remove('agent0'); expect(mock.lives[0].stop).toHaveBeenCalled(); expect(call.speaker).toBe('root');
  expect(root.setConferenceFloor).toHaveBeenLastCalledWith(true); await call.stop();
});
it('saves child speech before removal and drains it on hangup', async () => {
  const { call, options } = setup(); await call.add('agent0'); call.handoff('agent0');
  mock.lives[0].args[4]({ id: 'utterance', role: 'model', text: 'IT is ready.' });
  await call.stop(); expect(mock.api.put).toHaveBeenCalledWith('/companies/org/voice-sessions/agent0/messages/utterance', { role: 'model', text: 'IT is ready.' });
  expect(options.saved).toHaveBeenCalledWith({ id: 'comment' }); expect(mock.lives[0].stop).toHaveBeenCalled();
});
it('cancels a scheduled spoken handoff when the call ends', async () => {
  vi.useFakeTimers(); const { call } = setup(); await call.add('agent0');
  await call.control('root', { action: 'handoff', agent: 'Agent 0' }); await call.stop();
  await vi.runAllTimersAsync(); expect(call.speaker).toBe('root');
});
it('keeps partial transcripts local and sends a bounded attributed snapshot on handoff', async () => {
  vi.useFakeTimers(); const {call}=setup(); await call.add('agent0'); const listener=mock.lives[0]; listener.conferenceContext.mockClear();
  for(let i=0;i<100;i++) call.observe('root',{id:'turn',role:'user',text:'Latest request '+i});
  await vi.advanceTimersByTimeAsync(2000); expect(listener.conferenceContext).not.toHaveBeenCalled();
  call.handoff('agent0'); expect(listener.conferenceContext).toHaveBeenCalledOnce();
  expect(listener.conferenceContext.mock.calls[0][0]).toContain('Latest request 99'); await call.stop();
});
