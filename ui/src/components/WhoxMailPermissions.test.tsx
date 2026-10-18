// @vitest-environment jsdom
import { render,screen,fireEvent,waitFor,cleanup } from '@testing-library/react';
import { QueryClient,QueryClientProvider } from '@tanstack/react-query';
import { beforeEach,afterEach,describe,expect,it,vi } from 'vitest';
import { WhoxMailPermissions } from './WhoxMailPermissions';
const mocks=vi.hoisted(()=>({get:vi.fn(),grants:vi.fn(),patch:vi.fn()}));
vi.mock('@/api/tools',()=>({toolsApi:{getConnection:mocks.get,listConnectionGrants:mocks.grants}}));
vi.mock('@/api/client',()=>({api:{patch:mocks.patch}}));
afterEach(cleanup);
beforeEach(()=>{vi.clearAllMocks();mocks.get.mockResolvedValue({config:{mailAgentPermissions:{agent:{read:true,write:false}}}});mocks.grants.mockResolvedValue({capabilities:{canConfigure:true}});mocks.patch.mockResolvedValue({read:true,write:true});});
function mount(){return render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><WhoxMailPermissions connectionId="connection" agentId="agent"/></QueryClientProvider>);}
describe('WHOX Mail settings',()=>{
 it('saves write independently without dropping read',async()=>{mount();await waitFor(()=>expect(screen.getByRole('checkbox',{name:'Read mail'}).getAttribute('aria-checked')).toBe('true'));fireEvent.click(screen.getByRole('checkbox',{name:'Write and send mail'}));await waitFor(()=>expect(mocks.patch).toHaveBeenCalledWith('/tool-connections/connection/mail-access/agent',{read:true,write:true}));});
 it('disables changes without configure access',async()=>{mocks.grants.mockResolvedValue({capabilities:{canConfigure:false}});mount();await waitFor(()=>expect(screen.getByRole('checkbox',{name:'Read mail'}).getAttribute('aria-checked')).toBe('true'));expect(screen.getByRole('checkbox',{name:'Write and send mail'}).hasAttribute('disabled')).toBe(true);});
});
