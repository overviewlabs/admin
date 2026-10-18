import { api } from '@/api/client';

/** Ordered, cancellable admission to the server-wide voice allowance.
 * Numbers are conservative estimates, not Google's tokenizer or a billing ledger.
 */
export class VoiceTokenPacer {
  private controller = new AbortController();
  private tail = Promise.resolve();
  private bytes = 0;
  private credit = 0;
  private creditUntil = 0;
  private prompt: number;
  private reservedInputTokens = 0;
  private firstSetup = true;
  private inputEpoch = 0;
  private inputActive = false;
  private isWaiting = false;
  cancelInput() { this.inputEpoch++; }
  private setWaiting(value: boolean) { if (this.isWaiting !== value) { this.isWaiting = value; this.waiting(value); } }
  constructor(private config: { url: string; setupTokens: number }, private write: (message: unknown) => void,
    private waiting: (value: boolean) => void, private failed: (error: Error) => void) { this.prompt = config.setupTokens; }
  usage(metadata: { promptTokenCount?: number }) {
    const count = metadata?.promptTokenCount;
    if (Number.isSafeInteger(count) && count! >= 0) this.prompt = count!;
  }
  enqueue(message: any): boolean {
    if (this.controller.signal.aborted) return false;
    const encoded = JSON.stringify(message);
    if (this.bytes + encoded.length > 2_000_000) { this.failed(new Error('Voice is waiting for quota and its audio buffer is full. End the call and try again shortly.')); return false; }
    this.bytes += encoded.length;
    const epoch = this.inputEpoch;
    const cancelled = () => this.controller.signal.aborted || (epoch !== this.inputEpoch && !message.setup && !message.toolResponse);
    this.tail = this.tail.then(async () => {
      if (cancelled()) return;
      const audio = message.realtimeInput?.audio?.data;
      const setup = message.setup !== undefined;
      // 16kHz mono PCM16 = 32KB/s. Reserve 32 tokens/s (Google documents 25).
      const added = setup ? 0 : audio ? Math.ceil(audio.length * 0.75 / 1000) : Math.ceil(new TextEncoder().encode(encoded).length / 3);
      // Manual audio turns generate on activityEnd. Context text inside that
      // activity is input, not a second generation charged against the quota.
      if (message.realtimeInput?.activityStart) this.inputActive = true;
      const generation = message.realtimeInput?.activityEnd
        || (message.realtimeInput?.text && !this.inputActive)
        || message.clientContent?.turnComplete || message.toolResponse;
      if (message.realtimeInput?.activityEnd) this.inputActive = false;
      // Setup configures the session; it does not generate a model turn.
      // Reserve only admission here, then charge the configured prompt when
      // generation actually starts. Otherwise a 36K setup plus its first
      // answer consumes 72K before the user can hear anything.
      // New input has already been admitted while streaming. Charge the
      // remaining prior context at generation, not the same input twice.
      const cost = setup ? 1 : added + (generation ? Math.max(0, this.prompt - this.reservedInputTokens) : 0);
      if (cost > 60_000) throw new Error('This voice context is too large for the 65K/min allowance. Start a fresh call.');
      await this.admit(Math.max(1, cost), setup);
      if (cancelled()) return;
      this.prompt += added;
      if (generation) this.reservedInputTokens = 0;
      else this.reservedInputTokens += added;
      this.write(message);
    }).catch(error => { if (!this.controller.signal.aborted) { this.stop(); this.failed(error instanceof Error ? error : new Error('Voice quota check failed.')); } })
      .finally(() => { this.bytes -= encoded.length; });
    return true;
  }
  private async admit(cost: number, setup: boolean) {
    if (Date.now() >= this.creditUntil) this.credit = 0;
    if (this.credit >= cost) { this.credit -= cost; return; }
    const tokens = Math.max(512, cost);
    const id = crypto.randomUUID();
    const started = Date.now();
    for (;;) {
      const result = await api.post<{ allowed: boolean; retryAfterMs: number }>(this.config.url, { id, tokens }, { signal: this.controller.signal });
      if (result.allowed) { this.credit = tokens - cost; this.creditUntil = Date.now() + 2_000; this.setWaiting(false); this.firstSetup = false; return; }
      // Short-lived provider tokens must not be replayed after their deadline.
      if (setup && this.firstSetup && Date.now() - started + result.retryAfterMs > 45_000) throw new Error('The shared voice allowance is busy. Try starting this agent again in a minute.');
      this.setWaiting(true);
      await new Promise<void>((resolve, reject) => {
        const signal = this.controller.signal;
        const done = () => { clearTimeout(timer); signal.removeEventListener('abort', abort); resolve(); };
        const abort = () => { clearTimeout(timer); signal.removeEventListener('abort', abort); reject(new DOMException('Call ended', 'AbortError')); };
        const timer = setTimeout(done, Math.max(50, Math.min(62_000, result.retryAfterMs)));
        signal.addEventListener('abort', abort, { once: true });
        if (signal.aborted) abort();
      });
    }
  }
  stop() { this.controller.abort(); this.credit = 0; }
}
