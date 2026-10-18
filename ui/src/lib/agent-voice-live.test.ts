import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentVoiceLive, isVoiceIdle, type PreparedVoicePlayback } from "./agent-voice-live";
import { VoicePlayback } from "./voice-playback";
import { assertVoiceToolActive } from './voice-tool-call';
import type { VoiceSession } from "@whoxos/shared/agent-voice";
vi.mock("./voice-playback", () => ({ VoicePlayback: class {
 input={};start=vi.fn(async()=>{});interrupt=vi.fn();resumeDelay=vi.fn(()=>0);stop=vi.fn();
} }));
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
function fixture(preparedPlayback?: PreparedVoicePlayback, onTurnContext?: (signal: AbortSignal) => Promise<unknown>) {
 const phase=vi.fn(), transcript=vi.fn(), error=vi.fn(), stop=vi.fn(), close=vi.fn();
 const live=new AgentVoiceLive({context:[]} as unknown as VoiceSession, {getTracks:()=>[{stop}]} as unknown as MediaStream, {currentTime:0,close,state:"running",addEventListener:vi.fn(),removeEventListener:vi.fn()} as unknown as AudioContext,phase,transcript,error,undefined,undefined,preparedPlayback,undefined,onTurnContext);
 return {live,state:live as any,phase,transcript,error,stop,close};
}

function recoveryFixture(authorize = vi.fn(async (_signal: AbortSignal) => ({ organization: { id: 'company' } }))) {
 vi.useFakeTimers(); vi.stubGlobal('WebSocket', {OPEN: 1});
 const result = fixture(undefined, authorize);
 const {state} = result;
 state.session.setup = {model: 'models/gemini-3.8-live-extended-thinking', realtimeInputConfig: {automaticActivityDetection: {disabled: true}}};
 state.socket = {readyState: 1, send: vi.fn(), close: vi.fn()};
 state.readRecovery.beginTurn();
 state.receive({serverContent: {inputTranscription: {text: 'Search NASA lunar eclipse.', finished: true}}});
 state.onToolCall = vi.fn(async () => ({provider: 'searxng', query: 'NASA lunar eclipse', category: 'general', results: [{title: 'NASA lunar eclipse', url: 'https://science.nasa.gov/moon/', snippet: 'Earth casts its shadow on the Moon.'}], sources: []}));
 return {...result, authorize};
}
async function completeRecoveryRead(state: any) {
 state.receive({toolCall: {functionCalls: [{id: 'verified-read', name: 'search_web', args: {query: 'NASA lunar eclipse', category: 'general'}}]}});
 await vi.advanceTimersByTimeAsync(0);
 state.receive({serverContent: {outputTranscription: {text: 'I apologize, a system error occurred.', finished: true}, turnComplete: true, interactionStatus: 'IDLE'}});
}
const correctiveFrames = (state: any) => state.socket.send.mock.calls.map(([text]: [string]) => JSON.parse(text)).filter((message: any) => message.clientContent?.turnComplete === true);

describe('verified voice read recovery', () => {
 it('re-arms when the audio clock lags the wall-clock drain timer', async () => {
  const {live,state,authorize} = recoveryFixture();
  state.context.currentTime = 10; state.playbackEndsAt = 10.2;
  await completeRecoveryRead(state);
  state.context.currentTime = 10.197; await vi.advanceTimersByTimeAsync(200);
  expect(authorize).not.toHaveBeenCalled(); expect(correctiveFrames(state)).toHaveLength(0);
  state.context.currentTime = 10.21; await vi.advanceTimersByTimeAsync(20);
  expect(authorize).toHaveBeenCalledOnce(); expect(correctiveFrames(state)).toHaveLength(1); live.stop();
 });
 it('revalidates access, corrects once in the same session, and preserves the original reply', async () => {
  const {live,state,transcript,authorize} = recoveryFixture();
  await completeRecoveryRead(state); await vi.advanceTimersByTimeAsync(0);
  expect(authorize).toHaveBeenCalledOnce();
  expect(correctiveFrames(state)).toHaveLength(1);
  expect(JSON.stringify(correctiveFrames(state))).toContain('NASA lunar eclipse');
  expect(transcript.mock.calls.some(([message]) => message.text === 'I apologize, a system error occurred.')).toBe(true);
  state.receive({serverContent: {outputTranscription: {text: 'I apologize, a system error occurred.', finished: true}, turnComplete: true, interactionStatus: 'IDLE'}});
  await vi.advanceTimersByTimeAsync(0);
  expect(correctiveFrames(state)).toHaveLength(1); expect(state.onToolCall).toHaveBeenCalledOnce(); live.stop();
 });
 it('reuses a matching completed read after authorization and rejects recovery mutations before dispatch', async () => {
  const {live,state,authorize} = recoveryFixture();
  await completeRecoveryRead(state); await vi.advanceTimersByTimeAsync(0);
  state.receive({toolCall: {functionCalls: [{id: 'duplicate-read', name: 'search_web', args: {category: 'general', query: 'NASA lunar eclipse'}}]}});
  await vi.advanceTimersByTimeAsync(0);
  expect(state.onToolCall).toHaveBeenCalledOnce(); expect(authorize).toHaveBeenCalledTimes(2);
  state.receive({toolCall: {functionCalls: [{id: 'write', name: 'organization_api', args: {action: 'create_task', data: '{"title":"No"}'}}]}});
  await vi.advanceTimersByTimeAsync(0);
  expect(state.onToolCall).toHaveBeenCalledOnce();
  expect(JSON.parse(state.socket.send.mock.calls.at(-1)[0]).toolResponse.functionResponses[0]).toMatchObject({id:'write', response:{error:expect.stringContaining('No action was executed')}}); live.stop();
 });
 it('cannot replay a command or mutation even if its response was successful', async () => {
  const {live,state} = recoveryFixture();
  state.receive({toolCall: {functionCalls: [{id:'command',name:'voice_workspace',args:{command:'python3 example.py'}}]}});
  await vi.advanceTimersByTimeAsync(0);
  await completeRecoveryRead(state); await vi.advanceTimersByTimeAsync(0);
  expect(correctiveFrames(state)).toHaveLength(0); live.stop();
 });
 it('does not recover a genuine HTTP failure, but can verify a fresh zero-call failure', async () => {
  const {live,state} = recoveryFixture();
  state.onToolCall.mockRejectedValueOnce(new Error('Search returned HTTP 503'));
  await completeRecoveryRead(state); await vi.advanceTimersByTimeAsync(0);
  expect(correctiveFrames(state)).toHaveLength(0);
  state.readRecovery.beginTurn(); state.readRecovery.input('How many agents?');
  state.receive({serverContent:{outputTranscription:{text:'I apologize, a system error occurred.',finished:true},turnComplete:true,interactionStatus:'IDLE'}});
  await vi.advanceTimersByTimeAsync(0); expect(correctiveFrames(state)).toHaveLength(1);
  expect(JSON.stringify(correctiveFrames(state))).toContain('No tool operation was observed'); live.stop();
 });
 it.each(['speech', 'stop'] as const)('cancels the recovery authorization on %s and ignores its late result', async action => {
  let finish!: (value: {organization: {id: string}}) => void;
  const authorize = vi.fn((_signal: AbortSignal) => new Promise<{organization:{id:string}}>(resolve => {finish=resolve;}));
  const {live,state} = recoveryFixture(authorize);
  await completeRecoveryRead(state); await vi.advanceTimersByTimeAsync(0);
  const signal = authorize.mock.calls[0][0]; expect(signal.aborted).toBe(false);
  if (action === 'stop') live.stop(); else state.inputActivity.emit({type:'start'});
  expect(signal.aborted).toBe(true); finish({organization:{id:'company'}});
  await vi.advanceTimersByTimeAsync(0); expect(correctiveFrames(state)).toHaveLength(0); live.stop();
 });
 it('never sends a corrective prompt when access cannot be revalidated', async () => {
  const {live,state,error} = recoveryFixture(vi.fn(async () => {throw new Error('Forbidden');}));
  await completeRecoveryRead(state); await vi.advanceTimersByTimeAsync(0);
  expect(correctiveFrames(state)).toHaveLength(0);
  expect(error).toHaveBeenCalledWith(expect.stringContaining('recheck access')); expect(state.stopped).toBe(true); live.stop();
 });
});
describe("continuous voice",()=>{
 it("does not treat turnComplete as the end of background thinking",()=>{
  expect(isVoiceIdle({serverContent:{turnComplete:true}})).toBe(false);
  expect(isVoiceIdle({interaction_status:'IDLE'})).toBe(true);
 });
 it("uses the selected model's completion protocol without ending Extended Thinking early",()=>{
  const completed={serverContent:{turnComplete:true}};
  expect(isVoiceIdle(completed,'models/gemini-3.8-live')).toBe(true);
  expect(isVoiceIdle(completed,'gemini-3.8-live')).toBe(true);
  expect(isVoiceIdle(completed,'models/gemini-3.8-live-extended-thinking')).toBe(false);
  expect(isVoiceIdle(completed,'unknown-model')).toBe(false);
  expect(isVoiceIdle({serverContent:{turnComplete:true,interactionStatus:'IN_PROGRESS'}},'models/gemini-3.8-live')).toBe(false);
  expect(isVoiceIdle({serverContent:{turnComplete:true,interactionStatus:'IDLE'}},'models/gemini-3.8-live-extended-thinking')).toBe(true);
 });
 it("waits for a standard Live tool result and final turn before returning to listening",async()=>{
  vi.useFakeTimers(); vi.stubGlobal('WebSocket',{OPEN:1});
  const {live,state,phase}=fixture();
  state.session.setup={model:'models/gemini-3.8-live'};
  state.socket={readyState:1,send:vi.fn(),close:vi.fn()};
  let finish!: (value:unknown)=>void;
  state.onToolCall=vi.fn(()=>new Promise(resolve=>{finish=resolve;}));
  state.receive({toolCall:{functionCalls:[{id:'standard-read',name:'get_organization_agents',args:{}}]}});
  await vi.advanceTimersByTimeAsync(0);
  state.receive({serverContent:{turnComplete:true}});
  await vi.advanceTimersByTimeAsync(500);
  expect(state.activeTools).toBe(1); expect(phase).not.toHaveBeenCalledWith('listening');
  finish({count:1,agents:[{id:'agent'}]}); await vi.advanceTimersByTimeAsync(0);
  expect(state.serverIdle).toBe(false);
  expect(state.socket.send).toHaveBeenCalledOnce();
  state.receive({serverContent:{turnComplete:true}});
  await vi.advanceTimersByTimeAsync(500);
  expect(phase).toHaveBeenCalledWith('listening');
  expect(state.onToolCall).toHaveBeenCalledOnce(); live.stop();
 });
 it("accumulates transcript fragments under stable message IDs and starts new messages at boundaries",()=>{
  const {state,transcript}=fixture();
  state.receive({serverContent:{inputTranscription:{text:'Hello '}}});
  state.receive({serverContent:{inputTranscription:{text:'there',finished:true}}});
  const first=transcript.mock.calls[0][0],second=transcript.mock.calls[1][0];
  expect(second).toEqual({...first,text:'Hello there'});
  state.receive({serverContent:{outputTranscription:{text:'Hi!',finished:true}}});
  state.receive({serverContent:{inputTranscription:{text:'Continue'}}});
  expect(transcript.mock.calls[2][0].role).toBe('model');
  expect(transcript.mock.calls[3][0].id).not.toBe(first.id);
 });
 it("returns to listening after playback and stops microphone and audio on exit",()=>{
  vi.useFakeTimers(); const {live,state,phase,stop,close}=fixture();state.nextAudio=2;
  state.receive({interaction_status:'IDLE'});vi.advanceTimersByTime(1999);expect(phase).not.toHaveBeenCalled();
  state.context.currentTime=2;vi.advanceTimersByTime(1);expect(phase).toHaveBeenCalledWith('listening');
  live.stop();live.stop();expect(stop).toHaveBeenCalledOnce();expect(close).toHaveBeenCalledOnce();
 });
 it("immediately cancels queued speech when the user interrupts",()=>{
  const {state,phase}=fixture();const stop=vi.fn();state.audio.add({stop});state.output={id:'old',role:'model',text:'Partial'};
  state.receive({serverContent:{interrupted:true}});expect(stop).toHaveBeenCalledOnce();expect(state.output).toBeUndefined();expect(phase).toHaveBeenCalledWith('listening');
 });
});

