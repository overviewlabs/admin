export type VoiceInputEvent =
  | { type: "start" }
  | { type: "audio"; data: ArrayBuffer }
  | { type: "end" };

export interface VoiceInputActivityOptions {
  sampleRate?: number;
  preRollMs?: number;
  minimumSpeechMs?: number;
  trailingSilenceMs?: number;
}

/**
 * Continuous microphone turn framing. This is an adaptive energy detector, not
 * speech recognition. Browser noise suppression/AEC still run before capture.
 * Keep the speech's leading consonants and pauses; only finish after sustained
 * quiet instead of allowing provider VAD to end a turn on a partial word.
 */
export class VoiceInputActivity {
  private readonly sampleRate: number;
  private readonly preRollMs: number;
  private readonly minimumSpeechMs: number;
  private readonly trailingSilenceMs: number;
  private preRoll: Array<{ data: ArrayBuffer; duration: number }> = [];
  private preRollDuration = 0;
  private speechDuration = 0;
  private silenceDuration = 0;
  private noiseFloor = 0.001;
  private active = false;

  constructor(private emit: (event: VoiceInputEvent) => void, options: VoiceInputActivityOptions = {}) {
    this.sampleRate = options.sampleRate ?? 16000;
    this.preRollMs = options.preRollMs ?? 400;
    this.minimumSpeechMs = options.minimumSpeechMs ?? 60;
    this.trailingSilenceMs = options.trailingSilenceMs ?? 1000;
  }

  get isActive() { return this.active; }

  push(data: ArrayBuffer, blocked = false, speechProbability?: number) {
    // Never save speaker output in pre-roll and replay it when listening resumes.
    if (blocked) { this.reset(); return; }
    if (!data.byteLength || data.byteLength % 2 !== 0) return;
    const duration = data.byteLength / 2 / this.sampleRate * 1000;
    const view = new DataView(data);
    let sum = 0, squares = 0;
    for (let offset = 0; offset < data.byteLength; offset += 2) {
      const value = view.getInt16(offset, true) / 32768;
      sum += value; squares += value * value;
    }
    const count = data.byteLength / 2;
    // Ignore DC offset, which is not useful speech energy.
    const rms = Math.sqrt(Math.max(0, squares / count - (sum / count) ** 2));
    const threshold = this.active
      ? Math.max(0.003, Math.min(0.025, this.noiseFloor * 2))
      : Math.max(0.006, Math.min(0.035, this.noiseFloor * 3.5));
    const audible = speechProbability === undefined ? rms >= threshold
      : Number.isFinite(speechProbability) && speechProbability >= (this.active ? 0.35 : 0.75);

    if (this.active) {
      this.emit({ type: "audio", data });
      this.silenceDuration = audible ? 0 : this.silenceDuration + duration;
      if (this.silenceDuration >= this.trailingSilenceMs) this.reset();
      return;
    }

    this.preRoll.push({ data, duration });
    this.preRollDuration += duration;
    while (this.preRoll.length > 1 && this.preRollDuration > this.preRollMs) {
      this.preRollDuration -= this.preRoll.shift()!.duration;
    }
    if (!audible) {
      this.speechDuration = 0;
      // Only learn from quiet frames, never train the threshold on the speaker.
      this.noiseFloor += (rms - this.noiseFloor) * 0.04;
      return;
    }
    this.speechDuration += duration;
    if (this.speechDuration < (speechProbability === undefined ? this.minimumSpeechMs : Math.max(128, this.minimumSpeechMs))) return;
    this.active = true;
    this.silenceDuration = 0;
    this.emit({ type: "start" });
    for (const frame of this.preRoll) this.emit({ type: "audio", data: frame.data });
    this.preRoll = []; this.preRollDuration = 0;
  }

  reset() {
    const wasActive = this.active;
    this.active = false;
    this.preRoll = []; this.preRollDuration = 0;
    this.speechDuration = 0; this.silenceDuration = 0;
    if (wasActive) this.emit({ type: "end" });
  }
}
