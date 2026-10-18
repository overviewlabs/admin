import { takeVoiceSpeechWorker, type VoiceSpeechWorker } from './voice-speech-worker';
export { warmVoiceSpeechDetector, clearVoiceSpeechDetectorWarmup } from './voice-speech-worker';

/** Local neural speech classification off the UI thread; no energy fallback. */
export class VoiceSpeechDetector {
  private worker?: Worker;
  private workerLease?: VoiceSpeechWorker;
  private epoch = 0;
  private pendingBytes = 0;
  private stopped = false;
  private rejectStart?: (error: Error) => void;
  private started?: Promise<void>;
  private backlogTimer?: ReturnType<typeof setTimeout>;
  constructor(private onFrame: (data: ArrayBuffer, probability: number) => void, private onError: (message: string) => void) {}
  start() {
    if (this.stopped) return Promise.reject(new Error('Speech detection stopped.'));
    if (this.started) return this.started;
    return this.started = new Promise<void>((resolve, reject) => {
      this.rejectStart = reject;
      const lease = this.workerLease = takeVoiceSpeechWorker();
      this.worker = lease.worker;
      const failed = () => {
        if (this.stopped) return;
        this.stop(); this.onError('Speech detection could not run. Restart voice to try again.');
      };
      lease.onFailure = failed;
      lease.onFrame = data => {
        if (this.stopped) return;
        if (data.epoch === this.epoch) {
          this.pendingBytes = Math.max(0, this.pendingBytes - data.data.byteLength);
          if (this.pendingBytes <= 64_000) { clearTimeout(this.backlogTimer); this.backlogTimer = undefined; }
          this.onFrame(data.data, data.probability);
        }
      };
      void lease.ready.then(() => {
        if (this.stopped) return;
        this.rejectStart = undefined; resolve();
      }, failed);
    });
  }
  push(data: ArrayBuffer) {
    if (this.stopped) return;
    this.pendingBytes += data.byteLength;
    // Worklet and worker messages arrive on separate task queues. After a brief
    // UI stall, microphone frames can be delivered before already-finished
    // inference results. Give the worker's acknowledgements one scheduling turn.
    if (this.pendingBytes > 256_000) { this.failBacklog(); return; }
    if (this.pendingBytes > 64_000 && !this.backlogTimer) {
      this.backlogTimer = setTimeout(() => {
        this.backlogTimer = undefined;
        if (!this.stopped && this.pendingBytes > 64_000) this.failBacklog();
      }, 250);
    }
    this.worker?.postMessage({ type: 'frame', epoch: this.epoch, data }, [data]);
  }
  private failBacklog() {
    this.stop(); this.onError('Speech detection is falling behind. Restart voice to try again.');
  }
  reset() { clearTimeout(this.backlogTimer); this.backlogTimer = undefined; this.epoch++; this.pendingBytes = 0; this.worker?.postMessage({ type: 'reset', epoch: this.epoch }); }
  stop() {
    if (this.stopped) return;
    this.stopped = true; clearTimeout(this.backlogTimer); this.workerLease?.dispose();
    this.rejectStart?.(new Error('Speech detection stopped.')); this.rejectStart = undefined;
  }
}
