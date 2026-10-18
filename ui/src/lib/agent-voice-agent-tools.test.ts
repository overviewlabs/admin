import { beforeEach, expect, it, vi } from "vitest";
import { createVoiceAgentTools } from "./agent-voice-agent-tools";
const api=vi.hoisted(()=>({get:vi.fn(),getComment:vi.fn(),listComments:vi.fn(),listInteractions:vi.fn(),addComment:vi.fn(),respondToInteraction:vi.fn()}));
const cancel=vi.hoisted(()=>vi.fn());
const liveRunsForIssue=vi.hoisted(()=>vi.fn().mockResolvedValue([]));
const organizationExecute=vi.hoisted(()=>vi.fn());
vi.mock('@/api/heartbeats',()=>({heartbeatsApi:{cancel,liveRunsForIssue}}));
vi.mock('@/api/issues',()=>({issuesApi:api}));
vi.mock('./agent-voice-organization-tools',()=>({executeOrganizationVoiceTool:organizationExecute}));
beforeEach(()=>{vi.resetAllMocks();api.get.mockResolvedValue({conversationSessionGeneration:2,status:'in_review'});api.listComments.mockResolvedValue([]);api.listInteractions.mockResolvedValue([]);api.addComment.mockResolvedValue({id:'receipt'});liveRunsForIssue.mockResolvedValue([]);});
it.each(['send_agent_message', 'answer_agent_question'])('blocks legacy runtime dispatch through %s', async name => {
 const tools=createVoiceAgentTools('chat',2,async()=>{},()=> 'receipt');
 await expect(tools.execute(name,{message:'Build the report'},'call')).rejects.toThrow('could launch another model');
 expect(api.addComment).not.toHaveBeenCalled(); expect(api.respondToInteraction).not.toHaveBeenCalled();
});
it('filters out Gemini narration from real execution results',async()=>{
 api.listComments.mockResolvedValue([{id:'real',body:'Created report',authorAgentId:'agent',conversationSessionGeneration:null},{id:'voice',body:'Working on it',authorAgentId:'agent',conversationSessionGeneration:null,metadata:{sections:[{rows:[{type:'text',label:'Source',text:'Voice conversation transcript'}]}]}}]);
 const tools=createVoiceAgentTools('chat',2,async()=>{},()=> 'receipt');expect((await tools.progress()).replies.map(r=>r.id)).toEqual(['real']);
});
it('reports pending questions and confirmations without answering or approving them',async()=>{
 api.listInteractions.mockResolvedValue([
  {id:'question',kind:'ask_user_questions',status:'pending'},
  {id:'approval',kind:'request_confirmation',status:'pending'},
  {id:'completed',kind:'request_confirmation',status:'resolved'},
 ]);
 const tools=createVoiceAgentTools('chat',2,async()=>{},()=> 'receipt');
 expect((await tools.progress()).questions.map(item=>item.id)).toEqual(['question','approval']);
 expect(api.respondToInteraction).not.toHaveBeenCalled();expect(api.addComment).not.toHaveBeenCalled();expect(cancel).not.toHaveBeenCalled();
});
it('cancels only the execution attached to the current chat through the normal Stop action',async()=>{
 api.get.mockResolvedValue({conversationSessionGeneration:2,executionRunId:'current-run'});
 const tools=createVoiceAgentTools('chat',2,async()=>{},()=> 'receipt');
 expect(await tools.execute('stop_agent_work',{},'call')).toMatchObject({requested:true});
 expect(cancel).toHaveBeenCalledWith('current-run');
});

