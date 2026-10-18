import { describe, expect, it, vi } from "vitest";
import { collectMcpToolPages } from "../services/mcp-tool-pagination.js";

describe("MCP tool catalog pagination", () => {
  it("collects later pages using opaque cursors", async () => {
    const next = vi.fn().mockResolvedValue({ result: { tools: [{ name: "advanced_orders" }] } });
    const cursor = "opaque:/+?value=abc";
    expect(await collectMcpToolPages({ result: { tools: [{ name: "accounts" }], nextCursor: cursor } }, next))
      .toEqual([{ name: "accounts" }, { name: "advanced_orders" }]);
    expect(next).toHaveBeenCalledExactlyOnceWith(cursor, 2);
  });
  it("supports non-paginated and legacy bare catalogs", async () => {
    const next = vi.fn();
    expect(await collectMcpToolPages({ tools: [] }, next)).toEqual([]);
    expect(next).not.toHaveBeenCalled();
  });
  it("continues an empty page that has a cursor", async () => {
    expect(await collectMcpToolPages({ result: { tools: [], nextCursor: "next" } }, async () => ({ result: { tools: [{ name: "last" }] } })))
      .toEqual([{ name: "last" }]);
  });
  it.each([null, "", 7, "x".repeat(16_385)])("rejects malformed cursors rather than publishing a partial catalog: %s", async (nextCursor) => {
    const next = vi.fn();
    await expect(collectMcpToolPages({ result: { tools: [], nextCursor } }, next)).rejects.toThrow("cursor is invalid");
    expect(next).not.toHaveBeenCalled();
  });
  it("rejects repeated cursors", async () => {
    await expect(collectMcpToolPages({ result: { tools: [], nextCursor: "a" } }, async () => ({ result: { tools: [], nextCursor: "a" } })))
      .rejects.toThrow("cursor repeated");
  });
  it("rejects later protocol errors and malformed payloads", async () => {
    for (const bad of [{ error: { code: -32603 } }, { result: {} }, null]) {
      await expect(collectMcpToolPages({ result: { tools: [{ name: "old" }], nextCursor: "a" } }, async () => bad)).rejects.toThrow();
    }
  });
  it("bounds infinite unique pages", async () => {
    const next = vi.fn(async (_cursor, page) => ({ result: { tools: [], nextCursor: String(page) } }));
    await expect(collectMcpToolPages({ result: { tools: [], nextCursor: "1" } }, next)).rejects.toThrow("page limit");
    expect(next).toHaveBeenCalledTimes(99);
  });
  it("bounds total catalog size", async () => {
    await expect(collectMcpToolPages({ result: { tools: Array(10_001).fill({ name: "tool" }) } }, vi.fn())).rejects.toThrow("tool limit");
  });
});
