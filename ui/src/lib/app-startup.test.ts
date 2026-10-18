// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import html from "../../index.html?raw";

const script = html.match(/<script data-app-startup>([\s\S]*?)<\/script>/)![1];
const root = html.match(/<div id="root">([\s\S]*?)<script data-app-startup>/)![0]
  .replace(/<script data-app-startup>$/, "");

function start() {
  vi.useFakeTimers();
  document.body.innerHTML = root;
  const listeners: Record<string, (event: unknown) => void> = {};
  const reload = vi.fn();
  const unregister = vi.fn().mockResolvedValue(true);
  const otherUnregister = vi.fn().mockResolvedValue(true);
  const deleteCache = vi.fn().mockResolvedValue(true);
  const mockWindow = {
    addEventListener: (name: string, callback: (event: unknown) => void) => { listeners[name] = callback; },
    setTimeout,
    clearTimeout,
    location: { reload, href: "https://overviewlabs.ai/", origin: "https://overviewlabs.ai" },
    fetch: vi.fn().mockResolvedValue({ status: 200, headers: new Headers({ "content-type": "text/javascript" }) }),
    caches: { keys: async () => ["whoxos-old", "other-app"], delete: deleteCache },
  };
  const mockNavigator = {
    serviceWorker: { getRegistrations: async () => [
      { active: { scriptURL: "https://overviewlabs.ai/sw.js" }, unregister },
      { active: { scriptURL: "https://overviewlabs.ai/other/sw.js" }, unregister: otherUnregister },
    ] },
  };
  new Function("window", "document", "navigator", "MutationObserver", "URL", script)(
    mockWindow, document, mockNavigator, MutationObserver, URL,
  );
  return { listeners, reload, unregister, otherUnregister, deleteCache };
}

afterEach(() => { document.body.innerHTML = ""; vi.useRealTimers(); });

describe("pre-React app startup", () => {
  it("shows a useful recovery action when the entry module fails", () => {
    const { listeners } = start();
    listeners.error({ message: "Could not load app module" });
    expect(document.getElementById("app-startup-reload")!.hidden).toBe(false);
    expect(document.getElementById("app-startup-error")!.textContent).toBe("Could not load app module");
  });

  it("does not remain a blank page when startup never completes", async () => {
    start();
    await vi.advanceTimersByTimeAsync(15000);
    expect(document.getElementById("app-startup-reload")!.hidden).toBe(false);
    expect(document.getElementById("app-startup-error")!.textContent).toContain("longer than expected");
  });

  it("identifies and checks the failed script without reusing cached responses", async () => {
    const { listeners } = start();
    listeners.error({ target: { tagName: "SCRIPT", src: "https://overviewlabs.ai/assets/app-v2/index.js" } });
    await Promise.resolve();
    expect(document.getElementById("app-startup-error")!.textContent).toContain("/assets/app-v2/index.js");
    expect(document.getElementById("app-startup-error")!.textContent).toContain("HTTP 200 (text/javascript)");
    expect((document.getElementById("app-startup-details") as HTMLDetailsElement).open).toBe(true);
  });

  it("leaves the application alone after React replaces the startup screen", async () => {
    const { listeners } = start();
    document.getElementById("root")!.innerHTML = "<main>Dashboard</main>";
    await Promise.resolve();
    listeners.error({ message: "An unrelated later error" });
    await vi.advanceTimersByTimeAsync(15000);
    expect(document.getElementById("root")!.textContent).toBe("Dashboard");
  });

  it("recovers only this app's caches and service worker", async () => {
    const state = start();
    state.listeners.error({ message: "Network interrupted" });
    document.getElementById("app-startup-reload")!.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(state.unregister).toHaveBeenCalledOnce();
    expect(state.otherUnregister).not.toHaveBeenCalled();
    expect(state.deleteCache).toHaveBeenCalledExactlyOnceWith("whoxos-old");
    expect(state.reload).toHaveBeenCalledOnce();
  });
});
