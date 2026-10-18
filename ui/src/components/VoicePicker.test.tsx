// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { VoiceAssignment } from "@whoxos/shared/agent-voice";
import { VoicePicker } from "./VoicePicker";

let container: HTMLDivElement;
let root: Root;
const onChange = vi.fn();
const assignments: VoiceAssignment[] = [
  { agentId: "ceo", agentName: "CEO", voice: "Kore", status: "idle" },
  { agentId: "tech", agentName: "Technology Lead", voice: "Puck", status: "paused" },
];
async function render(assignmentState: "ready" | "loading" | "error" = "ready") {
  await act(async () => root.render(<VoicePicker value="Kore" onChange={onChange} assignments={assignments} assignmentState={assignmentState} currentAgentId="ceo" />));
}
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  onChange.mockClear(); container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

it("shows every voice with its owner or availability and finds a voice by agent name", async () => {
  await render();
  expect(container.querySelectorAll('tbody tr')).toHaveLength(30);
  expect(container.textContent).toContain("CEO (this agent)"); expect(container.textContent).toContain("Technology Lead");
  const zephyr = container.querySelector('[aria-label="Select Zephyr"]')!.closest("tr")!;
  expect(zephyr.textContent).toContain("Available");
  await act(async () => {
    const input = container.querySelector('input[aria-label="Search voices"]')!;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "technology");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(container.querySelectorAll('tbody tr')).toHaveLength(1); expect(container.textContent).toContain("Puck");
  await act(async () => (container.querySelector('[aria-label="Select Puck"]') as HTMLInputElement).click());
  expect(onChange).toHaveBeenCalledWith("Puck");
});

it.each(["loading", "error"] as const)("does not label voices available or allow selection when assignment state is %s", async state => {
  await render(state);
  expect(container.textContent).not.toContain("Available");
  expect([...container.querySelectorAll<HTMLInputElement>('input[type="radio"]')].every(input => input.disabled)).toBe(true);
  expect((container.querySelector('[aria-label="Preview Puck"]') as HTMLButtonElement).disabled).toBe(false);
});

it("preserves playback previews and releases audio when selecting or leaving the picker", async () => {
  const playback = { play: vi.fn(async () => {}), pause: vi.fn(), removeAttribute: vi.fn(), load: vi.fn(), onended: null, onerror: null };
  const construct = vi.fn(function () { return playback; }); vi.stubGlobal("Audio", construct);
  await render();
  await act(async () => (container.querySelector('[aria-label="Preview Puck"]') as HTMLButtonElement).click());
  expect(construct).toHaveBeenCalledWith("https://www.gstatic.com/aistudio/voices/samples/Puck.wav");
  expect(playback.play).toHaveBeenCalledOnce();
  expect(container.querySelector('[aria-label="Stop Puck"]')).not.toBeNull();
  await act(async () => (container.querySelector('[aria-label="Select Puck"]') as HTMLInputElement).click());
  expect(playback.pause).toHaveBeenCalledOnce(); expect(playback.removeAttribute).toHaveBeenCalledWith("src");
});
