import type { Look } from "./bloub/engine";

/** Per-avatar idle timing. Driven by visible animation time, never wall timers. */
export class BloubIdle {
  private look: Look = { yaw: 0, pitch: 0, mix: 1, spin: 0, wander: 0 };
  private nextLook: number;
  private nextBlink: number;
  private blinkStart = -1;
  private blinkDuration = 0.2;
  private doubleBlink = false;

  constructor(private random: () => number = Math.random, now = 0) {
    this.nextBlink = now + 0.6 + random() * 3.5;
    this.nextLook = now + 1.5 + random() * 2;
  }

  sample(now: number): { look: Look; lid: number } {
    if (now >= this.nextLook) {
      this.look = {
        yaw: (this.random() - 0.5) * 56,
        pitch: (this.random() - 0.5) * 32,
        mix: 1, spin: 0, wander: 0,
      };
      this.nextLook = now + 0.9 + this.random() * 3.6;
    }
    if (now >= this.nextBlink) {
      this.blinkStart = now;
      this.blinkDuration = 0.16 + this.random() * 0.1;
      const repeat = !this.doubleBlink && this.random() < 0.15;
      this.doubleBlink = repeat;
      this.nextBlink = now + (repeat ? this.blinkDuration + 0.12 : 2 + this.random() * 4.5);
    }
    const progress = (now - this.blinkStart) / this.blinkDuration;
    const lid = progress < 0 || progress >= 1 ? 1
      : progress < 0.4 ? 1 - progress / 0.4 : (progress - 0.4) / 0.6;
    // Smooth eyelid acceleration, with faster closing than reopening.
    return { look: this.look, lid: lid * lid * (3 - 2 * lid) };
  }
}
