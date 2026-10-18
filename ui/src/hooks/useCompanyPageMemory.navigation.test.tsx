// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import type { CompanySelectionSource } from "../lib/company-selection";
import { useCompanyPageMemory } from "./useCompanyPageMemory";

const state = vi.hoisted(() => ({
  selectedCompanyId: "tre",
  selectionSource: "route_sync" as CompanySelectionSource,
  setSelectedCompanyId: vi.fn(),
  navigate: vi.fn(),
  location: { pathname: "/TRE/dashboard", search: "" },
}));
const companies = [
  { id: "tre", issuePrefix: "TRE" },
  { id: "tql", issuePrefix: "TQL" },
];
vi.mock("../context/CompanyContext", () => ({
  useCompany: () => ({
    companies,
    selectedCompanyId: state.selectedCompanyId,
    selectionSource: state.selectionSource,
    selectedCompany: companies.find(company => company.id === state.selectedCompanyId),
    setSelectedCompanyId: state.setSelectedCompanyId,
  }),
}));
vi.mock("@/lib/router", () => ({
  useLocation: () => state.location,
  useNavigate: () => state.navigate,
}));
function Probe() { useCompanyPageMemory(); return null; }
let root: Root;
let container: HTMLDivElement;
async function render() { await act(async () => root.render(<MemoryRouter><Probe /></MemoryRouter>)); }
beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  state.selectedCompanyId = "tre";
  state.selectionSource = "route_sync";
  state.location = { pathname: "/TRE/dashboard", search: "" };
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

it("never overrides URL-driven switches, including rapid changes and browser history", async () => {
  await render();
  for (const company of [companies[1]!, companies[0]!, companies[1]!, companies[0]!]) {
    state.location = { pathname: `/${company.issuePrefix}/projects`, search: "" };
    // The new URL can render before the selection effect catches up.
    await render();
    state.selectedCompanyId = company.id;
    await render();
  }
  expect(state.navigate).not.toHaveBeenCalled();
  expect(JSON.parse(localStorage.getItem("whoxos.companyPaths")!)).toEqual({ tre: "/projects", tql: "/projects" });
});

it("does not replace an organization's remembered page when visiting Admin", async () => {
  await render();
  state.location = { pathname: "/TRE/admin/settings/models", search: "" };
  await render();
  expect(JSON.parse(localStorage.getItem("whoxos.companyPaths")!).tre).toBe("/dashboard");
  expect(state.navigate).not.toHaveBeenCalled();
});

it("does not let a bootstrap selection override a direct organization URL", async () => {
  await render();
  state.location = { pathname: "/TQL/projects", search: "" };
  state.selectedCompanyId = "tql";
  state.selectionSource = "bootstrap";
  await render();
  expect(state.navigate).not.toHaveBeenCalled();
});

it("consumes a manual selection once so it cannot block the next organization URL", async () => {
  await render();
  localStorage.setItem("whoxos.companyPaths", JSON.stringify({ tql: "/admin?view=monitor" }));
  state.selectedCompanyId = "tql";
  state.selectionSource = "manual";
  await render();
  expect(state.navigate).toHaveBeenCalledExactlyOnceWith("/TQL/dashboard", { replace: true });
  expect(state.setSelectedCompanyId).toHaveBeenCalledExactlyOnceWith("tql", { source: "route_sync" });
  state.selectionSource = "route_sync";
  state.location = { pathname: "/TQL/dashboard", search: "" };
  await render();
  state.selectedCompanyId = "tre";
  state.location = { pathname: "/TRE/issues", search: "" };
  await render();
  expect(state.navigate).toHaveBeenCalledTimes(1);
});

it.each(["null", "[]", "broken json", '{"tql":42}'])("switches safely with invalid saved pages: %s", async raw => {
  await render();
  localStorage.setItem("whoxos.companyPaths", raw);
  state.selectedCompanyId = "tql";
  state.selectionSource = "manual";
  await render();
  expect(state.navigate).toHaveBeenCalledExactlyOnceWith("/TQL/dashboard", { replace: true });
});
