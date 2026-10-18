export type CallTone = 'start' | 'join' | 'leave' | 'failure' | 'end';
const notes: Record<CallTone, number[]> = { start: [440, 660], join: [660, 880], leave: [660, 440], failure: [330, 294], end: [440, 330] };
/** Original quiet sine tones. Errors never block a call; no downloaded audio. */
export class VoiceCallTones {
  private context?: AudioContext;
  unlock() {
    try { this.context ??= new AudioContext(); void this.context.resume().catch(() => {}); } catch {}
  }
  play(event: CallTone) {
    const ctx = this.context;
    if (!ctx || ctx.state !== 'running') return;
    notes[event].forEach((frequency, i) => {
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      const at = ctx.currentTime + i * 0.11;
      osc.frequency.value = frequency; osc.type = 'sine';
      gain.gain.setValueAtTime(0, at); gain.gain.linearRampToValueAtTime(0.025, at + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.19);
      osc.connect(gain); gain.connect(ctx.destination); osc.start(at); osc.stop(at + 0.2);
      osc.onended = () => { osc.disconnect(); gain.disconnect(); };
    });
  }
  close() { const ctx = this.context; this.context = undefined; if (ctx) setTimeout(() => void ctx.close().catch(() => {}), 350); }
}