it("silences barge-in immediately while context is pending and sends context within the original realtime activity", async () => {
 vi.useFakeTimers();vi.stubGlobal('WebSocket',{OPEN:1});let finish!:(value:unknown)=>void;
 const {live,state,transcript,phase}=fixture(undefined,()=>new Promise(resolve=>{finish=resolve;}));
 const send=vi.fn(),stop=vi.fn();state.socket={readyState:1,send,close:vi.fn()};state.serverIdle=false;state.audio.add({stop});
 const events=state.inputActivity.emit as (event:unknown)=>void;
 events({type:'start'});expect(stop).toHaveBeenCalledOnce();expect(send).not.toHaveBeenCalled();
 events({type:'audio',data:new ArrayBuffer(640)});events({type:'end'});await Promise.resolve();
 state.receive({serverContent:{interrupted:true,outputTranscription:{text:'Late old speech'},modelTurn:{parts:[{inlineData:{data:'AAAA'}}]},interactionStatus:'IDLE'}});
 await vi.advanceTimersByTimeAsync(0);
 expect(transcript).not.toHaveBeenCalled();expect(state.audio.size).toBe(0);expect(live.canRefreshInstructions).toBe(false);
 finish({organization:{id:'company'},asOf:'2026-09-27T00:00:00Z',count:13});await vi.advanceTimersByTimeAsync(0);
 const messages=send.mock.calls.map(([json])=>JSON.parse(json));
 expect(messages[0]).toEqual({realtimeInput:{activityStart:{}}});
 expect(messages[1]).toEqual({realtimeInput:{text:expect.stringContaining('"count":13')}});
 expect(messages.slice(2)).toEqual([{realtimeInput:{audio:{data:expect.any(String),mimeType:'audio/pcm;rate=16000'}}},{realtimeInput:{activityEnd:{}}}]);
 expect(state.serverIdle).toBe(false);expect(live.canRefreshInstructions).toBe(false);expect(phase).toHaveBeenLastCalledWith('thinking');live.stop();expect(phase).toHaveBeenCalledWith('listening');
});

it("never fetches turn context for provider transcripts or after voice stops", async () => {
 vi.stubGlobal('WebSocket',{OPEN:1});const context=vi.fn().mockResolvedValue({count:13});const {live,state}=fixture(undefined,context);
 state.socket={readyState:1,send:vi.fn(),close:vi.fn()};state.receive({serverContent:{inputTranscription:{text:'Hello',finished:true}}});
 await Promise.resolve();expect(context).not.toHaveBeenCalled();live.stop();state.inputActivity.emit({type:'start'});await Promise.resolve();expect(context).not.toHaveBeenCalled();
});

it("executes non-blocking calls once and delivers real results without stopping transcription", async () => {
 vi.stubGlobal("WebSocket", { OPEN: 1 });
 const {state,transcript}=fixture();const send=vi.fn();state.socket={readyState:1,send};
 let finish!: (value: unknown) => void;
 state.onToolCall=vi.fn(()=>new Promise(resolve=>{finish=resolve;}));
 const call={toolCall:{functionCalls:[{id:"call-1",name:"send_agent_message",args:{message:"Do real work"}}]}};
 state.receive(call);state.receive(call);await Promise.resolve();
 state.receive({serverContent:{inputTranscription:{text:"While you work",finished:true}}});
 expect(transcript).toHaveBeenCalled();expect(state.onToolCall).toHaveBeenCalledTimes(1);
 finish({accepted:true});await new Promise(resolve=>setTimeout(resolve,0));
 expect(JSON.parse(send.mock.calls[0][0]).toolResponse.functionResponses[0]).toMatchObject({id:"call-1",response:{result:{accepted:true}}});
});

it("records only bounded tool lifecycle metadata after the response is actually sent", async () => {
 vi.stubGlobal('WebSocket',{OPEN:1}); const {state}=fixture(); const events=vi.fn();
 state.onToolCheckpoint=events; state.socket={readyState:1,send:vi.fn()};
 state.onToolCall=vi.fn().mockResolvedValue({secret:'private result'});
 const call={toolCall:{functionCalls:[{id:'private call id',name:'get_organization_agents',args:{secret:'private argument'}}]}};
 state.receive(call);state.receive(call);
 await new Promise(resolve=>setTimeout(resolve,0));
 expect(events.mock.calls.map(([event])=>event)).toEqual([
  {stage:'tool_requested',tool:'get_organization_agents',sequence:1,elapsedMs:expect.any(Number)},
  {stage:'tool_response_sent',tool:'get_organization_agents',sequence:1,elapsedMs:expect.any(Number)},
 ]);
 expect(JSON.stringify(events.mock.calls)).not.toContain('private');
 expect(state.socket.send).toHaveBeenCalledOnce();
});

it("records cancellation once without a failure or response checkpoint", async () => {
 vi.stubGlobal('WebSocket',{OPEN:1}); const {state}=fixture(); const events=vi.fn(); let finish!:()=>void;
 state.onToolCheckpoint=events; state.socket={readyState:1,send:vi.fn()};
 state.onToolCall=()=>new Promise<void>(resolve=>{finish=resolve;});
 state.receive({toolCall:{functionCalls:[{id:'cancelled',name:'organization_api'}]}}); await Promise.resolve();
 state.receive({toolCallCancellation:{ids:['cancelled','cancelled']}}); finish();
 await new Promise(resolve=>setTimeout(resolve,0));
 expect(events.mock.calls.map(([event])=>event.stage)).toEqual(['tool_requested','tool_cancelled']);
 expect(state.socket.send).not.toHaveBeenCalled();
});

it("records tool failure without retaining the error or an unknown function name", async () => {
 vi.stubGlobal('WebSocket',{OPEN:1}); const {state}=fixture(); const events=vi.fn();
 state.onToolCheckpoint=events; state.socket={readyState:1,send:vi.fn()};
 state.onToolCall=vi.fn().mockRejectedValue(new Error('private error'));
 state.receive({toolCall:{functionCalls:[{id:'private id',name:'private function'}]}});
 await new Promise(resolve=>setTimeout(resolve,0));
 expect(events.mock.calls.map(([event])=>[event.stage,event.tool])).toEqual([
  ['tool_requested','unknown'],['tool_failed','unknown'],['tool_response_sent','unknown'],
 ]);
 expect(JSON.stringify(events.mock.calls)).not.toContain('private');
});

it.each(['closed','throws','backlogged'])('never records a sent tool response when its socket is %s', async failure => {
 vi.stubGlobal('WebSocket',{OPEN:1}); const {state}=fixture(); const events=vi.fn();
 state.onToolCheckpoint=events; state.socket={readyState:failure==='closed'?3:1,close:vi.fn(),bufferedAmount:failure==='backlogged'?129*1024:0,send:vi.fn(()=>{if(failure==='throws')throw new Error('socket failed');})};
 state.onToolCall=vi.fn().mockResolvedValue({count:13});
 state.receive({toolCall:{functionCalls:[{id:'call',name:'get_organization_agents'}]}});
 await new Promise(resolve=>setTimeout(resolve,0));
 expect(events.mock.calls.some(([event])=>event.stage==='tool_response_sent')).toBe(false);
});

it("bounds diagnostics without blocking execution when the callback fails", async () => {
 vi.stubGlobal('WebSocket',{OPEN:1}); const {state}=fixture(); const events=vi.fn(()=>{throw new Error('Diagnostics offline');});
 state.onToolCheckpoint=events; state.socket={readyState:1,send:vi.fn()}; state.onToolCall=vi.fn().mockResolvedValue({count:13});
 state.receive({toolCall:{functionCalls:Array.from({length:121},(_,i)=>({id:String(i),name:'get_organization_agents'}))}});
 await new Promise(resolve=>setTimeout(resolve,0));
 expect(events).toHaveBeenCalledTimes(120); expect(state.onToolCall).toHaveBeenCalledTimes(121); expect(state.socket.send).toHaveBeenCalledTimes(121);
});

it("queues output through the echo-reference path without disabling capture", () => {
 const {state}=fixture();const guard=vi.fn();state.capture={port:{postMessage:guard}};
 state.context.createBuffer=(_c:number,length:number,rate:number)=>({duration:length/rate,getChannelData:()=>new Float32Array(length)});
 const connect=vi.fn();state.context.createBufferSource=()=>({connect,start:vi.fn(),stop:vi.fn()});
 state.playback={input:{},resumeDelay:()=>0,interrupt:vi.fn()};
 state.play(btoa(String.fromCharCode(...new Uint8Array(4800))));
 expect(connect).toHaveBeenCalledWith(state.playback.input);expect(guard).not.toHaveBeenCalled();
 expect(state.playbackEndsAt).toBeCloseTo(.25);
});

