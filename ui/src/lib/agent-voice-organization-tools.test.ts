import { beforeEach, expect, it, vi } from "vitest";
import { executeOrganizationVoiceTool as execute } from "./agent-voice-organization-tools";
const mocks = vi.hoisted(() => ({ get: vi.fn(), list: vi.fn(), update: vi.fn(), create: vi.fn(), pause: vi.fn(), resume: vi.fn(), summary: vi.fn() }));
vi.mock("@/api/issues", () => ({ issuesApi: mocks }));
vi.mock("@/api/agents", () => ({ agentsApi: mocks }));
vi.mock("@/api/projects", () => ({ projectsApi: mocks }));
vi.mock("@/api/dashboard", () => ({ dashboardApi: mocks }));
const id = "11111111-1111-4111-8111-111111111111";
beforeEach(() => { vi.resetAllMocks(); });
it("uses the organization scoped API and strips sensitive agent configuration", async () => {
 mocks.list.mockResolvedValue([{ id, companyId: "company", name: "CEO", adapterConfig: { apiKey: "private" } }]);
 const result = await execute("company", { action: "list_agents" }, "call");
 expect(mocks.list).toHaveBeenCalledWith("company"); expect(JSON.stringify(result)).not.toContain("private");
});
it("rejects foreign resources before mutations", async () => {
 mocks.get.mockResolvedValue({ id, companyId: "other" });
 await expect(execute("company", { action: "update_task", id, data: '{"title":"Changed"}' }, "call")).rejects.toThrow("outside");
 expect(mocks.update).not.toHaveBeenCalled();
});
it("rejects cross-organization assignees and unknown privileged fields", async () => {
 mocks.get.mockResolvedValue({ id, companyId: "other" });
 await expect(execute("company", { action: "create_task", data: JSON.stringify({ title: "Build", assigneeAgentId: id }) }, "call")).rejects.toThrow("outside");
 await expect(execute("company", { action: "create_task", data: '{"title":"Build","companyId":"other"}' }, "call")).rejects.toThrow();
 expect(mocks.create).not.toHaveBeenCalled();
});
it("creates tasks directly with an idempotency key and does not automatically start them", async () => {
 mocks.create.mockResolvedValue({ id, title: "Plan", status: "backlog" });
 await execute("company", { action: "create_task", data: '{"title":"Plan"}' }, "call");
 expect(mocks.create).toHaveBeenCalledWith("company", { title: "Plan", status: "backlog", idempotencyKey: "voice:call" });
});
it("preserves normal API permission denials", async () => {
 mocks.get.mockResolvedValue({ id, companyId: "company" }); mocks.pause.mockRejectedValue(new Error("Forbidden"));
 await expect(execute("company", { action: "pause_agent", id }, "call")).rejects.toThrow("Forbidden");
});

it.each(["get_agent", "pause_agent", "resume_agent", "get_task", "get_project"])("rejects foreign resources for %s", async action => {
 mocks.get.mockResolvedValue({ id, companyId: "other", adapterConfig: { apiKey: "private" } });
 await expect(execute("company", { action, id }, "call")).rejects.toThrow("outside");
 expect(mocks.pause).not.toHaveBeenCalled();
 expect(mocks.resume).not.toHaveBeenCalled();
});

it.each(["list_agents", "list_tasks", "list_projects"])("does not leak a foreign record returned by %s", async action => {
 mocks.list.mockResolvedValue([{ id, companyId: "other" }]);
 await expect(execute("company", { action }, "call")).rejects.toThrow("outside");
});

it("rejects cross-organization projects before creating or updating tasks", async () => {
 mocks.get.mockResolvedValue({ id, companyId: "other" });
 for (const action of ["create_task", "update_task"]) {
  await expect(execute("company", { action, id, data: JSON.stringify({ title: "Task", projectId: id }) }, "call")).rejects.toThrow("outside");
 }
 expect(mocks.create).not.toHaveBeenCalled();
 expect(mocks.update).not.toHaveBeenCalled();
});

it("keeps conversations out of task lists, reads, and mutations", async () => {
 const chat = { id, companyId: "company", conversationAgentId: "agent", description: "Private conversation" };
 mocks.list.mockResolvedValue([chat, { id: "task", companyId: "company", title: "Ordinary task" }]);
 expect(await execute("company", { action: "list_tasks" }, "call")).toEqual([expect.objectContaining({ id: "task" })]);
 mocks.get.mockResolvedValue(chat);
 await expect(execute("company", { action: "get_task", id }, "call")).rejects.toThrow("Use chat tools");
 await expect(execute("company", { action: "update_task", id, data: '{"status":"done"}' }, "call")).rejects.toThrow("Use chat tools");
 expect(mocks.update).not.toHaveBeenCalled();
});

