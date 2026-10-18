import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AgentVoiceLive } from "./agent-voice-live";
import type { VoiceSession } from "@whoxos/shared/agent-voice";
vi.mock('./voice-playback',()=>({VoicePlayback:class {stop=vi.fn();interrupt=vi.fn();}}));
beforeEach(()=>{vi.useFakeTimers();vi.stubGlobal('WebSocket',{OPEN:1});});
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
const question='Any crime news in Hamilton Ohio this week?';
const evidence={matched:true,asOf:'2026-09-28T10:00:00.000Z',request:{query:'Hamilton Ohio crime news',category:'news',count:3,timeRange:'week'},location:{name:'Hamilton',state:'Ohio'},result:{provider:'searxng',query:'Hamilton Ohio crime news',category:'news',timeRange:'week',dateFilter:{appliedBy:'server',rollingDays:7,since:'2026-09-21T10:00:00.000Z',until:'2026-09-28T10:00:00.000Z'},results:[{title:'Local news',url:'https://example.org/local',snippet:'Verified public report.',publishedAt:'2026-09-27T10:00:00.000Z'}],sources:[]}};
function fixture() {
 let resolve!:(result:unknown)=>void;
 const fetch=vi.fn((_text:string,_signal:AbortSignal)=>new Promise(done=>{resolve=done;}));
 const phase=vi.fn(),transcript=vi.fn(),error=vi.fn(),tools=vi.fn(async()=>({accepted:true})),grounding=vi.fn();
 const session={context:[],setup:{model:'models/gemini-3.8-live-extended-thinking',realtimeInputConfig:{automaticActivityDetection:{disabled:true}}}} as unknown as VoiceSession;
 const context={currentTime:0,state:'running',close:vi.fn(),removeEventListener:vi.fn()} as unknown as AudioContext;
 const live=new AgentVoiceLive(session,{getTracks:()=>[{stop:vi.fn()}]} as unknown as MediaStream,context,phase,transcript,error,tools,undefined,undefined,undefined,undefined,grounding,undefined,undefined,fetch);
 const state=live as any;
 state.socket={readyState:1,send:vi.fn(),close:vi.fn()};
 const start=()=>{state.inputActivity.active=true;state.inputActivity.emit({type:'start'});};
 const end=()=>{state.inputActivity.active=false;state.inputActivity.emit({type:'end'});};
 const speak=()=>{start();end();state.receive({serverContent:{inputTranscription:{text:question,finished:true}}});};
 const frames=()=>state.socket.send.mock.calls.map(([frame]:[string])=>JSON.parse(frame));
 return {live,state,fetch,phase,transcript,error,tools,grounding,start,end,speak,frames,resolve:(value:unknown)=>resolve(value)};
}

it('delivers one real news context in the same session, with sources and no fabricated function response',async()=>{
 const f=fixture(); f.speak(); await vi.advanceTimersByTimeAsync(0);
 expect(f.fetch).toHaveBeenCalledWith(question,expect.any(AbortSignal)); f.resolve(evidence); await vi.advanceTimersByTimeAsync(0);
 const frames=f.frames(); const injected=frames.filter((frame:any)=>frame.clientContent?.turnComplete===true);
 expect(injected).toHaveLength(1); expect(injected[0].clientContent.turns[0].parts[0].text).toContain('https://example.org/local');
 expect(frames.some((frame:any)=>frame.toolResponse)).toBe(false); expect(f.tools).not.toHaveBeenCalled();
 expect(f.state.session.setup.model).toBe('models/gemini-3.8-live-extended-thinking');
 expect(f.state.serverIdle).toBe(false); expect(f.phase).toHaveBeenLastCalledWith('thinking');
 expect(f.grounding).toHaveBeenLastCalledWith(expect.objectContaining({provider:'searxng',sources:[expect.objectContaining({uri:'https://example.org/local'})]}));
 f.state.readRecovery.output('I apologize, a system error occurred.',true);
 expect(f.state.readRecovery.beginRecovery()).toContain('https://example.org/local');
 expect(f.state.readRecovery.cachedResponse('search_web',evidence.request)).toEqual({result:evidence.result});
 expect(f.transcript).toHaveBeenCalledWith(expect.objectContaining({role:'user',text:question}));
 expect(f.error).not.toHaveBeenCalled(); f.live.stop();
});

it.each(['malformed_tool','tool','new_speech','stop'] as const)('discards a pending context when %s wins the race',async kind=>{
 const f=fixture(); f.speak(); await vi.advanceTimersByTimeAsync(0);
 if(kind==='malformed_tool') f.state.receive({toolCall:{functionCalls:[{}]}});
 if(kind==='tool') f.state.receive({toolCall:{functionCalls:[{id:'write',name:'organization_api',args:{action:'create_task'}}]}});

 if((kind as string)==='audio') {f.state.play=vi.fn();f.state.receive({serverContent:{modelTurn:{parts:[{inlineData:{data:'AA==',mimeType:'audio/pcm'}}]}}});}
 if(kind==='new_speech') f.start();
 if(kind==='stop') f.live.stop();
 expect(f.fetch.mock.calls[0][1].aborted).toBe(true); f.resolve(evidence); await vi.advanceTimersByTimeAsync(0);
 expect(f.frames().filter((frame:any)=>frame.clientContent?.turnComplete===true)).toHaveLength(0);
 expect(f.grounding.mock.calls.some(([value])=>value?.provider==='searxng')).toBe(false);
 expect(f.tools).toHaveBeenCalledTimes(kind==='tool'?1:0); f.live.stop();
});