it('fences progress by a deleted or paginated reset marker cursor', async()=>{
 api.get.mockResolvedValue({conversationSessionGeneration:2,conversationBoundaryCommentId:'boundary'});
 api.getComment.mockResolvedValue({id:'boundary',createdAt:'2026-09-26T12:00:00Z',deletedAt:'2026-09-26T12:00:30Z'});
 api.listComments.mockResolvedValue([{id:'old',authorAgentId:'agent',body:'Old result',createdAt:'2026-09-26T11:00:00Z'},{id:'new',authorAgentId:'agent',body:'New result',createdAt:'2026-09-26T12:01:00Z'}]);
 const tools=createVoiceAgentTools('chat',2,async()=>{},()=> 'receipt');
 expect((await tools.progress()).replies.map(r=>r.id)).toEqual(['new']);
});
it('does not replay old progress if the reset cursor cannot be verified', async()=>{
 api.get.mockResolvedValue({conversationSessionGeneration:2,conversationBoundaryCommentId:'boundary'});
 api.getComment.mockRejectedValue(new Error('Not found'));
 const tools=createVoiceAgentTools('chat',2,async()=>{},()=> 'receipt');
 await expect(tools.progress()).rejects.toThrow('Not found');
});

it('refreshes my identity and assignments without dispatching a runtime message', async()=>{
 const context=vi.fn().mockResolvedValue({agent:{name:'Alex'},assignedTasks:[{title:'Build checkout'}]});
 const tools=createVoiceAgentTools('chat',2,async()=>{},()=> 'receipt',{context,authorizeTask:vi.fn()});
 expect(await tools.execute('get_agent_context',{},'call')).toEqual(await context());
 expect(api.addComment).not.toHaveBeenCalled();
});

function activeIdentity() {
 let active = true;
 return {
  identity: {
   context: vi.fn(),
   authorizeTask: vi.fn(),
   direct: vi.fn().mockResolvedValue({ success: true }),
   assertActive: () => { if (!active) throw new Error('Voice session ended'); },
  },
  end: () => { active = false; },
 };
}

it.each(['stop_agent_work'])('does not perform %s if voice ends while progress is loading', async action => {
 const session = activeIdentity();
 api.get.mockImplementationOnce(async () => {
  session.end();
  return { conversationSessionGeneration: 2, executionRunId: 'current-run' };
 });
 api.listInteractions.mockResolvedValue([{ id: 'question', kind: 'ask_user_questions', status: 'pending' }]);
 const tools = createVoiceAgentTools('chat', 2, async () => {}, () => 'receipt', session.identity);
 await expect(tools.execute(action, { interactionId: 'question', answers: [{ questionId: 'q', optionIds: [] }] }, 'call')).rejects.toThrow('Voice session ended');
 expect(cancel).not.toHaveBeenCalled();
 expect(api.respondToInteraction).not.toHaveBeenCalled();
});

it.each(['transcript flush', 'chat lookup'])('does not start an organization operation if voice ends during %s', async stage => {
 const session = activeIdentity();
 const flush = async () => { if (stage === 'transcript flush') session.end(); };
 api.get.mockImplementationOnce(async () => {
  if (stage === 'chat lookup') session.end();
  return { companyId: 'company', conversationSessionGeneration: 2 };
 });
 const tools = createVoiceAgentTools('chat', 2, flush, () => 'receipt', session.identity);
 await expect(tools.execute('organization_api', { action: 'create_project', data: '{"name":"Website"}' }, 'call')).rejects.toThrow('Voice session ended');
 expect(organizationExecute).not.toHaveBeenCalled();
});

it('passes the active-session check through to organization mutation boundaries', async () => {
 const session = activeIdentity();
 api.get.mockResolvedValue({ companyId: 'company', conversationSessionGeneration: 2 });
 const tools = createVoiceAgentTools('chat', 2, async () => {}, () => 'receipt', session.identity);
 const args = { action: 'create_project', data: '{"name":"Website"}' };
 await tools.execute('organization_api', args, 'call');
 expect(session.identity.direct).toHaveBeenCalledWith('organization_api', args, 'call');
 expect(api.addComment).not.toHaveBeenCalled();
});

