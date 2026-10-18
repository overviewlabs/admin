/** One clock for all visible agent avatars; never runs in hidden tabs. */
const listeners = new Set<(time: number) => void>();
let raf = 0;
function tick(time: number) {
  raf = 0;
  if (document.hidden || listeners.size === 0) return;
  for (const listener of listeners) listener(time);
  raf = requestAnimationFrame(tick);
}
function visibility() {
  if (document.hidden) { cancelAnimationFrame(raf); raf = 0; }
  else if (listeners.size && !raf) raf = requestAnimationFrame(tick);
}
export function subscribeBloubAnimation(listener: (time: number) => void) {
  listeners.add(listener);
  if (listeners.size === 1) document.addEventListener('visibilitychange', visibility);
  visibility();
  return () => {
    listeners.delete(listener);
    if (!listeners.size) {
      cancelAnimationFrame(raf); raf = 0;
      document.removeEventListener('visibilitychange', visibility);
    }
  };
}
