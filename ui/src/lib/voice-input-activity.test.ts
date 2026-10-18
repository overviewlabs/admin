import { describe, expect, it } from "vitest";
import { VoiceInputActivity, type VoiceInputEvent } from "./voice-input-activity";

function pcm(amplitude: number, dc = 0) {
  const buffer = new ArrayBuffer(640), view = new DataView(buffer);
  for (let i = 0; i < 320; i++) view.setInt16(i * 2, Math.round((dc + (i % 2 ? amplitude : -amplitude)) * 32767), true);
  return buffer;
}
function fixture() {
  const events: VoiceInputEvent[] = [];
  const detector = new VoiceInputActivity(event => events.push(event));
  function feed(amplitude: number, frames: number, blocked = false) {
    for (let i = 0; i < frames; i++) detector.push(pcm(amplitude), blocked);
  }
  const types = () => events.map(event => event.type);
  return { detector, events, feed, types };
}

describe("continuous microphone activity", () => {
  it("ignores silence and a click shorter than the speech onset window", () => {
    const { feed, events } = fixture();
    feed(0, 50); feed(0.5, 1); feed(0, 100);
    expect(events).toEqual([]);
  });

  it("opens a turn after 60ms and sends 400ms of bounded pre-roll before continuing", () => {
    const { detector, feed, events, types } = fixture();
    feed(0.001, 100); feed(0.02, 2);
    expect(events).toHaveLength(0);
    feed(0.02, 1);
    expect(types()).toEqual(["start", ...Array(20).fill("audio")]);
    expect(detector.isActive).toBe(true);
    const first = events[1];
    expect(first.type).toBe("audio");
    if (first.type === "audio") expect(Math.abs(new DataView(first.data).getInt16(0, true))).toBeLessThan(40);
    feed(0.02, 1); expect(types().at(-1)).toBe("audio");
  });

  it("preserves pauses and quiet word endings, then ends exactly after one second of silence", () => {
    const { feed, types } = fixture();
    feed(0.02, 3); feed(0, 40); feed(0.004, 5); feed(0, 49);
    expect(types().filter(type => type === "end")).toHaveLength(0);
    feed(0, 1);
    expect(types().at(-1)).toBe("end");
    expect(types().filter(type => type === "start")).toHaveLength(1);
  });

  it("starts a new continuous turn after the preceding one finishes without another click", () => {
    const { feed, types } = fixture();
    feed(0.03, 10); feed(0, 50); feed(0.03, 10); feed(0, 50);
    expect(types().filter(type => type !== "audio")).toEqual(["start", "end", "start", "end"]);
  });

  it("adapts to quiet background noise without treating it as speech", () => {
    const { feed, events, types } = fixture();
    feed(0.002, 500);
    expect(events).toHaveLength(0);
    feed(0.015, 3);
    expect(types()[0]).toBe("start");
  });

  it("ignores DC offset rather than opening a never-ending turn", () => {
    const { detector, events } = fixture();
    for (let i = 0; i < 100; i++) detector.push(pcm(0, 0.5));
    expect(events).toHaveLength(0);
  });

  it("discards all buffered playback and echo before the next user utterance", () => {
    const { detector, feed, events, types } = fixture();
    feed(0.03, 2);
    feed(0.8, 100, true);
    expect(events).toHaveLength(0);
    feed(0.03, 3);
    expect(types()).toEqual(["start", "audio", "audio", "audio"]);
    for (const event of events) if (event.type === "audio") {
      expect(Math.abs(new DataView(event.data).getInt16(0, true))).toBeLessThan(1000);
    }
    expect(detector.isActive).toBe(true);
  });

  it("closes an open activity once when playback starts and never sends speaker frames", () => {
    const { feed, events, types } = fixture();
    feed(0.03, 3);
    const audioCount = events.filter(event => event.type === "audio").length;
    feed(0.8, 100, true);
    expect(types().filter(type => type !== "audio")).toEqual(["start", "end"]);
    expect(events.filter(event => event.type === "audio")).toHaveLength(audioCount);
  });

  it("reset is idempotent and clears candidate onset as well as pre-roll", () => {
    const { detector, feed, events } = fixture();
    feed(0.02, 2); detector.reset(); detector.reset(); feed(0.02, 2);
    expect(events).toEqual([]);
  });

  it("ignores empty and incomplete PCM frames", () => {
    const { detector, events } = fixture();
    detector.push(new ArrayBuffer(0)); detector.push(new ArrayBuffer(5));
    expect(events).toEqual([]);
  });
});


it("uses speech confidence rather than loudness, while preserving quiet speech",()=>{
 const events:VoiceInputEvent[]=[];const detector=new VoiceInputActivity(event=>events.push(event));
 for(let i=0;i<150;i++)detector.push(pcm(.8),false,.02);
 expect(events).toHaveLength(0);
 for(let i=0;i<7;i++)detector.push(pcm(.001),false,.95);
 expect(events[0].type).toBe("start");
 for(let i=0;i<50;i++)detector.push(pcm(.8),false,.02);
 expect(events.at(-1)?.type).toBe("end");
});