it("defers and coalesces background updates until the current spoken turn is idle", () => {
 vi.useFakeTimers(); vi.stubGlobal("WebSocket", { OPEN: 1 });
 const { live, state } = fixture(); const send = vi.fn(); state.socket = { readyState: 1, send };
 state.serverIdle = false; state.playbackEndsAt = 2;
 live.updateAgentProgress({ result: "old" }); live.updateAgentProgress({ result: "latest" });
 expect(send).not.toHaveBeenCalled();
 state.receive({ interaction_status: "IDLE" });
 vi.advanceTimersByTime(1999); expect(send).not.toHaveBeenCalled();
 state.context.currentTime = 2; vi.advanceTimersByTime(1);
 expect(send).toHaveBeenCalledOnce(); expect(send.mock.calls[0][0]).toContain("latest");
});

it("keeps late input transcription together while output fragments arrive independently", () => {
 const {state,transcript}=fixture();
 state.receive({serverContent:{inputTranscription:{text:"Create a "}}});
 state.receive({serverContent:{outputTranscription:{text:"I can "}}});
 state.receive({serverContent:{inputTranscription:{text:"project ",finished:false}}});
 state.receive({serverContent:{outputTranscription:{text:"do that."}}});
 state.receive({serverContent:{inputTranscription:{text:"called Acme",finished:true}}});
 const inputs=transcript.mock.calls.map(call=>call[0]).filter(item=>item.role==="user");
 expect(new Set(inputs.map(item=>item.id)).size).toBe(1);
 expect(inputs.at(-1).text).toBe("Create a project called Acme");
});

it("uses turnComplete as the transcript boundary when finished is absent without ending reasoning", () => {
 const {state,transcript}=fixture();
 state.receive({serverContent:{inputTranscription:{text:"First request"}}});
 state.receive({serverContent:{outputTranscription:{text:"First response"}}});
 state.receive({serverContent:{turnComplete:true}});
 expect(state.serverIdle).toBe(false);
 state.receive({serverContent:{inputTranscription:{text:"Next request"}}});
 const inputs=transcript.mock.calls.map(call=>call[0]).filter(item=>item.role==="user");
 expect(inputs[0].id).not.toBe(inputs[1].id);
 expect(inputs[1].text).toBe("Next request");
});

it.each([
 {interactionStatus:"IN_PROGRESS"}, {interaction_status:"IN_PROGRESS"},
 {serverContent:{interactionStatus:"IN_PROGRESS"}}, {serverContent:{interaction_status:"IN_PROGRESS"}},
])("does not flush updates or report listening during subsequent background reasoning: %j", message => {
 vi.useFakeTimers(); vi.stubGlobal("WebSocket",{OPEN:1});
 const {live,state,phase}=fixture(); const send=vi.fn();state.socket={readyState:1,send};
 state.nextAudio=2;state.receive({interaction_status:"IDLE"});
 state.receive(message); live.updateAgentProgress({status:"working"});
 vi.advanceTimersByTime(2500);
 expect(phase).not.toHaveBeenCalledWith("listening"); expect(send).not.toHaveBeenCalled();
 expect(state.serverIdle).toBe(false);
});

it("waits for another idle signal after submitting a background update", () => {
 vi.stubGlobal("WebSocket",{OPEN:1});
 const {live,state}=fixture(); const send=vi.fn();state.socket={readyState:1,send};
 live.updateAgentProgress({result:"first"});live.updateAgentProgress({result:"second"});
 expect(send).toHaveBeenCalledOnce();expect(state.pendingProgress).toEqual({result:"second"});
});

it('waits for all tools and a new provider idle signal before relaying queued runtime progress',async()=>{
 vi.useFakeTimers();vi.stubGlobal('WebSocket',{OPEN:1});const {live,state}=fixture();const send=vi.fn();
 state.socket={readyState:1,send,close:vi.fn()};let finish!:(value:unknown)=>void;
 state.onToolCall=()=>new Promise(resolve=>{finish=resolve;});
 state.receive({toolCall:{functionCalls:[{id:'pending',name:'organization_api',args:{action:'overview'}}]}});await Promise.resolve();
 state.receive({interaction_status:'IDLE'});live.updateAgentProgress({status:'in_progress'});
 await vi.advanceTimersByTimeAsync(0);expect(send).not.toHaveBeenCalled();
 finish({tasks:[]});await state.toolCalls.get('pending');await Promise.resolve();
 expect(send).toHaveBeenCalledOnce();expect(JSON.parse(send.mock.calls[0][0]).toolResponse).toBeDefined();
 expect(state.serverIdle).toBe(false);state.flushProgress();expect(send).toHaveBeenCalledOnce();
 state.receive({interaction_status:'IDLE'});await vi.advanceTimersByTimeAsync(0);
 expect(send).toHaveBeenCalledTimes(2);expect(JSON.parse(send.mock.calls[1][0]).realtimeInput.text).toContain('in_progress');live.stop();
});

it.each(['success','failure'])('keeps progress polling behind a settled %s tool until its response is delivered',async outcome=>{
 vi.stubGlobal('WebSocket',{OPEN:1});const {live,state}=fixture();
 const send=vi.fn();state.socket={readyState:1,send,close:vi.fn()};
 let finish!:(value:unknown)=>void,fail!:(reason:Error)=>void;
 state.onToolCall=()=>new Promise((resolve,reject)=>{finish=resolve;fail=reject;});
 state.receive({toolCall:{functionCalls:[{id:'pending',name:'get_organization_agents',args:{}}]}});
 await Promise.resolve();
 // An IDLE already received while the function runs does not mean its result
 // has reached the provider. Poll between promise reactions to expose the race.
 state.receive({interaction_status:'IDLE'});
 if(outcome==='success')finish({count:13});else fail(new Error('Read unavailable'));
 for(let i=0;i<20;i++){
  await Promise.resolve();
  live.updateAgentProgress({status:'in_progress',stateChanged:true});
 }
 const messages=send.mock.calls.map(([raw])=>JSON.parse(raw));
 expect(messages).toHaveLength(1);
 expect(messages[0].toolResponse.functionResponses[0]).toMatchObject({id:'pending',response:outcome==='success'?{result:{count:13}}:{error:'Read unavailable'}});
 expect(state.activeTools).toBe(0);
 state.receive({interaction_status:'IDLE'});state.flushProgress();
 expect(send).toHaveBeenCalledTimes(2);live.stop();
});

it('retains unsent progress without claiming thinking when the socket is unavailable',async()=>{
 vi.useFakeTimers();vi.stubGlobal('WebSocket',{OPEN:1});const {live,state,phase}=fixture();const send=vi.fn();
 state.socket={readyState:3,send,close:vi.fn()};live.updateAgentProgress({status:'blocked'});
 expect(send).not.toHaveBeenCalled();expect(phase).not.toHaveBeenCalled();expect(state.serverIdle).toBe(true);expect(state.pendingProgress).toEqual({status:'blocked'});
 state.socket.readyState=1;state.receive({interaction_status:'IDLE'});await vi.advanceTimersByTimeAsync(0);
 expect(send).toHaveBeenCalledOnce();expect(state.pendingProgress).toBeUndefined();
 live.stop();live.updateAgentProgress({status:'late'});expect(send).toHaveBeenCalledOnce();expect(state.pendingProgress).toBeUndefined();
});

it('releases queued progress when the last cancelled call drains after provider idle',async()=>{
 vi.useFakeTimers();vi.stubGlobal('WebSocket',{OPEN:1});const {live,state}=fixture();const send=vi.fn();
 state.socket={readyState:1,send,close:vi.fn()};let finish!:(value:unknown)=>void;
 state.onToolCall=()=>new Promise(resolve=>{finish=resolve;});
 state.receive({toolCall:{functionCalls:[{id:'cancelled',name:'search_web',args:{query:'old'}}]}});await Promise.resolve();
 state.receive({toolCallCancellation:{ids:['cancelled']},interaction_status:'IDLE'});
 live.updateAgentProgress({status:'blocked'});await vi.advanceTimersByTimeAsync(0);expect(send).not.toHaveBeenCalled();
 finish({stale:true});await state.toolCalls.get('cancelled');await Promise.resolve();
 expect(send).toHaveBeenCalledOnce();expect(JSON.parse(send.mock.calls[0][0]).realtimeInput.text).toContain('blocked');expect(state.pendingProgress).toBeUndefined();live.stop();
});

it('coalesces current work state without losing an unsent reply or keeping a resolved question',async()=>{
 vi.useFakeTimers();vi.stubGlobal('WebSocket',{OPEN:1});const {live,state}=fixture();const send=vi.fn();
 state.socket={readyState:1,send,close:vi.fn()};state.serverIdle=false;
 live.updateAgentProgress({status:'in_progress',stateChanged:true,replies:[{id:'reply',text:'Finished the analysis'}],questions:[{id:'confirmation',status:'pending'}],pendingQuestionIds:['confirmation']});
 live.updateAgentProgress({status:'done',stateChanged:true,replies:[],questions:[],pendingQuestionIds:[]});
 state.serverIdle=true;expect(live.canRefreshInstructions).toBe(false);
 state.receive({interaction_status:'IDLE'});await vi.advanceTimersByTimeAsync(0);
 expect(send).toHaveBeenCalledOnce();const message=JSON.parse(send.mock.calls[0][0]).realtimeInput.text;
 expect(message).toContain('Finished the analysis');expect(message).toContain('"status":"done"');expect(message).not.toContain('confirmation');
 expect(state.pendingProgress).toBeUndefined();live.stop();
});

it('silently drops a disappeared question when no other new result or work-state change needs relaying',()=>{
 vi.stubGlobal('WebSocket',{OPEN:1});const {live,state,phase}=fixture();const send=vi.fn();
 state.socket={readyState:1,send,close:vi.fn()};state.serverIdle=false;
 live.updateAgentProgress({stateChanged:false,replies:[],questions:[{id:'question',status:'pending'}],pendingQuestionIds:['question']});
 live.updateAgentProgress({stateChanged:false,replies:[],questions:[],pendingQuestionIds:[]});
 state.serverIdle=true;state.flushProgress();expect(send).not.toHaveBeenCalled();expect(phase).not.toHaveBeenCalled();expect(state.pendingProgress).toBeUndefined();live.stop();
});

