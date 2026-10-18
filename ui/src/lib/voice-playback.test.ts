import { afterEach, expect, it, vi } from 'vitest';
import { VoicePlayback } from './voice-playback';
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers()});
function fixture(options: {connectionState?: string; iceConnectionState?: string} = {}) {
  const peers:any[]=[], gains:any[]=[];
  const offer=vi.fn(async()=>({type:'offer'}));
  vi.stubGlobal('RTCPeerConnection',class {
    remoteDescription:any;localDescription:any;ontrack:any;onconnectionstatechange:any;
    connectionState=options.connectionState ?? 'connected';iceConnectionState=options.iceConnectionState ?? 'new';
    constructor(public configuration:any){peers.push(this)}
    createOffer=offer;createAnswer=vi.fn(async()=>({type:'answer'}));addTrack=vi.fn();close=vi.fn();
    setLocalDescription=vi.fn(async(value:any)=>{this.localDescription=value});
    setRemoteDescription=vi.fn(async(value:any)=>{this.remoteDescription=value;if(this.ontrack)this.ontrack({streams:[{}]})});
    addIceCandidate=vi.fn(async()=>{});
  });
  const element={autoplay:false,srcObject:null,muted:false,style:{},setAttribute:vi.fn(),remove:vi.fn(),play:vi.fn(async()=>{}),pause:vi.fn()};
  const appendChild=vi.fn();
  vi.stubGlobal('document',{createElement:()=>element,body:{appendChild}});
  const stop=vi.fn(),disconnect=vi.fn(),error=vi.fn();
  const silence={connect:vi.fn(),disconnect:vi.fn(),start:vi.fn(),stop:vi.fn()};
  const destination={stream:{getTracks:()=>[{stop}]},disconnect};
  const listeners=new Map<string,()=>void>();
  const context={state:'running',destination:{speaker:true},resume:vi.fn(async()=>{context.state='running';listeners.get('statechange')?.();}),addEventListener:vi.fn((name:string,listener:()=>void)=>listeners.set(name,listener)),removeEventListener:vi.fn((name:string)=>listeners.delete(name)),createMediaStreamDestination:()=>destination,createConstantSource:()=>silence,createGain:()=>{const gain={gain:{value:1},connect:vi.fn(),disconnect:vi.fn()};gains.push(gain);return gain;}};
  const playback=new VoicePlayback(context as unknown as AudioContext,error);
  return {playback,peers,element,stop,disconnect,error,silence,gains,appendChild,context,listeners,offer,destination,input:gains[0]};
}
it('prefers only local peers and immediately mutes their queued output on interruption',async()=>{
 vi.useFakeTimers();const {playback,peers,element,input,stop,disconnect}=fixture();await playback.start();
 expect(playback.usesEchoReference).toBe(true);expect(peers.every(peer=>peer.configuration.iceServers.length===0)).toBe(true);
 playback.interrupt();expect(element.muted).toBe(true);expect(input.gain.value).toBe(0);expect(playback.resumeDelay()).toBeGreaterThan(0);
 await vi.advanceTimersByTimeAsync(151);expect(element.muted).toBe(false);expect(input.gain.value).toBe(1);
 playback.stop();playback.stop();expect(stop).toHaveBeenCalledOnce();expect(disconnect).toHaveBeenCalledOnce();
 expect(peers.every(peer=>peer.close.mock.calls.length===1)).toBe(true);expect(element.srcObject).toBeNull();expect(vi.getTimerCount()).toBe(0);
});
it('starts silent remote frames before waiting for autoplay and releases all resources',async()=>{
 const {playback,element,silence,gains,appendChild,destination}=fixture();await playback.start();
 expect(appendChild).toHaveBeenCalledWith(element);expect(element.setAttribute).toHaveBeenCalledWith('playsinline','');
 expect(gains[1].gain.value).toBe(0);expect(silence.connect).toHaveBeenCalledWith(gains[1]);expect(gains[1].connect).toHaveBeenCalledWith(destination);
 expect(silence.start).toHaveBeenCalledOnce();playback.stop();playback.stop();
 expect(silence.stop).toHaveBeenCalledOnce();expect(silence.disconnect).toHaveBeenCalledOnce();expect(gains[1].disconnect).toHaveBeenCalledOnce();expect(element.remove).toHaveBeenCalledOnce();
});
it('uses direct output after 3 seconds when local ICE cannot connect',async()=>{
 vi.useFakeTimers();const {playback,peers,element,context,input,error,silence,stop}=fixture({connectionState:'connecting'});
 let ready=false;const started=playback.start().then(()=>{ready=true});
 await vi.advanceTimersByTimeAsync(2999);expect(ready).toBe(false);
 await vi.advanceTimersByTimeAsync(1);await started;
 expect(playback.usesEchoReference).toBe(false);expect(input.connect).toHaveBeenLastCalledWith(context.destination);
 expect(peers.every(peer=>peer.close.mock.calls.length===1)).toBe(true);expect(element.remove).toHaveBeenCalledOnce();expect(silence.stop).toHaveBeenCalledOnce();expect(stop).toHaveBeenCalledOnce();expect(error).not.toHaveBeenCalled();
 playback.stop();expect(vi.getTimerCount()).toBe(0);
});
it('reuses direct output immediately when this tab recently timed out its local peer connection',async()=>{
 vi.useFakeTimers();const {playback,context,peers,error}=fixture({connectionState:'connecting'});
 const first=playback.start();await vi.advanceTimersByTimeAsync(3000);await first;playback.stop();
 const restarted=new VoicePlayback({...context} as unknown as AudioContext,error);await restarted.start();
 expect(restarted.usesEchoReference).toBe(false);expect(peers).toHaveLength(2);
 expect(restarted.input.connect).toHaveBeenCalledWith(context.destination);expect(error).not.toHaveBeenCalled();
 restarted.stop();expect(vi.getTimerCount()).toBe(0);
});
it('retries the preferred echo-reference path after the tab cooldown expires',async()=>{
 vi.useFakeTimers();const {playback,context,peers,error}=fixture({connectionState:'connecting'});
 const first=playback.start();await vi.advanceTimersByTimeAsync(3000);await first;playback.stop();
 await vi.advanceTimersByTimeAsync(60_001);
 const restarted=new VoicePlayback(context as unknown as AudioContext,error);const started=restarted.start();
 await vi.advanceTimersByTimeAsync(0);expect(peers).toHaveLength(4);
 for(const peer of peers.slice(2)){peer.connectionState='connected';peer.onconnectionstatechange();}
 await started;expect(restarted.usesEchoReference).toBe(true);restarted.stop();expect(vi.getTimerCount()).toBe(0);
});
it('never remembers a browser autoplay refusal as a local connection timeout',async()=>{
 vi.useFakeTimers();const {playback,context,peers,element,error}=fixture();
 element.play.mockRejectedValueOnce(Object.assign(new Error('blocked'),{name:'NotAllowedError'}));
 await expect(playback.start()).rejects.toThrow('stopped');
 const restarted=new VoicePlayback(context as unknown as AudioContext,error);await restarted.start();
 expect(peers).toHaveLength(4);expect(restarted.usesEchoReference).toBe(true);restarted.stop();expect(vi.getTimerCount()).toBe(0);
});
it('settles stalled negotiation by direct fallback and ignores a late rejected offer',async()=>{
 vi.useFakeTimers();const {playback,offer,input,context,error,peers}=fixture();let rejectOffer!:(error:Error)=>void;
 offer.mockImplementation(()=>new Promise((_resolve,reject)=>{rejectOffer=reject}));
 const started=playback.start();await vi.advanceTimersByTimeAsync(3000);await started;
 expect(playback.usesEchoReference).toBe(false);expect(input.connect).toHaveBeenLastCalledWith(context.destination);
 rejectOffer(new Error('closed peer'));await Promise.resolve();await Promise.resolve();
 expect(error).not.toHaveBeenCalled();expect(peers[0].setLocalDescription).not.toHaveBeenCalled();playback.stop();
});
it('falls back when WebRTC is unavailable or setup is rejected',async()=>{
 const {playback,input,context,error}=fixture();vi.stubGlobal('RTCPeerConnection',class {constructor(){throw new Error('unsupported')}});
 await playback.start();expect(input.connect).toHaveBeenLastCalledWith(context.destination);expect(playback.usesEchoReference).toBe(false);expect(error).not.toHaveBeenCalled();playback.stop();
});
it('switches output exactly once if an established peer fails',async()=>{
 const {playback,peers,input,context,element,error}=fixture();await playback.start();
 const changed=peers[1].onconnectionstatechange;peers[1].connectionState='failed';changed();changed();
 expect(playback.usesEchoReference).toBe(false);expect(input.connect.mock.calls.filter(([target]:any[])=>target===context.destination)).toHaveLength(1);
 expect(element.pause).toHaveBeenCalledOnce();expect(input.disconnect).toHaveBeenCalledOnce();expect(error).not.toHaveBeenCalled();playback.stop();
});
it('switches persistent runtime disconnection to direct output after a bounded grace',async()=>{
 vi.useFakeTimers();const {playback,peers,input,context,error}=fixture();await playback.start();
 const changed=peers[1].oniceconnectionstatechange;peers[1].iceConnectionState='disconnected';changed();
 await vi.advanceTimersByTimeAsync(2000);changed();expect(playback.usesEchoReference).toBe(true);
 await vi.advanceTimersByTimeAsync(1000);
 expect(playback.usesEchoReference).toBe(false);expect(input.connect.mock.calls.filter(([target]:any[])=>target===context.destination)).toHaveLength(1);
 expect(peers.every(peer=>peer.close.mock.calls.length===1)).toBe(true);expect(error).not.toHaveBeenCalled();playback.stop();expect(vi.getTimerCount()).toBe(0);
});
it('cancels the disconnect grace only when both peers recover',async()=>{
 vi.useFakeTimers();const {playback,peers,input,context}=fixture();await playback.start();
 for(const peer of peers){peer.connectionState='disconnected';peer.onconnectionstatechange();}
 await vi.advanceTimersByTimeAsync(1000);peers[0].connectionState='connected';peers[0].onconnectionstatechange();expect(vi.getTimerCount()).toBe(1);
 await vi.advanceTimersByTimeAsync(1000);peers[1].connectionState='connected';peers[1].onconnectionstatechange();expect(vi.getTimerCount()).toBe(0);
 await vi.advanceTimersByTimeAsync(3000);expect(playback.usesEchoReference).toBe(true);expect(input.connect).not.toHaveBeenCalledWith(context.destination);playback.stop();
});
it('cleans up the disconnect deadline when stopped before recovery',async()=>{
 vi.useFakeTimers();const {playback,peers,input,context,error}=fixture();await playback.start();
 const changed=peers[0].onconnectionstatechange;peers[0].connectionState='disconnected';changed();expect(vi.getTimerCount()).toBe(1);
 playback.stop();await vi.advanceTimersByTimeAsync(3000);changed();expect(vi.getTimerCount()).toBe(0);
 expect(input.connect).not.toHaveBeenCalledWith(context.destination);expect(error).not.toHaveBeenCalled();
});
it('preserves immediate mute and delayed unmute in direct mode',async()=>{
 vi.useFakeTimers();const {playback,input,context,offer}=fixture();offer.mockRejectedValue(new Error('setup failed'));
 await playback.start();expect(input.connect).toHaveBeenLastCalledWith(context.destination);
 playback.interrupt();expect(input.gain.value).toBe(0);expect(playback.resumeDelay()).toBeGreaterThan(0);
 await vi.advanceTimersByTimeAsync(151);expect(input.gain.value).toBe(1);playback.stop();expect(vi.getTimerCount()).toBe(0);
});
it('keeps a muted output muted when the preferred path fails',async()=>{
 const {playback,peers,input}=fixture();await playback.start();playback.interrupt();
 peers[1].connectionState='failed';peers[1].onconnectionstatechange();
 expect(playback.usesEchoReference).toBe(false);expect(input.gain.value).toBe(0);playback.stop();
});
it('cancellation settles immediately even when negotiation never resolves',async()=>{
 const {playback,offer,error}=fixture();offer.mockImplementation(()=>new Promise(()=>{}));
 const started=playback.start();const rejected=expect(started).rejects.toThrow('stopped');playback.stop();await rejected;expect(error).not.toHaveBeenCalled();
});
it('never revives the remote graph when callbacks arrive after direct fallback',async()=>{
 vi.useFakeTimers();const {playback,peers,element,input,context}=fixture({connectionState:'connecting'});let finishPlay!:()=>void;
 element.play.mockImplementation(()=>new Promise<void>(resolve=>{finishPlay=resolve}));
 const started=playback.start();for(let i=0;i<25;i++)await Promise.resolve();const track=peers[1].ontrack,changed=peers[1].onconnectionstatechange;
 await vi.advanceTimersByTimeAsync(3000);await started;
 finishPlay();track({streams:[{stale:true}]});peers[1].connectionState='connected';changed();await Promise.resolve();
 expect(playback.usesEchoReference).toBe(false);expect(element.srcObject).toBeNull();expect(element.play).toHaveBeenCalledOnce();expect(input.connect).toHaveBeenLastCalledWith(context.destination);playback.stop();
});
it('does not replace explicit browser autoplay refusal with direct output',async()=>{
 const {playback,element,error,input,context}=fixture();element.play.mockRejectedValue(Object.assign(new Error('policy'),{name:'NotAllowedError'}));
 await expect(playback.start()).rejects.toThrow('stopped');expect(error).toHaveBeenCalledWith(expect.stringContaining('blocked voice playback'));
 expect(input.connect).not.toHaveBeenCalledWith(context.destination);
});
it('does not bypass a connected peer whose autoplay remains pending',async()=>{
 vi.useFakeTimers();const {playback,element,error,input,context}=fixture();element.play.mockImplementation(()=>new Promise(()=>{}));
 const started=playback.start();const rejected=expect(started).rejects.toThrow('stopped');await vi.advanceTimersByTimeAsync(15000);await rejected;
 expect(error).toHaveBeenCalledWith(expect.stringContaining('Allow audio playback'));expect(input.connect).not.toHaveBeenCalledWith(context.destination);
});
it('resumes a context suspended before startup or during remote negotiation',async()=>{
 const {playback,context,offer,listeners}=fixture();context.state='suspended';
 offer.mockImplementation(async()=>{context.state='interrupted';listeners.get('statechange')?.();return {type:'offer'};});
 await playback.start();expect(context.resume).toHaveBeenCalledTimes(2);expect(context.state).toBe('running');expect(listeners.has('statechange')).toBe(false);playback.stop();
});
it('never connects direct output while the context is paused',async()=>{
 vi.useFakeTimers();const {playback,context,offer,input,error,listeners}=fixture();
 offer.mockImplementation(async()=>{context.state='interrupted';context.resume.mockImplementation(()=>new Promise(()=>{}));listeners.get('statechange')?.();throw new Error('RTC failed');});
 await expect(playback.start()).rejects.toThrow('stopped');expect(error).toHaveBeenCalledWith(expect.stringContaining('paused by your browser'));
 expect(input.connect).not.toHaveBeenCalledWith(context.destination);expect(vi.getTimerCount()).toBe(0);
});
it('cancels pending resume without creating peers or leaking listeners',async()=>{
 vi.useFakeTimers();const {playback,context,offer,listeners,error}=fixture();let resume!:()=>void;
 context.state='suspended';context.resume.mockImplementation(()=>new Promise<void>(resolve=>{resume=resolve}));
 const started=playback.start();const rejected=expect(started).rejects.toThrow('stopped');for(let i=0;i<5&&!resume;i++)await Promise.resolve();
 playback.stop();await rejected;context.state='running';resume();await Promise.resolve();await Promise.resolve();
 expect(offer).not.toHaveBeenCalled();expect(error).not.toHaveBeenCalled();expect(listeners.has('statechange')).toBe(false);expect(vi.getTimerCount()).toBe(0);
});
it('bounds a context that never resumes without bypassing its permission',async()=>{
 vi.useFakeTimers();const {playback,context,error,input,listeners}=fixture();context.state='suspended';context.resume.mockImplementation(()=>new Promise(()=>{}));
 const started=playback.start();const rejected=expect(started).rejects.toThrow('stopped');await vi.advanceTimersByTimeAsync(15000);await rejected;
 expect(error).toHaveBeenCalledWith(expect.stringContaining('paused by your browser'));expect(input.connect).not.toHaveBeenCalledWith(context.destination);expect(listeners.has('statechange')).toBe(false);expect(vi.getTimerCount()).toBe(0);
});
it('accepts playable ICE when aggregate connectionState lags',async()=>{
 const {playback}=fixture({connectionState:'connecting',iceConnectionState:'completed'});await playback.start();expect(playback.usesEchoReference).toBe(true);playback.stop();
});

const safariUserAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15';
it('bounds Safari local ICE checking to 750ms while preserving direct interruption and cleanup',async()=>{
 vi.useFakeTimers();vi.stubGlobal('navigator',{userAgent:safariUserAgent});
 const {playback,peers,element,context,input,error,stop}=fixture({connectionState:'connecting'});
 let ready=false;const started=playback.start().then(()=>{ready=true;});
 await vi.advanceTimersByTimeAsync(749);expect(ready).toBe(false);
 await vi.advanceTimersByTimeAsync(1);await started;
 expect(playback.usesEchoReference).toBe(false);expect(input.connect).toHaveBeenLastCalledWith(context.destination);
 expect(peers.every(peer=>peer.close.mock.calls.length===1)).toBe(true);expect(element.srcObject).toBeNull();expect(stop).toHaveBeenCalledOnce();
 playback.interrupt();expect(input.gain.value).toBe(0);expect(playback.resumeDelay()).toBeGreaterThan(0);await vi.advanceTimersByTimeAsync(151);expect(input.gain.value).toBe(1);
 expect(error).not.toHaveBeenCalled();playback.stop();expect(vi.getTimerCount()).toBe(0);
});
it('retains Safari echo-reference playback when local peers connect before the deadline',async()=>{
 vi.useFakeTimers();vi.stubGlobal('navigator',{userAgent:safariUserAgent});
 const {playback,peers,input,context}=fixture({connectionState:'connecting'});const started=playback.start();
 await vi.advanceTimersByTimeAsync(500);
 for(const peer of peers){peer.connectionState='connected';peer.onconnectionstatechange();}
 await started;await vi.advanceTimersByTimeAsync(3000);
 expect(playback.usesEchoReference).toBe(true);expect(input.connect).not.toHaveBeenCalledWith(context.destination);playback.stop();
});
it('never uses the shorter Safari deadline to bypass pending autoplay or revive late peers',async()=>{
 vi.useFakeTimers();vi.stubGlobal('navigator',{userAgent:safariUserAgent});
 const healthy=fixture();healthy.element.play.mockImplementation(()=>new Promise(()=>{}));
 const started=healthy.playback.start();const rejected=expect(started).rejects.toThrow('stopped');
 await vi.advanceTimersByTimeAsync(750);expect(healthy.input.connect).not.toHaveBeenCalledWith(healthy.context.destination);
 healthy.playback.stop();await rejected;
 const stalled=fixture({connectionState:'connecting'});let finish!:()=>void;
 stalled.element.play.mockImplementation(()=>new Promise<void>(resolve=>{finish=resolve;}));
 const fallback=stalled.playback.start();await vi.advanceTimersByTimeAsync(0);
 const track=stalled.peers[1].ontrack,changed=stalled.peers[1].onconnectionstatechange;
 await vi.advanceTimersByTimeAsync(750);await fallback;
 finish();track({streams:[{late:true}]});stalled.peers[1].connectionState='connected';changed();await Promise.resolve();
 expect(stalled.playback.usesEchoReference).toBe(false);expect(stalled.element.srcObject).toBeNull();
 expect(stalled.input.connect.mock.calls.filter(([target]:any[])=>target===stalled.context.destination)).toHaveLength(1);
 expect(stalled.error).not.toHaveBeenCalled();stalled.playback.stop();expect(vi.getTimerCount()).toBe(0);
});
it('keeps the full local-peer deadline in Chrome even though its user agent includes Safari',async()=>{
 vi.useFakeTimers();vi.stubGlobal('navigator',{userAgent:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36'});
 const {playback}=fixture({connectionState:'connecting'});let ready=false;const started=playback.start().then(()=>{ready=true;});
 await vi.advanceTimersByTimeAsync(750);expect(ready).toBe(false);
 await vi.advanceTimersByTimeAsync(2250);await started;expect(playback.usesEchoReference).toBe(false);playback.stop();
});
