import { randomUUID } from "node:crypto";
import type { Request } from "express";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  agents, agentWakeupRequests, companies, companyMemberships, authUsers, createDb, heartbeatRuns, issues,
  issueThreadInteractions, startEmbeddedPostgresTestDatabase, toolActionRequests,
  toolInvocations, toolPolicies,
} from "@whoxos/db";
import { callVoiceApi } from "./voice-direct-api.js";
import { createToolGatewayService, ToolGatewayHttpError } from "./tool-gateway.js";
import { HttpError } from "../errors.js";

vi.mock("./access.js", () => ({ accessService: () => ({ decide: async () => ({ allowed: true }) }) }));

describe("voice connector approvals with real gateway and PostgreSQL", () => {
  let temporary: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>>;
  let db: ReturnType<typeof createDb>;
  beforeAll(async () => {
    vi.stubEnv("WHOXOS_AGENT_JWT_SECRET", "voice-approval-test-jwt-secret");
    temporary = await startEmbeddedPostgresTestDatabase("voice-approval-");
    db = createDb(temporary.connectionString);
  }, 90_000);
  afterAll(async () => { await temporary?.cleanup(); vi.unstubAllEnvs(); });
  afterEach(() => vi.unstubAllGlobals());

  it.each(["__proto__", "constructor", "toString"])("rejects inherited operation name %s", async action => {
    await expect(callVoiceApi(db, {} as Request, { companyId: randomUUID(), agentId: randomUUID(), issueId: randomUUID(), userId: "owner" }, { action })).rejects.toMatchObject({ status: 400 });
  });

  async function fixture() {
    const companyId = randomUUID(), agentId = randomUUID(), issueId = randomUUID();
    await db.insert(companies).values({ id: companyId, name: "Voice approval test", issuePrefix: `V${companyId.slice(0, 8)}` });
    await db.insert(agents).values({ id: agentId, companyId, name: "Voice agent", role: "engineer" });
    await db.insert(issues).values({ id: issueId, companyId, title: "Voice chat", status: "in_review", assigneeAgentId: agentId, conversationAgentId: agentId, conversationUserId: "owner", conversationState: "waiting" });
    await db.insert(toolPolicies).values({ companyId, name: "Review writes", policyType: "require_approval", selectors: { toolName: "mcp-remote-fixture:update_note" } });
    const scope = { companyId, agentId, issueId, userId: "owner" };
    const gateway = createToolGatewayService(db, { toolActionSigningSecret: "voice-approval-test-signing-secret" });
    const req = { actor: { type: "board", userId: "owner" }, app: { locals: { voiceToolGateway: gateway } }, socket: { localPort: 1 } } as unknown as Request;
    const data = { tool: "mcp-remote-fixture:update_note", parameters: { noteId: "n1", body: "reviewed" }, idempotencyKey: randomUUID() };
    const call = (overrides: Record<string, unknown> = {}, callScope = scope) => callVoiceApi(db, req, callScope, { action: "call_connected_tool", data: JSON.stringify({ ...data, ...overrides }) });
    const pending = await call();
    expect(pending).toMatchObject({ status: "requires_approval", executed: false, code: "approval_required", actionRequestId: expect.any(String), instructions: expect.stringContaining("has not run") });
    const [action] = await db.select().from(toolActionRequests).where(eq(toolActionRequests.companyId, companyId));
    const [invocation] = await db.select().from(toolInvocations).where(eq(toolInvocations.id, action!.invocationId));
    expect(pending).toMatchObject({ actionRequestId: action!.id, invocationId: invocation!.id, interactionId: action!.interactionId, issueId });
    const approve = () => db.update(issueThreadInteractions).set({ status: "accepted", resolvedByUserId: "owner", resolvedAt: new Date() }).where(eq(issueThreadInteractions.id, action!.interactionId!));
    const runs = () => db.select().from(heartbeatRuns).where(eq(heartbeatRuns.companyId, companyId));
    return { scope, req, call, action: action!, invocation: invocation!, approve, runs, gateway };
  }

  it("reuses the original direct run and executes only signed reviewed arguments", async () => {
    const test = await fixture();
    await test.approve();
    const result = await test.call({ approvedActionRequestId: test.action.id, parameters: { noteId: "n1", body: "this tampered body must never execute" } }) as any;
    expect(result).toMatchObject({ status: "completed", invocationId: test.invocation.id });
    expect(result.result.data.bodyLength).toBe("reviewed".length);
    const runs = await test.runs();
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ id: test.invocation.runId, runtimeMode: "voice_direct", status: "succeeded", usageJson: { provider: "gemini_live", modelInvocations: 0 } });
    expect(await db.select().from(agentWakeupRequests).where(eq(agentWakeupRequests.companyId, test.scope.companyId))).toHaveLength(0);
    await expect(test.call({ approvedActionRequestId: test.action.id })).rejects.toMatchObject({ status: 409, details: { code: "action_not_approved" } });
    expect(await test.runs()).toHaveLength(1);
  });

  it("keeps task lists compact after authorization while preserving full task detail reads", async () => {
    const test = await fixture();
    const id = randomUUID();
    await db.insert(issues).values({ id, companyId: test.scope.companyId, title: "Review data", status: "blocked", assigneeAgentId: test.scope.agentId });
    const summary = { id, identifier: "TASK-1", title: "Review data", status: "blocked", priority: "high", assigneeAgentId: test.scope.agentId, projectId: null, updatedAt: "2026-09-27T00:00:00.000Z" };
    const full = { ...summary, companyId: test.scope.companyId, description: "Task instructions and evidence. ".repeat(5000), executionState: { history: "Large runtime state" }, env: { API_KEY: "private-test-key" } };
    const upstream = vi.fn(async (_url: unknown) => ({ ok: true, status: 200, json: async () => [full, { ...full, id: test.scope.issueId }, { ...full, id: randomUUID() }] }));
    vi.stubGlobal("fetch", upstream);
    const list = await callVoiceApi(db, test.req, test.scope, { action: "list_tasks" });
    expect(list).toEqual([summary]); // Chat rows and unknown IDs remain excluded.
    expect(JSON.stringify(list).length).toBeLessThan(1000);
    expect(upstream.mock.calls[0][0]).toContain("limit=100");
    upstream.mockResolvedValueOnce({ ok: true, status: 200, json: async () => full } as any);
    const detail = await callVoiceApi(db, test.req, test.scope, { action: "get_task", id });
    expect(detail).toMatchObject({ id, description: full.description, executionState: full.executionState });
    expect(JSON.stringify(detail)).not.toContain("private-test-key");
    expect(await db.select().from(agentWakeupRequests).where(eq(agentWakeupRequests.companyId, test.scope.companyId))).toHaveLength(0);
  });

  it("reads organization people directly with the authenticated voice speaker, without a model run or forwarded identity", async () => {
    const test = await fixture();
    const otherUserId = randomUUID();
    await db.insert(authUsers).values([
      { id: "owner", name: "Verified founder", email: "founder@example.test", createdAt: new Date(), updatedAt: new Date() },
      { id: otherUserId, name: "Verified administrator", email: `${otherUserId}@example.test`, createdAt: new Date(), updatedAt: new Date() },
    ]).onConflictDoNothing();
    await db.insert(companyMemberships).values([
      { companyId: test.scope.companyId, principalType: "user", principalId: "owner", status: "active", membershipRole: "owner" },
      { companyId: test.scope.companyId, principalType: "user", principalId: otherUserId, status: "active", membershipRole: "admin" },
    ]);
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    const runsBefore = (await test.runs()).length;
    const result = await callVoiceApi(db, test.req, test.scope, { action: "get_organization_context" });
    expect(result).toMatchObject({
      currentHuman: { id: "owner", name: "Verified founder", membershipRole: "owner", designation: "Founder / Owner" },
      responsibleHuman: null, counts: { humans: 2, agents: 1 },
    });
    expect(JSON.stringify(result)).toContain("Verified administrator");
    expect(JSON.stringify(result)).not.toContain("@example.test");
    expect(fetch).not.toHaveBeenCalled();
    expect((await test.runs()).length).toBe(runsBefore);
    await expect(callVoiceApi(db, test.req, { ...test.scope, userId: otherUserId }, { action: "get_organization_context" })).rejects.toMatchObject({ status: 403 });
    await expect(callVoiceApi(db, test.req, test.scope, { action: "get_organization_context", data: JSON.stringify({ currentUserId: otherUserId }) })).rejects.toMatchObject({ status: 400 });
    await db.delete(companyMemberships).where(eq(companyMemberships.principalId, "owner"));
    await expect(callVoiceApi(db, test.req, test.scope, { action: "get_organization_context" })).rejects.toMatchObject({ status: 403 });
  });

  it("retains approval enforcement when the user has not approved", async () => {
    const test = await fixture();
    await expect(test.call({ approvedActionRequestId: test.action.id })).rejects.toMatchObject({ status: 409, details: { code: "action_not_approved" } });
    const [invocation] = await db.select().from(toolInvocations).where(eq(toolInvocations.id, test.invocation.id));
    expect(invocation).toMatchObject({ status: "awaiting_approval", resultSummary: null });
    expect(await test.runs()).toHaveLength(1);
  });

  it.each(["companyId", "agentId", "issueId", "userId"] as const)("rejects a retry from another %s without reactivating the run", async field => {
    const test = await fixture();
    await test.approve();
    const createSession = vi.spyOn(test.gateway, "createSession");
    await expect(test.call({ approvedActionRequestId: test.action.id }, { ...test.scope, [field]: randomUUID() })).rejects.toMatchObject({ status: 403 });
    expect(createSession).not.toHaveBeenCalled();
    expect(await test.runs()).toMatchObject([{ id: test.invocation.runId, status: "succeeded" }]);
  });

  it.each(["runtimeMode", "triggerDetail", "contextSnapshot"] as const)("refuses to reopen a run without its direct-voice %s marker", async field => {
    const test = await fixture();
    await db.update(heartbeatRuns).set({ [field]: field === "contextSnapshot" ? { issueId: randomUUID(), source: "text" } : "legacy" }).where(eq(heartbeatRuns.id, test.invocation.runId!));
    await expect(test.call({ approvedActionRequestId: test.action.id })).rejects.toMatchObject({ status: 403 });
    expect(await test.runs()).toMatchObject([{ status: "succeeded" }]);
  });

  it.each(["running", "cancelled"])("does not reactivate a %s operation", async status => {
    const test = await fixture();
    await db.update(heartbeatRuns).set({ status }).where(eq(heartbeatRuns.id, test.invocation.runId!));
    await expect(test.call({ approvedActionRequestId: test.action.id })).rejects.toMatchObject({ status: 409 });
    expect(await test.runs()).toMatchObject([{ status }]);
  });

  it("does not let a concurrent retry claim the same originating run", async () => {
    const test = await fixture(); await test.approve();
    const original = test.gateway.executeTool.bind(test.gateway);
    let release!: () => void, entered!: () => void;
    const blocked = new Promise<void>(resolve => { release = resolve; });
    const waiting = new Promise<void>(resolve => { entered = resolve; });
    vi.spyOn(test.gateway, "executeTool").mockImplementationOnce(async args => { entered(); await blocked; return original(args); });
    const first = test.call({ approvedActionRequestId: test.action.id });
    await waiting;
    try { await expect(test.call({ approvedActionRequestId: test.action.id })).rejects.toMatchObject({ status: 409 }); }
    finally { release(); }
    expect(await first).toMatchObject({ status: "completed" });
    expect(await test.runs()).toHaveLength(1);
  });

  it("retains expiry and current connector policy checks", async () => {
    const expired = await fixture(); await expired.approve();
    await db.update(toolActionRequests).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(toolActionRequests.id, expired.action.id));
    await expect(expired.call({ approvedActionRequestId: expired.action.id })).rejects.toMatchObject({ status: 409, details: { code: "action_expired" } });
    const denied = await fixture(); await denied.approve();
    await db.insert(toolPolicies).values({ companyId: denied.scope.companyId, name: "Revoked write access", policyType: "block", priority: 0, selectors: { toolName: "mcp-remote-fixture:update_note" } });
    await expect(denied.call({ approvedActionRequestId: denied.action.id })).rejects.toMatchObject({ status: 403 });
    expect(await db.select().from(agentWakeupRequests).where(eq(agentWakeupRequests.companyId, denied.scope.companyId))).toHaveLength(0);
  });

  it("preserves actionable 4xx status and redacts secrets from upstream errors", async () => {
    const test = await fixture();
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 403, json: async () => ({ error: "Permission denied for credential fixture-sensitive-value", code: "access_denied", secretValue: "fixture-sensitive-value", details: { token: "hidden-upstream-token" } }) })));
    const result = callVoiceApi(db, test.req, test.scope, { action: "list_goals" });
    await expect(result).rejects.toMatchObject({ status: 403, details: { code: "access_denied" }, message: expect.stringContaining("Permission denied") });
    try { await result; } catch (error) {
      expect(JSON.stringify(error) + String(error)).not.toMatch(/fixture-sensitive-value|hidden-upstream-token/);
    }
  });

  it("keeps upstream server failures action-scoped without echoing provider internals", async () => {
    const test = await fixture();
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 503, json: async () => ({ error: "private provider traceback fixture-sensitive-value", token: "fixture-sensitive-value" }) })));
    await expect(callVoiceApi(db, test.req, test.scope, { action: "list_goals" })).rejects.toMatchObject({ status: 503, message: "WHOXOS could not complete this action (HTTP 503)." });
  });

  it.each([403, 503, 200])("handles unreadable HTTP %s results without leaking response content", async status => {
    const test = await fixture();
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: status === 200, status, json: async () => { throw new SyntaxError("private upstream HTML fixture-key"); } })));
    const result = callVoiceApi(db, test.req, test.scope, { action: "list_goals" });
    await expect(result).rejects.toMatchObject({ status: status === 200 ? 502 : status });
    try { await result; } catch (error) { expect(String(error)).not.toContain("fixture-key"); }
    expect((await test.runs()).find(run => run.resultJson?.action === "list_goals")).toMatchObject({ status: "failed", usageJson: { modelInvocations: 0 } });
  });

  it("converts gateway denials into HTTP errors with safe codes and UUIDs only", async () => {
    const test = await fixture();
    vi.spyOn(test.gateway, "executeTool").mockRejectedValueOnce(new ToolGatewayHttpError(403, "Access denied for fixture-private-credential", "grant_revoked", {
      actionRequestId: test.action.id, invocationId: test.invocation.id, interactionId: "not-a-uuid", issueId: test.scope.issueId,
      secretValue: "fixture-private-credential", credentials: { token: "private-token" }, instructions: "Do not expose provider prose", unsafe: "raw payload",
    }));
    const result = test.call();
    await expect(result).rejects.toBeInstanceOf(HttpError);
    await expect(result).rejects.toMatchObject({ status: 403, details: { code: "grant_revoked", actionRequestId: test.action.id, invocationId: test.invocation.id, issueId: test.scope.issueId } });
    try { await result; } catch (error) {
      expect(JSON.stringify(error) + String(error)).not.toMatch(/fixture-private-credential|private-token|not-a-uuid|provider prose|raw payload/);
    }
  });

  it.each([
    { error: "MCP tool returned an error result", content: "private provider traceback", data: { apiKey: "fixture-secret" } },
    { content: "private provider traceback", data: { isError: true, token: "fixture-secret" } },
  ])("does not call an MCP error envelope successful or retry it", async toolResult => {
    const test = await fixture();
    const execute = vi.spyOn(test.gateway, "executeTool").mockResolvedValueOnce({
      status: "completed", invocationId: test.invocation.id, tool: "mcp-remote-fixture:update_note", result: toolResult,
    });
    const result = await test.call();
    expect(result).toEqual({
      status: "failed", code: "connector_tool_failed", retrySafe: false, invocationId: test.invocation.id,
      error: expect.stringContaining("do not retry automatically"),
    });
    expect(JSON.stringify(result)).not.toMatch(/private provider|fixture-secret/);
    expect(execute).toHaveBeenCalledTimes(1);
    const failed = (await test.runs()).find(run => run.resultJson?.success === false);
    expect(failed).toMatchObject({ status: "failed", usageJson: { modelInvocations: 0 }, resultJson: { action: "call_connected_tool", success: false } });
    expect(await db.select().from(agentWakeupRequests).where(eq(agentWakeupRequests.companyId, test.scope.companyId))).toHaveLength(0);
  });

  it("omits an invalid invocation reference from a failed MCP envelope", async () => {
    const test = await fixture();
    vi.spyOn(test.gateway, "executeTool").mockResolvedValueOnce({
      status: "completed", invocationId: "private-provider-value", tool: "fixture", result: { data: { isError: true } },
    });
    const result = await test.call();
    expect(result).toMatchObject({ status: "failed", retrySafe: false });
    expect(result).not.toHaveProperty("invocationId");
    expect(JSON.stringify(result)).not.toContain("private-provider-value");
  });

  it("keeps unexpected gateway failures out of the approval adapter", async () => {
    const test = await fixture();
    const failure = new Error("unexpected fixture failure");
    vi.spyOn(test.gateway, "listToolsForSession").mockRejectedValueOnce(failure);
    await expect(callVoiceApi(db, test.req, test.scope, { action: "list_connected_tools" })).rejects.toBe(failure);
  });
});