it("drops cancelled tool results and does not execute calls after shutdown", async () => {
 const {state,live}=fixture(); const send=vi.fn();vi.stubGlobal("WebSocket",{OPEN:1});
 state.socket={readyState:1,send,close:vi.fn()};
 let finish!:(value:unknown)=>void;
 state.onToolCall=vi.fn(()=>new Promise(resolve=>{finish=resolve;}));
 state.receive({toolCall:{functionCalls:[{id:"cancelled",name:"organization_api"}]}});
 await Promise.resolve();state.receive({toolCallCancellation:{ids:["cancelled"]}});
 finish({result:"done"});await state.toolCalls.get("cancelled");await Promise.resolve();
 expect(send).not.toHaveBeenCalled();
 live.stop();state.receive({toolCall:{functionCalls:[{id:"after-stop",name:"organization_api"}]}});
 await state.toolCalls.get("after-stop");
 expect(state.onToolCall).toHaveBeenCalledOnce();
});

it('aborts call preflight on provider cancellation without sending a failure or stopping voice', async () => {
 const {state,live,error}=fixture(), send=vi.fn(), execute=vi.fn(); vi.stubGlobal('WebSocket',{OPEN:1});
 state.socket={readyState:1,send,close:vi.fn()};
 let authorize!:()=>void; let signal!:AbortSignal;
 state.onToolCall=vi.fn(async(_name:string,_args:unknown,_id:string,callSignal:AbortSignal)=>{
  signal=callSignal; await new Promise<void>(resolve=>{authorize=resolve;});
  assertVoiceToolActive(signal); execute(); return {accepted:true};
 });
 state.receive({toolCall:{functionCalls:[{id:'preflight',name:'organization_api'}]}}); await Promise.resolve();
 state.receive({toolCallCancellation:{ids:['preflight']}}); expect(signal.aborted).toBe(true);
 authorize(); await state.toolCalls.get('preflight'); await Promise.resolve();
 expect(execute).not.toHaveBeenCalled(); expect(send).not.toHaveBeenCalled(); expect(error).not.toHaveBeenCalled();
 expect(state.stopped).toBe(false); expect(state.activeTools).toBe(0); expect(state.toolControllers.size).toBe(0); live.stop();
});

it.each([
 {name:'search_web',args:{query:'old topic',category:'general'}},
 {name:'read_web_page',args:{url:'https://example.com'}},
 {name:'organization_api',args:{action:'search_web',data:'{}'}},
 {name:'organization_api',args:{action:'read_web_page',data:'{}'}},
])('drops late $name research results immediately on local new speech without provider cancellation', async call => {
 vi.stubGlobal('WebSocket',{OPEN:1}); const {state,live,error}=fixture(); const send=vi.fn(),events=vi.fn();
 state.socket={readyState:1,send,close:vi.fn()}; state.onToolCheckpoint=events;
 let finish!:(value:unknown)=>void; let signal!:AbortSignal;
 state.onToolCall=vi.fn((_name:string,_args:unknown,_id:string,callSignal:AbortSignal)=>{
  signal=callSignal; return new Promise(resolve=>{finish=resolve;});
 });
 state.receive({toolCall:{functionCalls:[{id:'old-research',...call}]}}); await Promise.resolve();
 state.inputActivity.emit({type:'start'}); expect(signal.aborted).toBe(true);
 // The HTTP read may already be in flight and ignore abort. It must still not
 // be delivered to the provider once the user has started a new turn.
 finish({sources:[{title:'Old result',uri:'https://example.com'}]});
 await state.toolCalls.get('old-research'); await Promise.resolve();
 expect(send.mock.calls.map(([json])=>JSON.parse(json))).toEqual([{realtimeInput:{activityStart:{}}}]);
 expect(events.mock.calls.map(([event])=>event.stage)).toEqual(['tool_requested','tool_cancelled']);
 expect(state.activeTools).toBe(0); expect(state.toolControllers.size).toBe(0); expect(state.researchToolIds.size).toBe(0);
 expect(error).not.toHaveBeenCalled(); expect(state.stopped).toBe(false); live.stop();
});

it('cancels only old research while allowing an organization write and new-turn research to finish', async () => {
 vi.stubGlobal('WebSocket',{OPEN:1}); const {state,live}=fixture(); const send=vi.fn();
 state.socket={readyState:1,send,close:vi.fn()};
 const calls=new Map<string,{signal:AbortSignal;finish:(value:unknown)=>void}>();
 state.onToolCall=vi.fn((_name:string,_args:unknown,id:string,signal:AbortSignal)=>new Promise(resolve=>{
  calls.set(id,{signal,finish:resolve});
 }));
 state.receive({toolCall:{functionCalls:[
  {id:'old',name:'search_web',args:{query:'old',category:'general'}},
  {id:'write',name:'organization_api',args:{action:'create_task',data:'{}'}},
 ]}}); await Promise.resolve();
 state.inputActivity.emit({type:'start'}); state.inputActivity.emit({type:'end'});
 expect(calls.get('old')!.signal.aborted).toBe(true); expect(calls.get('write')!.signal.aborted).toBe(false);
 state.receive({toolCall:{functionCalls:[{id:'new',name:'search_web',args:{query:'new',category:'news'}}]}}); await Promise.resolve();
 calls.get('old')!.finish({stale:true}); calls.get('write')!.finish({created:true}); calls.get('new')!.finish({provider:'searxng',query:'new'});
 await Promise.all(state.toolCalls.values()); await Promise.resolve();
 const responses=send.mock.calls.map(([json])=>JSON.parse(json)).flatMap(message=>message.toolResponse?.functionResponses??[]);
 expect(responses).toEqual([
  {id:'write',name:'organization_api',response:{result:{created:true}}},
  {id:'new',name:'search_web',response:{result:{provider:'searxng',query:'new'}}},
 ]);
 expect(calls.get('new')!.signal.aborted).toBe(false); expect(state.toolControllers.size).toBe(0); live.stop();
});

it('does not begin a pending research callback after local speech supersedes it', async () => {
 vi.stubGlobal('WebSocket',{OPEN:1}); const {state,live}=fixture(); const send=vi.fn();
 state.socket={readyState:1,send,close:vi.fn()}; state.onToolCall=vi.fn();
 state.receive({toolCall:{functionCalls:[{id:'not-started',name:'read_web_page',args:{url:'https://example.com'}}]}});
 state.inputActivity.emit({type:'start'});
 await state.toolCalls.get('not-started'); await Promise.resolve();
 expect(state.onToolCall).not.toHaveBeenCalled(); expect(state.toolControllers.size).toBe(0);
 expect(send.mock.calls.map(([json])=>JSON.parse(json))).toEqual([{realtimeInput:{activityStart:{}}}]); live.stop();
});

it('aborts every pending tool preflight on session stop and releases controllers', async () => {
 const {state,live,error}=fixture(); const signals:AbortSignal[]=[];
 state.onToolCall=vi.fn((_name:string,_args:unknown,_id:string,signal:AbortSignal)=>new Promise<void>((_resolve,reject)=>{
  signals.push(signal); signal.addEventListener('abort',()=>reject(new DOMException('Cancelled','AbortError')),{once:true});
 }));
 state.receive({toolCall:{functionCalls:[{id:'one',name:'organization_api'},{id:'two',name:'voice_workspace'}]}}); await Promise.resolve();
 live.stop(); await Promise.all(state.toolCalls.values());
 expect(signals).toHaveLength(2); expect(signals.every(signal=>signal.aborted)).toBe(true);
 expect(state.toolControllers.size).toBe(0); expect(state.activeTools).toBe(0); expect(error).not.toHaveBeenCalled();
});

it("fails rather than sending stale microphone audio over an overloaded socket", () => {
 const {state,error,stop}=fixture();vi.stubGlobal("WebSocket",{OPEN:1});
 const send=vi.fn();state.socket={readyState:1,bufferedAmount:128*1024+1,send,close:vi.fn()};
 state.send({realtimeInput:{audio:{data:"audio"}}});
 expect(send).not.toHaveBeenCalled();expect(error).toHaveBeenCalledWith(expect.stringContaining("too slow"));expect(stop).toHaveBeenCalledOnce();
});

function transportFixture(configure?: (state: any) => void) {
 const sockets:any[]=[];
 class Socket {
  static OPEN=1; readyState=1;bufferedAmount=0;binaryType="blob";
  send=vi.fn();close=vi.fn();onmessage?: (event:any)=>void;onopen?:()=>void;onclose?:()=>void;
  constructor(){sockets.push(this);}
 }
 vi.stubGlobal("WebSocket",Socket);
 const fx=fixture();configure?.(fx.state);const connection:Promise<void>=fx.state.connect();
 const socket=sockets[0];
 const deliver=async (data:any)=>{socket.onmessage({data});await fx.state.receiveQueue;};
 return {...fx,connection,socket,sockets,deliver};
}

function searchSetup() { return {model:'models/gemini-3.8-live-extended-thinking',generationConfig:{thinkingConfig:{thinkingLevel:'HIGH'}},tools:[{functionDeclarations:[{name:'organization_api'}]},{googleSearch:{}}]}; }
function searchFixture(recover?: (signal: AbortSignal) => Promise<VoiceSession>) {
 let replacement!:VoiceSession;
 const fallback=vi.fn(recover??(async()=>replacement));
 const fx=transportFixture(state=>{
  state.session={...state.session,token:'first',setup:searchSetup()};
  replacement={...state.session,token:'replacement',setup:{...searchSetup(),tools:[{functionDeclarations:[{name:'organization_api'}]}]}};
  state.onSearchQuota=fallback;
 });
 return {...fx,fallback,replacement};
}