it.each([undefined, "{}", "[]", "null", '{"name":42}', '{"name":"Build","workspace":{"setupCommand":"dangerous"}}', '{"name":"Build","env":{"KEY":"private"}}'])("rejects invalid project creation data %s before calling the API", async data => {
 await expect(execute("company", { action: "create_project", ...(data === undefined ? {} : { data }) }, "call")).rejects.toThrow();
 expect(mocks.create).not.toHaveBeenCalled();
});

it.each(["create_task", "update_task", "create_project", "update_project"])("rejects malformed JSON for %s", async action => {
 await expect(execute("company", { action, id, data: "{bad json" }, "call")).rejects.toThrow("valid JSON object");
 expect(mocks.create).not.toHaveBeenCalled();
 expect(mocks.update).not.toHaveBeenCalled();
});

it.each(["update_task", "update_project"])("rejects empty %s instead of reporting a misleading success", async action => {
 await expect(execute("company", { action, id, data: "{}" }, "call")).rejects.toThrow("at least one field");
 expect(mocks.update).not.toHaveBeenCalled();
});

it.each(["get_agent", "pause_agent", "resume_agent", "get_task", "get_project"])("requires a resource UUID before %s", async action => {
 for (const invalidId of [undefined, "https://example.com", "../other"]) {
  await expect(execute("company", { action, ...(invalidId ? { id: invalidId } : {}) }, "call")).rejects.toThrow();
 }
 expect(mocks.get).not.toHaveBeenCalled();
});

it("rejects actions and request fields outside the tool contract", async () => {
 await expect(execute("company", { action: "delete_company", id }, "call")).rejects.toThrow();
 await expect(execute("company", { action: "list_agents", companyId: "other" }, "call")).rejects.toThrow();
 await expect(execute("company", { action: "overview", url: "/secrets" }, "call")).rejects.toThrow();
 expect(mocks.list).not.toHaveBeenCalled();
 expect(mocks.summary).not.toHaveBeenCalled();
});

it("reuses the durable project creation key after an ambiguous failed response", async () => {
 mocks.create.mockRejectedValueOnce(new Error("Connection lost after commit")).mockResolvedValueOnce({ id, name: "Site" });
 const args = { action: "create_project", data: '{"name":"Site"}' };
 await expect(execute("company", args, "session:call")).rejects.toThrow("Connection lost");
 await expect(execute("company", args, "session:call")).resolves.toMatchObject({ id, name: "Site" });
 expect(mocks.create.mock.calls).toEqual([
  ["company", { name: "Site", idempotencyKey: "voice:session:call" }],
  ["company", { name: "Site", idempotencyKey: "voice:session:call" }],
 ]);
});

it.each(["create_task", "create_project"])("requires a bounded nonempty receipt for %s", async action => {
 const data = action === "create_task" ? '{"title":"Task"}' : '{"name":"Project"}';
 for (const callId of ["", "   ", "x".repeat(250)]) {
  await expect(execute("company", { action, data }, callId)).rejects.toThrow();
 }
 expect(mocks.create).not.toHaveBeenCalled();
});

it("updates tasks using the original resource and only requested fields", async () => {
 mocks.get.mockResolvedValue({ id, companyId: "company", conversationAgentId: null });
 mocks.update.mockResolvedValue({ id, title: "Updated", status: "todo", runtime: { secret: "private" } });
 const result = await execute("company", { action: "update_task", id, data: '{"title":"Updated","assigneeAgentId":null,"projectId":null}' }, "call");
 expect(mocks.update).toHaveBeenCalledWith(id, { title: "Updated", assigneeAgentId: null, projectId: null });
 expect(result).toMatchObject({ id, title: "Updated", status: "todo" });
 expect(JSON.stringify(result)).not.toContain("private");
});

