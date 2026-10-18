/** Serial, coalesced maintenance; foreground requests and execution deadlines bypass this lane. */
export function createBackgroundSweeps(options: {
  gapMs?: number;
  now?: () => number;
  onError: (key: string, error: unknown) => void;
}) {
  const now = options.now ?? Date.now;
  const gapMs = options.gapMs ?? 250;
  const pending = new Map<string, Promise<void>>();
  const lastStarted = new Map<string, number>();
  const queue: { key: string; work: () => Promise<unknown>; done: () => void }[] = [];
  let active = false;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  function drain() {
    timer = undefined;
    if (active || stopped) return;
    const job = queue.shift();
    if (!job) return;
    active = true;
    lastStarted.set(job.key, now());
    void Promise.resolve().then(job.work)
      .catch(error => options.onError(job.key, error))
      .finally(() => {
        active = false;
        pending.delete(job.key);
        job.done();
        if (!stopped && queue.length) {
          timer = setTimeout(drain, gapMs);
          timer.unref?.();
        }
      });
  }

  return {
    schedule(key: string, work: () => Promise<unknown>, intervalMs = 0): Promise<void> | null {
      if (stopped || pending.has(key)) return null;
      const previous = lastStarted.get(key);
      if (previous !== undefined && now() - previous < intervalMs) return null;
      let done!: () => void;
      const completion = new Promise<void>(resolve => { done = resolve; });
      pending.set(key, completion);
      queue.push({ key, work, done });
      if (!active && !timer) drain();
      return completion;
    },
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      timer = undefined;
      for (const job of queue.splice(0)) {
        pending.delete(job.key);
        job.done();
      }
    },
  };
}
