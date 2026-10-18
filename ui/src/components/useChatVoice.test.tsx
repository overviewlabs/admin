// @vitest-environment jsdom
import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,expect,it,vi} from 'vitest';
import {useChatVoice} from './useChatVoice';
const m=vi.hoisted(()=>({session:{agent:{id:'agent',companyId:'company'},active:true,stream:null,phase:'listening',error:'',start:vi.fn(),stop:vi.fn()}}));
vi.mock('@/context/VoiceSessionContext',()=>({useOptionalVoiceSession:()=>m.session}));
vi.mock('@/context/ThemeContext',()=>({useTheme:()=>({theme:'dark'})}));
let current:ReturnType<typeof useChatVoice>;let root:ReturnType<typeof createRoot>;
async function mount(companyId:string){(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;root=createRoot(document.createElement('div'));function Harness(){current=useChatVoice({id:'agent',companyId});return null;}await act(async()=>root.render(<Harness/>));}
afterEach(async()=>{await act(async()=>root.unmount());vi.clearAllMocks();});
it('controls the active agent in the matching organization',async()=>{await mount('company');expect(current.active).toBe(true);current.stop();expect(m.session.stop).toHaveBeenCalledOnce();});
it('does not transfer or stop voice when viewing another organization',async()=>{await mount('other');expect(current.active).toBe(false);current.stop();expect(m.session.stop).not.toHaveBeenCalled();await current.start();expect(m.session.start).toHaveBeenCalledWith({id:'agent',companyId:'other'});});
