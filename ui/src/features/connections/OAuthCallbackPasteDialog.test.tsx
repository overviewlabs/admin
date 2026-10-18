// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/api/client";
import { OAuthCallbackPasteDialog } from "./OAuthCallbackPasteDialog";
import { readPendingLoopbackSignIn } from "./pendingLoopbackSignIn";
vi.mock("@/api/client", () => ({ api: { post: vi.fn() } }));
let root: Root | undefined;
const complete = vi.fn();
const state = "whox-local-v1.client.new-attempt";
const authorizationUrl = `https://mcp.wasabisys.dev/oauth/authorize?state=${state}&redirect_uri=http%3A%2F%2Flocalhost%3A8765%2Fcallback`;
const expiresAt = new Date(Date.now() + 30 * 60_000).toISOString();
beforeEach(() => { sessionStorage.clear(); vi.clearAllMocks(); });
afterEach(async () => { if (root) await act(async () => root!.unmount()); root = undefined; document.body.innerHTML = ""; });
async function render(onRestart?: () => Promise<void>) {
  const host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(async () => root!.render(<OAuthCallbackPasteDialog connectionId="wasabi" providerName="Wasabi S3"
    authorizationUrl={authorizationUrl} expiresAt={expiresAt} onComplete={complete} onCancel={() => {}} onRestart={onRestart} />));
}
async function submit(value: string) {
  const input = document.querySelector('input')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => document.querySelector('form')!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
}
describe("provider callback dialog", () => {
  it("shows Wasabi instructions and keeps authorization in a separate tab", async () => {
    await render();
    expect(document.body.textContent).toContain("Finish connecting Wasabi S3");
    expect(document.body.textContent).not.toContain("Robinhood");
    const link = document.querySelector('a[href^="https://mcp.wasabisys.dev/"]')!;
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
    expect(document.querySelector("input")?.type).toBe("password");
  });
  it("lets the authenticated server validate a still-pending earlier attempt", async () => {
    vi.mocked(api.post).mockResolvedValue({ completed: true, connectionId: "wasabi" });
    await render();
    const callback = "http://localhost:8765/callback?code=test-code&state=whox-local-v1.client.earlier-attempt&iss=https%3A%2F%2Fmcp.wasabisys.dev";
    await submit(callback);
    expect(api.post).toHaveBeenCalledWith("/tools/oauth/wasabi/callback-url", { callbackUrl: callback });
    expect(complete).toHaveBeenCalledOnce();
    expect(readPendingLoopbackSignIn("wasabi")).toBeNull();
  });
  it("persists the pending link through tab changes and remount but never the callback code", async () => {
    await render();
    document.dispatchEvent(new Event("visibilitychange")); window.dispatchEvent(new Event("focus"));
    expect(readPendingLoopbackSignIn("wasabi")?.authorizationUrl).toBe(authorizationUrl);
    await act(async () => root!.unmount()); root = undefined;
    expect(readPendingLoopbackSignIn("wasabi")?.expiresAt).toBe(expiresAt);
    expect(sessionStorage.getItem(sessionStorage.key(0)!)).not.toContain("callbackUrl");
  });
  it("rejects provider URLs, missing codes and duplicate states without making a request", async () => {
    await render();
    for (const value of [authorizationUrl, 'http://localhost:8765/callback?state=whox-local-v1.a', 'http://localhost:8765/callback?code=test&state=whox-local-v1.a&state=whox-local-v1.b']) await submit(value);
    expect(api.post).not.toHaveBeenCalled();
    expect(complete).not.toHaveBeenCalled();
  });
  it("preserves recovery when server rejects an expired or wrong-actor callback", async () => {
    vi.mocked(api.post).mockRejectedValue(new Error("OAuth state has expired"));
    const restart = vi.fn().mockResolvedValue(undefined);
    await render(restart);
    await submit(`http://localhost:8765/callback?code=test&state=${state}`);
    expect(document.body.textContent).toContain("OAuth state has expired");
    expect(complete).not.toHaveBeenCalled();
    const button = [...document.querySelectorAll('button')].find(b => b.textContent === 'Start a new sign-in')!;
    await act(async () => button.click());
    expect(restart).toHaveBeenCalledOnce();
  });
  it("clears pending sign-in only when explicitly cancelled", async () => {
    await render();
    const button = [...document.querySelectorAll('button')].find(b => b.textContent === 'Cancel')!;
    await act(async () => button.click());
    expect(readPendingLoopbackSignIn('wasabi')).toBeNull();
  });
});
