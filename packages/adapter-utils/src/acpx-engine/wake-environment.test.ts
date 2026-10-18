import { spawnSync } from "node:child_process";
import { expect, it } from "vitest";
import { boundedWakeEnvironment } from "./wake-environment.js";
it("keeps small context intact and bounds multibyte oversized history for real process startup", () => {
  expect(boundedWakeEnvironment(null)).toBeNull();
  const small = JSON.stringify({ reason: "scheduled", issue: { id: "task" } });
  expect(boundedWakeEnvironment(small)).toBe(small);
  const large = JSON.stringify({ version: 1, reason: "scheduled", issue: { id: "task", identifier: "TASK-80", description: "𐐀".repeat(70000) } });
  const bounded = boundedWakeEnvironment(large)!;
  expect(Buffer.byteLength(bounded)).toBeLessThan(48 * 1024);
  expect(JSON.parse(bounded)).toMatchObject({ issue: { id: "task", identifier: "TASK-80" }, environmentSummaryOnly: true });
  const result = spawnSync(process.execPath, ["-e", "JSON.parse(process.env.WHOXOS_WAKE_PAYLOAD_JSON)"], { env: { ...process.env, WHOXOS_WAKE_PAYLOAD_JSON: bounded } });
  expect(result.error).toBeUndefined();
  expect(result.status).toBe(0);
  expect(JSON.parse(large).issue.description.length).toBe(140000);
});
