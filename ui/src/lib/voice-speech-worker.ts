type SpeechFrame = { type: 'frame'; epoch: number; data: ArrayBuffer; probability: number };

/** One never-used classifier may wait for a click. An adopted worker never
 * returns to this pool, so recurrent state cannot cross voice sessions. */
let idleWorker: VoiceSpeechWorker | undefined;
const activeWorkers = new Set<VoiceSpeechWorker>();

export class VoiceSpeechWorker {
  readonly worker: Worker;
  readonly ready: Promise<void>;
  onFrame?: (frame: SpeechFrame) => void;
  onFailure?: () => void;
  private disposed = false;
  private prepared = false;
  private resolveReady?: () => void;
  private rejectReady?: (error: Error) => void;
  private loadTimer?: ReturnType<typeof setTimeout>;
  private idleTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    this.worker = new Worker('/voice-speech-worker.js?v=2', { type: 'module' });
    this.ready = new Promise<void>((resolve, reject) => {
      this.resolveReady = resolve; this.rejectReady = reject;
    });
    // A speculative worker can fail before anyone adopts it. Always attach a
    // rejection handler immediately, while keeping the original result intact.
    void this.ready.catch(() => {});
    this.loadTimer = setTimeout(() => this.fail(), 30_000);
    this.worker.onerror = () => this.fail();
    this.worker.onmessage = ({ data }) => {
      if (this.disposed) return;
      if (data.type === 'error') { this.fail(); return; }
      if (data.type === 'ready') {
        if (this.prepared) return;
        this.prepared = true; clearTimeout(this.loadTimer);
        this.resolveReady?.(); this.resolveReady = undefined; this.rejectReady = undefined;
      } else if (data.type === 'frame' && this.prepared && activeWorkers.has(this)) {
        this.onFrame?.(data);
      }
    };
  }

  keepIdle() { this.idleTimer = setTimeout(() => this.dispose(), 5 * 60_000); }
  adopt() { clearTimeout(this.idleTimer); activeWorkers.add(this); }
  private fail() {
    if (this.disposed) return;
    const failed = this.onFailure;
    this.dispose(); failed?.();
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    clearTimeout(this.loadTimer); clearTimeout(this.idleTimer);
    if (idleWorker === this) idleWorker = undefined;
    activeWorkers.delete(this);
    this.onFrame = undefined; this.onFailure = undefined;
    this.worker.terminate();
    this.rejectReady?.(new Error('Speech detection stopped.'));
    this.resolveReady = undefined; this.rejectReady = undefined;
  }
}

/** Static same-origin model work only: no microphone, audio context or API. */
export function warmVoiceSpeechDetector(): Promise<void> {
  if (activeWorkers.size) return Promise.resolve();
  try {
    if (!idleWorker) { idleWorker = new VoiceSpeechWorker(); idleWorker.keepIdle(); }
    return idleWorker.ready.catch(() => {});
  } catch { return Promise.resolve(); }
}

export function clearVoiceSpeechDetectorWarmup() { idleWorker?.dispose(); }

export function takeVoiceSpeechWorker(): VoiceSpeechWorker {
  const worker = idleWorker ?? new VoiceSpeechWorker();
  idleWorker = undefined;
  worker.adopt();
  return worker;
}
