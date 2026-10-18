// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ location: { search: "?view=chat&chatId=old" }, navigate: vi.fn(), request: vi.fn(), saved: undefined as undefined | ((id: string) => void) }));
vi.mock("../../lib/router", () => ({ useLocation: () => state.location, useNavigate: () => state.navigate }));
vi.mock("../../api/native-admin", async (original) => ({ ...await original<object>(), adminRequest: state.request, ensureAdminSession: async () => {} }));
vi.mock("socket.io-client", () => ({ io: () => ({ on() {}, emit() {}, disconnect() {} }) }));
vi.mock("../../hooks/useAdminPortalAccess", () => ({ useAdminPortalAccess: () => ({ currentUserId: "owner" }) }));
vi.mock("../../hooks/useNativeAdmin", () => ({ useAdminQuery: () => ({ data: { models: [{ id: "codex", name: "Codex" }], default: "codex" } }), useAdminAction: () => ({ error: "", busy: false, setError() {} }) }));
vi.mock("../../hooks/useAdminVoice", () => ({ useAdminVoice: (options: { onSaved: (id: string) => void }) => { state.saved = options.onSaved; return {}; } }));
vi.mock("../../hooks/useChatFollow", () => ({ useChatFollow: () => ({ away: false, onScroll() {}, resume() {} }) }));
vi.mock("@/context/SidebarContext", () => ({ useSidebar: () => ({ isMobile: false }) }));
vi.mock("@/hooks/useStreamlinedUiEnabled", () => ({ useStreamlinedUiEnabled: () => ({ enabled: false }) }));
vi.mock("../GlobalVoiceIndicator", () => ({ VoiceIndicator: () => null }));
vi.mock("../task-chat/presentation-mode", () => ({ TaskChatPresentationProvider: ({ children }: { children: ReactNode }) => children }));
vi.mock("../task-chat/TaskChatBubble", () => ({ TaskChatBubble: ({ item }: { item: { text: string } }) => <p>{item.text}</p> }));
vi.mock("../task-chat/TaskChatComposer", () => ({ TaskChatComposer: ({ onAdd, disabled }: { onAdd: (body: string) => Promise<unknown>; disabled: boolean }) => <button disabled={disabled} onClick={() => void onAdd("Test message").catch(() => {})}>Send test message</button> }));
import { AdminChat } from "./AdminChat";
let container: HTMLDivElement;
let root: Root;
const failedChat = { chat: { id: "old", title: "Old", current_message_id: "failed", updated_at: 0 }, messages: [{ id: "user", parent_id: null, role: "user", content: "Original request", done: true, output: [] }, { id: "failed", parent_id: "user", role: "assistant", content: "Error", done: true, output: [], meta: { error: "HTTP 429" } }] };
async function render(remount = false) { await act(async () => { root.render(<AdminChat key={remount ? state.location.search : "stable"} />); }); }
async function click(text: string) { const button = [...container.querySelectorAll("button")].find(b => b.textContent?.includes(text) || b.getAttribute("aria-label") === text); expect(button).toBeTruthy(); await act(async () => { button!.click(); }); }
beforeEach(() => { state.location = { search: "?view=chat&chatId=old" }; state.navigate.mockReset(); state.request.mockReset().mockResolvedValue(failedChat); container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
it("clears a failed chat's error when opening a new conversation", async () => {
  await render(); expect(container.textContent).toContain("HTTP 429");
  state.location = { search: "?view=chat&request=new" }; await render(true);
  expect(container.textContent).not.toContain("HTTP 429"); expect(container.textContent).toContain("What would you like to work on?");
});
it("Try again creates a response branch for the saved user message", async () => {
  await render(); state.request.mockImplementation(async (path: string) => path === "chats" ? { chat_id: "old", message_id: "retry" } : failedChat);
  await click("Try again");
  const call = state.request.mock.calls.find(([path]) => path === "chats");
  expect(JSON.parse(call![1].body)).toMatchObject({ chat_id: "old", parent_id: "user", content: "" });
});
it("a late send response cannot navigate away from the new chat", async () => {
  await render(); let finish!: (value: unknown) => void;
  state.request.mockImplementation((path: string) => path === "chats" ? new Promise(resolve => { finish = resolve; }) : Promise.resolve(failedChat));
  await click("Send test message");
  state.location = { search: "?view=chat&request=new" }; await render(true);
  await act(async () => finish({ chat_id: "old", message_id: "late" }));
  expect(state.navigate).not.toHaveBeenCalled(); expect(container.textContent).toContain("What would you like to work on?");
  expect(container.querySelector<HTMLButtonElement>("button:last-child")?.disabled).toBe(false);
});
it("saving an old voice transcript cannot pull the user out of a new chat", async () => {
  await render(); const previousSave = state.saved!;
  state.location = { search: "?view=chat&request=new" }; await render(true);
  await act(async () => previousSave("old"));
  expect(state.navigate).not.toHaveBeenCalled();
});
