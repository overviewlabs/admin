// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Company } from "@whoxos/shared";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { ExecutiveDelegationSettings } from "./ExecutiveDelegationSettings";

const mocks = vi.hoisted(() => ({ members: vi.fn(), agents: vi.fn(), session: vi.fn(), update: vi.fn() }));
vi.mock("../api/access", () => ({ accessApi: { listMembers: mocks.members } }));
vi.mock("../api/agents", () => ({ agentsApi: { list: mocks.agents } }));
vi.mock("../api/auth", () => ({ authApi: { getSession: mocks.session } }));
vi.mock("../api/companies", () => ({ companiesApi: { updateExecutiveDelegation: mocks.update } }));
vi.mock("./AgentMultiSelect", () => ({ AgentSelect: ({ agents, value, onChange, disabled, id }: any) => (
  <select id={id} value={value} disabled={disabled} onChange={event => onChange(event.target.value)}>
    <option value="">Select CEO</option>{agents.map((agent: any) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
  </select>
) }));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const company = { id: "company", interactionResolverGovernance: {} } as Company;
const grant = { agentId: "ceo", grantedByUserId: "owner", grantedAt: "2026-09-28T00:00:00Z" };
function members(role = "owner", status = "active", principalId = "owner") {
  return { access: { currentUserRole: "owner", canManageMembers: true }, members: [{
    companyId: "company", principalType: "user", principalId, membershipRole: role, status,
  }] };
}
describe("CEO operational delegation", () => {
  let root: Root;
  let container: HTMLDivElement;
  let client: QueryClient;
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.session.mockResolvedValue({ user: { id: "owner" } });
    mocks.members.mockResolvedValue(members());
    mocks.agents.mockResolvedValue([{ id: "ceo", name: "CEO", companyId: "company", role: "ceo", status: "idle" }]);
    mocks.update.mockResolvedValue({ ...company, interactionResolverGovernance: { executiveDelegation: grant } });
    container = document.createElement("div"); document.body.append(container);
    root = createRoot(container);
    client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  });
  afterEach(async () => { await act(async () => root.unmount()); client.clear(); container.remove(); });
  async function render(value = company) {
    await act(async () => root.render(<QueryClientProvider client={client}><ExecutiveDelegationSettings key={value.id} company={value} /></QueryClientProvider>));
    await vi.waitFor(() => expect(mocks.members).toHaveBeenCalled());
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
  }
  const toggle = () => container.querySelector<HTMLButtonElement>('[role="switch"]')!;
  it.each(["owner", "admin"])("lets an active %s explicitly delegate and revoke", async role => {
    mocks.members.mockResolvedValue(members(role));
    await render();
    await vi.waitFor(() => expect(toggle().disabled).toBe(false));
    expect(mocks.update).not.toHaveBeenCalled();
    await act(async () => toggle().click());
    await vi.waitFor(() => expect(toggle().getAttribute("aria-checked")).toBe("true"));
    expect(mocks.update).toHaveBeenCalledExactlyOnceWith("company", "ceo");
    expect(container.textContent).toContain("real agent identity");
    expect(container.textContent).toContain("Private personal requests");
    mocks.update.mockResolvedValue(company);
    await act(async () => toggle().click());
    await vi.waitFor(() => expect(toggle().getAttribute("aria-checked")).toBe("false"));
    expect(mocks.update).toHaveBeenLastCalledWith("company", null);
  });
  it.each([
    ["operator", "active", "owner"], ["viewer", "active", "owner"], ["owner", "suspended", "owner"],
    ["admin", "pending", "owner"], ["owner", "active", "someone-else"],
  ])("does not infer authority from an instance/local admin summary: %s/%s/%s", async (role, status, userId) => {
    mocks.members.mockResolvedValue(members(role, status, userId));
    await render();
    expect(toggle().disabled).toBe(true);
    await act(async () => toggle().click());
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("offers only available CEOs in the selected company", async () => {
    mocks.agents.mockResolvedValue([
      { id: "ceo", name: "CEO", companyId: "company", role: "ceo", status: "idle" },
      { id: "foreign", name: "Foreign", companyId: "elsewhere", role: "ceo", status: "idle" },
      { id: "paused", name: "Paused", companyId: "company", role: "ceo", status: "paused" },
      { id: "builder", name: "Builder", companyId: "company", role: "engineer", status: "idle" },
    ]);
    await render();
    await vi.waitFor(() => expect(toggle().disabled).toBe(false));
    expect([...container.querySelectorAll("option")].map(option => option.value)).toEqual(["", "ceo"]);
  });
  it("keeps the saved grant off when the server rejects delegation", async () => {
    mocks.update.mockRejectedValue(new Error("CEO membership is no longer active."));
    await render();
    await vi.waitFor(() => expect(toggle().disabled).toBe(false));
    await act(async () => toggle().click());
    await vi.waitFor(() => expect(container.querySelector('[role="alert"]')?.textContent).toContain("no longer active"));
    expect(toggle().getAttribute("aria-checked")).toBe("false");
    expect(mocks.update).toHaveBeenCalledTimes(1);
  });
  it("allows revocation even when the delegated CEO becomes unavailable", async () => {
    mocks.agents.mockResolvedValue([]);
    mocks.update.mockResolvedValue(company);
    await render({ ...company, interactionResolverGovernance: { executiveDelegation: grant } });
    await vi.waitFor(() => expect(toggle().disabled).toBe(false));
    expect(container.textContent).toContain("currently unavailable");
    await act(async () => toggle().click());
    await vi.waitFor(() => expect(mocks.update).toHaveBeenCalledExactlyOnceWith("company", null));
  });
  it("does not carry the previous company's grant into a new company", async () => {
    await render({ ...company, interactionResolverGovernance: { executiveDelegation: grant } });
    await render({ ...company, id: "other-company" });
    expect(toggle().getAttribute("aria-checked")).toBe("false");
    expect(toggle().disabled).toBe(true);
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
