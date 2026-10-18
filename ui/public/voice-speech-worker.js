import * as ort from './voice-vad/ort.wasm.min.mjs';
// Silero v5: 512 new samples + 64 preceding samples at 16 kHz. Inference is local.
ort.env.wasm.numThreads = 1;
ort.env.wasm.wasmPaths = new URL('./voice-vad/', import.meta.url).href;
let session, state, rate, epoch = 0, resetNeeded = true, running = false;
let context = new Float32Array(64), samples = [], queue = [];
function resetState() {
  state?.dispose();
  state = new ort.Tensor('float32', new Float32Array(256), [2, 1, 128]);
  context = new Float32Array(64); resetNeeded = false;
}
async function drain() {
  if (running || !session) return;
  running = true;
  try {
    while (queue.length) {
      const frame = queue.shift();
      if (frame.epoch !== epoch) continue;
      if (resetNeeded) resetState();
      const input = new Float32Array(576); input.set(context);
      const pcm = new Int16Array(frame.data);
      for (let i = 0; i < 512; i++) input[64 + i] = pcm[i] / 32768;
      const tensor = new ort.Tensor('float32', input, [1, 576]);
      let output;
      try { output = await session.run({ input: tensor, state, sr: rate }); }
      finally { tensor.dispose(); }
      const probability = Number(output.output.data[0]);
      state.dispose(); state = output.stateN; output.output.dispose();
      if (frame.epoch !== epoch) continue;
      if (!Number.isFinite(probability)) throw new Error('Invalid speech probability');
      context = input.slice(-64);
      self.postMessage({ type: 'frame', epoch, probability, data: frame.data }, [frame.data]);
    }
  } catch { self.postMessage({ type: 'error' }); queue = []; }
  finally { running = false; }
}
self.onmessage = ({ data }) => {
  if (data.type === 'reset') {
    epoch = data.epoch; samples = []; queue = []; resetNeeded = true; return;
  }
  if (data.type !== 'frame' || data.epoch !== epoch) return;
  samples.push(...new Int16Array(data.data));
  while (samples.length >= 512) {
    const frame = new Int16Array(samples.splice(0, 512));
    queue.push({ epoch, data: frame.buffer });
  }
  void drain();
};
try {
  session = await ort.InferenceSession.create(new URL('./voice-vad/silero-v5.onnx', import.meta.url).href, { executionProviders: ['wasm'] });
  rate = new ort.Tensor('int64', BigInt64Array.from([16000n]), [1]);
  // Compile the first inference before live capture starts. Cold WASM setup
  // must not be counted as a stalled microphone queue.
  resetState();
  const warmup = new ort.Tensor('float32', new Float32Array(576), [1, 576]);
  try {
    const output = await session.run({ input: warmup, state, sr: rate });
    output.output.dispose(); output.stateN.dispose();
  } finally { warmup.dispose(); }
  resetState();
  self.postMessage({ type: 'ready' });
} catch { self.postMessage({ type: 'error' }); }
