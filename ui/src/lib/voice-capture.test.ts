import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { expect, it } from "vitest";

function fixture(sampleRate = 16000) {
  const frames: ArrayBuffer[] = [];
  let Processor: any;
  const scope = {
    sampleRate, currentTime: 0,
    AudioWorkletProcessor: class { port = { postMessage: (frame: ArrayBuffer) => frames.push(frame), onmessage: (_event: any) => {} }; },
    registerProcessor: (_name: string, value: any) => { Processor = value; },
  };
  runInNewContext(readFileSync(new URL("../../public/voice-capture.js", import.meta.url), "utf8"), scope);
  const capture = new Processor();
  function feed(samples: Float32Array, blockSize = 128) {
    for (let offset = 0; offset < samples.length; offset += blockSize) {
      const block = samples.subarray(offset, offset + blockSize);
      capture.process([[block]]);
      scope.currentTime += block.length / sampleRate;
    }
  }
  const output = () => frames.flatMap(frame => [...new Int16Array(frame)]);
  return { capture, scope, frames, feed, output };
}

it("continues capturing real PCM during output so a person can interrupt", () => {
 const {capture,frames,feed}=fixture();
 capture.port.onmessage({data:{blockUntil:999}});
 feed(new Float32Array(640).fill(.1));
 expect(frames).toHaveLength(2);
 expect([...new Int16Array(frames[0])].every(value=>value>0)).toBe(true);
});

it.each([8000, 16000, 44100, 48000, 96000])("produces exactly 16,000 samples per second from a %i Hz microphone", (rate) => {
  const { feed, output, frames } = fixture(rate);
  feed(new Float32Array(rate).fill(0.5));
  expect(output()).toHaveLength(16000);
  expect(frames.every(frame => frame.byteLength === 640)).toBe(true);
  expect(output().every(sample => Math.abs(sample - 16384) <= 1)).toBe(true);
});

it("preserves phase across arbitrary input blocks at 44.1 kHz", () => {
  const signal = Float32Array.from({ length: 44100 }, (_, i) => Math.sin(2 * Math.PI * 1000 * i / 44100) * 0.5);
  const a = fixture(44100), b = fixture(44100);
  a.feed(signal, 128); b.feed(signal, 333);
  expect(a.output()).toEqual(b.output());
  // A 1 kHz tone should survive capture without the variable bucket jitter.
  const result = a.output();
  const rms = Math.sqrt(result.reduce((sum, sample) => sum + (sample / 32767) ** 2, 0) / result.length);
  expect(rms).toBeGreaterThan(0.34);
  expect(rms).toBeLessThan(0.36);
});

it("clips loud samples to signed PCM16 instead of wrapping their sign", () => {
  const { feed, output } = fixture();
  feed(Float32Array.from({ length: 320 }, (_, i) => i % 2 ? -2 : 2));
  expect(output()[0]).toBe(32767);
  expect(output()[1]).toBe(-32767);
});
