// A tab that just proved its local peer route cannot connect need not spend
// another three seconds proving it on an immediate retry. Retry the preferred
// echo-reference route after one minute; never persist this across page loads.
const localRtcRetryAfter = new WeakMap<Document, number>();

/** Prefer local WebRTC playout as the microphone's remote-audio AEC reference.
 * If the browser cannot connect its local peers, use the already-authorized
 * AudioContext. Callers must account for the missing reference in direct mode.
 */
export class VoicePlayback {
  readonly input: GainNode;
  private destination?: MediaStreamAudioDestinationNode;
  private sender?: RTCPeerConnection;
  private receiver?: RTCPeerConnection;
  private element?: HTMLAudioElement;
  private silence?: ConstantSourceNode;
  private silenceGain?: GainNode;
  private mode: 'starting' | 'webrtc' | 'direct' = 'starting';
  private rtcAttempt = 0;
  private negotiationComplete = false;
  private audioReady = false;
  private stopped = false;
  private muted = false;
  private muteUntil = 0;
  private unmuteTimer?: ReturnType<typeof setTimeout>;
  private resolveStart?: () => void;
  private rejectStart?: (error: Error) => void;
  private startTimer?: ReturnType<typeof setTimeout>;
  private fallbackTimer?: ReturnType<typeof setTimeout>;
  private disconnectTimer?: ReturnType<typeof setTimeout>;
  private contextResume?: Promise<void>;
  private contextStateListener?: () => void;
  constructor(private context: AudioContext, private onError: (message: string) => void) {
    // Sources keep one stable destination even when the output path changes.
    this.input = context.createGain();
    this.input.gain.value = 1;
  }
  get usesEchoReference() { return this.mode === 'webrtc'; }
  async start() {
    if (this.stopped) throw new Error('Voice playback stopped.');
    if (this.mode !== 'starting') return;
    return new Promise<void>((resolve, reject) => {
      this.resolveStart = resolve; this.rejectStart = reject;
      this.startTimer = setTimeout(() => this.fail(this.context.state !== 'running'
        ? 'Voice audio is paused by your browser. Click Start voice again to enable playback.'
        : this.connected() && !this.audioReady
          ? 'Voice playback did not start. Allow audio playback for this site, then start voice again.'
          : 'Voice audio connection failed. Restart voice to reconnect.'), 15_000);
      this.contextStateListener = () => {
        if (this.stopped) return;
        if (this.context.state === 'running') { this.completeStart(); return; }
        void this.ensureContextRunning().then(() => this.completeStart()).catch(() => {
          this.fail('Your browser paused voice audio and could not resume it. Click Start voice again to enable playback.');
        });
      };
      this.context.addEventListener('statechange', this.contextStateListener);
      void this.startPreferred().catch(error => this.rtcFailed(error));
    });
  }
  private connected() {
    return this.receiver?.connectionState === 'connected'
      || ['connected', 'completed'].includes(this.receiver?.iceConnectionState ?? '');
  }
  private completeStart() {
    if (this.stopped || this.context.state !== 'running') return;
    if (this.mode !== 'direct') {
      if (!this.negotiationComplete || !this.audioReady || !this.connected()) return;
      this.mode = 'webrtc';
    }
    clearTimeout(this.startTimer); clearTimeout(this.fallbackTimer);
    this.removeContextListener();
    const resolve = this.resolveStart;
    this.resolveStart = undefined; this.rejectStart = undefined;
    resolve?.();
  }
  private async startPreferred() {
    await this.ensureContextRunning();
    if (this.stopped) return;
    if (this.context.state !== 'running') throw new Error('Voice audio is paused.');
    if ((localRtcRetryAfter.get(document) ?? 0) > performance.now()) {
      this.useDirectPlayback(); return;
    }
    localRtcRetryAfter.delete(document);
    const attempt = ++this.rtcAttempt;
    const current = () => !this.stopped && this.mode !== 'direct' && attempt === this.rtcAttempt;
    // Safari's local loopback can stay in ICE checking even though direct
    // WebAudio already works. Bound that optional route sooner on WebKit;
    // keep Chromium's longer allowance for healthy peer negotiation.
    const userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent;
    const webkit = /AppleWebKit/.test(userAgent) && /Safari/.test(userAgent)
      && !/Chrome|Chromium|Edg|OPR|Android/.test(userAgent);
    const localPeerDeadlineMs = webkit ? 750 : 3_000;
    this.fallbackTimer = setTimeout(() => {
      if (!current()) return;
      // A connected peer whose play() is still pending may be blocked by the
      // browser's autoplay policy. Do not treat that as an ICE failure.
      if (this.negotiationComplete && this.connected() && !this.audioReady) return;
      this.useDirectPlayback(true);
    }, localPeerDeadlineMs);
    this.destination = this.context.createMediaStreamDestination();
    this.input.connect(this.destination);
    const sender = this.sender = new RTCPeerConnection({ iceServers: [] });
    const receiver = this.receiver = new RTCPeerConnection({ iceServers: [] });
    const element = this.element = document.createElement('audio');
    element.autoplay = true;
    element.setAttribute('playsinline', '');
    element.setAttribute('aria-hidden', 'true');
    element.tabIndex = -1;
    Object.assign(element.style, { position: 'fixed', left: '-9999px', width: '1px', height: '1px', pointerEvents: 'none' });
    document.body.appendChild(element);
    // Safari needs remote frames before play() resolves, even before Gemini
    // has produced any speech. Keep that remote track alive with silent frames.
    this.silence = this.context.createConstantSource();
    this.silenceGain = this.context.createGain();
    this.silenceGain.gain.value = 0;
    this.silence.connect(this.silenceGain); this.silenceGain.connect(this.destination); this.silence.start();
    this.applyMute();
    receiver.ontrack = ({ streams, track }) => {
      if (!current()) return;
      element.srcObject = streams[0] ?? new MediaStream([track]);
      try {
        void element.play().then(() => {
          if (!current()) return;
          this.audioReady = true; this.completeStart();
        }).catch(error => { if (current()) this.rtcFailed(error); });
      } catch (error) { if (current()) this.rtcFailed(error); }
    };
    const toSender: RTCIceCandidate[] = [], toReceiver: RTCIceCandidate[] = [];
    const deliver = (target: RTCPeerConnection, pending: RTCIceCandidate[], candidate: RTCIceCandidate | null) => {
      if (!candidate || !current()) return;
      if (!target.remoteDescription) pending.push(candidate);
      else void target.addIceCandidate(candidate).catch(error => { if (current()) this.rtcFailed(error); });
    };
    sender.onicecandidate = ({ candidate }) => deliver(receiver, toReceiver, candidate);
    receiver.onicecandidate = ({ candidate }) => deliver(sender, toSender, candidate);
    for (const peer of [sender, receiver]) {
      const changed = () => {
        if (!current()) return;
        if (peer.connectionState === 'failed' || peer.iceConnectionState === 'failed') this.rtcFailed();
        else {
          if (this.mode === 'webrtc') {
            const peers = [sender, receiver];
            const recovered = peers.every(candidate =>
              !['disconnected', 'failed', 'closed'].includes(candidate.connectionState)
              && !['disconnected', 'failed', 'closed'].includes(candidate.iceConnectionState)
              && (candidate.connectionState === 'connected'
                || ['connected', 'completed'].includes(candidate.iceConnectionState)));
            if (recovered) {
              clearTimeout(this.disconnectTimer); this.disconnectTimer = undefined;
            } else if (this.disconnectTimer === undefined && peers.some(candidate =>
              candidate.connectionState === 'disconnected' || candidate.iceConnectionState === 'disconnected')) {
              // A brief network transition can recover. Repeated events must
              // not keep extending this deadline while output stays silent.
              this.disconnectTimer = setTimeout(() => {
                this.disconnectTimer = undefined;
                if (current()) this.useDirectPlayback();
              }, 3_000);
            }
          }
          this.completeStart();
        }
      };
      peer.onconnectionstatechange = changed; peer.oniceconnectionstatechange = changed;
    }
    for (const track of this.destination.stream.getTracks()) sender.addTrack(track, this.destination.stream);
    const offer = await sender.createOffer(); if (!current()) return;
    await sender.setLocalDescription(offer); if (!current()) return;
    await receiver.setRemoteDescription(sender.localDescription!); if (!current()) return;
    await Promise.all(toReceiver.splice(0).map(candidate => receiver.addIceCandidate(candidate))); if (!current()) return;
    const answer = await receiver.createAnswer(); if (!current()) return;
    await receiver.setLocalDescription(answer); if (!current()) return;
    await sender.setRemoteDescription(receiver.localDescription!); if (!current()) return;
    await Promise.all(toSender.splice(0).map(candidate => sender.addIceCandidate(candidate))); if (!current()) return;
    this.negotiationComplete = true; this.completeStart();
  }
  private rtcFailed(error?: unknown) {
    if (this.stopped || this.mode === 'direct') return;
    if (error && typeof error === 'object' && 'name' in error && error.name === 'NotAllowedError') {
      this.fail('Your browser blocked voice playback. Allow audio playback for this site, then start voice again.');
      return;
    }
    this.useDirectPlayback();
  }
  private useDirectPlayback(rememberConnectionTimeout = false) {
    if (this.stopped || this.mode === 'direct') return;
    if (this.context.state !== 'running') {
      this.fail('Voice audio is paused by your browser. Click Start voice again to enable playback.');
      return;
    }
    this.teardownRtc();
    try {
      this.input.connect(this.context.destination);
      if (rememberConnectionTimeout) localRtcRetryAfter.set(document, performance.now() + 60_000);
      this.mode = 'direct'; this.applyMute(); this.completeStart();
    } catch { this.fail('Your browser could not enable voice playback. Click Start voice again to allow audio.'); }
  }
  private ensureContextRunning() {
    if (this.stopped) return Promise.reject(new Error('Voice playback stopped.'));
    if (this.context.state === 'running') return Promise.resolve();
    if (this.contextResume) return this.contextResume;
    this.contextResume = Promise.resolve().then(async () => {
      if (this.stopped) throw new Error('Voice playback stopped.');
      if (this.context.state === 'closed') throw new Error('Voice audio is closed.');
      await this.context.resume();
      if (this.stopped) throw new Error('Voice playback stopped.');
    }).finally(() => { this.contextResume = undefined; });
    return this.contextResume;
  }
  private removeContextListener() {
    if (this.contextStateListener) this.context.removeEventListener('statechange', this.contextStateListener);
    this.contextStateListener = undefined;
  }
  /** Silence queued remote playout and direct output immediately on interruption. */
  interrupt() {
    clearTimeout(this.unmuteTimer); this.muted = true; this.applyMute();
    this.muteUntil = performance.now() + 150;
  }
  private applyMute() {
    this.input.gain.value = this.muted ? 0 : 1;
    if (this.element) this.element.muted = this.muted;
  }
  /** Delay fresh audio if needed so old remote jitter-buffer audio drains muted. */
  resumeDelay() {
    if (this.stopped) return 0;
    clearTimeout(this.unmuteTimer);
    const delay = Math.max(0, this.muteUntil - performance.now());
    const unmute = () => { if (!this.stopped) { this.muted = false; this.applyMute(); } };
    if (delay) this.unmuteTimer = setTimeout(unmute, delay); else unmute();
    return delay / 1000;
  }
  private teardownRtc() {
    this.rtcAttempt++; clearTimeout(this.fallbackTimer);
    clearTimeout(this.disconnectTimer); this.disconnectTimer = undefined;
    this.input.disconnect();
    for (const peer of [this.sender, this.receiver]) {
      if (!peer) continue;
      peer.ontrack = null; peer.onicecandidate = null; peer.onconnectionstatechange = null; peer.oniceconnectionstatechange = null;
      peer.close();
    }
    this.sender = undefined; this.receiver = undefined;
    if (this.element) { this.element.pause(); this.element.srcObject = null; this.element.remove(); this.element = undefined; }
    if (this.silence) { this.silence.stop(); this.silence.disconnect(); this.silence = undefined; }
    this.silenceGain?.disconnect(); this.silenceGain = undefined;
    this.destination?.stream.getTracks().forEach(track => track.stop()); this.destination?.disconnect(); this.destination = undefined;
  }
  private fail(message: string) {
    if (this.stopped) return;
    this.stop(); this.onError(message);
  }
  stop() {
    if (this.stopped) return;
    this.stopped = true; clearTimeout(this.startTimer); clearTimeout(this.fallbackTimer); clearTimeout(this.unmuteTimer);
    this.removeContextListener(); this.resolveStart = undefined;
    this.rejectStart?.(new Error('Voice playback stopped.')); this.rejectStart = undefined;
    this.teardownRtc();
  }
}