it('rejects a late tool call before flushing or creating a receipt', async () => {
 const session = activeIdentity();
 const flush = vi.fn();
 const receipt = vi.fn();
 session.end();
 const tools = createVoiceAgentTools('chat', 2, flush, receipt, session.identity);
 await expect(tools.execute('send_agent_message', { message: 'Build report' }, 'call')).rejects.toThrow('Voice session ended');
 expect(flush).not.toHaveBeenCalled();
 expect(receipt).not.toHaveBeenCalled();
 expect(api.addComment).not.toHaveBeenCalled();
});

it('returns a completed direct operation even if voice ends while awaiting its response', async () => {
 const session=activeIdentity(); session.identity.direct.mockImplementationOnce(async()=>{session.end(); return {exitCode:0};});
 const tools=createVoiceAgentTools('chat',2,async()=>{},()=> 'receipt',session.identity);
 await expect(tools.execute('voice_workspace',{command:'true'},'call')).resolves.toEqual({exitCode:0});
 expect(api.addComment).not.toHaveBeenCalled();
});
it('fails closed when the direct executor is missing or the conversation resets', async () => {
 const tools=createVoiceAgentTools('chat',2,async()=>{},()=> 'receipt');
 await expect(tools.execute('voice_workspace',{command:'true'},'call')).rejects.toThrow('unavailable');
 api.get.mockResolvedValue({conversationSessionGeneration:3});
 await expect(tools.execute('organization_api',{action:'capabilities'},'call')).rejects.toThrow('changed');
 expect(api.addComment).not.toHaveBeenCalled();
});

it('fetches the organization roster through the authorized direct API and returns only compact identity fields', async () => {
 const session=activeIdentity();
 session.identity.direct.mockResolvedValue([
  {id:'ceo',name:'CEO',role:'ceo',title:'Chief executive',status:'idle',adapterConfig:{apiKey:'private-api-key'},metadata:{secret:'private-metadata'}},
  {id:'it',name:'Head of IT',role:'general',title:null,status:'running',runtimeConfig:{env:{KEY:'private-runtime-key'}},password:'private-password'},
 ]);
 const flush=vi.fn().mockResolvedValue(undefined);
 const receipt=vi.fn();
 const tools=createVoiceAgentTools('chat',2,flush,receipt,session.identity);
 const result=await tools.execute('get_organization_agents',{},'roster-call') as any;
 expect(session.identity.direct).toHaveBeenCalledExactlyOnceWith('organization_api',{action:'list_agents'},'roster-call');
 expect(flush).toHaveBeenCalledOnce();
 expect(api.get).toHaveBeenCalledWith('chat');
 expect(result.count).toBe(2);
 expect(Number.isFinite(Date.parse(result.asOf))).toBe(true);
 expect(result.agents).toEqual([
  {id:'ceo',name:'CEO',role:'ceo',title:'Chief executive',status:'idle'},
  {id:'it',name:'Head of IT',role:'general',title:null,status:'running'},
 ]);
 expect(JSON.stringify(result)).not.toMatch(/private-|adapterConfig|runtimeConfig|metadata|password/);
 expect(receipt).not.toHaveBeenCalled();
 expect(api.addComment).not.toHaveBeenCalled();
 expect(organizationExecute).not.toHaveBeenCalled();
});

it('counts paused and pending-approval agents while excluding terminated agents', async () => {
 const session=activeIdentity();
 session.identity.direct.mockResolvedValue([
  {id:'idle',name:'Idle',role:'general',title:null,status:'idle'},
  {id:'paused',name:'Paused',role:'general',title:null,status:'paused'},
  {id:'pending',name:'Pending',role:'general',title:null,status:'pending_approval'},
  {id:'terminated',name:'Terminated',role:'general',title:null,status:'terminated'},
 ]);
 const tools=createVoiceAgentTools('chat',2,async()=>{},()=> 'receipt',session.identity);
 const result=await tools.execute('get_organization_agents',{},'count-call') as any;
 expect(result.count).toBe(3);
 expect(result.agents.map((agent:any)=>agent.id)).toEqual(['idle','paused','pending']);
 expect(JSON.stringify(result.agents)).not.toContain('terminated');
});

