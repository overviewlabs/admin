import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { webResearchRoutes } from "../routes/web-research.js";
import { executeWebResearch } from "../services/web-research.js";
import { callVoiceApi } from "../services/voice-direct-api.js";

const mocks = vi.hoisted(() => ({ decide: vi.fn(), search: vi.fn(), read: vi.fn() }));
vi.mock("../services/access.js", () => ({ accessService: () => ({ decide: mocks.decide }) }));
vi.mock("../services/web-search.js", () => ({ searchWeb: mocks.search, readWebPage: mocks.read }));
const companyId = "01234567-0000-4000-8000-000000000001";
const agentId = "01234567-0000-4000-8000-000000000002";
const issueId = "01234567-0000-4000-8000-000000000003";
const actor = { type: "board", source: "session", userId: "speaker", companyIds: [companyId] };
const db = {} as any; // Any model run/DB mutation would fail in these read-only tests.
function app() {
  const app = express(); app.use(express.json());
  app.use((req, _res, next) => { req.actor = req.get("x-agent") ? { type: "agent", agentId, companyId: req.get("x-agent")! } : actor as any; next(); });
  app.use(webResearchRoutes(db));
  app.use((error: any, _req: any, res: any, _next: any) => res.status(error.status ?? 500).json({ error: error.message }));
  return app;
}
beforeEach(() => {
  vi.clearAllMocks(); mocks.decide.mockResolvedValue({ allowed: true });
  mocks.search.mockResolvedValue({ provider: "searxng", query: "weather", results: [{ title: "Forecast", url: "https://weather.gov/", snippet: "Forecast details" }], sources: [{ title: "Forecast", uri: "https://weather.gov/" }] });
  mocks.read.mockResolvedValue({ provider: "web", url: "https://weather.gov/", title: "Forecast", text: "Current conditions", sources: [], truncated: false });
});
describe("authenticated core web research", () => {
  it("searches and reads public sources under the authenticated organization", async () => {
    const search = await request(app()).post(`/companies/${companyId}/web/search`).send({ query: "weather", count: 5 });
    expect(search.status).toBe(200); expect(search.body.sources[0].uri).toBe("https://weather.gov/");
    expect(search.headers["cache-control"]).toBe("no-store");
    expect(mocks.search).toHaveBeenCalledWith({ query: "weather", category: "general", count: 5 }, { scopeKey: `${companyId}:speaker` });
    expect((await request(app()).post(`/companies/${companyId}/web/read`).send({ url: "https://weather.gov/" })).status).toBe(200);
  });
  it.each(["general", "images", "videos", "news"])("passes one explicit %s category unchanged", async category => {
    const response = await request(app()).post(`/companies/${companyId}/web/search`).send({ query: "Hamilton Ohio", category });
    expect(response.status).toBe(200);
    expect(mocks.search).toHaveBeenCalledWith({ query: "Hamilton Ohio", category }, { scopeKey: `${companyId}:speaker` });
  });
  it.each(["general,news", ["images", "videos"], "music", "", null])("rejects combined or unsupported category %j", async category => {
    expect((await request(app()).post(`/companies/${companyId}/web/search`).send({ query: "Hamilton Ohio", category })).status).toBe(400);
    expect(mocks.search).not.toHaveBeenCalled();
  });
  it("denies cross-company keys and denied tool policies before any fetch", async () => {
    expect((await request(app()).post(`/companies/${companyId}/web/search`).set("x-agent", "other-company").send({ query: "weather" })).status).toBe(403);
    mocks.decide.mockResolvedValue({ allowed: false, explanation: "Policy denied" });
    expect((await request(app()).post(`/companies/${companyId}/web/read`).send({ url: "https://weather.gov/" })).status).toBe(403);
    expect(mocks.search).not.toHaveBeenCalled(); expect(mocks.read).not.toHaveBeenCalled();
  });
  it.each([{ query: "" }, { query: "weather", count: 100 }, { query: "weather", companyId: "other" }, { query: "weather", endpoint: "http://localhost/" }])("rejects invalid or injected fields %j", async data => {
    expect((await request(app()).post(`/companies/${companyId}/web/search`).send(data)).status).toBe(400);
    expect(mocks.search).not.toHaveBeenCalled();
  });
  it("intersects voice user's tool access with the selected agent's credential scope", async () => {
    mocks.decide.mockImplementation(async ({ actor }) => ({ allowed: actor.type !== "agent", explanation: "Restricted agent scope" }));
    await expect(executeWebResearch(db, { actor, method: "POST" } as any, companyId, "search_web", { query: "weather" }, agentId)).rejects.toMatchObject({ status: 403 });
    expect(mocks.decide.mock.calls.map(([arg]) => arg.action)).toEqual(["tools:use", "company_scope:read"]);
    expect(mocks.search).not.toHaveBeenCalled();
  });
  it("runs voice searches directly with no model fallback or audit-run mutation", async () => {
    const result = await callVoiceApi(db, { actor, method: "POST" } as any, { companyId, agentId, issueId, userId: "speaker" }, { action: "search_web", data: JSON.stringify({ query: "weather", category: "general" }) });
    expect(result).toMatchObject({ provider: "searxng" }); expect(mocks.search).toHaveBeenCalledTimes(1);
    await expect(callVoiceApi(db, { actor, method: "POST" } as any, { companyId, agentId, issueId, userId: "other" }, { action: "search_web", data: JSON.stringify({ query: "weather" }) })).rejects.toMatchObject({ status: 403 });
    expect(mocks.search).toHaveBeenCalledTimes(1);
  });
  it.each([undefined, null, "", "general,news", ["general", "news"]])("never defaults an absent or invalid voice category %j to General", async category => {
    await expect(callVoiceApi(db, { actor, method: "POST" } as any, { companyId, agentId, issueId, userId: "speaker" }, {
      action: "search_web", data: JSON.stringify({ query: "Hamilton Ohio recent crime", category }),
    })).rejects.toMatchObject({ status: 400 });
    expect(mocks.search).not.toHaveBeenCalled();
  });
  it("preserves the selected News category and requested freshness through the legacy voice path", async () => {
    const data = { query: '"Hamilton" "Ohio" crime', category: "news", timeRange: "week", count: 3 };
    await callVoiceApi(db, { actor, method: "POST" } as any, { companyId, agentId, issueId, userId: "speaker" }, { action: "search_web", data: JSON.stringify(data) });
    expect(mocks.search).toHaveBeenCalledExactlyOnceWith(data, { scopeKey: `${companyId}:speaker` });
  });
});
