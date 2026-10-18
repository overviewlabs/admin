// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GlobalVoiceIndicator } from "./GlobalVoiceIndicator";

const state = vi.hoisted(() => ({ voice: null as Record<string, unknown> | null, theme: "light", audio: { state: "running", suspend: vi.fn().mockResolvedValue(undefined) }, getAudioContext: vi.fn() }));
vi.mock("@/context/VoiceSessionContext", () => ({ useOptionalVoiceSession: () => state.voice }));
vi.mock("@/lib/router", () => ({ Link: ({ to, children, ...props }: { to: string; children: ReactNode }) => <a href={to} {...props}>{children}</a> }));

vi.mock("@/context/ThemeContext", () => ({ useTheme: () => ({ theme: state.theme }) }));
vi.mock("voice-glow", () => ({
  getAudioContext: state.getAudioContext,
  VoiceBeam: ({ children, stream, processing, scale, theme, ...props }: {
    children: ReactNode; stream: MediaStream | null; processing: boolean; scale: number; theme: string;
  }) => <div {...props} data-stream={stream ? "present" : "absent"} data-processing={processing} data-scale={scale} data-theme={theme}>{children}</div>,
}));

let root: Root;
let mount: HTMLDivElement;
function voice(overrides: Record<string, unknown> = {}) {
  return {
    active: true, stream: null, phase: "listening", error: "", connectionRequired: false,
    agent: { id: "agent-ceo", companyId: "treasury", name: "CEO", companyName: "Treasury", companyPrefix: "TRE" },
    start: vi.fn(), stop: vi.fn(), dismissError: vi.fn(), ...overrides,
  };
}
async function render() { await act(async () => root.render(<GlobalVoiceIndicator />)); }
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  state.theme = "light";
  state.audio.suspend.mockClear(); state.getAudioContext.mockReset().mockReturnValue(state.audio);
  state.voice = voice();
  mount = document.createElement("div"); mount.id = "root"; document.body.appendChild(mount); root = createRoot(mount);
});
afterEach(async () => {
  await act(async () => root.unmount());
  document.body.replaceChildren(); vi.unstubAllGlobals();
});

describe("GlobalVoiceIndicator", () => {
  it("renders nothing without a provider or when voice is inactive", async () => {
    state.voice = null; await render(); expect(document.querySelector(".global-voice-overlay")).toBeNull();
    state.voice = voice({ active: false }); await render(); expect(document.querySelector(".global-voice-overlay")).toBeNull();
  });

  it("keeps the original agent and organization in controls and navigation", async () => {
    const pane = document.createElement("main"); pane.dataset.voicePane = ""; document.body.appendChild(pane);
    await render();
    expect(pane.textContent).toContain("CEO · Treasury");
    expect(pane.querySelector('[role="status"]')?.textContent).toBe("Listening");
    expect(pane.querySelector('a')?.getAttribute("href")).toBe("/TRE/chats/agent-ceo");
    const stop = [...pane.querySelectorAll("button")].find(button => button.textContent?.includes("End voice"))!;
    await act(async () => stop.click()); expect(state.voice!.stop).toHaveBeenCalledOnce();
  });

  it("keeps controls on pages without a layout and moves them into a new pane", async () => {
    await render(); expect(document.querySelector('.global-voice-overlay[data-fullscreen="true"]')).not.toBeNull();
    expect(mount.hasAttribute("data-voice-controls")).toBe(false);
    const pane = document.createElement("main"); pane.dataset.voicePane = "";
    await act(async () => document.body.appendChild(pane));
    expect(pane.querySelector('.global-voice-overlay[data-fullscreen="false"]')).not.toBeNull();
    expect(pane.hasAttribute("data-voice-controls")).toBe(false);
    expect(mount.hasAttribute("data-voice-controls")).toBe(false);
    await act(async () => pane.remove());
    expect(document.querySelector('.global-voice-overlay[data-fullscreen="true"]')).not.toBeNull();
    expect(mount.hasAttribute("data-voice-controls")).toBe(false);
  });

  it("floats without modifying existing pane spacing when voice starts and stops", async () => {
    const pane = document.createElement("main"); pane.dataset.voicePane = "";
    pane.style.paddingTop = "12px"; document.body.appendChild(pane);
    await render();
    expect(pane.style.paddingTop).toBe("12px");
    expect(pane.hasAttribute("data-voice-controls")).toBe(false);
    expect(pane.style.getPropertyValue("--voice-controls-height")).toBe("");
    state.voice = voice({ active: false }); await render();
    expect(pane.style.paddingTop).toBe("12px");
  });

  it("shows actionable local voice errors with dismissal", async () => {
    state.voice = voice({ active: false, error: "Voice disconnected. Start voice again.", connectionRequired: true });
    await render();
    expect(document.querySelector('[role="alert"]')?.textContent).toContain("Voice disconnected.");
    expect(document.querySelector('a[href="/TRE/apps/connect?source=gemini"]')).not.toBeNull();
    expect(document.querySelector(".global-voice-glow-frame")).toBeNull();
    await act(async () => (document.querySelector('[aria-label="Dismiss voice error"]') as HTMLButtonElement).click());
    expect(state.voice.dismissError).toHaveBeenCalledOnce();
  });

  it("renders the original beam on all four sides and preserves microphone ownership across routes", async () => {
    const trackStop = vi.fn();
    const stream = { getTracks: () => [{ stop: trackStop }] } as unknown as MediaStream;
    state.voice = voice({ stream }); await render();
    const beams = [...document.querySelectorAll(".global-voice-glow")];
    expect(beams.map(beam => beam.getAttribute("data-edge"))).toEqual(["bottom", "top", "left", "right"]);
    expect(beams.every(beam => beam.getAttribute("data-stream") === "present" && beam.getAttribute("data-scale") === "2.6")).toBe(true);
    const pane = document.createElement("main"); pane.dataset.voicePane = "";
    await act(async () => document.body.appendChild(pane));
    expect(pane.querySelectorAll('.global-voice-glow[data-stream="present"]')).toHaveLength(4);
    state.voice = voice({ active: false }); await render();
    expect(document.querySelector(".global-voice-glow-frame")).toBeNull();
    expect(trackStop).not.toHaveBeenCalled();
  });

  it("updates all four beams for thinking and theme changes", async () => {
    state.voice = voice({ phase: "thinking" }); await render();
    expect(document.querySelectorAll('.global-voice-glow[data-processing="true"][data-theme="light"]')).toHaveLength(4);
    state.theme = "dark"; state.voice = voice({ phase: "speaking" }); await render();
    expect(document.querySelectorAll('.global-voice-glow[data-processing="false"][data-theme="dark"]')).toHaveLength(4);
  });

  it("suspends the shared analyzer after voice ends while retaining it across pane and phase changes", async () => {
    const stream = {} as MediaStream;
    state.voice = voice({ stream }); await render();
    expect(state.getAudioContext).toHaveBeenCalledOnce();
    const pane = document.createElement("main"); pane.dataset.voicePane = "";
    await act(async () => document.body.appendChild(pane));
    state.voice = voice({ stream, phase: "thinking" }); await render();
    expect(state.audio.suspend).not.toHaveBeenCalled();
    state.voice = voice({ active: false }); await render();
    expect(state.audio.suspend).toHaveBeenCalledOnce();
    state.voice = voice({ stream }); await render();
    expect(state.getAudioContext).toHaveBeenCalledTimes(2);
  });

  it("shows controls immediately but starts the four canvas beams only after audio connects", async () => {
    state.voice = voice({ phase: "connecting" }); await render();
    expect(document.querySelectorAll('.global-voice-glow')).toHaveLength(0);
    expect(document.querySelector('[role="status"]')?.textContent).toBe("Connecting");
    expect(state.voice.stop).not.toHaveBeenCalled();
    state.voice = voice({ phase: "listening" }); await render();
    expect(document.querySelectorAll('.global-voice-glow')).toHaveLength(4);
  });
});

