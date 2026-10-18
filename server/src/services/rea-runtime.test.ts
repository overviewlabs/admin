import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { reaEnabled, ReaSessions, searchReaTools, assertReaToolMode } from "./rea-runtime.js";

describe("R.E.A. runtime", () => {
  it("requires an explicit boolean opt-in", () => {
    for (const value of [undefined, null, {}, { reaMode: false }, { reaMode: "true" }]) expect(reaEnabled(value)).toBe(false);
    expect(reaEnabled({ reaMode: true })).toBe(true);
  });
  it("returns matching tools with their original schemas and limits context", () => {
    const tools = Array.from({ length: 20 }, (_, i) => ({ name: `javascript_${i}`, inputSchema: { type: "object" } }));
    expect(searchReaTools(tools, "javascript", 99)).toHaveLength(10);
    expect(searchReaTools(tools, "javascript_7")[0]).toBe(tools[7]);
    expect(searchReaTools(tools, "unavailable")).toEqual([]);
  });
  it("retains task-mode restrictions for target execution and mutation", () => {
    const read = { name: "inspect", inputSchema: {}, annotations: { readOnlyHint: true } };
    expect(() => assertReaToolMode(read, "ask")).not.toThrow();
    expect(() => assertReaToolMode({ ...read, annotations: {} }, "plan")).toThrow("standard execution");
    expect(() => assertReaToolMode(undefined, "standard")).toThrow("Unknown REA");
  });
  it("isolates agent/run sessions, serializes target changes and closes completed runs", async () => {
    const close = vi.fn(async () => {});
    const start = vi.fn(async () => ({ tools: [], client: {} as never, close }));
    const sessions = new ReaSessions(start);
    const a = { companyId: randomUUID(), agentId: randomUUID(), runId: randomUUID() };
    const events: string[] = [];
    await Promise.all([
      sessions.use(a, async () => { events.push("first"); await new Promise(resolve => setTimeout(resolve, 10)); events.push("finished"); }),
      sessions.use(a, async () => { events.push("second"); }),
    ]);
    expect(events).toEqual(["first", "finished", "second"]);
    expect(start).toHaveBeenCalledTimes(1);
    await sessions.use({ ...a, agentId: randomUUID() }, async () => {});
    expect(start).toHaveBeenCalledTimes(2);
    await sessions.close(a.runId);
    expect(close).toHaveBeenCalledTimes(2);
    await sessions.use(a, async () => {});
    expect(start).toHaveBeenCalledTimes(3);
    await sessions.close(a.runId);
  });
  it("retries failed startup instead of keeping a poisoned session", async () => {
    const start = vi.fn().mockRejectedValueOnce(new Error("missing runtime")).mockResolvedValue({ tools: [], client: {}, close: async () => {} });
    const sessions = new ReaSessions(start);
    const input = { companyId: randomUUID(), agentId: randomUUID(), runId: randomUUID() };
    await expect(sessions.use(input, async () => {})).rejects.toThrow("missing runtime");
    await sessions.use(input, async () => {});
    expect(start).toHaveBeenCalledTimes(2);
    await sessions.close(input.runId);
  });
});
