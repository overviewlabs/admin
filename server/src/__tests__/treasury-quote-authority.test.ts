import { describe, it, expect, vi, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import { heartbeatRuns, issues, issueComments } from "@whoxos/db";
import { quoteAuthoritySnapshot, treasuryQuoteAuthority, QUOTE_COMPANY, QUOTE_IT, QUOTE_ISSUE, QUOTE_REVIEW, QUOTE_TECH, QUOTE_GOV } from "../services/treasury-quote-authority.js";
import { assertProductionRootExecution, callRootExecutor } from "../services/production-root.js";
vi.mock("../services/production-root.js", () => ({ assertProductionRootExecution: vi.fn(), callRootExecutor: vi.fn() }));

function fixture() {
  const run = randomUUID(), retention = randomUUID();
  const req: any = { actor: { type: "agent", source: "agent_jwt", companyId: QUOTE_COMPANY, agentId: QUOTE_IT, runId: run },
    body: { operation: "historical_quote_authority_v1", runId: run, retentionIssueIds: [retention] } };
  const row = (id: string, author: string, schema: string, extras = {}) => ({ id: randomUUID(), issueId: id,
    companyId: QUOTE_COMPANY, authorAgentId: author, authorUserId: null, deletedAt: null, createdAt: new Date(),
    body: JSON.stringify({ schema, companyId: QUOTE_COMPANY, revoked: false, validUntil: Date.now()/1000+100, ...extras }) });
  const review = [row(QUOTE_REVIEW, QUOTE_TECH, "quote-read-acceptance-v1", { decision: "accept" })];
  const retained = [row(retention, QUOTE_GOV, "storage-control-record-v1", { gate: "retention" })];
  const deps = { authorize: vi.fn(async () => {}), issue: vi.fn(async (id: string) => ({ id, companyId: QUOTE_COMPANY })),
    comments: vi.fn(async (id: string) => id === QUOTE_REVIEW ? review : retained) };
  return { req, deps, row, review, retained, run, retention };
}

function databaseFixture(f: ReturnType<typeof fixture>) {
  const run: any = { status: "running", finishedAt: null, context: {} };
  const task: any = { status: "in_progress", assigneeAgentId: QUOTE_IT, assigneeUserId: null, checkoutRunId: f.run, executionRunId: f.run };
  const recordReads = vi.fn();
  let issueReads = 0;
  const db: any = { select: (columns: any) => ({ from: (table: any) => ({ where: () => {
    let rows: any[];
    if (table === heartbeatRuns) rows = [run];
    else if (table === issues && columns.checkoutRunId) rows = [task];
    else if (table === issues) rows = [{ id: issueReads++ === 0 ? QUOTE_REVIEW : f.retention, companyId: QUOTE_COMPANY }];
    else if (table === issueComments) { recordReads(); rows = recordReads.mock.calls.length === 1 ? f.review : f.retained; }
    else throw new Error("unexpected table");
    return { then: (resolve: any, reject: any) => Promise.resolve(rows).then(resolve, reject), limit: async () => rows };
  } }) }) };
  return { db, run, task, recordReads };
}

describe("private quote current authority", () => {
  beforeEach(() => { vi.clearAllMocks(); vi.mocked(callRootExecutor).mockResolvedValue({ available: true, enabled: true }); });
  it("returns fresh bounded records with canonical IT147 identity and no positive cache", async () => {
    const f = fixture();
    const result = await quoteAuthoritySnapshot(f.req, f.deps);
    expect(result.identity).toEqual({ companyId: QUOTE_COMPANY, agentId: QUOTE_IT, issueId: QUOTE_ISSUE, runId: f.run });
    expect(result.reviewRows).toEqual(f.review);
    f.review[0].body = JSON.stringify({ schema: "quote-read-acceptance-v1", companyId: QUOTE_COMPANY, revoked: true });
    expect((await quoteAuthoritySnapshot(f.req, f.deps)).reviewRows[0].body).toContain('"revoked":true');
    expect(f.deps.authorize).toHaveBeenCalledTimes(4);
  });
  it.each(["deleted", "revoked", "hold", "tie", "expired"])("preserves newest %s evidence for root fail-closed evaluation", async kind => {
    const f = fixture(), original = f.review[0];
    const newer = { ...original, id: randomUUID(), createdAt: new Date(original.createdAt.getTime() + (kind === "tie" ? 0 : 1)) };
    const value = JSON.parse(newer.body);
    if (kind === "deleted") newer.deletedAt = new Date() as any;
    if (kind === "revoked") value.revoked = true;
    if (kind === "hold") value.decision = "hold";
    if (kind === "expired") value.validUntil = 0;
    newer.body = JSON.stringify(value); f.review.push(newer);
    expect((await quoteAuthoritySnapshot(f.req, f.deps)).reviewRows).toEqual([original, newer].sort((a, b) => a.id.localeCompare(b.id)));
  });
  it("returns identical snapshots when database row order changes", async () => {
    const f = fixture();
    f.review.push({ ...f.review[0], id: randomUUID() });
    f.retained.push({ ...f.retained[0], id: randomUUID() });
    const first = await quoteAuthoritySnapshot(f.req, f.deps);
    f.review.reverse(); f.retained.reverse();
    expect(await quoteAuthoritySnapshot(f.req, f.deps)).toEqual(first);
  });
  it.each(["board", "api_key", "wrong_agent", "wrong_company", "wrong_run", "restricted"])("denies %s before reading controls", async kind => {
    const f = fixture();
    if (kind === "board") f.req.actor.type = "board";
    if (kind === "api_key") f.req.actor.source = "agent_key";
    if (kind === "wrong_agent") f.req.actor.agentId = randomUUID();
    if (kind === "wrong_company") f.req.actor.companyId = randomUUID();
    if (kind === "wrong_run") f.req.actor.runId = randomUUID();
    if (kind === "restricted") f.req.actor.keyScope = { kind: "task_bridge" };
    await expect(quoteAuthoritySnapshot(f.req, f.deps)).rejects.toThrow("quote_read_denied");
    expect(f.deps.comments).not.toHaveBeenCalled();
  });
  it.each(["extra_key", "zero", "four", "duplicate", "bad_id"])("denies malformed %s requests", async kind => {
    const f = fixture();
    if (kind === "extra_key") f.req.body.token = "not-a-token";
    if (kind === "zero") f.req.body.retentionIssueIds = [];
    if (kind === "four") f.req.body.retentionIssueIds = Array.from({ length: 4 }, () => randomUUID());
    if (kind === "duplicate") f.req.body.retentionIssueIds.push(f.retention);
    if (kind === "bad_id") f.req.body.retentionIssueIds = ["../elsewhere"];
    await expect(quoteAuthoritySnapshot(f.req, f.deps)).rejects.toThrow();
    expect(f.deps.authorize).not.toHaveBeenCalled();
  });
  it("does not return cross-company issue facts", async () => {
    const f = fixture(); f.deps.issue.mockResolvedValue({ id: f.retention, companyId: randomUUID() });
    await expect(quoteAuthoritySnapshot(f.req, f.deps)).rejects.toThrow();
    expect(f.deps.comments).not.toHaveBeenCalled();
  });
  it("refuses a lost current grant after records are fetched", async () => {
    const f = fixture(); f.deps.authorize.mockResolvedValueOnce().mockRejectedValueOnce(new Error("revoked"));
    await expect(quoteAuthoritySnapshot(f.req, f.deps)).rejects.toThrow("revoked");
  });
  it("excludes prose and wrong-author data but preserves correct retention tombstones", async () => {
    const f = fixture(); f.review.push({ ...f.review[0], id: randomUUID(), body: "ordinary commentary" }, { ...f.review[0], id: randomUUID(), authorAgentId: QUOTE_IT });
    f.retained[0].deletedAt = new Date() as any;
    const result = await quoteAuthoritySnapshot(f.req, f.deps);
    expect(result.reviewRows).toHaveLength(1); expect(result.retentionRows[f.retention][0].deletedAt).toBeTruthy();
  });
  it.each(["rows", "bytes", "duplicate_id"])("fails on %s overflow or ambiguity", async kind => {
    const f = fixture();
    if (kind === "rows") f.review.push(...Array.from({ length: 4096 }, () => ({ ...f.review[0], id: randomUUID() })));
    if (kind === "bytes") f.review[0].body = JSON.stringify({ schema: "quote-read-acceptance-v1", companyId: QUOTE_COMPANY, excess: "x".repeat(1048576) });
    if (kind === "duplicate_id") f.review.push({ ...f.review[0] });
    await expect(quoteAuthoritySnapshot(f.req, f.deps)).rejects.toThrow();
  });
  it("production adapter checks live execution and root capability before and after selecting controls", async () => {
    const f = fixture(), d = databaseFixture(f);
    expect((await treasuryQuoteAuthority(d.db, f.req)).reviewRows).toEqual(f.review);
    expect(d.recordReads).toHaveBeenCalledTimes(2);
    expect(assertProductionRootExecution).toHaveBeenCalledTimes(2);
    expect(callRootExecutor).toHaveBeenCalledTimes(2);
    expect(callRootExecutor).toHaveBeenCalledWith({ operation: "status", companyId: QUOTE_COMPANY, agentId: QUOTE_IT });
  });
  it("production adapter denies grant revocation during the current request", async () => {
    const f = fixture(), d = databaseFixture(f);
    vi.mocked(callRootExecutor).mockResolvedValueOnce({ available: true, enabled: true }).mockResolvedValueOnce({ available: true, enabled: false });
    await expect(treasuryQuoteAuthority(d.db, f.req)).rejects.toThrow("quote_read_denied");
    expect(d.recordReads).toHaveBeenCalledTimes(2);
  });
  it.each(["stopped", "finished", "revoked_jwt", "checkout", "execution", "user_assignee", "disabled_root", "unavailable_root", "responsible_human"])("production adapter denies %s before selecting controls", async kind => {
    const f = fixture();
    const d = databaseFixture(f), { run, task } = d;
    if (kind === "stopped") run.status = "failed";
    if (kind === "finished") run.finishedAt = new Date();
    if (kind === "revoked_jwt") run.context.agentJwtRevokedAt = new Date().toISOString();
    if (kind === "checkout") task.checkoutRunId = randomUUID();
    if (kind === "execution") task.executionRunId = null;
    if (kind === "user_assignee") task.assigneeUserId = "someone";
    if (kind === "disabled_root") vi.mocked(callRootExecutor).mockResolvedValue({ available: true, enabled: false });
    if (kind === "unavailable_root") vi.mocked(callRootExecutor).mockResolvedValue({ available: false, enabled: true });
    if (kind === "responsible_human") vi.mocked(assertProductionRootExecution).mockRejectedValueOnce(new Error("human revoked"));
    await expect(treasuryQuoteAuthority(d.db, f.req)).rejects.toThrow();
    expect(d.recordReads).not.toHaveBeenCalled();
  });
});