it("checks voice assignment permissions before any task mutation, including status changes", async () => {
 const denied = vi.fn().mockRejectedValue(new Error("Agent cannot delegate"));
 mocks.get.mockResolvedValue({ id, companyId: "company" });
 await expect(execute("company", { action: "create_task", data: JSON.stringify({ title: "Build", assigneeAgentId: id, status: "todo" }) }, "call", denied)).rejects.toThrow("cannot delegate");
 expect(mocks.create).not.toHaveBeenCalled();
 await expect(execute("company", { action: "update_task", id, data: '{"status":"todo"}' }, "call", denied)).rejects.toThrow("cannot delegate");
 expect(mocks.update).not.toHaveBeenCalled();
 expect(denied).toHaveBeenLastCalledWith({ id, assigneeAgentId: undefined, projectId: undefined });
});
it("assigns requested runnable work once through normal task creation after authorization", async () => {
 const allowed = vi.fn().mockResolvedValue({ allowed: true });
 mocks.get.mockResolvedValue({ id, companyId: "company", name: "Engineer" });mocks.create.mockResolvedValue({ id, assigneeAgentId: id, status: "todo" });
 expect(await execute("company", { action: "create_task", data: JSON.stringify({ title: "Build", assigneeAgentId: id, status: "todo" }) }, "call", allowed)).toMatchObject({ assigneeAgentId: id, status: "todo" });
 expect(allowed).toHaveBeenCalledOnce();expect(mocks.create).toHaveBeenCalledOnce();
 expect(mocks.create).toHaveBeenCalledWith("company", expect.objectContaining({ assigneeAgentId: id, status: "todo", idempotencyKey: "voice:call" }));
});
it("filters assignment queries on the server before limiting results", async () => {
 mocks.list.mockResolvedValue([]);
 await execute("company", { action: "list_tasks", data: JSON.stringify({ assigneeAgentId: id, status: "in_progress" }) }, "call");
 expect(mocks.list).toHaveBeenCalledWith("company", { assigneeAgentId: id, status: "in_progress", limit: 100 });
});

function activeSession() {
 let active = true;
 return {
  assertActive: () => { if (!active) throw new Error("Voice session ended"); },
  end: () => { active = false; },
 };
}

it.each(["pause_agent", "resume_agent", "update_project"])("does not execute %s after voice ends during its resource lookup", async action => {
 const session = activeSession();
 mocks.get.mockImplementationOnce(async () => {
  session.end();
  return { id, companyId: "company" };
 });
 await expect(execute("company", { action, id, data: '{"name":"Updated"}' }, "call", undefined, session.assertActive)).rejects.toThrow("Voice session ended");
 expect(mocks.pause).not.toHaveBeenCalled();
 expect(mocks.resume).not.toHaveBeenCalled();
 expect(mocks.update).not.toHaveBeenCalled();
});

it.each(["create_task", "update_task"])("does not execute %s after voice ends while assignment authorization is pending", async action => {
 const session = activeSession();
 mocks.get.mockResolvedValue({ id, companyId: "company" });
 const authorizeTask = vi.fn(async () => { session.end(); return { allowed: true }; });
 await expect(execute("company", { action, id, data: JSON.stringify({ title: "Build", assigneeAgentId: id, projectId: id }) }, "call", authorizeTask, session.assertActive)).rejects.toThrow("Voice session ended");
 expect(authorizeTask).toHaveBeenCalledOnce();
 expect(mocks.create).not.toHaveBeenCalled();
 expect(mocks.update).not.toHaveBeenCalled();
});

it.each(["create_task", "update_task"])("does not request assignment authorization for %s after voice ends during lookup", async action => {
 const session = activeSession();
 mocks.get.mockImplementation(async () => {
  session.end();
  return { id, companyId: "company" };
 });
 const authorizeTask = vi.fn();
 await expect(execute("company", { action, id, data: JSON.stringify({ title: "Build", assigneeAgentId: id }) }, "call", authorizeTask, session.assertActive)).rejects.toThrow("Voice session ended");
 expect(authorizeTask).not.toHaveBeenCalled();
 expect(mocks.create).not.toHaveBeenCalled();
 expect(mocks.update).not.toHaveBeenCalled();
});

it("rejects an expired session before submitting a project creation", async () => {
 const session = activeSession();
 session.end();
 await expect(execute("company", { action: "create_project", data: '{"name":"Website"}' }, "call", undefined, session.assertActive)).rejects.toThrow("Voice session ended");
 expect(mocks.create).not.toHaveBeenCalled();
});

it("preserves the result of work already submitted before voice ended", async () => {
 const session = activeSession();
 mocks.create.mockImplementationOnce(async () => { session.end(); return { id, name: "Website" }; });
 await expect(execute("company", { action: "create_project", data: '{"name":"Website"}' }, "call", undefined, session.assertActive)).resolves.toMatchObject({ id, name: "Website" });
 expect(mocks.create).toHaveBeenCalledOnce();
});