it('returns zero only when the fetched roster has no nonterminated agents', async () => {
 const session=activeIdentity();
 session.identity.direct.mockResolvedValueOnce([]).mockResolvedValueOnce([{id:'former',name:'Former',role:'general',status:'terminated'}]);
 const tools=createVoiceAgentTools('chat',2,async()=>{},()=> 'receipt',session.identity);
 for(const callId of ['empty','all-terminated']) {
  const result=await tools.execute('get_organization_agents',{},callId) as any;
  expect(result).toMatchObject({count:0,agents:[]});
 }
});

it('does not turn a failed roster lookup into a claimed zero count', async () => {
 const session=activeIdentity();
 session.identity.direct.mockRejectedValueOnce(new Error('Read access denied'));
 const tools=createVoiceAgentTools('chat',2,async()=>{},()=> 'receipt',session.identity);
 await expect(tools.execute('get_organization_agents',{},'failed')).rejects.toThrow('Read access denied');
 expect(session.identity.direct).toHaveBeenCalledOnce();
 expect(session.identity.context).not.toHaveBeenCalled();
 expect(api.addComment).not.toHaveBeenCalled();
});

it('refuses to claim an exact count when the roster reaches the API result limit', async () => {
 const session=activeIdentity();
 session.identity.direct.mockResolvedValue(Array.from({length:100},(_,i)=>({id:String(i),name:`Agent ${i}`,role:'general',title:null,status:i<30?'idle':'terminated'})));
 const tools=createVoiceAgentTools('chat',2,async()=>{},()=> 'receipt',session.identity);
 await expect(tools.execute('get_organization_agents',{},'truncated')).rejects.toThrow('exact agent count could not be verified');
 expect(session.identity.direct).toHaveBeenCalledOnce();
});

it.each([undefined, {agents:[]}, [{id:'broken',name:'Missing status'}], [null]])('does not report zero or a count for malformed roster data %#', async response => {
 const session=activeIdentity();
 session.identity.direct.mockResolvedValue(response);
 const tools=createVoiceAgentTools('chat',2,async()=>{},()=> 'receipt',session.identity);
 await expect(tools.execute('get_organization_agents',{},'invalid')).rejects.toThrow('agent count could not be verified');
});

it('refreshes the roster on each call instead of reusing a stale snapshot', async () => {
 const session=activeIdentity();
 const ceo={id:'ceo',name:'CEO',role:'ceo',title:null,status:'idle'};
 const itAgent={id:'it',name:'IT',role:'general',title:null,status:'paused'};
 session.identity.direct.mockResolvedValueOnce([ceo]).mockResolvedValueOnce([ceo,itAgent]);
 const tools=createVoiceAgentTools('chat',2,async()=>{},()=> 'receipt',session.identity);
 expect(await tools.execute('get_organization_agents',{},'first')).toMatchObject({count:1,agents:[ceo]});
 expect(await tools.execute('get_organization_agents',{},'second')).toMatchObject({count:2,agents:[ceo,itAgent]});
 expect(session.identity.direct).toHaveBeenNthCalledWith(1,'organization_api',{action:'list_agents'},'first');
 expect(session.identity.direct).toHaveBeenNthCalledWith(2,'organization_api',{action:'list_agents'},'second');
});

it.each(['ended','reset','missing executor'])('does not fetch a roster for a %s voice session', async reason => {
 const session=activeIdentity();
 if(reason==='ended')session.end();
 if(reason==='reset')api.get.mockResolvedValue({conversationSessionGeneration:3});
 const identity=reason==='missing executor'?{context:vi.fn(),authorizeTask:vi.fn()}:session.identity;
 const tools=createVoiceAgentTools('chat',2,async()=>{},()=> 'receipt',identity);
 await expect(tools.execute('get_organization_agents',{},'blocked')).rejects.toThrow();
 expect(session.identity.direct).not.toHaveBeenCalled();
 expect(api.addComment).not.toHaveBeenCalled();
});

