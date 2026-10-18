// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useAdminVoice } from "./useAdminVoice";
import { isVoiceSessionActive, requestVoiceSessionReset, setVoiceSessionActive } from "@/lib/active-voice-session";
const mocks = vi.hoisted(() => ({ post: vi.fn(), get: vi.fn(), delete: vi.fn(), request: vi.fn(), start: vi.fn(), stop: vi.fn(), live: vi.fn() }));
vi.mock("@/api/client", () => ({ api: { post: mocks.post, get: mocks.get, delete: mocks.delete } }));
vi.mock("@/api/native-admin", () => ({ adminRequest: mocks.request, adminJson: (body: unknown) => ({ method: "POST", body: JSON.stringify(body) }) }));
vi.mock("@/context/ThemeContext", () => ({ useTheme: () => ({ theme: "light" }) }));
vi.mock("@/lib/voice-microphone", () => ({ configureVoiceMicrophone: vi.fn(async () => {}), voiceMicrophoneFailure: () => "Microphone denied" }));
vi.mock("@/lib/voice-startup", () => ({ voiceStartupStep: (promise: Promise<unknown>) => promise, resumeVoiceAudio: vi.fn(async () => {}) }));
vi.mock("@/lib/agent-voice-live", () => ({ AgentVoiceLive: class { constructor(...args: unknown[]) { mocks.live(...args); } start = mocks.start; stop = mocks.stop; } }));
let root: ReturnType<typeof createRoot>, voice: ReturnType<typeof useAdminVoice>;
const trackStop = vi.fn(), contextClose = vi.fn(async () => {}), saved = vi.fn();
beforeEach(() => {
  vi.clearAllMocks(); setVoiceSessionActive(false);
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal("AudioContext", class { state = "running"; resume = async () => {}; close = contextClose; });
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop: trackStop }] })) } });
  mocks.post.mockResolvedValue({ sessionId: "session", token: "ephemeral", setup: { model: "models/gemini-3.8-live" } });
  mocks.get.mockResolvedValue({ available: true }); mocks.delete.mockResolvedValue(undefined); mocks.start.mockResolvedValue(undefined);
  mocks.request.mockImplementation(async path => path === "audio/live/prepare" ? { setup: { model: "models/gemini-3.8-live" }, history: [] } : { chat_id: "chat" });
  root = createRoot(document.createElement("div"));
  function Harness() { voice = useAdminVoice({ chatId: "chat", model: "text-model", mode: "ask", onSaved: saved }); return null; }
  act(() => root.render(<Harness />));
});
afterEach(async () => { await act(async () => root.unmount()); setVoiceSessionActive(false); vi.unstubAllGlobals(); });
it("provisions Admin voice through both authenticated gateways and releases microphone on End", async () => {
  await act(async () => voice.start());
  expect(voice.active).toBe(true);
  expect(mocks.request).toHaveBeenCalledWith("audio/live/prepare", expect.anything());
  expect(mocks.post).toHaveBeenCalledWith("/instance/admin-voice-sessions", { setup: { model: "models/gemini-3.8-live" } });
  await act(async () => voice.stop());
  expect(trackStop).toHaveBeenCalled(); expect(contextClose).toHaveBeenCalled();
  expect(mocks.delete).toHaveBeenCalledWith("/instance/admin-voice-sessions/session"); expect(isVoiceSessionActive()).toBe(false);
});
it("cannot overlap an organization call or clear its active lease when Admin is unmounted", async () => {
  setVoiceSessionActive(true);
  await act(async () => voice.start());
  expect(voice.error).toContain("End the current"); expect(mocks.post).not.toHaveBeenCalled();
  act(() => voice.stop()); expect(isVoiceSessionActive()).toBe(true);
});
it("saves spoken turns in the Admin conversation without invoking a text model", async () => {
  await act(async () => voice.start());
  const transcript = mocks.live.mock.calls[0][4];
  transcript({ id: "one", role: "user", text: "Hello" }); transcript({ id: "two", role: "model", text: "Hello back" });
  await act(async () => voice.stop());
  const write = mocks.request.mock.calls.find(([path]) => path === "audio/live/transcript");
  expect(JSON.parse(write![1].body)).toMatchObject({ chat_id: "chat", session_id: "session", turns: [{ role: "user", text: "Hello" }, { role: "assistant", text: "Hello back" }] });
  expect(mocks.request.mock.calls.some(([path]) => path === "chats")).toBe(false);
});
it("stops on sign-out and does not publish pending spoken turns under a different account", async () => {
  await act(async () => voice.start()); mocks.live.mock.calls[0][4]({ id: "one", role: "user", text: "Private" });
  await act(async () => requestVoiceSessionReset());
  expect(voice.active).toBe(false); expect(trackStop).toHaveBeenCalled();
  expect(mocks.request.mock.calls.some(([path]) => path === "audio/live/transcript")).toBe(false);
});
it("revalidates credentials before a native Admin tool and never dispatches after denial", async () => {
  await act(async () => voice.start()); mocks.get.mockRejectedValueOnce(new Error("Revoked"));
  const tool = mocks.live.mock.calls[0][6];
  await expect(tool("whox_admin_inventory", {}, "call")).rejects.toThrow("Revoked");
  expect(mocks.request.mock.calls.some(([path]) => path === "audio/live/admin-tools")).toBe(false);
});
