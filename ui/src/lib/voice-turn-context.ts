import type { VoiceInputEvent } from "./voice-input-activity";

type PendingTurn = {
  controller: AbortController;
  events: VoiceInputEvent[];
  bytes: number;
  timer?: ReturnType<typeof setTimeout>;
};

/** Fetch context only for real speech, without letting a slow read delay audio. */
export class VoiceTurnContext {
  private pending?: PendingTurn;
  private stopped = false;

  constructor(
    private fetchContext: (signal: AbortSignal) => Promise<unknown>,
    private sendContext: (context: unknown) => boolean,
    private sendInput: (event: VoiceInputEvent) => boolean,
  ) {}

  get isPending() { return this.pending !== undefined; }

  push(event: VoiceInputEvent) {
    if (this.stopped) return;
    if (event.type === "start") {
      this.discard();
      const turn: PendingTurn = { controller: new AbortController(), events: [event], bytes: 0 };
      this.pending = turn;
      turn.timer = setTimeout(() => this.release(turn), 750);
      // Attach both handlers immediately, including synchronous fetch failures.
      void Promise.resolve().then(() => {
        if (this.stopped || this.pending !== turn) return;
        return this.fetchContext(turn.controller.signal);
      }).then(context => this.release(turn, context), () => this.release(turn));
      return;
    }
    const turn = this.pending;
    if (turn) {
      if (event.type === "audio" && turn.bytes + event.data.byteLength > 64 * 1024) {
        this.release(turn);
        if (!this.stopped) this.sendInput(event);
      } else {
        turn.events.push(event);
        if (event.type === "audio") turn.bytes += event.data.byteLength;
      }
    } else this.sendInput(event);
  }

  private release(turn: PendingTurn, context?: unknown) {
    if (this.stopped || this.pending !== turn) return;
    this.pending = undefined;
    clearTimeout(turn.timer);
    turn.controller.abort();
    // Explicitly expire earlier snapshots if this turn's read did not finish.
    // The provider retains conversation history, so omission would look fresh.
    // Snapshot text belongs to this realtime activity. An unfinished
    // clientContent turn can leave Gemini waiting instead of answering audio.
    const start = turn.events.shift();
    if (!start || !this.sendInput(start)) return;
    if (!this.sendContext(context ?? { available: false })) return;
    for (const event of turn.events) {
      if (this.stopped || !this.sendInput(event)) break;
    }
    turn.events = [];
  }

  private discard() {
    const turn = this.pending;
    this.pending = undefined;
    if (!turn) return;
    clearTimeout(turn.timer);
    turn.controller.abort();
    turn.events = [];
  }

  cancel() { this.discard(); }

  stop() { this.stopped = true; this.discard(); }
}
