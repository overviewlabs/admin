// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ConnectCodexPage } from "./ConnectCodex";
const mocks = vi.hoisted(() => ({ list: vi.fn(), setDefault: vi.fn(), navigate: vi.fn(), step: undefined as any }));
vi.mock("@/context/CompanyContext", () => ({ useCompany: () => ({ selectedCompany: { id: "company", name: "Club HQL" } }) }));
vi.mock("@/lib/router", () => ({ useNavigate: () => mocks.navigate }));
vi.mock("@/api/ai-connections", () => ({ aiConnectionsApi: { list: mocks.list, setDefault: mocks.setDefault } }));
vi.mock("@/components/ai-connections/AiConnectionCredentialStep", () => ({ AiConnectionCredentialStep: (props: any) => { mocks.step = props; return <span>Personal sign-in</span>; } }));
let root: Root, container: HTMLDivElement, client: QueryClient;
const account = { id: "own", grantId: "grant", companyId: "company", provider: "openai", method: "subscription", ownership: "personal", ownerUserId: "alice", status: "revoked", isDefault: true, name: "My subscription" };
async function settle(fn = () => {}) { await act(async () => { fn(); await new Promise(resolve => setTimeout(resolve, 20)); }); }
beforeEach(async () => {
 vi.clearAllMocks(); mocks.step = undefined;
 (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
 mocks.list.mockResolvedValue({ currentUserId: "alice", connections: [account] });
 mocks.setDefault.mockResolvedValue({ ok: true });
 container=document.createElement("div"); document.body.appendChild(container); root=createRoot(container);
 client=new QueryClient({ defaultOptions: { queries: { retry: false } } });
 await settle(() => root.render(<QueryClientProvider client={client}><ConnectCodexPage /></QueryClientProvider>)); await settle();
});
afterEach(async () => { await settle(() => root.unmount()); client.clear(); container.remove(); });
it("requires personal sign-in and reconnects the owner's revoked account", () => {
 expect(container.textContent).toContain("Link your Codex account first");
 expect(container.textContent).not.toContain("Continue to team");
 expect(mocks.step).toMatchObject({ connectionId: "own", ownership: "personal", allAgents: true, agentIds: [] });
});
it("selects and verifies the authenticated user's new default before continuing", async () => {
 mocks.list.mockResolvedValue({ currentUserId: "alice", connections: [{ ...account, status: "connected" }] });
 await settle(() => { void mocks.step.onComplete({ connectionId: "own", grantId: "grant", method: "subscription" }); }); await settle();
 expect(mocks.setDefault).toHaveBeenCalledWith("company", "grant");
 expect(container.textContent).toContain("Continue to team");
 await settle(() => (container.querySelector("button") as HTMLButtonElement).click());
 expect(mocks.navigate).toHaveBeenCalledWith("/dashboard", { replace: true });
});
it("does not treat another member's connected account as this user's account", async () => {
 mocks.list.mockResolvedValue({ currentUserId: "alice", connections: [{ ...account, status: "connected", ownerUserId: "bob" }] });
 await settle(() => { void client.invalidateQueries(); }); await settle();
 expect(container.textContent).not.toContain("Continue to team");
});
it("shows default selection failure instead of claiming the account is ready", async () => {
 mocks.setDefault.mockRejectedValue(new Error("Account needs validation"));
 await settle(() => { void mocks.step.onComplete({ connectionId: "own", grantId: "grant", method: "subscription" }); });
 expect(container.textContent).toContain("Account needs validation");
 expect(container.textContent).not.toContain("Continue to team");
});
