import { expect, it } from 'vitest';
import { VoiceTokenBudget } from '../services/voice-token-budget.js';
it('shares one allowance across organizations, agents and keys with a 5K margin', () => {
  const budget = new VoiceTokenBudget(() => 0);
  expect(budget.limit).toBe(65000);
  for (let i = 0; i < 5; i++) expect(budget.reserve(`org${i}/session`, 12000).allowed).toBe(true);
  expect(budget.reserve('another-key', 1)).toEqual({ allowed: false, retryAfterMs: 62000 });
});
it('uses a rolling window including the allocation lifetime and deduplicates retries', () => {
  let now = 0; const budget = new VoiceTokenBudget(() => now);
  budget.reserve('a', 30000); now = 10000; budget.reserve('b', 30000);
  expect(budget.reserve('b', 30000).allowed).toBe(true);
  now = 60000; expect(budget.reserve('c', 30000)).toEqual({ allowed: false, retryAfterMs: 2000 });
  now = 62000; expect(budget.reserve('c', 30000).allowed).toBe(true);
  expect(budget.reserve('d', 1)).toEqual({ allowed: false, retryAfterMs: 10000 });
});
it('rejects invalid and unbounded allocations', () => {
  const budget = new VoiceTokenBudget();
  for (const value of [NaN, Infinity, -1, 0, .5, 60001]) expect(() => budget.reserve('bad', value)).toThrow();
});
