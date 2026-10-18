import { agents, issues, projects, type Db } from "@whoxos/db";
import { PgDialect, type PgTable } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { beforeEach, expect, it, vi } from "vitest";
import { createVoiceReadAccess } from "./voice-direct-read-access.js";

const { decide } = vi.hoisted(() => ({ decide: vi.fn() }));
vi.mock("./access.js", () => ({ accessService: () => ({ decide }) }));

const first = "11111111-1111-4111-8111-111111111111";
const second = "22222222-2222-4222-8222-222222222222";
const third = "33333333-3333-4333-8333-333333333333";
const projectId = "44444444-4444-4444-8444-444444444444";
const parentId = "55555555-5555-4555-8555-555555555555";
const agentId = "66666666-6666-4666-8666-666666666666";
const board = { type: "board" as const, userId: "owner", companyIds: ["company"] };
const scope = { companyId: "company", agentId };

beforeEach(() => { decide.mockReset().mockImplementation(async ({ action }) => ({ allowed: action !== "company_scope:read" })); });

function fixture() {
  const rows = new Map<PgTable, Record<string, unknown>[]>([
    [issues, [first, second, third].map(id => ({ id, companyId: "company", projectId, parentId, assigneeAgentId: agentId, assigneeUserId: "assignee", status: "in_progress", conversationAgentId: null }))],
    [agents, [first, second, third, agentId].map(id => ({ id, companyId: "company" }))],
    [projects, [first, second, third, projectId].map(id => ({ id, companyId: "company" }))],
  ]);
  const select = vi.fn(() => ({ from: (table: PgTable) => ({ where: async (predicate: SQL) => {
    const params = new PgDialect().sqlToQuery(predicate).params;
    return rows.get(table)?.filter(row => row.id === params[0] && row.companyId === params[1]) ?? [];
  } }) }));
  const helper = createVoiceReadAccess({ select } as unknown as Db, board, scope);
  return { helper, rows, select };
}

it("checks canonical issue context against both the member and selected agent", async () => {
  const { helper } = fixture();
  await helper.assertOperation("get_task", { id: first });
  const issueScope = { issueId: first, projectId, parentIssueId: parentId, assigneeAgentId: agentId, assigneeUserId: "assignee" };
  for (const actor of [board, { type: "agent", agentId, companyId: "company" }]) {
    expect(decide).toHaveBeenCalledWith({
      actor, action: "issue:read", scope: issueScope,
      resource: { type: "issue", companyId: "company", ...issueScope, status: "in_progress" },
    });
  }
});

it.each(["get_task", "list_comments", "list_documents", "get_document", "get_agent", "get_project"])("denies %s when either member or agent cannot read", async action => {
  for (const denied of ["board", "agent"]) {
    decide.mockImplementation(async ({ actor }) => ({ allowed: actor.type !== denied }));
    await expect(fixture().helper.assertOperation(action, { id: first })).rejects.toMatchObject({ status: 403 });
  }
});

it("uses the exact project and agent read permissions", async () => {
  const { helper } = fixture();
  await helper.assertOperation("get_agent", { id: first });
  await helper.assertOperation("get_project", { id: second });
  expect(decide).toHaveBeenCalledWith({ actor: board, action: "agent:read", resource: { type: "agent", companyId: "company", agentId: first } });
  expect(decide).toHaveBeenCalledWith({ actor: board, action: "project:read", resource: { type: "project", companyId: "company", projectId: second } });
});

it("rejects foreign, missing and malformed references plus other conversations", async () => {
  const { helper, rows } = fixture();
  rows.get(issues)![0].conversationAgentId = agentId;
  rows.get(issues)![1].companyId = "foreign";
  expect(await helper.canReadResource("issue", { id: first })).toBe(false);
  expect(await helper.canReadResource("issue", { id: second })).toBe(false);
  expect(await helper.canReadResource("agent", { id: first, companyId: "foreign" })).toBe(false);
  expect(await helper.canReadResource("agent", { id: parentId })).toBe(false);
  expect(await helper.canReadResource("agent", { id: "not-a-uuid" })).toBe(false);
  expect(decide).not.toHaveBeenCalled();
});

it.each(["list_tasks", "list_agents", "list_projects"])("filters %s to the read-policy intersection instead of denying the whole list", async action => {
  const { helper } = fixture();
  decide.mockImplementation(async ({ actor, resource, action: permission }) => {
    if (permission === "company_scope:read") return { allowed: false };
    const id = resource.issueId ?? resource.agentId ?? resource.projectId;
    return { allowed: actor.type === "board" ? id !== second : id !== first };
  });
  const input = [first, second, third].map(id => ({ id, companyId: "company", title: id }));
  await expect(helper.assertOperation(action)).resolves.toBeUndefined();
  expect(await helper.filterResult(action, input)).toEqual([input[2]]);
});

it("matches the task list's company-wide read allowance separately for each actor", async () => {
  const { helper } = fixture();
  decide.mockImplementation(async ({ actor, action, resource }) => ({
    allowed: actor.type === "board" ? action === "company_scope:read" : resource.issueId === second,
  }));
  const input = [first, second].map(id => ({ id, companyId: "company" }));
  expect(await helper.filterResult("list_tasks", input)).toEqual([input[1]]);
  expect(decide.mock.calls.filter(([call]) => call.actor.type === "board" && call.action === "issue:read")).toHaveLength(0);
  // Detail reads use the endpoint's own issue:read decision, even when list
  // access was admitted through company_scope:read.
  await expect(helper.assertOperation("get_task", { id: second })).rejects.toMatchObject({ status: 403 });
});

it("does not substitute company-wide task read for project or agent read", async () => {
  const { helper } = fixture();
  decide.mockImplementation(async ({ action }) => ({ allowed: action === "company_scope:read" }));
  expect(await helper.filterResult("list_agents", [{ id: first }])).toEqual([]);
  expect(await helper.filterResult("list_projects", [{ id: first }])).toEqual([]);
});

it("filters compact projections with canonical database scope and refuses spoofed company fields", async () => {
  const { helper } = fixture();
  const input = [{ id: first }, { id: second, companyId: "foreign" }, null, { id: "bad" }, { id: third, companyId: 123 }];
  expect(await helper.filterResult("list_tasks", input)).toEqual([{ id: first }]);
  expect(decide).toHaveBeenCalledWith(expect.objectContaining({ action: "issue:read", resource: expect.objectContaining({ issueId: first, projectId, parentIssueId: parentId }) }));
});

it("caches only within one helper instance and rechecks access on the next request", async () => {
  const { helper, select } = fixture();
  expect(await helper.canReadResource("issue", { id: first })).toBe(true);
  expect(await helper.canReadResource("issue", { id: first })).toBe(true);
  expect(select).toHaveBeenCalledTimes(1);
  expect(decide).toHaveBeenCalledTimes(2);
  decide.mockResolvedValue({ allowed: false });
  expect(await fixture().helper.canReadResource("issue", { id: first })).toBe(false);
});

it("preserves membership-only endpoint behavior without inventing broader read grants", async () => {
  const { helper } = fixture();
  decide.mockResolvedValue({ allowed: false });
  for (const action of ["overview", "list_goals", "get_goal", "list_skills", "list_secret_proposals"]) {
    await expect(helper.assertOperation(action, { id: first })).resolves.toBeUndefined();
    const result = { value: "already authorized by the endpoint" };
    expect(await helper.filterResult(action, result)).toBe(result);
  }
  expect(decide).not.toHaveBeenCalled();
});
