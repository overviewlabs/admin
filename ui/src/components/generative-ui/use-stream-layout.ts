import {useLayoutEffect, type RefObject} from "react";
import {parseCssTimeMs} from "../task-chat/motion-tokens";

/** Observe natural content, animate only its frame. Watching the frame itself
 * would feed its animation back into the observer and restart it every frame. */
export function useStreamLayout(frame: RefObject<HTMLDivElement | null>, body: RefObject<HTMLDivElement | null>, streaming: boolean, visible: boolean) {
  useLayoutEffect(() => {
    const outer = frame.current, inner = body.current;
    if (!outer || !inner || !visible || typeof ResizeObserver === "undefined") return;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    let pending = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const clear = () => { if (timer !== null) clearTimeout(timer); timer = null; };
    const release = () => { clear(); outer.style.removeProperty("height"); outer.removeAttribute("data-resizing"); pending = false; };
    const settle = () => { clear(); pending = false; outer.removeAttribute("data-resizing"); if (!streaming) release(); };
    const measure = () => {
      if (reduced?.matches || document.visibilityState === "hidden") { release(); return; }
      const height = Math.max(inner.getBoundingClientRect().height, parseFloat(getComputedStyle(outer).minHeight) || 0);
      if (Math.abs(height - outer.getBoundingClientRect().height) < 1) { if (!streaming) release(); return; }
      if (!streaming && !outer.style.height) return;
      outer.style.height = `${height}px`;
      outer.dataset.resizing = "true";
      pending = true;
      clear();
      const tokens = getComputedStyle(document.documentElement);
      // A cancelled/unchanged CSS transition may have no transitionend.
      // A bounded fallback releases clipping without a polling loop.
      timer = setTimeout(settle, parseCssTimeMs(tokens.getPropertyValue("--motion-duration-base")) + parseCssTimeMs(tokens.getPropertyValue("--motion-duration-fast")));
    };
    if (streaming && !reduced?.matches) outer.style.height = `${outer.getBoundingClientRect().height}px`;
    const observer = new ResizeObserver(measure);
    observer.observe(inner);
    const settled = (event: TransitionEvent) => { if (event.target === outer && event.propertyName === "height") settle(); };
    outer.addEventListener("transitionend", settled);
    reduced?.addEventListener("change", measure);
    measure();
    if (!streaming && !pending) release();
    return () => { release(); observer.disconnect(); outer.removeEventListener("transitionend", settled); reduced?.removeEventListener("change", measure); };
  }, [frame, body, streaming, visible]);
}
