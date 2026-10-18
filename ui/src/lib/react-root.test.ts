import { describe, expect, it, vi } from "vitest";
import type { Root } from "react-dom/client";
import {
  getOrCreateWHOXOSReactRoot,
  type WHOXOSReactRootHost,
} from "./react-root";

describe("getOrCreateWHOXOSReactRoot", () => {
  it("reuses the existing root when the entry module runs again", () => {
    const host: WHOXOSReactRootHost = {};
    const container = {} as Parameters<typeof getOrCreateWHOXOSReactRoot>[1];
    const root = { render: vi.fn(), unmount: vi.fn() } as unknown as Root;
    const createRoot = vi.fn(() => root);

    expect(getOrCreateWHOXOSReactRoot(host, container, createRoot)).toBe(root);
    expect(getOrCreateWHOXOSReactRoot(host, container, createRoot)).toBe(root);
    expect(createRoot).toHaveBeenCalledTimes(1);
    expect(createRoot).toHaveBeenCalledWith(container);
  });
});
