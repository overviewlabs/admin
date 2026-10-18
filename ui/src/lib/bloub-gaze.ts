import type { Look } from "./bloub/engine";

/** Exact critically damped spring: continuous velocity, independent of frame rate. */
export class BloubGaze {
  private position = [0, 0, 0];
  private velocity = [0, 0, 0];

  step(target: Look, seconds: number, rate = 28): Look {
    const dt = Math.max(0, Math.min(seconds, 0.1));
    const decay = Math.exp(-rate * dt);
    const goals = [target.yaw, target.pitch, target.mix];
    for (let i = 0; i < goals.length; i++) {
      const offset = this.position[i] - goals[i];
      const impulse = this.velocity[i] + rate * offset;
      this.position[i] = goals[i] + (offset + impulse * dt) * decay;
      this.velocity[i] = (this.velocity[i] - rate * impulse * dt) * decay;
    }
    return { ...target, yaw: this.position[0], pitch: this.position[1], mix: this.position[2] };
  }
}
