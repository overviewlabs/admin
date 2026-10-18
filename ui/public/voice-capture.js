// Resample the device stream to mono PCM16 at 16 kHz off the UI thread.
class VoiceCapture extends AudioWorkletProcessor {
  constructor() { super(); this.pending = []; this.weight = 0; this.sum = 0; }
  process(inputs) {
    const channel = inputs[0]?.[0];
    if (!channel) return true;
    const ratio = sampleRate / 16000;
    for (let i = 0; i < channel.length; i++) {
      const value = channel[i];
      let remaining = 1;
      // Integrate fractional sample overlaps so 44.1 kHz is not resampled with
      // alternating, uneven two- and three-sample averages. State crosses blocks.
      while (remaining > 1e-9) {
        const weight = Math.min(remaining, ratio - this.weight);
        this.sum += value * weight; this.weight += weight; remaining -= weight;
        if (this.weight >= ratio - 1e-9) {
          this.pending.push(Math.round(Math.max(-1, Math.min(1, this.sum / ratio)) * 32767));
          this.sum = 0; this.weight = 0;
          if (this.pending.length === 320) {
            const buffer = new ArrayBuffer(640); const view = new DataView(buffer);
            this.pending.forEach((sample, index) => view.setInt16(index * 2, sample, true));
            this.port.postMessage(buffer, [buffer]); this.pending = [];
          }
        }
      }
    }
    return true;
  }
}
registerProcessor('voice-capture', VoiceCapture);
