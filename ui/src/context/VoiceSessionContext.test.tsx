// @vitest-environment jsdom
import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter,useNavigate,type NavigateFunction} from 'react-router-dom';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {VoiceSessionProvider,useOptionalVoiceSession} from './VoiceSessionContext';
const m=vi.hoisted(()=>({identity:{settled:true,userId:'owner' as string|null},session:{active:true,start:vi.fn(),reset:vi.fn()}}));
vi.mock('@/api/companies-query',()=>({useAccountIdentity:()=>m.identity}));
vi.mock('./CompanyContext',()=>({useCompany:()=>({companies:[{id:'company',name:'WHOXOS',issuePrefix:'OVE'}]})}));
vi.mock('@/hooks/useVoiceSession',()=>({useVoiceSession:()=>m.session}));
let root:ReturnType<typeof createRoot>,navigate:NavigateFunction,session:NonNullable<ReturnType<typeof useOptionalVoiceSession>>;
function Observer(){navigate=useNavigate();session=useOptionalVoiceSession()!;return null;}
function App(){return <MemoryRouter><VoiceSessionProvider><Observer/></VoiceSessionProvider></MemoryRouter>;}
async function render(){await act(async()=>root.render(<App/>));}
beforeEach(()=>{vi.clearAllMocks();m.identity={settled:true,userId:'owner'};(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;root=createRoot(document.createElement('div'));});
afterEach(async()=>{await act(async()=>root.unmount());});
it('retains the session during ordinary page navigation',async()=>{await render();await act(async()=>navigate('/OVE/tasks'));expect(m.session.reset).not.toHaveBeenCalled();});
it('ends voice on logout and account changes',async()=>{await render();m.identity.userId='other';await render();expect(m.session.reset).toHaveBeenCalledTimes(1);m.identity.userId=null;await render();expect(m.session.reset).toHaveBeenCalledTimes(2);});
it('ends voice on authentication pages',async()=>{await render();await act(async()=>navigate('/auth/login'));expect(m.session.reset).toHaveBeenCalledOnce();});
it('passes the organization identity to the shared session',async()=>{await render();await session.start({id:'agent',companyId:'company'});expect(m.session.start).toHaveBeenCalledWith({id:'agent',companyId:'company',companyName:'WHOXOS',companyPrefix:'OVE'});});
