import {parseCssTimeMs} from "@/components/task-chat/motion-tokens";

/** Upward movement always releases follow. A reader reattaches only at the
 * actual bottom, so the old near-bottom threshold cannot undo their gesture. */
export function shouldFollowChatScroll(pinned: boolean, previousTop: number, top: number, distance: number, threshold: number) {
  return top >= previousTop - 1 && distance <= (pinned ? threshold : 1);
}

/** Retarget one short-lived animation as content grows. Native smooth scroll
 * restarts on every chunk; assigning scrollTop instead jumps on every chunk. */
export function createChatScrollFollower(element: HTMLElement) {
  let frame: number | null = null, previous = 0, duration = 0, written = element.scrollTop;
  const bottom = () => Math.max(0, element.scrollHeight - element.clientHeight);
  const cancel = () => { if (frame !== null) cancelAnimationFrame(frame); frame = null; };
  const setTop = (value: number) => { element.scrollTop = value; written = element.scrollTop; };
  const tick = (now: number) => {
    // Scrollbar drags and native input can move before the scroll listener
    // runs. Never overwrite that position with the next animation frame.
    if (Math.abs(element.scrollTop - written) > 1) { cancel(); return; }
    const target = bottom(), distance = target - element.scrollTop;
    if (document.visibilityState === "hidden") { cancel(); return; }
    if (Math.abs(distance) <= 1 || duration <= 0) { setTop(target); frame = null; return; }
    const elapsed = Math.max(0, now - previous); previous = now;
    const step = distance * (1 - Math.exp(-6 * elapsed / duration));
    // Integer scroll offsets must still converge instead of rounding a tiny
    // final step to zero and leaving a requestAnimationFrame loop alive.
    setTop(element.scrollTop + Math.sign(distance) * Math.min(Math.abs(distance), Math.max(1, Math.abs(step))));
    frame = requestAnimationFrame(tick);
  };
  return {
    get active() { return frame !== null; },
    ownsPosition() { return Math.abs(element.scrollTop - written) <= 1; },
    follow(immediate = false) {
      if (immediate || typeof requestAnimationFrame !== "function" || typeof window.matchMedia !== "function" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) { cancel(); setTop(element.scrollHeight); return; }
      if (document.visibilityState === "hidden" || frame !== null || Math.abs(bottom() - element.scrollTop) <= 1) return;
      duration = parseCssTimeMs(getComputedStyle(document.documentElement).getPropertyValue("--motion-duration-base"));
      if (duration <= 0) { setTop(element.scrollHeight); return; }
      previous = performance.now(); written = element.scrollTop;
      frame = requestAnimationFrame(tick);
    },
    cancel,
  };
}
