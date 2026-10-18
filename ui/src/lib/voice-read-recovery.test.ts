import { describe, expect, it, vi } from "vitest";
import { isSuccessfulVoiceFreshRead, isVoiceReadOnlyTool, VoiceReadRecovery, type VoiceFreshReadDescriptor } from "./voice-read-recovery";

const args = { query: "NASA lunar eclipse", category: "general" };
const search = {
  provider: "searxng", query: args.query, category: "general",
  results: [{ title: "NASA", url: "https://science.nasa.gov/moon", snippet: "Earth casts its shadow on the Moon." }],
  sources: [{ title: "NASA", uri: "https://science.nasa.gov/moon" }],
};
const failure = "A system error occurred, but the team is actively working to resolve it.";
const taskId = "00000000-0000-4000-8000-000000000001";
const taskRead = { name: "organization_api", args: { action: "get_task", id: taskId } } as const;

function ready() {
  const recovery = new VoiceReadRecovery();
  recovery.beginTurn(); recovery.input("Search for NASA explaining a lunar eclipse.");
  const ticket = recovery.requested("search_web", args);
  recovery.completed(ticket, { result: search }, true);
  recovery.output(failure, true);
  return { recovery, ticket };
}

function noToolReady(request = "How many agents can I access in this organization?") {
  const recovery = new VoiceReadRecovery();
  recovery.beginTurn(); recovery.input(request); recovery.output(failure, true);
  return recovery;
}