it("retries the pinned agent from the error bar on any page", async () => {
 state.voice=voice({active:false,error:"Microphone access is blocked."});await render();
 const retry=[...document.querySelectorAll("button")].find(b=>b.textContent==='Try voice again')!;
 await act(async()=>retry.click());
 expect(state.voice.start).toHaveBeenCalledWith(state.voice.agent);
});

it("explains Search quota fallback without displaying it as a failed voice connection", async () => {
 state.voice=voice({searchUnavailable:'Search is off for this session; voice and organization tools remain available.'});await render();
 expect(document.querySelector('.global-voice-controls')?.textContent).toContain('Search is off for this session');
 expect(document.querySelector('[role="alert"]')).toBeNull();expect(document.querySelector('.global-voice-glow-frame')).not.toBeNull();
});

it.each(['searxng','web','google'])("never renders floating search results or source controls for %s", async provider => {
 state.voice=voice({grounding:{id:'web',provider,category:'images',query:'Private search query',answer:'Private answer',suggestionsHtml:['<a href="https://example.org">Suggestions</a>'],sources:[{uri:'https://example.org/picture',title:'Private source',imageUrl:'https://external.example/image.jpg'}]},microphones:[{deviceId:'mic',label:'Microphone'}],changeMicrophone:vi.fn()});await render();
 const overlay=document.querySelector('.global-voice-controls')!;
 expect(document.querySelector('.global-voice-search-card,.global-voice-sources,[role="dialog"],img,video,iframe')).toBeNull();
 expect(overlay.textContent).not.toMatch(/Private|Suggestions|Sources/);
 expect(document.querySelector('[aria-label="Voice microphone"]')).not.toBeNull();
 const end=[...overlay.querySelectorAll('button')].find(button=>button.textContent==='End voice')!;
 await act(async()=>end.click());expect(state.voice!.stop).toHaveBeenCalledOnce();
});

it("shows actual activity compactly with the voice phase and removes it when finished or stopped",async()=>{
 state.voice=voice({phase:'speaking',activity:'Searching the web'});await render();
 expect(document.querySelector('[role="status"]')?.textContent).toBe('Speaking · Searching the web');
 expect(document.querySelectorAll('[role="status"]')).toHaveLength(1);
 state.voice=voice({phase:'listening',activity:null});await render();
 expect(document.querySelector('[role="status"]')?.textContent).toBe('Listening');
 state.voice=voice({active:false,error:'Connection closed',activity:'Searching the web'});await render();
 expect(document.querySelector('[role="status"]')?.textContent).toBe('Voice stopped');
});