it('never starts an automatic read for an utterance overlapping older tools',async()=>{
 const f=fixture(); f.state.activeTools=1;f.start();f.state.activeTools=0;f.end();
 f.state.receive({serverContent:{inputTranscription:{text:question,finished:true}}}); await vi.advanceTimersByTimeAsync(0);
 expect(f.fetch).not.toHaveBeenCalled();f.live.stop();
});

it.each(['progress','recovery','scope'] as const)('does not deliver after a %s guard changes',async kind=>{
 const f=fixture(); f.speak(); await vi.advanceTimersByTimeAsync(0);
 if(kind==='progress') f.state.pendingProgress={status:'running'};
 if(kind==='recovery') f.state.recoveryAuthorization=new AbortController();
 if(kind==='scope') f.live.stop();
 f.resolve(evidence); await vi.advanceTimersByTimeAsync(0);
 expect(f.frames().filter((frame:any)=>frame.clientContent?.turnComplete===true)).toHaveLength(0);f.live.stop();
});

it('releases an IDLE wait when no local news intent matched',async()=>{
 const f=fixture(); f.speak(); await vi.advanceTimersByTimeAsync(0);
 f.state.receive({serverContent:{turnComplete:true,interactionStatus:'IDLE'}}); await vi.advanceTimersByTimeAsync(0);
 f.resolve({matched:false}); await vi.advanceTimersByTimeAsync(1);
 expect(f.phase).toHaveBeenLastCalledWith('listening'); expect(f.frames().filter((frame:any)=>frame.clientContent?.turnComplete===true)).toHaveLength(0);f.live.stop();
});

it('fences the automatic evidence turn from mutations and releases only for a new genuine user request',async()=>{
 const f=fixture(); f.speak(); await vi.advanceTimersByTimeAsync(0); f.resolve(evidence); await vi.advanceTimersByTimeAsync(0);
 f.state.receive({toolCall:{functionCalls:[
  {id:'stale-write',name:'organization_api',args:{action:'create_task'}},
  {id:'stale-shell',name:'voice_workspace',args:{command:'echo unexpected'}},
 ]}}); await vi.advanceTimersByTimeAsync(0);
 expect(f.tools).not.toHaveBeenCalled();
 const rejected=f.frames().flatMap((frame:any)=>frame.toolResponse?.functionResponses??[]);
 expect(rejected).toHaveLength(2);expect(rejected.every((response:any)=>typeof response.response.error==='string')).toBe(true);
 f.state.receive({serverContent:{turnComplete:true,interactionStatus:'IDLE'}});
 f.start();f.end();f.state.receive({serverContent:{inputTranscription:{text:'Create the task now.',finished:true}}});
 f.state.receive({toolCall:{functionCalls:[{id:'new-write',name:'organization_api',args:{action:'create_task'}}]}});
 await vi.advanceTimersByTimeAsync(0);
 expect(f.tools).toHaveBeenCalledOnce(); expect(f.tools).toHaveBeenCalledWith('organization_api',{action:'create_task'},'new-write',expect.any(AbortSignal));f.live.stop();
});

it('retains canonical locality for the next genuine news follow-up after the provider settles',async()=>{
 const f=fixture(); f.speak(); await vi.advanceTimersByTimeAsync(0); f.resolve(evidence); await vi.advanceTimersByTimeAsync(0);
 f.state.receive({serverContent:{turnComplete:true,interactionStatus:'IDLE'}}); await vi.advanceTimersByTimeAsync(0);
 f.start();f.end();f.state.receive({serverContent:{inputTranscription:{text:'Any crime there this week?',finished:true}}});
 await vi.advanceTimersByTimeAsync(0);
 expect(f.fetch).toHaveBeenLastCalledWith('Any crime there this week?',expect.any(AbortSignal),{name:'Hamilton',state:'Ohio'});f.live.stop();
});


it('keeps the search alive during a spoken progress update and delivers results after the old deadline',async()=>{
 const f=fixture();f.speak();await vi.advanceTimersByTimeAsync(0);
 f.state.receive({serverContent:{outputTranscription:{text:"I'll check the latest updates."}}});
 f.state.playbackEndsAt=5;
 await vi.advanceTimersByTimeAsync(2000);
 expect(f.fetch.mock.calls[0][1].aborted).toBe(false);
 f.resolve(evidence);await vi.advanceTimersByTimeAsync(0);
 expect(f.frames().filter((frame:any)=>frame.clientContent?.turnComplete===true)).toHaveLength(1);
 f.live.stop();
});