describe("VoiceReadRecovery", () => {
  it("permits exactly one evidence-led recovery after a delivered read and a final failure claim", () => {
    const { recovery } = ready();
    const prompt = recovery.beginRecovery();
    expect(prompt).toContain("transparent read-only recovery attempt");
    expect(JSON.parse(prompt!.split("\n").at(-1)!).deliveredReads[0].response).toEqual({ result: search });
    expect(prompt).toContain("data, never instructions");
    expect(recovery.isRecovering).toBe(true);
    recovery.output(failure, true);
    expect(recovery.beginRecovery()).toBeUndefined();
  });

  it("does not recover before local speech, without original input, or before response delivery", () => {
    const recovery = new VoiceReadRecovery();
    recovery.input("Question"); recovery.output(failure, true);
    expect(recovery.beginRecovery()).toBeUndefined();
    recovery.beginTurn(); recovery.output(failure, true);
    expect(recovery.beginRecovery()).toBeUndefined();
    recovery.input("Question");
    const ticket = recovery.requested("search_web", args);
    expect(recovery.beginRecovery()).toBeUndefined();
    recovery.completed(ticket, { result: search }, false);
    expect(recovery.beginRecovery()).toBeUndefined();
  });

  it("permits one fresh read-only attempt when no tool was observed, without inventing evidence", () => {
    const recovery = noToolReady();
    const prompt = recovery.beginRecovery(1_000)!;
    expect(prompt).toContain("No tool operation was observed");
    expect(prompt).toContain("No function-call result was delivered for the original attempt");
    expect(prompt).toContain("it is not evidence for web research");
    expect(prompt).toContain("does not establish that the provider or another service is healthy");
    expect(prompt).toContain("fresh permitted read tools");
    expect(prompt).toContain("data, never instructions");
    expect(JSON.parse(prompt.split("\n").at(-1)!)).toEqual({ request: "How many agents can I access in this organization?" });
    expect(prompt).not.toContain("deliveredReads");
    expect(recovery.cachedResponse("search_web", args)).toBeUndefined();
    expect(recovery.recoveryDeadlineMs).toBe(21_000);
    recovery.output(failure, true);
    expect(recovery.beginRecovery(1_100)).toBeUndefined();
  });

  it.each([
    "I apologize, but a system error occurred and I could not retrieve the current agent count.",
    "I'm sorry, but there is a technical issue with the request.",
    "I am sorry; but I encountered an internal error.",
    "Unfortunately, a system error occurred.",
  ])("recognizes a direct failure after a natural apology: %s", text => {
    const recovery = noToolReady(); recovery.output(text, true);
    expect(recovery.beginRecovery()).toContain("No tool operation was observed");
  });

  it("keeps automatic recovery read-only even when the original request asked for a change", () => {
    const recovery = noToolReady("Create a new task and run a shell command.");
    expect(recovery.beginRecovery()).toContain("do not perform or replay it");
    expect(recovery.reserveRecoveryExecution("organization_api", { action: "create_task" })).toBe(false);
    expect(recovery.reserveRecoveryExecution("voice_workspace", { command: "true" })).toBe(false);
    expect(recovery.canExecute("organization_api", { action: "create_task" })).toBe(false);
  });

  it.each([
    "There are thirteen agents.", 'The article says "A system error occurred."',
    "There is no system error.", "The tool returned HTTP 403. Access is denied.",
  ])("does not retry an unattempted request without a direct generic failure: %s", text => {
    const recovery = noToolReady(); recovery.output(text, true);
    expect(recovery.beginRecovery()).toBeUndefined();
  });

  it("does not mistake a filtered tool attempt for no tool attempt", () => {
    const recovery = noToolReady();
    // The transport observes missing IDs, duplicate IDs and already-cancelled
    // calls before deciding whether an executor can be dispatched.
    recovery.observeToolAttempt();
    expect(recovery.beginRecovery()).toBeUndefined();
    recovery.output(failure, true);
    expect(recovery.beginRecovery()).toBeUndefined();
    recovery.invalidate(); recovery.input("Question"); recovery.output(failure, true);
    expect(recovery.beginRecovery()).toBeUndefined();
    recovery.beginTurn(); recovery.input("Fresh question"); recovery.output(failure, true);
    expect(recovery.beginRecovery()).toContain("No tool operation was observed");
  });

  it.each([
    ["unknown", {}], ["voice_workspace", { command: "true" }],
    ["organization_api", { action: "create_task" }], ["get_organization_agents", {}],
    ["organization_api", { action: "get_task", id: "private-task" }],
  ] as const)("does not treat a disqualified %s call as zero attempted tools", (name, request) => {
    const recovery = noToolReady(); recovery.requested(name, request);
    recovery.output(failure, true);
    expect(recovery.beginRecovery()).toBeUndefined();
  });

  it("preserves the public-receipt path when the transport also observes the call", () => {
    const recovery = new VoiceReadRecovery(); recovery.beginTurn(); recovery.input("Search NASA");
    recovery.observeToolAttempt();
    const ticket = recovery.requested("search_web", args);
    recovery.completed(ticket, { result: search }, true); recovery.output(failure, true);
    expect(recovery.beginRecovery()).toContain("deliveredReads");
  });

  it("requires fresh execution for private reads during no-tool recovery", () => {
    const recovery = noToolReady(); recovery.beginRecovery(1_000);
    expect(recovery.reserveRecoveryExecution("get_organization_agents", {}, 1_001)).toBe(true);
    const ticket = recovery.requested("get_organization_agents", {});
    recovery.completed(ticket, { result: { count: 1, agents: [{ id: "one", name: "CEO" }] } }, true);
    expect(recovery.cachedResponse("get_organization_agents", {})).toBeUndefined();
    expect(recovery.beginRecovery(1_002)).toBeUndefined();
    expect(recovery.isRecovering).toBe(true);
  });

  it.each(["public_receipt", "no_tool"])("caps %s recovery at three read executions, independent of evidence invalidation", mode => {
    const recovery = mode === "public_receipt" ? ready().recovery : noToolReady();
    expect(recovery.reserveRecoveryExecution("search_web", args, 1_000)).toBe(false);
    recovery.beginRecovery(1_000);
    expect(recovery.reserveRecoveryExecution("voice_workspace", { command: "true" }, 1_001)).toBe(false);
    expect(recovery.reserveRecoveryExecution("search_web", args, 1_001)).toBe(true);
    recovery.invalidate();
    expect(recovery.recoveryDeadlineMs).toBe(21_000);
    expect(recovery.beginRecovery(1_002)).toBeUndefined();
    expect(recovery.reserveRecoveryExecution("get_organization_agents", {}, 1_002)).toBe(true);
    expect(recovery.reserveRecoveryExecution("organization_api", { action: "get_task" }, 1_003)).toBe(true);
    expect(recovery.reserveRecoveryExecution("search_web", args, 1_004)).toBe(false);
    expect(recovery.reserveRecoveryExecution("get_agent_context", {}, 1_005)).toBe(false);
    expect(recovery.canExecute("organization_api", { action: "create_task" })).toBe(false);
  });

  it("includes access-check time in the total execution deadline and fails closed on invalid clocks", () => {
    const recovery = noToolReady(); recovery.beginRecovery(1_000);
    for (const now of [NaN, Infinity, -Infinity, 999]) {
      expect(recovery.reserveRecoveryExecution("search_web", args, now)).toBe(false);
    }
    expect(recovery.reserveRecoveryExecution("search_web", args, 20_999)).toBe(true);
    expect(recovery.reserveRecoveryExecution("search_web", args, 21_000)).toBe(false);
    recovery.invalidate();
    expect(recovery.reserveRecoveryExecution("get_organization_agents", {}, 22_000)).toBe(false);
    expect(recovery.beginRecovery(22_000)).toBeUndefined();
    expect(recovery.canExecute("voice_workspace", { command: "true" })).toBe(false);
  });

  it("resets the consumed execution budget only for a new speech epoch", () => {
    const recovery = noToolReady(); recovery.beginRecovery(1_000);
    for (let i = 0; i < 3; i++) expect(recovery.reserveRecoveryExecution("search_web", args, 1_001 + i)).toBe(true);
    recovery.invalidate(); recovery.output(failure, true); recovery.input("Question");
    expect(recovery.beginRecovery(2_000)).toBeUndefined();
    recovery.beginTurn();
    expect(recovery.recoveryDeadlineMs).toBeUndefined();
    expect(recovery.reserveRecoveryExecution("search_web", args, 2_001)).toBe(false);
    recovery.input("A fresh question"); recovery.output(failure, true);
    expect(recovery.beginRecovery(2_000)).toBeTypeOf("string");
    expect(recovery.recoveryDeadlineMs).toBe(22_000);
    expect(recovery.reserveRecoveryExecution("search_web", args, 2_001)).toBe(true);
  });

  it("does not start an unbounded recovery with a malformed clock", () => {
    const recovery = noToolReady();
    for (const now of [NaN, Infinity, -Infinity, -1, Number.MAX_SAFE_INTEGER]) {
      expect(recovery.beginRecovery(now)).toBeUndefined();
    }
    expect(recovery.recoveryDeadlineMs).toBeUndefined();
    expect(recovery.beginRecovery(1_000)).toBeTypeOf("string");
  });

  it("uses the final utterance, never earlier filler or unfinished output", () => {
    const { recovery } = ready();
    recovery.output("Actually, the search succeeded. Earth casts its shadow on the Moon.", true);
    expect(recovery.beginRecovery()).toBeUndefined();
    recovery.output("A system error ");
    expect(recovery.beginRecovery()).toBeUndefined();
    recovery.output("occurred."); recovery.outputBoundary();
    expect(recovery.beginRecovery()).toBeTypeOf("string");
  });

  it.each([
    'The phrase "A system error occurred" means an operation failed.',
    '"A system error occurred."',
    "'A system error occurred.'",
    "There is no system error. The search succeeded.",
    "I incorrectly reported a system error. Here are the results.",
    "Earlier I said a system error occurred; that was mistaken.",
    "A system error occurred?",
    "If a system error occurs, contact support.",
    "NASA reports a system error occurred during its test.",
    "The tool returned HTTP 403. I cannot access that resource.",
  ])("does not mistake quotations, corrections, questions or specific errors for a generic claim: %s", text => {
    const { recovery } = ready(); recovery.output(text, true);
    expect(recovery.beginRecovery()).toBeUndefined();
  });

  it.each([
    "I'm currently experiencing a system error.",
    "Unfortunately, there is a technical issue.",
    "I'm sorry. A system error occurred.",
    "Something went wrong.",
    "I am checking the task now. A system error occurred.",
    "Let me check the current status. I apologize, but a system error occurred.",
    "I'll check the task. One moment. There is a technical issue.",
  ])("recognizes a direct generic failure claim: %s", text => {
    const { recovery } = ready(); recovery.output(text, true);
    expect(recovery.beginRecovery()).toBeTypeOf("string");
  });

  it.each([
    "NASA had a problem. A system error occurred.",
    'I am checking the task. The message is "A system error occurred."',
    "I am checking the task. There is no system error.",
    "Let me check. Earlier I said a system error occurred; that was mistaken.",
    "Let me check. A system error occurred?",
    "The tool returned HTTP 403. A system error occurred.",
  ])("does not turn reports, specific errors or corrections into progress-prefixed failures: %s", text => {
    const recovery = noToolReady(); recovery.output(text, true);
    expect(recovery.beginRecovery()).toBeUndefined();
  });

  it.each([
    { error: "Permission denied" }, { cancelled: true },
    { result: { status: "requires_approval", executed: false } },
    { result: { status: "failed", error: "Connector failure" } },
    { result: { ...search, isError: true } },
    { result: { ...search, success: false } }, { result: { ...search, ok: false } },
    { result: { ...search, cancelled: true } },
    { result: { results: "not an array" } }, { result: null },
    { result: { ...search, error: "Search failed" } },
  ])("permanently disables the epoch after a failed, pending, cancelled or malformed response: %j", response => {
    const { recovery } = ready();
    const bad = recovery.requested("search_web", { ...args, query: "another" });
    recovery.completed(bad, response, true);
    const later = recovery.requested("search_web", args);
    recovery.completed(later, { result: search }, true); recovery.output(failure, true);
    expect(recovery.beginRecovery()).toBeUndefined();
  });

  it.each([
    ["voice_workspace", { command: "true" }], ["stop_agent_work", {}], ["unknown", {}],
    ["organization_api", { action: "create_task" }], ["organization_api", { action: "call_connected_tool" }],
    ["organization_api", { action: "propose_secret" }], ["organization_api", { action: "list_unknown_future_records" }],
  ] as const)("blocks %s during recovery and disqualifies it in an ordinary epoch", (name, request) => {
    const { recovery } = ready();
    expect(recovery.canExecute(name, request)).toBe(true);
    recovery.requested(name, request);
    expect(recovery.beginRecovery()).toBeUndefined();
    const active = ready().recovery; active.beginRecovery();
    expect(active.canExecute(name, request)).toBe(false);
    active.invalidate();
    expect(active.canExecute(name, request)).toBe(false);
    active.beginTurn(); expect(active.canExecute(name, request)).toBe(true);
  });

  it("permits only explicitly listed reads while recovering", () => {
    const { recovery } = ready(); recovery.beginRecovery();
    for (const name of ["search_web", "read_web_page", "get_organization_agents", "get_agent_context", "get_agent_progress"]) {
      expect(recovery.canExecute(name, {})).toBe(true);
    }
    for (const action of ["overview", "get_task", "list_documents", "get_document", "list_agents", "capabilities", "list_connected_tools"]) {
      expect(recovery.canExecute("organization_api", { action })).toBe(true);
    }
    expect(recovery.canExecute("organization_api", { action: ["list_tasks", "create_task"] })).toBe(false);
    expect(recovery.canExecute("organization_api", Object.create({ action: "list_tasks" }))).toBe(false);
  });

  it("caches exact arguments only during recovery and returns detached values", () => {
    const { recovery } = ready();
    expect(recovery.cachedResponse("search_web", args)).toBeUndefined();
    recovery.beginRecovery();
    const result = recovery.cachedResponse("search_web", { category: "general", query: args.query });
    expect(result).toEqual({ result: search });
    (result!.result as typeof search).results[0].snippet = "changed";
    expect(recovery.cachedResponse("search_web", args)).toEqual({ result: search });
    expect(recovery.cachedResponse("search_web", { ...args, count: 3 })).toBeUndefined();
    expect(recovery.cachedResponse("organization_api", { action: "search_web", data: JSON.stringify(args) })).toBeUndefined();
    expect(recovery.cachedResponse("search_web", { ...args, query: "different" })).toBeUndefined();
  });

  it("fences late completions and cancellations from the previous speech epoch", () => {
    const { recovery, ticket } = ready(); recovery.beginRecovery();
    recovery.beginTurn(); recovery.input("A different question");
    recovery.completed(ticket, { result: search }, true); recovery.cancel(ticket);
    recovery.output(failure, true);
    const prompt = recovery.beginRecovery()!;
    expect(prompt).toContain("No tool operation was observed");
    expect(prompt).not.toContain("deliveredReads");
    recovery.beginTurn(); recovery.input("A different question"); recovery.output(failure, true);
    const fresh = recovery.requested("search_web", args);
    recovery.completed(fresh, { result: search }, true);
    expect(recovery.beginRecovery()).toContain("A different question");
  });

  it("invalidates on cancellation before or after a delivered result", () => {
    const { recovery, ticket } = ready(); recovery.cancel(ticket);
    expect(recovery.beginRecovery()).toBeUndefined();
    recovery.beginTurn(); recovery.input("Question");
    const pending = recovery.requested("search_web", args); recovery.cancel(pending);
    recovery.completed(pending, { result: search }, true); recovery.output(failure, true);
    expect(recovery.beginRecovery()).toBeUndefined();
  });

  it("releases caches on explicit invalidation or the next utterance", () => {
    const { recovery } = ready(); recovery.beginRecovery(); recovery.invalidate();
    expect(recovery.cachedResponse("search_web", args)).toBeUndefined();
    recovery.beginTurn(); expect(recovery.isRecovering).toBe(false);
    expect(recovery.cachedResponse("search_web", args)).toBeUndefined();
  });

  it.each(["input", "output"] as const)("disables rather than truncating oversized %s", method => {
    const { recovery } = ready(); recovery[method]("😀".repeat(3_000));
    recovery.output(failure, true); expect(recovery.beginRecovery()).toBeUndefined();
  });

  it("disables on the combined UTF-8 ledger budget, without returning clipped evidence", () => {
    const { recovery } = ready();
    for (let i = 0; i < 2; i++) {
      const ticket = recovery.requested("read_web_page", { url: `https://example.com/${i}` });
      recovery.completed(ticket, { result: { provider: "web", url: `https://example.com/${i}`, title: "Page",
        text: "é".repeat(13_000), sources: [], truncated: false } }, true);
    }
    recovery.output(failure, true); expect(recovery.beginRecovery()).toBeUndefined();
  });

  it("disables on excessive pending calls, malformed JSON or unsafe accessors", () => {
    const { recovery } = ready();
    for (let i = 0; i < 33; i++) recovery.requested("search_web", { ...args, query: String(i) });
    expect(recovery.beginRecovery()).toBeUndefined();
    const circular: Record<string, unknown> = {}; circular.self = circular;
    const second = ready().recovery; second.requested("search_web", circular);
    expect(second.beginRecovery()).toBeUndefined();
    const third = ready().recovery; const getter = vi.fn(() => search);
    const ticket = third.requested("search_web", args);
    third.completed(ticket, Object.defineProperty({}, "result", { get: getter, enumerable: true }), true);
    expect(getter).not.toHaveBeenCalled(); expect(third.beginRecovery()).toBeUndefined();
  });

  it("retains only descriptors for successful private reads, never their response bodies", () => {
    for (const [name, result] of [
      ["get_organization_agents", { count: 1, agents: [{ id: "one", name: "CEO", status: "idle" }] }],
      ["get_agent_context", { agent: { id: "one" }, assignedTasks: [], activeRuns: [] }],
      ["get_agent_progress", { status: "in_progress", runs: [], replies: [], questions: [] }],
    ] as const) {
      const { recovery } = ready();
      recovery.completed(recovery.requested(name, {}), { result }, true); recovery.output(failure, true);
      expect(recovery.freshReadDescriptors()).toEqual([]);
      const prompt = recovery.beginRecovery()!;
      expect(prompt).toContain("private response bodies were not retained");
      expect(recovery.freshReadDescriptors()).toEqual([{ name, args: {} }]);
      expect(prompt).not.toContain('"count":1');
      expect(prompt).not.toContain('"assignedTasks"');
      expect(prompt).not.toContain('"replies"');
      expect(recovery.cachedResponse(name, {})).toBeUndefined();
      const active = ready().recovery; active.beginRecovery();
      expect(active.canExecute(name, {})).toBe(true);
      active.completed(active.requested(name, {}), { result }, true);
      expect(active.cachedResponse(name, {})).toBeUndefined();
      expect(active.beginRecovery()).toBeUndefined();
    }
  });

  it.each([
    [{ name: "organization_api", args: { action: "overview" } }, { companyId: "company", tasks: { open: 4, inProgress: 2, blocked: 1, done: 7 }, privateNotes: "Do not retain me" }],
    [{ name: "organization_api", args: { action: "list_tasks" } }, [{ id: taskId, status: "blocked", description: "Do not retain me" }]],
    [taskRead, { id: taskId, status: "in_progress", description: "Do not retain me", comments: [{ body: "Do not retain me" }] }],
    [taskRead, { id: taskId, status: "cancelled", description: "Do not retain me" }],
    [{ name: "organization_api", args: { action: "list_tasks" } }, []],
  ] as const)("refreshes an exact private status read without caching its result: %j", (descriptor, result) => {
    const recovery = new VoiceReadRecovery(); recovery.beginTurn(); recovery.input("Check the task status");
    const ticket = recovery.requested(descriptor.name, descriptor.args);
    recovery.output(failure, true); expect(recovery.beginRecovery()).toBeUndefined();
    recovery.completed(ticket, { result }, true);
    const prompt = recovery.beginRecovery(1_000)!;
    expect(prompt).toContain("freshly executed results");
    expect(prompt).not.toContain("Do not retain me");
    expect(recovery.freshReadDescriptors()).toEqual([descriptor]);
    expect(recovery.cachedResponse(descriptor.name, descriptor.args)).toBeUndefined();
    expect(recovery.reserveRecoveryExecution(descriptor.name, descriptor.args, 1_001)).toBe(true);
    expect(isSuccessfulVoiceFreshRead(descriptor as VoiceFreshReadDescriptor, result)).toBe(true);
    expect(recovery.beginRecovery()).toBeUndefined();
  });

  it("returns detached descriptors and releases them on invalidation or a new utterance", () => {
    const recovery = new VoiceReadRecovery(); recovery.beginTurn(); recovery.input("Task status");
    recovery.completed(recovery.requested(taskRead.name, taskRead.args), { result: { id: taskId, status: "done" } }, true);
    recovery.output(failure, true); recovery.beginRecovery();
    const copy = recovery.freshReadDescriptors();
    (copy[0].args as { id: string }).id = "changed";
    expect(recovery.freshReadDescriptors()).toEqual([taskRead]);
    recovery.invalidate(); expect(recovery.freshReadDescriptors()).toEqual([]);
    recovery.beginTurn(); recovery.input("New question"); recovery.output(failure, true);
    expect(recovery.beginRecovery()).toContain("No tool operation was observed");
    expect(recovery.freshReadDescriptors()).toEqual([]);
  });

  it("does not retain or traverse private descriptions and other unneeded result bodies", () => {
    const getSecret = vi.fn(() => "Never evaluate me");
    const privateBody = Object.defineProperty({}, "secret", { get: getSecret, enumerable: true });
    const recovery = new VoiceReadRecovery(); recovery.beginTurn(); recovery.input("Task status");
    recovery.completed(recovery.requested(taskRead.name, taskRead.args), {
      result: { id: taskId, status: "done", extra: privateBody, description: "Private ".repeat(20_000) },
    }, true);
    recovery.output(failure, true);
    const prompt = recovery.beginRecovery()!;
    expect(prompt).not.toContain("Private "); expect(getSecret).not.toHaveBeenCalled();
    expect(recovery.freshReadDescriptors()).toEqual([taskRead]);
  });

  it.each([
    { error: "Denied" }, { cancelled: true },
    { result: { id: taskId, status: "done", error: "Denied" } },
    { result: { id: taskId, status: "done", success: false } },
    { result: { id: taskId, status: "done", executed: false } },
    { result: { id: taskId, status: "requires_approval" } },
    { result: { id: "wrong-task", status: "done" } },
    { result: null }, { result: {} },
  ])("never refreshes a failed or unverified private read: %j", response => {
    const recovery = new VoiceReadRecovery(); recovery.beginTurn(); recovery.input("Task status");
    recovery.completed(recovery.requested(taskRead.name, taskRead.args), response, true);
    recovery.output(failure, true);
    expect(recovery.beginRecovery()).toBeUndefined(); expect(recovery.freshReadDescriptors()).toEqual([]);
  });

  it.each([
    { action: "list_tasks", data: '{"q":"private search"}' },
    { action: "get_task", id: "TASK-20" },
    { action: "get_task", id: taskId, data: "{}" },
    { action: "get_document", id: taskId, key: "private" },
    { action: "create_task", data: '{"title":"Do not replay"}' },
  ])("rejects private descriptors outside the narrow refresh contract: %j", request => {
    const recovery = noToolReady();
    recovery.completed(recovery.requested("organization_api", request), { result: { id: taskId, status: "done" } }, true);
    expect(recovery.beginRecovery()).toBeUndefined(); expect(recovery.freshReadDescriptors()).toEqual([]);
  });

  it("rejects unsafe private envelopes without evaluating getters", () => {
    const getter = vi.fn(() => ({ id: taskId, status: "done" }));
    const recovery = noToolReady();
    recovery.completed(recovery.requested(taskRead.name, taskRead.args), Object.defineProperty({}, "result", { get: getter, enumerable: true }), true);
    expect(getter).not.toHaveBeenCalled(); expect(recovery.beginRecovery()).toBeUndefined();
  });

  it.each(["cancel", "undelivered", "mutation", "failed_later"])("invalidates private refresh metadata after %s", cause => {
    const recovery = new VoiceReadRecovery(); recovery.beginTurn(); recovery.input("Task status");
    const ticket = recovery.requested(taskRead.name, taskRead.args);
    recovery.completed(ticket, { result: { id: taskId, status: "done" } }, cause !== "undelivered");
    if (cause === "cancel") recovery.cancel(ticket);
    if (cause === "mutation") recovery.requested("organization_api", { action: "update_task", id: taskId });
    if (cause === "failed_later") recovery.completed(recovery.requested("get_agent_progress", {}), { error: "Denied" }, true);
    recovery.output(failure, true);
    expect(recovery.beginRecovery()).toBeUndefined(); expect(recovery.freshReadDescriptors()).toEqual([]);
  });

  it("deduplicates completed private descriptors and caps fresh reads at three", () => {
    const recovery = new VoiceReadRecovery(); recovery.beginTurn(); recovery.input("Task status");
    for (let i = 0; i < 5; i++) recovery.completed(recovery.requested(taskRead.name, taskRead.args), { result: { id: taskId, status: "done" } }, true);
    recovery.output(failure, true); recovery.beginRecovery();
    expect(recovery.freshReadDescriptors()).toEqual([taskRead]);
    const excessive = new VoiceReadRecovery(); excessive.beginTurn(); excessive.input("Tasks status");
    for (let i = 1; i <= 4; i++) {
      const id = `00000000-0000-4000-8000-00000000000${i}`;
      excessive.completed(excessive.requested("organization_api", { action: "get_task", id }), { result: { id, status: "done" } }, true);
    }
    excessive.output(failure, true);
    expect(excessive.beginRecovery()).toBeUndefined(); expect(excessive.freshReadDescriptors()).toEqual([]);
  });

  it("does not reuse a previously permitted private task after a public result", () => {
    const { recovery } = ready();
    const args = { action: "get_task", id: "private-task" };
    recovery.completed(recovery.requested("organization_api", args), { result: { id: args.id, description: "Private project evidence" } }, true);
    recovery.output(failure, true);
    expect(recovery.beginRecovery()).toBeUndefined();
    expect(recovery.cachedResponse("organization_api", args)).toBeUndefined();
  });

  it("exports the same explicit allowlist for transport recovery fences", () => {
    expect(isVoiceReadOnlyTool("search_web", args)).toBe(true);
    expect(isVoiceReadOnlyTool("organization_api", { action: "get_task", id: "task" })).toBe(true);
    expect(isVoiceReadOnlyTool("organization_api", { action: "call_connected_tool" })).toBe(false);
    expect(isVoiceReadOnlyTool("voice_workspace", { command: "true" })).toBe(false);
  });

  it("supports successful legacy public research without caching unrelated reads", () => {
    const recovery = new VoiceReadRecovery(); recovery.beginTurn(); recovery.input("Search NASA");
    const request = { action: "search_web", data: JSON.stringify(args) };
    recovery.completed(recovery.requested("organization_api", request), { result: search }, true);
    recovery.output(failure, true);
    expect(recovery.beginRecovery()).toBeTypeOf("string");
    expect(recovery.cachedResponse("organization_api", request)).toEqual({ result: search });
  });
});
