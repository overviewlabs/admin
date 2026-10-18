// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startMobileViewport } from "./mobile-app";

describe("mobile keyboard viewport", () => {
  let viewport: EventTarget & { height: number; offsetTop: number; scale: number };
  let frames: FrameRequestCallback[];
  let stop: () => void;
  function flush() { const callbacks = frames.splice(0); callbacks.forEach(fn => fn(0)); }
  beforeEach(() => {
    document.documentElement.removeAttribute("style");
    delete document.documentElement.dataset.keyboardOpen;
    frames = [];
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { frames.push(callback); return frames.length; });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
    vi.stubGlobal("innerHeight", 844); vi.stubGlobal("innerWidth", 390);
    vi.spyOn(document.documentElement, "clientHeight", "get").mockReturnValue(844);
    viewport = Object.assign(new EventTarget(), { height: 844, offsetTop: 0, scale: 1 });
    vi.stubGlobal("visualViewport", viewport);
    stop = startMobileViewport(); flush();
  });
  afterEach(() => { stop(); document.body.innerHTML = ""; vi.restoreAllMocks(); vi.unstubAllGlobals(); });
  it("anchors to Safari's panned visible bottom instead of subtracting the keyboard twice", () => {
    viewport.height = 420; viewport.offsetTop = 140; viewport.dispatchEvent(new Event("resize")); flush();
    const style = document.documentElement.style;
    expect(style.getPropertyValue("--app-visible-top")).toBe("140px");
    expect(style.getPropertyValue("--app-visible-height")).toBe("420px");
    expect(844 - parseFloat(style.getPropertyValue("--app-keyboard-inset"))).toBe(viewport.height + viewport.offsetTop);
    expect(document.documentElement.dataset.keyboardOpen).toBe("true");
  });
  it("recognizes keyboards that resize both layout and visual viewports", () => {
    const editor = document.createElement("textarea"); document.body.append(editor); editor.focus();
    vi.spyOn(document.documentElement, "clientHeight", "get").mockReturnValue(420); vi.stubGlobal("innerHeight", 420);
    viewport.height = 420; viewport.dispatchEvent(new Event("resize")); flush();
    expect(document.documentElement.dataset.keyboardOpen).toBe("true");
    expect(document.documentElement.style.getPropertyValue("--app-keyboard-inset")).toBe("0px");
  });
  it("restores the dock when the keyboard closes and does not mistake rotation for a keyboard", () => {
    viewport.height = 420; viewport.dispatchEvent(new Event("resize")); flush();
    viewport.height = 844; viewport.dispatchEvent(new Event("resize")); flush();
    expect(document.documentElement.dataset.keyboardOpen).toBe("false");
    vi.stubGlobal("innerWidth", 844); vi.stubGlobal("innerHeight", 390);
    vi.spyOn(document.documentElement, "clientHeight", "get").mockReturnValue(390);
    viewport.height = 390; viewport.dispatchEvent(new Event("resize")); flush();
    expect(document.documentElement.dataset.keyboardOpen).toBe("false");
  });
  it("reserves the actual composer height so messages remain reachable", () => {
    const dock = document.createElement("div"); dock.setAttribute("data-chat-composer-dock", "");
    vi.spyOn(dock, "getBoundingClientRect").mockReturnValue({ width: 390, height: 132 } as DOMRect);
    document.body.append(dock); window.dispatchEvent(new Event("resize")); flush();
    expect(document.documentElement.dataset.mobileChatComposer).toBe("true");
    expect(document.documentElement.style.getPropertyValue("--app-composer-height")).toBe("132px");
  });
  it("leaves pinch zoom under browser control", () => {
    const before = document.documentElement.style.cssText;
    viewport.scale = 2; viewport.height = 200; viewport.dispatchEvent(new Event("resize")); flush();
    expect(document.documentElement.style.cssText).toBe(before);
  });
});
