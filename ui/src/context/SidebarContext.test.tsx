// @vitest-environment jsdom

import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SidebarProvider, useSidebar } from "./SidebarContext";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let capturedValue: ReturnType<typeof useSidebar> | null = null;

function Capture() {
  capturedValue = useSidebar();
  return null;
}

function act(callback: () => void) {
  flushSync(callback);
}

function renderProvider(): { root: Root; host: HTMLDivElement } {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(
      <SidebarProvider>
        <Capture />
      </SidebarProvider>,
    );
  });
  return { root, host };
}

describe("SidebarContext", () => {
  let active: { root: Root; host: HTMLDivElement } | null = null;

  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("whoxos.sidebar.collapsed", "1");
    capturedValue = null;
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      writable: true,
      value: 1280,
    });
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  afterEach(() => {
    if (active) {
      act(() => active!.root.unmount());
      active.host.remove();
      active = null;
    }
    localStorage.clear();
  });

  it("keeps the global navigation expanded even when legacy collapsed state exists", () => {
    active = renderProvider();

    expect(capturedValue?.collapsed).toBe(false);
    expect(capturedValue?.collapseLocked).toBe(false);
    expect(capturedValue?.peeking).toBe(false);
  });

  it("collapses and expands on request without automatic hover peeking", () => {
    active = renderProvider();

    act(() => capturedValue?.setCollapsed(true));
    expect(capturedValue?.collapsed).toBe(true);
    expect(localStorage.getItem("overviewlabs.sidebar.collapsed")).toBe("1");
    act(() => capturedValue?.toggleCollapsed());
    act(() => capturedValue?.setForceCollapsed(true));
    act(() => capturedValue?.setPeeking(true));

    expect(capturedValue?.collapsed).toBe(false);
    expect(capturedValue?.collapseLocked).toBe(false);
    expect(capturedValue?.peeking).toBe(false);
  });

  it("restores the desktop preference but keeps the mobile drawer expanded", () => {
    localStorage.setItem("overviewlabs.sidebar.collapsed", "1");
    active = renderProvider();
    expect(capturedValue?.collapsed).toBe(true);
    act(() => active!.root.unmount());
    active.host.remove();
    window.innerWidth = 390;
    active = renderProvider();
    expect(capturedValue?.collapsed).toBe(false);
  });

  it("tracks route requests for compatibility without collapsing the navigation", () => {
    active = renderProvider();

    act(() => capturedValue?.setRouteRequestsCollapsed(true));

    expect(capturedValue?.routeRequestsCollapsed).toBe(true);
    expect(capturedValue?.collapsed).toBe(false);
  });

  it("retains sidebarOpen and toggleSidebar for the mobile drawer", () => {
    active = renderProvider();
    const initial = capturedValue?.sidebarOpen;

    act(() => capturedValue?.toggleSidebar());

    expect(capturedValue?.sidebarOpen).toBe(!initial);
  });
});
