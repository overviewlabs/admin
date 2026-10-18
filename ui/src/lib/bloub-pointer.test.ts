import { describe, expect, it } from "vitest";
import { lookAtPointer } from "./bloub-pointer";
const rect = { left: 100, top: 100, width: 40, height: 40 };
describe("cursor gaze", () => {
  it("looks toward the cursor relative to each avatar", () => {
    expect(lookAtPointer({ x: 120, y: 120 }, rect)).toMatchObject({ yaw: 0, wander: 0 });
    expect(lookAtPointer({ x: 120, y: 120 }, rect)!.pitch).toBeCloseTo(0);
    expect(lookAtPointer({ x: 0, y: 0 }, rect)!.yaw).toBeLessThan(0);
    expect(lookAtPointer({ x: 240, y: 240 }, rect)!.pitch).toBeLessThan(0);
    expect(lookAtPointer({ x: 120, y: 120 }, { ...rect, left: 300 })!.yaw).toBeLessThan(0);
  });
  it("bounds gaze so eyes stay on the face", () => {
    const look = lookAtPointer({ x: 1e6, y: -1e6 }, rect)!;
    expect(look.yaw).toBeLessThanOrEqual(42);
    expect(look.pitch).toBeLessThanOrEqual(28);
  });
  it("ignores hidden or invalid geometry", () => {
    expect(lookAtPointer({ x: 0, y: 0 }, { ...rect, width: 0 })).toBeNull();
    expect(lookAtPointer({ x: NaN, y: 0 }, rect)).toBeNull();
  });
});