it.each(['close','error'])('recovers one Search quota %s before setup while retaining the microphone and audio context',async mode=>{
 vi.useFakeTimers();const fx=searchFixture();const context=fx.state.context;
 if(mode==='close')fx.socket.onclose({reason:'You exceeded your current quota.'});
 else await fx.deliver(JSON.stringify({error:{status:'RESOURCE_EXHAUSTED',message:'You exceeded your current quota.'}}));
 await vi.advanceTimersByTimeAsync(0);
 expect(fx.fallback).toHaveBeenCalledOnce();expect(fx.sockets).toHaveLength(2);expect(fx.socket.close).toHaveBeenCalledOnce();
 expect(fx.stop).not.toHaveBeenCalled();expect(fx.close).not.toHaveBeenCalled();expect(fx.state.context).toBe(context);expect(fx.error).not.toHaveBeenCalled();
 const next=fx.sockets[1];next.onopen();expect(JSON.parse(next.send.mock.calls[0][0]).setup).toEqual(fx.replacement.setup);
 next.onmessage({data:JSON.stringify({setupComplete:{}})});await fx.state.receiveQueue;await fx.connection;
 expect(fx.state.session.token).toBe('replacement');fx.live.stop();
});

it('never retries a quota error after setup completed',async()=>{
 const fx=searchFixture();await fx.deliver(JSON.stringify({setupComplete:{}}));await fx.connection;
 fx.socket.onclose({reason:'Quota exceeded'});expect(fx.fallback).not.toHaveBeenCalled();expect(fx.stop).toHaveBeenCalledOnce();expect(fx.error).toHaveBeenCalledOnce();
});

it('does not retry a second quota rejection or a nonquota startup failure',async()=>{
 vi.useFakeTimers();const fx=searchFixture();const rejected=expect(fx.connection).rejects.toThrow('Voice connection closed');
 fx.socket.onclose({reason:'Quota exceeded'});await vi.advanceTimersByTimeAsync(0);
 fx.sockets[1].onclose({reason:'Quota exceeded'});await rejected;expect(fx.fallback).toHaveBeenCalledOnce();expect(fx.error).toHaveBeenCalledOnce();
 const other=searchFixture();const failed=expect(other.connection).rejects.toThrow('Voice connection closed');other.socket.onclose({reason:'Unsupported configuration'});await failed;expect(other.fallback).not.toHaveBeenCalled();
});

it('handles a failed Search recovery once without an unhandled rejection',async()=>{
 vi.useFakeTimers();const fx=searchFixture(async()=>{throw new Error('Token service unavailable');});const failed=expect(fx.connection).rejects.toThrow('Voice connection closed');
 fx.socket.onclose({reason:'Quota exceeded'});await vi.advanceTimersByTimeAsync(0);await failed;
 expect(fx.sockets).toHaveLength(1);expect(fx.error).toHaveBeenCalledOnce();expect(fx.stop).toHaveBeenCalledOnce();
});

it('aborts a pending fallback on stop and drops late tokens and old socket frames',async()=>{
 vi.useFakeTimers();let finish!:(session:VoiceSession)=>void;const fx=searchFixture(()=>new Promise(resolve=>{finish=resolve;}));
 const oldMessage=fx.socket.onmessage;const failed=expect(fx.connection).rejects.toThrow('Voice connection closed');
 fx.socket.onclose({reason:'Quota exceeded'});await vi.advanceTimersByTimeAsync(0);fx.live.stop();await failed;
 expect(fx.fallback.mock.calls[0][0].aborted).toBe(true);finish(fx.replacement);
 oldMessage({data:JSON.stringify({serverContent:{outputTranscription:{text:'Late answer'}}})});await vi.advanceTimersByTimeAsync(0);
 expect(fx.sockets).toHaveLength(1);expect(fx.transcript).not.toHaveBeenCalled();expect(fx.error).not.toHaveBeenCalled();
});

it('keeps the original bounded connection deadline while recovering Search quota',async()=>{
 vi.useFakeTimers();const fx=searchFixture(()=>new Promise(()=>{}));const failed=expect(fx.connection).rejects.toThrow('Voice connection closed');
 await vi.advanceTimersByTimeAsync(15_000);fx.socket.onclose({reason:'Quota exceeded'});await vi.advanceTimersByTimeAsync(5_000);await failed;
 expect(fx.fallback.mock.calls[0][0].aborted).toBe(true);expect(fx.error).toHaveBeenCalledWith('Voice connection timed out.');
});

it('associates incremental grounding arriving after a finished transcript with that spoken answer',()=>{
 const {state,transcript,live}=fixture();const grounding=vi.fn();state.onGrounding=grounding;
 state.receive({serverContent:{outputTranscription:{text:'The answer.',finished:true},turnComplete:true}});
 state.receive({serverContent:{groundingMetadata:{searchEntryPoint:{renderedContent:'<a href="https://google.com/search?q=test">Search</a>'},groundingChunks:[{web:{uri:'https://example.com/one',title:'First'}}]}}});
 state.receive({serverContent:{groundingMetadata:{groundingChunks:[{web:{uri:'https://example.com/one',title:'Duplicate'}},{web:{uri:'https://example.com/two',title:'Second'}}]}}});
 expect(grounding).toHaveBeenLastCalledWith(expect.objectContaining({id:transcript.mock.calls[0][0].id,answer:'The answer.',sources:[{uri:'https://example.com/one',title:'First'},{uri:'https://example.com/two',title:'Second'}]}));live.stop();
});

it('attaches transcription to grounding that arrives first and clears it on new speech and stop',()=>{
 vi.stubGlobal('WebSocket',{OPEN:1});const {state,live}=fixture();state.socket={readyState:1,send:vi.fn(),close:vi.fn()};const grounding=vi.fn();state.onGrounding=grounding;
 state.receive({serverContent:{groundingMetadata:{groundingChunks:[{web:{uri:'https://example.com',title:'Source'}}]}}});
 const id=grounding.mock.calls[0][0].id;state.receive({serverContent:{outputTranscription:{text:'Spoken answer',finished:true}}});
 expect(grounding).toHaveBeenLastCalledWith(expect.objectContaining({id,answer:'Spoken answer'}));
 state.inputActivity.emit({type:'start'});expect(grounding).toHaveBeenLastCalledWith(null,'new_turn');live.stop();expect(grounding).toHaveBeenLastCalledWith(null,'stop');
 const calls=grounding.mock.calls.length;state.receive({serverContent:{groundingMetadata:{groundingChunks:[{web:{uri:'https://late.example',title:'Late'}}]}}});expect(grounding).toHaveBeenCalledTimes(calls);
});

it("processes slow Blob payloads in socket order, followed by ArrayBuffer frames", async () => {
 const {state,connection,socket,deliver,transcript,live}=transportFixture();
 await deliver(JSON.stringify({setupComplete:{}}));await connection;
 let decode!:(text:string)=>void;
 socket.onmessage({data:{text:()=>new Promise<string>(resolve=>{decode=resolve;})}});
 socket.onmessage({data:JSON.stringify({serverContent:{inputTranscription:{text:"second",finished:true}}})});
 await Promise.resolve();expect(transcript).not.toHaveBeenCalled();
 decode(JSON.stringify({serverContent:{inputTranscription:{text:"first "}}}));
 await state.receiveQueue;
 expect(transcript.mock.calls.at(-1)?.[0].text).toBe("first second");
 await deliver(new TextEncoder().encode(JSON.stringify({serverContent:{inputTranscription:{text:"third",finished:true}}})).buffer);
 expect(transcript.mock.calls.at(-1)?.[0].text).toBe("third");live.stop();
});

it("cleans up a failed connection before setup and rejects the startup promise", async () => {
 const {connection,socket,error,stop}=transportFixture();
 const rejected=expect(connection).rejects.toThrow("Voice connection closed");
 socket.onclose();await rejected;
 expect(error).toHaveBeenCalledOnce();expect(stop).toHaveBeenCalledOnce();
});

it("ignores a frame whose Blob decoding completes after the voice session ended", async () => {
 const {state,connection,socket,deliver,transcript,live}=transportFixture();
 await deliver(JSON.stringify({setupComplete:{}}));await connection;
 let decode!:(text:string)=>void;
 socket.onmessage({data:{text:()=>new Promise<string>(resolve=>{decode=resolve;})}});
 await Promise.resolve();live.stop();
 decode(JSON.stringify({serverContent:{inputTranscription:{text:"stale"}}}));await state.receiveQueue;
 expect(transcript).not.toHaveBeenCalled();
});

it("rejects a microphone that disconnected before capture was initialized", async () => {
 const {state,live,stop}=fixture();
 state.stream.getAudioTracks=()=>[{readyState:"ended",removeEventListener:vi.fn()}];
 await expect(live.start()).rejects.toThrow("Microphone disconnected");
 expect(stop).toHaveBeenCalledOnce();
});

it("accounts for output latency when waiting to deliver background updates", () => {
 const {state}=fixture();state.context.baseLatency=0.02;state.context.outputLatency=0.2;
 expect(state.outputDrainSeconds()).toBeCloseTo(0.37);
 state.context.outputLatency=Number.NaN;
 expect(state.outputDrainSeconds()).toBeCloseTo(0.17);
});

it("detects microphone loss while the provider is still connecting", async () => {
 let ended!:()=>void;
 const {state,live,error,stop}=fixture();
 const track={readyState:"live",addEventListener:vi.fn((event,listener)=>{if(event==="ended")ended=listener;}),removeEventListener:vi.fn()};
 state.stream.getAudioTracks=()=>[track];state.context.audioWorklet={addModule:vi.fn(()=>Promise.resolve())};
 vi.stubGlobal("WebSocket",class {static OPEN=1;close=vi.fn();});
 const started=live.start();const rejected=expect(started).rejects.toThrow("Voice connection closed");
 for(let i=0;i<10&&!state.rejectConnect;i++)await Promise.resolve();ended();await rejected;
 expect(error).toHaveBeenCalledWith(expect.stringContaining("Microphone disconnected"));
 expect(stop).toHaveBeenCalledOnce();expect(track.removeEventListener).toHaveBeenCalledTimes(3);
});

