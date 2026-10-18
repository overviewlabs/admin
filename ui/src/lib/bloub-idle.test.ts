import { describe, expect, it } from "vitest";
import { BloubIdle } from "./bloub-idle";
import { BotEngine } from "./bloub/engine";

describe("natural idle behavior", () => {
  it("continues blinking beyond the upstream 15-minute schedule", () => {
    const idle = new BloubIdle(() => 0.5, 1800);
    let closedFrames = 0;
    for (let t = 1800; t < 1830; t += 1 / 24) {
      const frame = idle.sample(t);
      if (frame.lid < 0.5) closedFrames++;
      expect(frame.lid).toBeGreaterThanOrEqual(0);
      expect(frame.lid).toBeLessThanOrEqual(1);
    }
    expect(closedFrames).toBeGreaterThan(5);
  });
  it("gives individual avatars independent blink timing", () => {
    const a = new BloubIdle(() => 0.35);
    const b = new BloubIdle(() => 0.8);
    a.sample(0); b.sample(0);
    a.sample(1.83);
    expect(a.sample(1.91).lid).toBeLessThan(b.sample(1.91).lid);
  });
  it("chooses varied independent targets without alternating back to center", () => {
    let seed = 12345;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    const idle = new BloubIdle(random);
    const targets = [];
    for (let t = 10; t <= 300; t += 10) {
      const { look } = idle.sample(t);
      targets.push(look);
      expect(Math.abs(look.yaw)).toBeLessThanOrEqual(28);
      expect(Math.abs(look.pitch)).toBeLessThanOrEqual(16);
    }
    expect(new Set(targets.map(p => `${p.yaw},${p.pitch}`)).size).toBe(30);
    expect(targets.filter(p => p.yaw === 0 && p.pitch === 0)).toHaveLength(0);
    expect(targets.some(p => p.yaw < 0)).toBe(true);
    expect(targets.some(p => p.yaw > 0)).toBe(true);
  });
  it("applies blink closure through the engine without changing the body", () => {
    const engine = new BotEngine(100);
    const open = engine.sample(2, 1), closed = engine.sample(2, 0);
    expect(open.bodyPath).toBe(closed.bodyPath);
    expect(open.eyes).not.toEqual(closed.eyes);
  });
});