it.each(['transcript flush', 'chat lookup'])('does not issue an operation cancelled during deferred %s', async stage => {
 const controller = new AbortController(), session = activeIdentity();
 let release!: (value: any) => void;
 const pendingStep = new Promise<any>(resolve => { release = resolve; });
 const flush = vi.fn(stage === 'transcript flush' ? () => pendingStep : async () => {});
 if (stage === 'chat lookup') api.get.mockReturnValueOnce(pendingStep);
 const tools = createVoiceAgentTools('chat',2,flush,()=>'receipt',session.identity);
 const pending = tools.execute('organization_api',{action:'create_task',data:'{"title":"Do not create"}'},'cancelled',controller.signal);
 const rejected = expect(pending).rejects.toMatchObject({name:'AbortError'});
 await Promise.resolve(); controller.abort(); release({conversationSessionGeneration:2}); await rejected;
 expect(session.identity.direct).not.toHaveBeenCalled(); expect(cancel).not.toHaveBeenCalled();
 if (stage === 'chat lookup') expect(api.get).toHaveBeenCalledWith('chat',{signal:controller.signal});
});

it('does not stop a run if its tool call was cancelled while progress was loading', async () => {
 const controller = new AbortController(); let resolve!: (value: any) => void;
 api.get.mockReturnValueOnce(new Promise(done=>{resolve=done;}));
 const tools=createVoiceAgentTools('chat',2,async()=>{},()=> 'receipt',activeIdentity().identity);
 const pending=tools.execute('stop_agent_work',{},'cancelled-stop',controller.signal);
 const rejected=expect(pending).rejects.toMatchObject({name:'AbortError'});
 controller.abort(); resolve({conversationSessionGeneration:2,executionRunId:'current-run'}); await rejected;
 expect(cancel).not.toHaveBeenCalled();
});

it('does not start preflight for an already cancelled call', async () => {
 const controller=new AbortController(), session=activeIdentity(), flush=vi.fn(); controller.abort();
 const tools=createVoiceAgentTools('chat',2,flush,()=> 'receipt',session.identity);
 await expect(tools.execute('voice_workspace',{command:'true'},'cancelled',controller.signal)).rejects.toMatchObject({name:'AbortError'});
 expect(flush).not.toHaveBeenCalled(); expect(api.get).not.toHaveBeenCalled(); expect(session.identity.direct).not.toHaveBeenCalled();
});

it.each([
 ['organization_api',{action:'create_task'}],
 ['voice_workspace',{command:'write output.txt'}],
])('does not abort, retry, or undo an issued %s write when its call is cancelled', async (name,args) => {
 const controller=new AbortController(), session=activeIdentity(); let finish!: (value: unknown) => void;
 session.identity.direct.mockReturnValueOnce(new Promise(resolve=>{finish=resolve;}));
 const tools=createVoiceAgentTools('chat',2,async()=>{},()=> 'receipt',session.identity);
 const pending=tools.execute(name as string,args as Record<string,unknown>,'already-issued',controller.signal);
 await vi.waitFor(()=>expect(session.identity.direct).toHaveBeenCalledOnce());
 expect(session.identity.direct).toHaveBeenCalledWith(name,args,'already-issued'); controller.abort(); finish({id:'created-task'});
 await expect(pending).resolves.toEqual({id:'created-task'});
 expect(session.identity.direct).toHaveBeenCalledOnce(); expect(cancel).not.toHaveBeenCalled();
});