function parallelStartupFixture(preparedPlayback?: PreparedVoicePlayback) {
 const fx=fixture(preparedPlayback), workers:any[]=[], sockets:any[]=[];
 const track={readyState:"live",muted:false,addEventListener:vi.fn(),removeEventListener:vi.fn()};
 fx.state.stream.getAudioTracks=()=>[track];
 fx.state.session.setup={realtimeInputConfig:{automaticActivityDetection:{disabled:true}}};
 fx.state.context.audioWorklet={addModule:vi.fn(()=>new Promise<void>(resolve=>setTimeout(resolve,400)))};
 fx.state.context.createMediaStreamSource=vi.fn(()=>({connect:vi.fn(),disconnect:vi.fn()}));
 vi.stubGlobal("Worker",class {
  onmessage:any;onerror:any;postMessage=vi.fn();timer:any;
  constructor(){workers.push(this);this.timer=setTimeout(()=>this.onmessage({data:{type:"ready"}}),600);}
  terminate=vi.fn(()=>clearTimeout(this.timer));
 });
 vi.stubGlobal("WebSocket",class {
  static OPEN=1;readyState=1;bufferedAmount=0;onmessage:any;onopen:any;onclose:any;send=vi.fn();timer:any;
  constructor(){sockets.push(this);this.timer=setTimeout(()=>this.onmessage({data:JSON.stringify({setupComplete:{}})}),800);}
  close=vi.fn(()=>clearTimeout(this.timer));
 });
 vi.stubGlobal("AudioWorkletNode",class {port={onmessage:null};connect=vi.fn();disconnect=vi.fn();});
 const start=()=>{
  const started=fx.live.start();
  fx.state.playback.start.mockImplementation(()=>new Promise<void>(resolve=>setTimeout(resolve,3000)));
  return started;
 };
 return {...fx,workers,sockets,track,start};
}

it("overlaps independent startup steps and waits only for the slowest before capturing",async()=>{
 vi.useFakeTimers();const {live,state,start,workers,sockets,phase}=parallelStartupFixture();
 let ready=false;const started=start().then(()=>{ready=true});
 await vi.advanceTimersByTimeAsync(0);
 expect(state.context.audioWorklet.addModule).toHaveBeenCalledOnce();expect(state.playback.start).toHaveBeenCalledOnce();
 expect(workers).toHaveLength(1);expect(sockets).toHaveLength(1);
 await vi.advanceTimersByTimeAsync(2999);expect(ready).toBe(false);expect(state.context.createMediaStreamSource).not.toHaveBeenCalled();
 await vi.advanceTimersByTimeAsync(1);await started;
 expect(ready).toBe(true);expect(state.context.createMediaStreamSource).toHaveBeenCalledOnce();expect(phase).toHaveBeenCalledWith("listening");
 live.stop();expect(vi.getTimerCount()).toBe(0);
});

it("holds eager provider messages until playback and capture are ready",async()=>{
 vi.useFakeTimers();const {live,state,start,sockets,transcript}=parallelStartupFixture();
 const started=start();await vi.advanceTimersByTimeAsync(800);
 sockets[0].onmessage({data:JSON.stringify({serverContent:{outputTranscription:{text:"Ready",finished:true}}})});
 await Promise.resolve();expect(transcript).not.toHaveBeenCalled();
 await vi.advanceTimersByTimeAsync(2200);await started;await state.receiveQueue;
 expect(transcript).toHaveBeenCalledWith(expect.objectContaining({text:"Ready"}));live.stop();
});
it("adopts preparatory playback and waits for it without restarting output",async()=>{
 vi.useFakeTimers(); const playback = new VoicePlayback({} as AudioContext, vi.fn());
 const ready = new Promise<void>(resolve=>setTimeout(resolve,1200));
 const {live,state,phase} = parallelStartupFixture({playback,ready});
 const started = live.start();
 await vi.advanceTimersByTimeAsync(800);
 expect(state.playback).toBe(playback); expect(playback.start).not.toHaveBeenCalled();
 expect(state.context.createMediaStreamSource).not.toHaveBeenCalled();
 await vi.advanceTimersByTimeAsync(400); await started;
 expect(phase).toHaveBeenCalledWith("listening"); expect(playback.start).not.toHaveBeenCalled();
 live.stop(); expect(playback.stop).toHaveBeenCalledOnce();
});
it("cleans adopted playback even if the live session stops before start",()=>{
 const playback = new VoicePlayback({} as AudioContext, vi.fn());
 const {live,stop} = fixture({playback,ready:Promise.resolve()});
 live.stop(); live.stop();
 expect(playback.stop).toHaveBeenCalledOnce(); expect(playback.start).not.toHaveBeenCalled(); expect(stop).toHaveBeenCalledOnce();
});

it("does not start deferred preparations after immediate cancellation",async()=>{
 vi.useFakeTimers();const {live,start,state,workers,sockets,stop}=parallelStartupFixture();
 const started=start();const rejected=expect(started).rejects.toThrow("stopped");live.stop();await rejected;
 expect(workers).toHaveLength(0);expect(sockets).toHaveLength(0);expect(state.context.audioWorklet.addModule).not.toHaveBeenCalled();
 expect(state.context.createMediaStreamSource).not.toHaveBeenCalled();expect(stop).toHaveBeenCalledOnce();expect(vi.getTimerCount()).toBe(0);
});

it("cleans every parallel preparation when one startup component fails",async()=>{
 vi.useFakeTimers();const {live,state,start,workers,sockets,stop,close}=parallelStartupFixture();
 state.context.audioWorklet.addModule.mockRejectedValueOnce(new Error("capture module failed"));
 await expect(start()).rejects.toThrow("capture module failed");
 expect(workers[0].terminate).toHaveBeenCalledOnce();expect(sockets[0].close).toHaveBeenCalledOnce();
 expect(state.playback.stop).toHaveBeenCalledOnce();expect(stop).toHaveBeenCalledOnce();expect(close).toHaveBeenCalledOnce();
 await vi.advanceTimersByTimeAsync(3000);expect(state.context.createMediaStreamSource).not.toHaveBeenCalled();live.stop();
});

async function captureFixture(clientActivity: boolean) {
 const fx=fixture();const send=vi.fn();let probability=.01;
 vi.stubGlobal("Worker",class {
  onmessage:any; onerror:any; terminate=vi.fn();
  constructor(){queueMicrotask(()=>this.onmessage({data:{type:"ready"}}));}
  postMessage(message:any){if(message.type==="frame")this.onmessage({data:{...message,probability}});}
 });
 vi.stubGlobal("WebSocket",{OPEN:1});
 fx.state.socket={readyState:1,bufferedAmount:0,send,close:vi.fn()};
 fx.state.connect=async()=>{};
 fx.state.session.setup={realtimeInputConfig:{automaticActivityDetection:{disabled:clientActivity}}};
 const track={readyState:"live",muted:false,addEventListener:vi.fn(),removeEventListener:vi.fn()};
 fx.state.stream.getAudioTracks=()=>[track];
 fx.state.context.resume=vi.fn(async()=>{});
 fx.state.context.audioWorklet={addModule:vi.fn(async()=>{})};
 fx.state.context.createMediaStreamSource=()=>({connect:vi.fn(),disconnect:vi.fn()});
 vi.stubGlobal("AudioWorkletNode",class {
  port={postMessage:vi.fn(),onmessage:undefined};connect=vi.fn();disconnect=vi.fn();
 });
 await fx.live.start();
 const frame=(amplitude:number,confidence=amplitude?.99:.01)=>{
  probability=confidence;
  const pcm=new Int16Array(320); for(let i=0;i<320;i++)pcm[i]=(i%2?1:-1)*Math.round(amplitude*32767);
  fx.state.capture.port.onmessage({data:pcm.buffer});
 };
 const packets=()=>send.mock.calls.map(call=>JSON.parse(call[0]).realtimeInput);
 return {...fx,send,frame,packets,track};
}

it("frames each continuous utterance with activity markers when automatic provider VAD is disabled", async () => {
 const {live,frame,packets}=await captureFixture(true);
 for(let i=0;i<20;i++)frame(0);
 expect(packets()).toHaveLength(0);
 for(let i=0;i<7;i++)frame(0.03);
 expect(packets()[0]).toEqual({activityStart:{}});
 expect(packets().slice(1).every(packet=>packet.audio?.mimeType==="audio/pcm;rate=16000")).toBe(true);
 for(let i=0;i<50;i++)frame(0);
 expect(packets().at(-1)).toEqual({activityEnd:{}});
 for(let i=0;i<7;i++)frame(0.03);
 expect(packets().filter(packet=>packet.activityStart)).toHaveLength(2);
 live.stop();
});

it("retains continuous PCM streaming for sessions using provider VAD and never sends manual markers", async () => {
 const {live,state,frame,packets}=await captureFixture(false);
 frame(0.03);state.playbackEndsAt=1;frame(0.9);
 expect(packets()).toHaveLength(2);
 expect(packets().every(packet=>packet.audio&&!packet.activityStart&&!packet.activityEnd)).toBe(true);
 expect([...atob(packets()[1].audio.data)].some(value=>value.charCodeAt(0)!==0)).toBe(true);
 live.stop();
});

it("interrupts local playback on confirmed speech, keeps capturing, and rejects stale output", async () => {
 const {live,state,frame,packets,transcript}=await captureFixture(true);
 const stop=vi.fn();state.audio.add({stop});state.serverIdle=false;state.playbackEndsAt=10;
 for(let i=0;i<30;i++)frame(.001,.01);
 expect(packets()).toHaveLength(0);expect(stop).not.toHaveBeenCalled();
 for(let i=0;i<7;i++)frame(.03,.99);
 expect(stop).toHaveBeenCalledOnce();expect(packets()[0]).toEqual({activityStart:{}});
 expect(state.awaitingInterruption).toBe(true);
 const play=vi.spyOn(state,'play');
 state.receive({serverContent:{modelTurn:{parts:[{inlineData:{data:'AAAA'}}]},outputTranscription:{text:'Old response'}}});
 expect(play).not.toHaveBeenCalled();expect(transcript).not.toHaveBeenCalled();
 state.receive({serverContent:{interrupted:true}});
 state.receive({serverContent:{inputTranscription:{text:'Actually, change that.',finished:true}}});
 expect(transcript).toHaveBeenCalledWith(expect.objectContaining({text:'Actually, change that.',role:'user'}));
 for(let i=0;i<50;i++)frame(0);
 expect(packets().at(-1)).toEqual({activityEnd:{}});
 state.receive({serverContent:{outputTranscription:{text:'New response',finished:true}}});
 expect(transcript).toHaveBeenLastCalledWith(expect.objectContaining({text:'New response'}));
 live.stop();
});

it("can interrupt queued audio after provider IDLE without discarding the next reply",async()=>{
 const {live,state,frame,transcript}=await captureFixture(true);
 state.audio.add({stop:vi.fn()});state.serverIdle=true;
 for(let i=0;i<7;i++)frame(.03);
 expect(state.awaitingInterruption).toBe(false);
 for(let i=0;i<50;i++)frame(0);
 state.receive({serverContent:{outputTranscription:{text:'Next reply',finished:true}}});
 expect(transcript).toHaveBeenLastCalledWith(expect.objectContaining({text:'Next reply'}));live.stop();
});

