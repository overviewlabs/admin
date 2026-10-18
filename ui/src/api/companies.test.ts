import { afterEach, expect, it, vi } from "vitest";
import { companiesApi } from "./companies";

afterEach(() => vi.unstubAllGlobals());

it("uses the dedicated delegation route for explicit grant and revoke", async () => {
  const fetchMock = vi.fn().mockImplementation(async () => Response.json({ id: "company" }));
  vi.stubGlobal("fetch", fetchMock);
  await companiesApi.updateExecutiveDelegation("company", "ceo");
  await companiesApi.updateExecutiveDelegation("company", null);
  expect(fetchMock.mock.calls.map(([url, options]) => ({ url, method: options.method, body: JSON.parse(options.body) }))).toEqual([
    { url: "/api/companies/company/executive-delegation", method: "PATCH", body: { agentId: "ceo" } },
    { url: "/api/companies/company/executive-delegation", method: "PATCH", body: { agentId: null } },
  ]);
});

it("does not replay or revoke the reserved grant when saving ordinary governance", async () => {
  const fetchMock = vi.fn().mockResolvedValue(Response.json({ id: "company" }));
  vi.stubGlobal("fetch", fetchMock);
  await companiesApi.update("company", { name: "Acme", interactionResolverGovernance: {
    ask_user_questions: { defaultPolicy: "human_only" },
    executiveDelegation: { agentId: "ceo", grantedByUserId: "owner", grantedAt: "2026-09-28T00:00:00Z" },
  } });
  expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toEqual({ name: "Acme", interactionResolverGovernance: { ask_user_questions: { defaultPolicy: "human_only" } } });
});

it("keeps directory requests separate from navigation and previous accounts", async () => {
  let resolveOldDirectory!: (response: Response) => void;
  const oldDirectory = new Promise<Response>((resolve) => { resolveOldDirectory = resolve; });
  const fetchMock = vi.fn()
    .mockReturnValueOnce(oldDirectory)
    .mockResolvedValueOnce(Response.json([{ id: "member-company" }]))
    .mockResolvedValueOnce(Response.json([{ id: "directory-company" }]));
  vi.stubGlobal("fetch", fetchMock);
  const previousAccount = companiesApi.directory();
  const navigation = companiesApi.list();
  companiesApi.detachInflightDirectory();
  const currentDirectory = companiesApi.directory();
  try {
    await expect(navigation).resolves.toEqual([{ id: "member-company" }]);
    await expect(currentDirectory).resolves.toEqual([{ id: "directory-company" }]);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "/api/companies", "/api/companies?scope=accessible", "/api/companies",
    ]);
  } finally {
    resolveOldDirectory(Response.json([]));
    await previousAccount;
  }
});

it("requests navigable companies and detaches the same request when accounts change", async () => {
  let resolveOldRequest!: (response: Response) => void;
  const oldRequest = new Promise<Response>((resolve) => { resolveOldRequest = resolve; });
  const currentCompanies = [{ id: "current-company" }];
  const fetchMock = vi.fn()
    .mockReturnValueOnce(oldRequest)
    .mockResolvedValueOnce(Response.json(currentCompanies));
  vi.stubGlobal("fetch", fetchMock);

  const previousAccount = companiesApi.list();
  companiesApi.detachInflightList();
  const currentAccount = companiesApi.list();
  try {
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "/api/companies?scope=accessible",
      "/api/companies?scope=accessible",
    ]);
    await expect(currentAccount).resolves.toEqual(currentCompanies);
  } finally {
    resolveOldRequest(Response.json([{ id: "previous-company" }]));
    await previousAccount;
  }
});
