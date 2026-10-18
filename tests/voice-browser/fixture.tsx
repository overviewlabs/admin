import React, { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { VoiceSessionProvider, useOptionalVoiceSession } from '../../ui/src/context/VoiceSessionContext';
import { CompanyProvider } from '../../ui/src/context/CompanyContext';
import { ThemeProvider } from '../../ui/src/context/ThemeContext';
import { GlobalVoiceIndicator, VoiceIndicator } from '../../ui/src/components/GlobalVoiceIndicator';
import { queryKeys } from '../../ui/src/lib/queryKeys';
import { requestVoiceSessionReset, isVoiceSessionActive } from '../../ui/src/lib/active-voice-session';
import { startServiceWorkerUpdates } from '../../ui/src/lib/service-worker-updates';
import '../../ui/src/index.css';
import './fixture.css';
import { useAdminVoice } from '../../ui/src/hooks/useAdminVoice';

const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
client.setQueryData(queryKeys.auth.session, { user: { id: 'fixture-owner', name: 'Fixture Owner' } });
client.setQueryData(queryKeys.companies.list('fixture-owner'), { unauthorized: false, companies: [{ id: 'company', name: 'Voice Test Organization', issuePrefix: 'TEST', status: 'active' }] });
const agent = { id: 'agent', companyId: 'company', name: 'Test Agent', companyName: 'Voice Test Organization', companyPrefix: 'TEST' };

function AdminVoiceFixture() {
  const voice = useAdminVoice({ chatId: 'admin-chat', model: 'fixture-text-model', mode: 'ask', onSaved: () => {} });
  return <div><VoiceIndicator voice={{ ...voice, agent: { id: "admin", companyId: "instance", name: "Admin", companyName: "Instance" } }} /><button onClick={() => voice.active ? voice.stop() : void voice.start()}>{voice.active ? 'End Admin voice' : 'Start Admin voice'}</button><p role="status">{voice.phase}</p>{voice.error && <p role="alert">{voice.error}</p>}</div>;
}

function Fixture() {
  const voice = useOptionalVoiceSession()!;
  const { pathname } = useLocation();
  const page = pathname.split('/').at(-1) || 'Chat';
  // Render the actual voice persistence cache with synthetic API comments.
  // This fixture deliberately has no issue-page fetch or provider transcript.
  const { data: comments } = useQuery<{ pages: Array<Array<{ id: string; body: string }>> }>({ queryKey: queryKeys.issues.comments('chat'), queryFn: async () => ({ pages: [] }), enabled: false });
  useEffect(() => {
    (window as any).__voiceFixture = {
      snapshot: () => ({ active: voice.active, phase: voice.phase, error: voice.error, activity: voice.activity, sources: voice.grounding?.sources.length ?? 0, lease: isVoiceSessionActive() }),
      reset: requestVoiceSessionReset,
    };
  });
  useEffect(() => startServiceWorkerUpdates({ reload: () => { (window as any).__fixtureReloads = ((window as any).__fixtureReloads || 0) + 1; } }), []);
  const contents = <><h1 data-testid="page-heading">{page}</h1><button onClick={() => void voice.start(agent)}>Start test voice</button><p>Isolated browser fixture; no real organization data or microphone is used.</p><div data-testid="saved-transcripts">{comments?.pages.flat().map(comment => <p key={comment.id}>{comment.body}</p>)}</div><div className="fixture-content">Page content</div></>;
  return <div className="fixture-shell">
    <aside><nav>{['chats/agent', 'tasks', 'projects', 'agents', 'apps', 'detached'].map(route => <Link key={route} to={`/TEST/${route}`}>{({ apps: 'Connectors', detached: 'Detached shell' } as Record<string,string>)[route] || route}</Link>)}<Link to="/auth">Sign out fixture</Link></nav></aside>
    {page === 'admin-voice' ? <AdminVoiceFixture /> : page === 'detached' ? <article>{contents}</article> : <section key={pathname} data-voice-pane><main>{contents}</main></section>}
    <GlobalVoiceIndicator />
  </div>;
}

createRoot(document.getElementById('root')!).render(<QueryClientProvider client={client}><ThemeProvider><BrowserRouter><CompanyProvider><VoiceSessionProvider><Fixture /></VoiceSessionProvider></CompanyProvider></BrowserRouter></ThemeProvider></QueryClientProvider>);