it("does not inject an agent progress update in the middle of a locally detected user utterance", async () => {
 const {live,state,frame,packets}=await captureFixture(true);
 for(let i=0;i<7;i++)frame(0.03);
 state.serverIdle=true;
 live.updateAgentProgress({replies:["new result"]});
 expect(packets().some(packet=>packet.text)).toBe(false);
 live.stop();
});


it("never publishes split no-speech markers as user or model messages", () => {
 const {state,transcript}=fixture();
 for(const key of ["inputTranscription","outputTranscription"]){
  state.receive({serverContent:{[key]:{text:"<no"}}});
  state.receive({serverContent:{[key]:{text:" speech>",finished:true}}});
 }
 expect(transcript).not.toHaveBeenCalled();
 state.receive({serverContent:{inputTranscription:{text:"Hello",finished:true}}});
 expect(transcript).toHaveBeenCalledWith(expect.objectContaining({text:"Hello",role:"user"}));
});

it("only refreshes instructions after speech, audio and tool responses finish", async () => {
 const {live,state}=fixture();expect(live.canRefreshInstructions).toBe(true);
 state.playbackEndsAt=2;expect(live.canRefreshInstructions).toBe(false);state.context.currentTime=2;
 state.serverIdle=false;expect(live.canRefreshInstructions).toBe(false);state.serverIdle=true;
 vi.spyOn(state.inputActivity,'isActive','get').mockReturnValue(true);expect(live.canRefreshInstructions).toBe(false);
 vi.restoreAllMocks();state.activeTools=1;expect(live.canRefreshInstructions).toBe(false);state.activeTools=0;
 expect(live.canRefreshInstructions).toBe(true);live.stop();expect(live.canRefreshInstructions).toBe(false);
});

it("reports provider quota failures without exposing the raw provider reason", async () => {
 const {connection,socket,error}=transportFixture();
 const rejected=expect(connection).rejects.toThrow();
 socket.onclose({code:1011,reason:"You exceeded your current quota, please check your plan and billing details."});
 await rejected;
 expect(error).toHaveBeenCalledWith(expect.stringContaining("Gemini API quota or rate limit"));
});

it("accepts the next reply when a prior turn ended without a provider IDLE event", async () => {
 const {live,state,frame,transcript}=await captureFixture(true);
 state.serverIdle=false;state.playbackEndsAt=0;
 for(let i=0;i<7;i++)frame(.03,.99);
 expect(state.awaitingInterruption).toBe(false);
 for(let i=0;i<50;i++)frame(0);
 state.receive({serverContent:{outputTranscription:{text:'I can hear you.',finished:true}}});
 expect(transcript).toHaveBeenLastCalledWith(expect.objectContaining({text:'I can hear you.'}));
 live.stop();
});

it("reports a capture processor failure and removes all health listeners", async () => {
 const {live,state,error,track}=await captureFixture(false);
 const capture=state.capture;
 capture.onprocessorerror();
 expect(error).toHaveBeenCalledWith(expect.stringContaining("audio processing stopped"));
 expect(capture.onprocessorerror).toBeNull();expect(capture.port.onmessage).toBeNull();
 expect(track.removeEventListener).toHaveBeenCalledTimes(3);
 expect(state.context.removeEventListener).toHaveBeenCalledWith("statechange",state.onAudioContextChanged);
 live.stop();expect(error).toHaveBeenCalledOnce();
});
it("does not stay listening when the capture graph produces no PCM frames", async () => {
 vi.useFakeTimers();const {error}=await captureFixture(false);
 await vi.advanceTimersByTimeAsync(5999);expect(error).not.toHaveBeenCalled();
 await vi.advanceTimersByTimeAsync(1);
 expect(error).toHaveBeenCalledWith(expect.stringContaining("No microphone audio"));
 expect(vi.getTimerCount()).toBe(0);
});
it("accepts continuous zero-valued PCM as healthy silence", async () => {
 vi.useFakeTimers();const {live,error,frame}=await captureFixture(false);
 for(let i=0;i<20;i++){frame(0);await vi.advanceTimersByTimeAsync(1000);}
 expect(error).not.toHaveBeenCalled();live.stop();expect(vi.getTimerCount()).toBe(0);
});
it("automatically resumes an interrupted Safari context only once while recovery is pending", async () => {
 vi.useFakeTimers();const {live,state,error,frame}=await captureFixture(false);
 let resume!:()=>void;
 state.context.state="interrupted";
 state.context.resume=vi.fn(()=>new Promise<void>(resolve=>{resume=()=>{state.context.state="running";resolve();}}));
 state.onAudioContextChanged();state.onAudioContextChanged();await Promise.resolve();
 expect(state.context.resume).toHaveBeenCalledOnce();
 await vi.advanceTimersByTimeAsync(2000);resume();await Promise.resolve();await Promise.resolve();
 state.onAudioContextChanged();frame(0);await vi.advanceTimersByTimeAsync(1000);
 expect(error).not.toHaveBeenCalled();live.stop();expect(vi.getTimerCount()).toBe(0);
});
it("reports blocked audio recovery instead of silently remaining connected", async () => {
 vi.useFakeTimers();const {state,error}=await captureFixture(false);
 state.context.state="interrupted";state.context.resume=vi.fn(()=>new Promise(()=>{}));
 state.onAudioContextChanged();await vi.advanceTimersByTimeAsync(8000);
 expect(error).toHaveBeenCalledWith(expect.stringContaining("could not resume"));
 expect(vi.getTimerCount()).toBe(0);
});
it("cleans up a blocked audio recovery when voice is stopped", async () => {
 vi.useFakeTimers();const {live,state,error}=await captureFixture(false);
 state.context.state="suspended";state.context.resume=vi.fn(()=>new Promise(()=>{}));
 state.onAudioContextChanged();await Promise.resolve();live.stop();
 expect(vi.getTimerCount()).toBe(0);await vi.advanceTimersByTimeAsync(10000);
 expect(error).not.toHaveBeenCalled();
});
it("ignores transient microphone mutes but explains a sustained browser mute", async () => {
 vi.useFakeTimers();const {state,track,error,frame}=await captureFixture(false);
 track.muted=true;state.onMicrophoneMuteChanged();await vi.advanceTimersByTimeAsync(1000);
 track.muted=false;state.onMicrophoneMuteChanged();frame(0);await vi.advanceTimersByTimeAsync(3000);
 expect(error).not.toHaveBeenCalled();
 frame(0);track.muted=true;state.onMicrophoneMuteChanged();await vi.advanceTimersByTimeAsync(3000);
 expect(error).toHaveBeenCalledWith(expect.stringContaining("browser paused the microphone"));
 expect(vi.getTimerCount()).toBe(0);
});

it('correlates provider interruptions and output with actual tool delivery without recording content', async () => {
 vi.useFakeTimers(); vi.stubGlobal('WebSocket',{OPEN:1});
 const {live,state}=fixture(); const events=vi.fn(); state.onLifecycleCheckpoint=events;
 state.socket={readyState:1,send:vi.fn(),close:vi.fn()};
 let finish!:(value:unknown)=>void; state.onToolCall=vi.fn(()=>new Promise(resolve=>{finish=resolve;}));
 state.receive({toolCall:{functionCalls:[{id:'private-id',name:'organization_api',args:{private:'argument'}}]}});
 await Promise.resolve();
 state.receive({serverContent:{interrupted:true}});
 expect(events.mock.calls.at(-1)?.[0]).toMatchObject({stage:'provider_interrupted',sequence:1,activeTools:1});
 expect(events.mock.calls.at(-1)?.[0]).not.toHaveProperty('sinceToolResponseMs');
 finish({private:'result'}); await vi.advanceTimersByTimeAsync(0); await vi.advanceTimersByTimeAsync(125);
 state.receive({serverContent:{outputTranscription:{text:'private answer'}}});
 state.receive({serverContent:{outputTranscription:{text:' continued'}}});
 state.receive({serverContent:{turnComplete:true,interactionStatus:'IDLE'}});
 expect(events.mock.calls.filter(([event])=>event.stage==='provider_output_started')).toHaveLength(1);
 expect(events.mock.calls.at(-1)?.[0]).toMatchObject({stage:'provider_idle',sequence:1,activeTools:0,sinceToolResponseMs:125});
 state.inputActivity.emit({type:'start'}); state.inputActivity.emit({type:'end'});
 expect(events.mock.calls.slice(-2).map(([event])=>[event.stage,event.inputActive])).toEqual([['input_started',true],['input_ended',false]]);
 expect(JSON.stringify(events.mock.calls)).not.toContain('private'); live.stop();
});

it('bounds lifecycle diagnostics and isolates callback failures from speech', () => {
 const {live,state,transcript}=fixture(); const events=vi.fn(()=>{throw Error('diagnostic unavailable');}); state.onLifecycleCheckpoint=events;
 for(let i=0;i<260;i++) state.receive({serverContent:{interrupted:true}});
 expect(events).toHaveBeenCalledTimes(240);
 state.receive({serverContent:{outputTranscription:{text:'Still connected'}}}); expect(transcript).toHaveBeenCalledOnce();
 live.stop(); state.inputActivity.emit({type:'start'}); expect(events).toHaveBeenCalledTimes(240);
});

it('records malformed incoming calls before filtering without logging or executing their contents', async () => {
 vi.useFakeTimers(); vi.stubGlobal('WebSocket',{OPEN:1});
 const {live,state,error}=fixture(); const events=vi.fn(); state.onLifecycleCheckpoint=events;
 state.socket={readyState:1,send:vi.fn(),close:vi.fn()}; state.onToolCall=vi.fn().mockResolvedValue({ok:true});
 state.receive({toolCall:{functionCalls:[null,{id:'',name:'private-name',args:{secret:'private-args'}},{id:'private-id',name:''}]}});
 expect(events.mock.calls.map(([event])=>event.toolCallIssue)).toEqual(['invalid_call','missing_id','missing_name']);
 expect(events.mock.calls.every(([event])=>event.stage==='provider_tool_call_invalid' && event.sequence===0)).toBe(true);
 expect(state.onToolCall).not.toHaveBeenCalled(); expect(state.socket.send).not.toHaveBeenCalled();
 state.receive({toolCall:{functionCalls:[{id:'private-valid',name:'get_organization_agents',args:{}}]}});
 await vi.advanceTimersByTimeAsync(0);
 expect(state.onToolCall).toHaveBeenCalledOnce(); expect(state.toolSequence).toBe(1);
 expect(JSON.stringify(events.mock.calls)).not.toContain('private'); expect(error).not.toHaveBeenCalled(); live.stop();
});