it.each(['search_web','read_web_page'])('maps typed %s into the existing authorized API without waiting for transcript writes',async name=>{
 const session=activeIdentity(),flush=vi.fn(()=>new Promise<void>(()=>{}));
 session.identity.direct.mockResolvedValue({provider:name==='search_web'?'searxng':'web'});
 const tools=createVoiceAgentTools('chat',2,flush,()=> 'receipt',session.identity);
 const args=name==='search_web'?{query:'public news',category:'news',count:5}:{url:'https://example.org'};
 await expect(tools.execute(name,args,'typed')).resolves.toHaveProperty('provider');
 expect(flush).not.toHaveBeenCalled();expect(api.get).toHaveBeenCalledWith('chat');
 expect(session.identity.direct).toHaveBeenCalledWith('organization_api',{action:name,data:JSON.stringify(args)},'typed',undefined);
});
it.each(['search_web','read_web_page'])('preserves legacy %s read routing and skips only its transcript barrier',async action=>{
 const session=activeIdentity(),flush=vi.fn();session.identity.direct.mockResolvedValue({provider:'searxng'});
 const tools=createVoiceAgentTools('chat',2,flush,()=> 'receipt',session.identity),args={action,data:'{}'};
 await tools.execute('organization_api',args,'legacy');expect(flush).not.toHaveBeenCalled();
 expect(api.get).toHaveBeenCalledWith('chat');expect(session.identity.direct).toHaveBeenCalledWith('organization_api',args,'legacy',undefined);
});
it.each([
 ['search_web',{query:'public news',category:'news'}],
 ['read_web_page',{url:'https://example.org'}],
 ['organization_api',{action:'search_web',data:'{"query":"public news","category":"news"}'}],
 ['organization_api',{action:'read_web_page',data:'{"url":"https://example.org"}'}],
])('aborts in-flight %s research through the direct transport without retrying',async(name,args)=>{
 const controller=new AbortController(),session=activeIdentity();
 session.identity.direct.mockImplementation((_name,_args,_callId,signal?:AbortSignal)=>new Promise((_resolve,reject)=>{
  signal?.addEventListener('abort',()=>reject(new DOMException('Cancelled','AbortError')),{once:true});
 }));
 const tools=createVoiceAgentTools('chat',2,async()=>{},()=> 'receipt',session.identity);
 const pending=tools.execute(name as string,args as Record<string,unknown>,'research',controller.signal);
 const rejected=expect(pending).rejects.toMatchObject({name:'AbortError'});
 await vi.waitFor(()=>expect(session.identity.direct).toHaveBeenCalledOnce());
 expect(session.identity.direct.mock.calls[0][3]).toBe(controller.signal);
 controller.abort();await rejected;
 expect(session.identity.direct).toHaveBeenCalledOnce();expect(cancel).not.toHaveBeenCalled();expect(api.addComment).not.toHaveBeenCalled();
});
it.each(['reset','cancelled','ended'])('keeps read-only web research blocked when the session is %s',async reason=>{
 const session=activeIdentity(),controller=new AbortController();
 if(reason==='reset')api.get.mockResolvedValue({conversationSessionGeneration:3});
 if(reason==='cancelled')controller.abort();if(reason==='ended')session.end();
 const tools=createVoiceAgentTools('chat',2,async()=>{},()=> 'receipt',session.identity);
 await expect(tools.execute('search_web',{query:'public news',category:'news'},'blocked',controller.signal)).rejects.toThrow();
 expect(session.identity.direct).not.toHaveBeenCalled();
});
it('routes the typed deletion function through the existing authenticated mutation path', async()=>{
 const session=activeIdentity();const flush=vi.fn().mockResolvedValue(undefined);
 const tools=createVoiceAgentTools('chat',2,flush,()=> 'receipt',session.identity);
 await tools.execute('terminate_organization',{organizationId:'target',confirmationName:'Test organization'},'delete-call');
 expect(flush).toHaveBeenCalledOnce();
 expect(session.identity.direct).toHaveBeenCalledWith('organization_api',{action:'terminate_organization',id:'target',data:'{"confirmationName":"Test organization"}'},'delete-call');
});
it('does not attempt typed deletion when its target is missing',async()=>{
 const session=activeIdentity();const tools=createVoiceAgentTools('chat',2,async()=>{},()=> 'receipt',session.identity);
 await expect(tools.execute('terminate_organization',{},'delete-call')).rejects.toThrow('No deletion was attempted');
 expect(session.identity.direct).not.toHaveBeenCalled();
});
