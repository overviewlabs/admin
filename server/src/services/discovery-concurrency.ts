// Bound discovery work across all concurrently initializing MCP clients.
// Tasks keep their own current authorization and do not share decisions.
const limit = 8;
let active = 0;
const waiting: Array<() => void> = [];
async function acquire() {
  if (active < limit) { active += 1; return; }
  await new Promise<void>(resolve => waiting.push(resolve));
}
function release() {
  const next = waiting.shift();
  if (next) next(); else active -= 1;
}
export async function mapDiscoveryBounded<T, R>(items: readonly T[], fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  await Promise.all(Array.from({length: Math.min(limit, items.length)}, async () => {
    for (;;) {
      const index = cursor++;
      if (index >= items.length) return;
      await acquire();
      try { results[index] = await fn(items[index], index); }
      finally { release(); }
    }
  }));
  return results;
}
