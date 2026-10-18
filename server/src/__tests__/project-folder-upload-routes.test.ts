import { afterEach, beforeEach, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { mkdtemp, readdir, rm, readFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
const state = vi.hoisted(() => ({ root: "", fail: false, create: vi.fn(), workspace: vi.fn(), activity: vi.fn() }));
vi.mock("../home-paths.js", async importOriginal => ({ ...await importOriginal<typeof import("../home-paths.js")>(), resolveManagedProjectWorkspaceDir: ({ companyId, projectId }: { companyId: string; projectId: string }) => `${state.root}/${companyId}/${projectId}/_default` }));
vi.mock("../services/index.js", () => ({
  projectService: () => ({ create: state.create, createWorkspace: state.workspace, getById: async (id: string) => ({ id }) }),
  accessService: () => ({}), workspaceOperationService: () => ({}), logActivity: vi.fn(),
}));
vi.mock("../services/secrets.js", () => ({ secretService: () => ({}) }));
vi.mock("../services/instance-settings.js", () => ({ instanceSettingsService: () => ({}) }));
vi.mock("../services/activity-log.js", () => ({ persistActivity: state.activity, publishActivity: vi.fn() }));
import { projectRoutes } from "../routes/projects.js";
const company = "79255634-54f2-4a25-b72f-19f2808ad251";
function app(actor: object = { type: "board", userId: "user", companyIds: [company], source: "session" }) {
  const result = express();
  result.use((req, _res, next) => { Object.assign(req, { actor }); next(); });
  result.use(projectRoutes({ transaction: async (effect: (tx: unknown) => unknown) => {
    const value = await effect({});
    if (state.fail) throw new Error("Transaction failed");
    return value;
  } } as never));
  result.use((error: Error & { status?: number }, _req: express.Request, res: express.Response, _next: express.NextFunction) => res.status(error.status ?? 500).json({ error: error.message }));
  return result;
}
beforeEach(async () => {
  state.root = await mkdtemp(path.join(tmpdir(), "folder-route-"));
  state.fail = false;
  vi.clearAllMocks();
  state.activity.mockResolvedValue({ publication: null });
  state.workspace.mockResolvedValue({ id: "workspace" });
});
afterEach(async () => rm(state.root, { recursive: true, force: true }));
it("rejects other organizations before accepting file data", async () => {
  const response = await request(app()).post('/companies/0d8aad87-64f2-4f9c-a92c-94a261e140f7/projects/upload-folder');
  expect(response.status).toBe(403);
  expect(await readdir(state.root)).toEqual([]);
});
it("rejects agent uploads", async () => {
  expect((await request(app({ type: "agent", companyId: company })).post(`/companies/${company}/projects/upload-folder`)).status).toBe(403);
});
it.each([false, true])("commits only complete imported projects; transaction failure=%s", async fail => {
  state.fail = fail;
  const response = await request(app()).post(`/companies/${company}/projects/upload-folder`).field("name", "Demo").field("paths", '["src/main.txt"]').attach("files", Buffer.from("hello"), "main.txt");
  expect(response.status).toBe(fail ? 500 : 201);
  const entries = await readdir(path.join(state.root, company));
  if (fail) expect(entries).toEqual([]);
  else {
    expect(entries).toEqual([response.body.id]);
    expect(await readFile(path.join(state.root, company, response.body.id, "_default/src/main.txt"), "utf8")).toBe("hello");
    expect(state.activity).toHaveBeenCalledOnce();
    expect(state.workspace).toHaveBeenCalledWith(response.body.id, expect.objectContaining({ sourceType: "non_git_path", isPrimary: true }));
  }
});
