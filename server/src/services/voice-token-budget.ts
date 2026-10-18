/** One conservative allowance across every organization/key on this API process.
 * Google project IDs are not derivable from API keys, so never split by key.
 * 5K headroom covers estimation; 62s covers the client's 2s allocation lifetime.
 */
export class VoiceTokenBudget {
  readonly limit = 65_000;
  readonly allowance = 60_000;
  private entries = new Map<string, { at: number; tokens: number }>();
  constructor(private now = Date.now) {}
  reserve(id: string, tokens: number) {
    const now = this.now();
    for (const [key, entry] of this.entries) if (entry.at + 62_000 <= now) this.entries.delete(key);
    if (!Number.isSafeInteger(tokens) || tokens < 1 || tokens > this.allowance) throw new Error('Voice input exceeds the minute allowance. Start a fresh call with a shorter request.');
    if (this.entries.has(id)) return { allowed: true, retryAfterMs: 0 };
    let used = [...this.entries.values()].reduce((sum, entry) => sum + entry.tokens, 0);
    if (used + tokens <= this.allowance) {
      this.entries.set(id, { at: now, tokens });
      return { allowed: true, retryAfterMs: 0 };
    }
    for (const entry of this.entries.values()) {
      used -= entry.tokens;
      if (used + tokens <= this.allowance) return { allowed: false, retryAfterMs: Math.max(1, entry.at + 62_000 - now) };
    }
    return { allowed: false, retryAfterMs: 62_000 };
  }
}
export const voiceTokenBudget = new VoiceTokenBudget();
