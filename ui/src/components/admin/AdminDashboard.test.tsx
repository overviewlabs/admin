// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminChatList } from "./AdminDashboard";
const state = vi.hoisted(() => ({ paths: [] as string[], navigate: vi.fn(), rows: [
  { id: "general", title: "General chat", updated_at: 10, meta: {} },
  { id: "studio", title: "Studio work", updated_at: 20, workspace_name: "OVL Studio", meta: { workspace: "/projects/studio" } },
  { id: "system", title: "Server work", updated_at: 30, workspace_name: "System", meta: { workspace: "/projects/System" } },
] }));
vi.mock("../../lib/router", () => ({ useNavigate: () => state.navigate }));
vi.mock("../../hooks/useNativeAdmin", () => ({
  useAdminQuery: (path: string) => { state.paths.push(path); return { data: { chats: state.rows, total: 3, has_more: true }, isPending: false, isError: false, refetch: vi.fn() }; },
  useAdminAction: () => ({ busy: false, error: "", run: vi.fn() }),
}));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement;let root: ReturnType<typeof createRoot>;
beforeEach(() => { state.paths = [];state.navigate.mockClear();host = document.createElement("div");document.body.append(host);root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount());host.remove(); });
const render = async (props = {}) => act(async () => root.render(<AdminChatList {...props} />));
describe("Admin conversations across workspaces", () => {
  it("requests the combined list and labels only workspace conversations", async () => {
    await render();expect(state.paths.at(-1)).toContain("all_workspaces=true");
    expect([...new Set([...host.querySelectorAll('[data-slot="badge"]')].map(x => x.textContent))]).toEqual(["OVL Studio", "System"]);
    expect(host.querySelector("tbody tr")?.querySelector('[data-slot="badge"]')).toBeNull();
    expect([...host.querySelectorAll('th')].map(x => x.textContent)).toEqual(["Type", "Workspace", "Conversation", "Updated", "Status", "Actions"]);
    expect(host.textContent).toContain("General chat");
  });
  it("opens a workspace conversation in its actual workspace", async () => {
    await render();const button = [...host.querySelectorAll("button")].find(x => x.textContent?.includes("Studio work"))!;
    await act(async () => button.click());
    expect(state.navigate).toHaveBeenCalledWith("/admin?view=chat&chatId=studio&workspace=%2Fprojects%2Fstudio");
  });
  it("preserves dedicated workspace lists", async () => {
    await render({ workspace: "/projects/studio" });expect(state.paths.at(-1)).toContain("workspace=%2Fprojects%2Fstudio");expect(state.paths.at(-1)).not.toContain("all_workspaces");
  });
  it("paginates the combined list", async () => {
    await render();const next = [...host.querySelectorAll("button")].find(x => x.textContent === "Next")!;
    await act(async () => next.click());expect(state.paths.at(-1)).toContain("offset=30&all_workspaces=true");
  });
  it("includes workspace tags in the recent conversation list", async () => {
    await render({ compact: true });expect(state.paths.at(-1)).toContain("limit=8");
    expect([...new Set([...host.querySelectorAll('[data-slot="badge"]')].map(x => x.textContent))]).toEqual(["OVL Studio", "System"]);
  });
});
