// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AiConnectionCredentialStep } from "./AiConnectionCredentialStep";

const create = vi.hoisted(() => vi.fn());
vi.mock("@/api/ai-connections", () => ({ aiConnectionsApi: { create } }));
let root: Root;
let container: HTMLDivElement;
let client: QueryClient;
const complete = vi.fn();
async function settle(fn: () => void = () => {}) {
  await act(async () => { fn(); await new Promise(resolve => setTimeout(resolve, 0)); });
}
function setInput(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}
beforeEach(async () => {
  vi.clearAllMocks();
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  create.mockResolvedValue({ connectionId: "voice-account", grantId: "voice-grant" });
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  await settle(() => root.render(<QueryClientProvider client={client}>
    <AiConnectionCredentialStep companyId="company" provider="gemini" name="My Gemini" ownership="shared" allAgents={false} agentIds={["agent"]} onComplete={complete} onCancel={() => {}} />
  </QueryClientProvider>));
});
afterEach(async () => { await settle(() => root.unmount()); client.clear(); container.remove(); });

it("sends Gemini keys only as personal voice credentials and clears the input on success", async () => {
  const key = container.querySelector<HTMLInputElement>('input[type="password"]')!;
  expect(container.textContent).toContain("Provide your Gemini API key");
  expect(container.querySelector('a[href="https://aistudio.google.com/apikey"]')).not.toBeNull();
  await settle(() => setInput(key, "fixture-gemini-key"));
  await settle(() => key.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
  expect(create).toHaveBeenCalledWith("company", expect.objectContaining({
    provider: "gemini", method: "api_key", ownership: "personal", allAgents: true, agentIds: [], apiKey: "fixture-gemini-key",
  }));
  expect(complete).toHaveBeenCalledWith({ connectionId: "voice-account", grantId: "voice-grant", method: "api_key" });
  expect(key.value).toBe("");
});

it("clears a rejected key and displays the connection error", async () => {
  create.mockRejectedValueOnce(new Error("Gemini rejected this key."));
  const key = container.querySelector<HTMLInputElement>('input[type="password"]')!;
  await settle(() => setInput(key, "fixture-invalid-key"));
  await settle(() => key.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
  expect(key.value).toBe("");
  expect(container.querySelector('[role="alert"]')?.textContent).toBe("Gemini rejected this key.");
  expect(complete).not.toHaveBeenCalled();
});

it("does not submit an empty name through the API-key Enter shortcut", async () => {
  const inputs = container.querySelectorAll<HTMLInputElement>("input");
  const name = [...inputs].find(input => input.type !== "password")!;
  const key = container.querySelector<HTMLInputElement>('input[type="password"]')!;
  await settle(() => { setInput(name, ""); setInput(key, "fixture-gemini-key"); });
  await settle(() => key.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
  expect(create).not.toHaveBeenCalled();
});