it('identifies invalid call containers and arguments without changing execution policy', () => {
 const {live,state}=fixture(); const events=vi.fn(); state.onLifecycleCheckpoint=events;
 state.recordProviderToolMetadata({toolCall:{functionCalls:{private:'content'}}},{});
 state.recordProviderToolMetadata({toolCall:{functionCalls:[{id:'private',name:'private',args:'private argument'}]}},{});
 expect(events.mock.calls.map(([event])=>event.toolCallIssue)).toEqual(['invalid_function_calls','invalid_arguments']);
 expect(JSON.stringify(events.mock.calls)).not.toContain('private'); expect(state.toolSequence).toBe(0); live.stop();
});

it('records only code execution outcomes while preserving provider speech and not executing code locally', () => {
 const {live,state,transcript,error}=fixture(); const events=vi.fn(); state.onLifecycleCheckpoint=events; state.onToolCall=vi.fn();
 for(const outcome of ['OUTCOME_OK','OUTCOME_FAILED','OUTCOME_DEADLINE_EXCEEDED','OUTCOME_UNSPECIFIED','private provider text',42,null,undefined]) {
  state.receive({serverContent:{modelTurn:{parts:[{codeExecutionResult:{outcome,output:'private output'},executableCode:{code:'private code'}}]}}});
 }
 state.receive({serverContent:{modelTurn:{parts:[{code_execution_result:{outcome:'OUTCOME_FAILED',output:'private output'}}]},outputTranscription:{text:'The requested calculation failed.'}}});
 const outcomes=events.mock.calls.filter(([event])=>event.stage==='provider_code_execution');
 expect(outcomes.map(([event])=>event.codeExecutionOutcome)).toEqual(['OUTCOME_OK','OUTCOME_FAILED','OUTCOME_DEADLINE_EXCEEDED','OUTCOME_UNSPECIFIED','unknown','unknown','unknown','unknown','OUTCOME_FAILED']);
 expect(outcomes.every(([event])=>event.sequence===0 && event.activeTools===0)).toBe(true);
 expect(JSON.stringify(events.mock.calls)).not.toContain('private'); expect(transcript).toHaveBeenCalledOnce();
 expect(state.onToolCall).not.toHaveBeenCalled(); expect(error).not.toHaveBeenCalled(); live.stop();
});

it('bounds provider metadata diagnostics and isolates callback failure from receive handling', () => {
 const {live,state,transcript}=fixture(); const events=vi.fn(()=>{throw Error('private diagnostic failure');}); state.onLifecycleCheckpoint=events;
 state.receive({toolCall:{functionCalls:Array.from({length:300},()=>null)}});
 expect(events).toHaveBeenCalledTimes(240);
 state.receive({serverContent:{modelTurn:{parts:[{codeExecutionResult:{outcome:'OUTCOME_FAILED',output:'private'}}]},outputTranscription:{text:'Still connected'}}});
 expect(events).toHaveBeenCalledTimes(240); expect(transcript).toHaveBeenCalledOnce(); live.stop();
});

it('records a provider malformed-function reason even when no function call reaches the client', async () => {
 vi.useFakeTimers(); const fx=transportFixture(); const events=vi.fn(); fx.state.onLifecycleCheckpoint=events;
 fx.state.onToolCall=vi.fn();
 await fx.deliver(JSON.stringify({setupComplete:{}})); await fx.connection;
 const spoken='I apologize, a system error occurred.';
 await fx.deliver(JSON.stringify({serverContent:{
  outputTranscription:{text:spoken,finished:true}, turnComplete:true,
  turnCompleteReason:'MALFORMED_FUNCTION_CALL', waitingForInput:false, interactionStatus:'IDLE',
  errorMessage:'private provider details', args:{secret:'private argument'},
 }}));
 const event=events.mock.calls.find(([value])=>value.stage==='provider_turn_complete')?.[0];
 expect(event).toEqual({stage:'provider_turn_complete',sequence:0,elapsedMs:expect.any(Number),activeTools:0,inputActive:false,turnCompleteReason:'MALFORMED_FUNCTION_CALL',waitingForInput:false});
 expect(JSON.stringify(events.mock.calls)).not.toContain('private');
 expect(JSON.stringify(events.mock.calls)).not.toContain(spoken);
 expect(fx.transcript).toHaveBeenCalledWith(expect.objectContaining({role:'model',text:spoken}));
 expect(fx.state.onToolCall).not.toHaveBeenCalled(); expect(fx.error).not.toHaveBeenCalled();
 fx.live.stop();
});

it('normalizes unrecognized completion reasons without logging their content or inventing missing reasons', () => {
 const {live,state,error}=fixture(); const events=vi.fn(); state.onLifecycleCheckpoint=events;
 for(const reason of ['private diagnostic text',{text:'private diagnostic text'},42,null]) {
  state.receive({serverContent:{turnComplete:true,turnCompleteReason:reason,waitingForInput:'private flag'}});
  expect(events.mock.calls.at(-1)?.[0]).toMatchObject({stage:'provider_turn_complete',turnCompleteReason:'unknown'});
  expect(events.mock.calls.at(-1)?.[0]).not.toHaveProperty('waitingForInput');
 }
 state.receive({serverContent:{turnComplete:true}});
 expect(events.mock.calls.at(-1)?.[0]).not.toHaveProperty('turnCompleteReason');
 state.receive({serverContent:{turnComplete:true,turn_complete_reason:'NEED_MORE_INPUT',waiting_for_input:true}});
 expect(events.mock.calls.at(-1)?.[0]).toMatchObject({turnCompleteReason:'NEED_MORE_INPUT',waitingForInput:true});
 state.receive({serverContent:{turnCompleteReason:'MALFORMED_FUNCTION_CALL',waitingForInput:true,interactionStatus:'IDLE'}});
 expect(events.mock.calls.at(-1)?.[0]).not.toHaveProperty('turnCompleteReason');
 expect(JSON.stringify(events.mock.calls)).not.toContain('private'); expect(error).not.toHaveBeenCalled(); live.stop();
});

it('honors a GoAway deadline while delivering the current answer and never recreates a connection or action', async () => {
 vi.useFakeTimers(); const fx=transportFixture(); const events=vi.fn(); fx.state.onLifecycleCheckpoint=events;
 await fx.deliver(JSON.stringify({setupComplete:{}})); await fx.connection;
 fx.state.onToolCall=vi.fn().mockResolvedValue({accepted:true});
 await fx.deliver(JSON.stringify({toolCall:{functionCalls:[{id:'operation',name:'organization_api',args:{action:'create_task'}}]}}));
 await vi.advanceTimersByTimeAsync(0);
 await fx.deliver(JSON.stringify({goAway:{timeLeft:'2.5s'}}));
 await fx.deliver(JSON.stringify({serverContent:{outputTranscription:{text:'Your requested action finished.'}}}));
 expect(fx.transcript).toHaveBeenCalledOnce(); expect(fx.error).not.toHaveBeenCalled();
 await vi.advanceTimersByTimeAsync(2499); expect(fx.error).not.toHaveBeenCalled();
 await vi.advanceTimersByTimeAsync(1);
 expect(fx.error).toHaveBeenCalledWith(expect.stringContaining('reached its time limit'));
 expect(fx.sockets).toHaveLength(1); expect(fx.state.onToolCall).toHaveBeenCalledOnce(); expect(fx.stop).toHaveBeenCalledOnce();
 expect(events).toHaveBeenCalledWith(expect.objectContaining({stage:'provider_go_away'}));
});

it('does not invent a GoAway deadline and cancels its timer when stopped', async () => {
 vi.useFakeTimers(); const fx=transportFixture(); await fx.deliver(JSON.stringify({setupComplete:{}})); await fx.connection;
 await fx.deliver(JSON.stringify({go_away:{time_left:'invalid'}})); await vi.advanceTimersByTimeAsync(60_000);
 expect(fx.error).not.toHaveBeenCalled();
 await fx.deliver(JSON.stringify({goAway:{timeLeft:'10s'}})); fx.live.stop(); await vi.advanceTimersByTimeAsync(20_000);
 expect(fx.error).not.toHaveBeenCalled(); expect(fx.stop).toHaveBeenCalledOnce();
});

describe('explicit voice cancellation', () => {
 it('blocks queued writes after stop and does not resume for a hearing question', async () => {
  vi.stubGlobal('WebSocket', {OPEN:1});
  const {live,state} = fixture();
  state.socket = {readyState:1,send:vi.fn(),close:vi.fn()};
  state.onToolCall = vi.fn(async () => ({success:true}));
  state.receive({serverContent:{inputTranscription:{text:'No, stop.',finished:true}}});
  state.receive({serverContent:{inputTranscription:{text:'Can you hear me?',finished:true}}});
  state.receive({toolCall:{functionCalls:[{id:'stale-write',name:'organization_api',args:{action:'create_task'}}]}});
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(state.onToolCall).not.toHaveBeenCalled();
  expect(JSON.stringify(state.socket.send.mock.calls)).toContain('The user stopped work');
  state.receive({serverContent:{inputTranscription:{text:'Create a new task',finished:true}}});
  state.receive({toolCall:{functionCalls:[{id:'new-write',name:'organization_api',args:{action:'create_task'}}]}});
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(state.onToolCall).toHaveBeenCalledOnce(); live.stop();
 });
});


it('keeps a conference listener silent and suppresses microphone and output transcripts', () => {
 vi.useFakeTimers(); vi.stubGlobal('WebSocket', {OPEN:1});
 const {live,state,transcript} = fixture(); state.socket={readyState:1,send:vi.fn(),close:vi.fn()};
 live.setConferenceFloor(false);
 expect(state.sendAudio(new ArrayBuffer(4))).toBe(false);
 state.receive({serverContent:{outputTranscription:{text:'Uninvited speech',finished:true},inputTranscription:{text:'Hello',finished:true}}});
 expect(transcript).not.toHaveBeenCalled();
 expect(live.conferenceContext('CEO: welcome',false)).toBe(true);
 expect(JSON.parse(state.socket.send.mock.calls.at(-1)[0]).clientContent.turnComplete).toBe(false);
 live.setConferenceFloor(true); expect(state.sendAudio(new ArrayBuffer(4))).toBe(true); live.stop();
});
