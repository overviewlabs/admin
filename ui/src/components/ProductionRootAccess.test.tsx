// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ProductionRootAccess } from "./ProductionRootAccess";
const get = vi.hoisted(() => vi.fn());
const patch = vi.hoisted(() => vi.fn());
const toast = vi.hoisted(() => vi.fn());
vi.mock("../api/client", () => ({ api: { get, patch } }));
vi.mock("../context/ToastContext", () => ({ useToastActions: () => ({ pushToast: toast }) }));
let container: HTMLDivElement, root: Root, client: QueryClient;
const status = { eligible: true, available: true, enabled: false, canManage: true, target: "production" };
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  get.mockReset().mockResolvedValue(status); patch.mockReset(); toast.mockReset();
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
});
afterEach(async () => { await act(async () => root.unmount()); client.clear(); container.remove(); });
async function render() {
  await act(async () => root.render(<QueryClientProvider client={client}><ProductionRootAccess companyId="company" agentId="agent" /></QueryClientProvider>));
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
}
async function click() { await act(async () => { container.querySelector("button")!.click(); await new Promise(resolve => setTimeout(resolve, 10)); }); }
it("enables and revokes through the privileged endpoint without changing unrelated agent permissions", async () => {
  patch.mockImplementation(async (_path, body) => ({ ...status, enabled: body.enabled }));
  await render();
  expect(container.textContent).toContain("all hosted organizations");
  expect(container.querySelector("button")!.disabled).toBe(false);
  await click();
  expect(patch).toHaveBeenLastCalledWith("/companies/company/agents/agent/production-root", { enabled: true });
  expect(container.querySelector("button")!.getAttribute("aria-checked")).toBe("true");
  await click();
  expect(patch).toHaveBeenLastCalledWith("/companies/company/agents/agent/production-root", { enabled: false });
});
it.each([{ ...status, available: false }, { ...status, canManage: false }])("keeps unavailable or unauthorized controls disabled", async value => {
  get.mockResolvedValue(value); await render();
  expect(container.querySelector("button")!.disabled).toBe(true);
  expect(patch).not.toHaveBeenCalled();
});
it("keeps the authoritative state and shows failed grants instead of optimistic success", async () => {
  patch.mockRejectedValue(new Error("Access revoked")); await render(); await click();
  expect(container.querySelector("button")!.getAttribute("aria-checked")).toBe("false");
  expect(toast).toHaveBeenCalledWith(expect.objectContaining({ tone: "error", body: "Access revoked" }));
});

it("hides the control for organizations outside WHOXOS", async () => {
  get.mockResolvedValue({ ...status, eligible: false }); await render();
  expect(container.textContent).toBe("");
  expect(container.querySelector("button")).toBeNull();
  expect(patch).not.toHaveBeenCalled();
});
