// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const OFFICIAL_ORGANIZATION_ID='79255634-54f2-4a25-b72f-19f2808ad251';
import { AdminSettings } from './AdminSettings';
const state=vi.hoisted(()=>({company:{selectedCompanyId:null as string|null,loading:true,companies:[{id:'treasury',issuePrefix:'TASK'}]},route:{companyPrefix:undefined as string|undefined},access:{isError:false,data:{allowed:true} as {allowed:boolean}|undefined}}));
vi.mock('../context/CompanyContext',()=>({useCompany:()=>state.company}));
vi.mock('../context/BreadcrumbContext',()=>({useBreadcrumbs:()=>({setBreadcrumbs:()=>{}})}));
vi.mock('../hooks/useAdminPortalAccess',()=>({useAdminPortalAccess:()=>({access:state.access})}));
vi.mock('../hooks/useNativeAdmin',()=>({useAdminQuery:()=>({isPending:true,isError:false,data:undefined})}));
vi.mock('../lib/router',()=>({useParams:()=>state.route,Navigate:({to}:{to:string})=><div data-redirect={to}/> }));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
describe('Admin model settings route admission',()=>{
 let host:HTMLDivElement;let root:ReturnType<typeof createRoot>;
 beforeEach(()=>{state.route.companyPrefix=undefined;state.company={...state.company,selectedCompanyId:null,loading:true};state.access={isError:false,data:{allowed:true}};host=document.createElement('div');document.body.append(host);root=createRoot(host);});
 afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
 const render=()=>act(async()=>root.render(<AdminSettings/>));
 it('loads Admin settings without waiting for organization selection',async()=>{
  await render();expect(host.querySelector('[data-redirect]')).toBeNull();
  state.company={...state.company,selectedCompanyId:null,loading:false};await render();expect(host.querySelector('[data-redirect]')).toBeNull();
  state.company={...state.company,selectedCompanyId:OFFICIAL_ORGANIZATION_ID,loading:false};await render();expect(host.textContent).toContain('Default model');expect(host.querySelector('[data-redirect]')).toBeNull();
 });
 it('allows administrators to open model settings from Treasury',async()=>{
  state.company={...state.company,selectedCompanyId:'treasury',loading:false};await render();expect(host.textContent).toContain('Default model');expect(host.querySelector('[data-redirect]')).toBeNull();
 });
 it('uses the explicit Admin organization before a remembered Treasury selection synchronizes',async()=>{
  state.company={...state.company,selectedCompanyId:'treasury',loading:false};state.route.companyPrefix='OVE';await render();expect(host.textContent).toContain('Default model');expect(host.querySelector('[data-redirect]')).toBeNull();
 });
 it('allows a remaining organization route with a stale deleted organization selection',async()=>{
  state.company={...state.company,selectedCompanyId:OFFICIAL_ORGANIZATION_ID,loading:false};state.route.companyPrefix='TASK';await render();expect(host.querySelector('[data-redirect]')).toBeNull();expect(host.textContent).toContain('Default model');
 });
 it('keeps denied administrator access from rendering the model control',async()=>{
  state.company={...state.company,selectedCompanyId:OFFICIAL_ORGANIZATION_ID,loading:false};state.access.data={allowed:false};await render();expect(host.querySelector('[role=alert]')).not.toBeNull();expect(host.textContent).not.toContain('Default model');
 });
});
