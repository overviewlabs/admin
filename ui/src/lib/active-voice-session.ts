/** The persistent voice controller owns this signal for the lifetime of a call. */
let active = false;
const listeners = new Set<(active: boolean) => void>();

export function setVoiceSessionActive(nextActive: boolean): void {
  if (nextActive === active) return;
  active = nextActive;
  for (const listener of [...listeners]) listener(active);
}

export function isVoiceSessionActive(): boolean {
  return active;
}

export function subscribeVoiceSessionActivity(listener: (active: boolean) => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

// Sign-out must release the microphone before auth cookies/cache are changed.
const resetListeners = new Set<() => void>();
export function requestVoiceSessionReset(): void {
  for (const listener of [...resetListeners]) listener();
}
export function subscribeVoiceSessionReset(listener: () => void): () => void {
  resetListeners.add(listener);
  return () => { resetListeners.delete(listener); };
}
