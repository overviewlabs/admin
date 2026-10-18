import type { Look } from "./bloub/engine";

let pointer: { x: number; y: number } | null = null;
let subscribers = 0;
let lastMovement = -Infinity;
const clear = () => { pointer = null; };
const move = (event: PointerEvent) => {
  if (!pointer || event.clientX !== pointer.x || event.clientY !== pointer.y) lastMovement = performance.now();
  pointer = event.pointerType === "touch" ? null : { x: event.clientX, y: event.clientY };
};

/** One pointer listener shared by all visible, animated idle avatars. */
export function trackBloubPointer() {
  if (subscribers++ === 0) {
    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("blur", clear);
    document.documentElement.addEventListener("pointerleave", clear);
  }
  return () => {
    if (--subscribers === 0) {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("blur", clear);
      document.documentElement.removeEventListener("pointerleave", clear);
      clear();
    }
  };
}

export function lookAtPointer(point: { x: number; y: number }, rect: { left: number; top: number; width: number; height: number }): Look | null {
  if (rect.width <= 0 || rect.height <= 0 || !Number.isFinite(point.x + point.y + rect.left + rect.top + rect.width + rect.height)) return null;
  const distance = Math.max(120, rect.width * 2);
  return {
    yaw: Math.tanh((point.x - rect.left - rect.width / 2) / distance) * 42,
    pitch: -Math.tanh((point.y - rect.top - rect.height / 2) / distance) * 28,
    mix: 1, spin: 0, wander: 0,
  };
}

export function currentBloubPointer(now = performance.now()) {
  return now - lastMovement < 1800 ? pointer : null;
}
