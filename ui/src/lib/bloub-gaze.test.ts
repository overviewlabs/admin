import { expect, it } from "vitest";
import { BloubGaze } from "./bloub-gaze";
import { BotEngine } from "./bloub/engine";
const target = { yaw: 40, pitch: -20, mix: 1, wander: 0, spin: 0 };
it("converges smoothly without overshooting a stationary cursor", () => {
  const gaze = new BloubGaze();
  let previous = 0;
  for (let i = 0; i < 60; i++) {
    const look = gaze.step(target, 1 / 60);
    expect(look.yaw).toBeGreaterThanOrEqual(previous);
    expect(look.yaw).toBeLessThanOrEqual(40);
    previous = look.yaw;
  }
  expect(previous).toBeCloseTo(40, 4);
});
it("has the same response at 30, 60, and 120 fps", () => {
  const values = [30, 60, 120].map(fps => {
    const gaze = new BloubGaze();
    let look = target;
    for (let i = 0; i < fps / 5; i++) look = gaze.step(target, 1 / fps);
    return look.yaw;
  });
  expect(values[0]).toBeCloseTo(values[1], 8);
  expect(values[1]).toBeCloseTo(values[2], 8);
});
it("renders immediate smoothed gaze without NaN at the same timestamp", () => {
  const engine = new BotEngine(100);
  engine.setLook(new BloubGaze().step(target, 1 / 60), 1, 0);
  expect(JSON.stringify(engine.sample(1))).not.toMatch(/NaN|Infinity/);
});
