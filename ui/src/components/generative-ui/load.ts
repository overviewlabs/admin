let pending: Promise<typeof import("./InteractiveAnswer")> | undefined;
/** Warm the lazy renderer only when a user starts composing, not at idle. */
export function loadInteractiveAnswer() {
  pending ??= import("./InteractiveAnswer").catch(error => { pending = undefined; throw error; });
  return pending;
}
