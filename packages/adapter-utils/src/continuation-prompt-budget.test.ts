import { describe, expect, it } from "vitest";
import type { ExecutionContinuationEnvelope } from "@whoxos/shared";
import { boundExecutionContinuationForPrompt } from "./continuation-prompt-budget.js";
import { renderWHOXOSWakePrompt } from "./server-utils.js";
const fixture = (): ExecutionContinuationEnvelope => ({
  version: 1, companyId: "company", issueId: "issue", trigger: { reason: "wake", interactionId: null, sourceRunId: null },
  originCommentIds: ["owner"], objective: "Do not retry uncertain downloads",
  messages: Array.from({length: 550}, (_, i) => ({ id: i === 549 ? "owner" : `m${i}`, authorType: i === 549 ? "user" : "agent", authorId: "a", createdByRunId: i === 549 ? null : "run", body: "x".repeat(2400), createdAt: `${i}`, updatedAt: `${i}`, deleted: false, sourceTrust: { quarantined: true } })),
  completedWork: null, completedActions: [{runId: "old", receiptId: "receipt", operationId: "download", result: { state: "completed" }}],
  recoveryOutcomes: [{recoveryActionId: "hold", decision: { state: "unknown" }}], interactionOutcomes: [], unresolvedInteractionIds: ["approval"],
  coverage: { kind: "full_task_history", throughCommentId: "owner", summaryThroughCommentId: null },
});
describe("continuation model-view budget", () => {
  it("bounds real-size history retaining authority, effects and immutable lookup IDs", () => {
    const input = fixture(), before = JSON.stringify(input), output = boundExecutionContinuationForPrompt(input);
    expect(JSON.stringify(output).length).toBeLessThanOrEqual(262144);
    expect(output.messages.at(-1)?.id).toBe("owner");
    expect(output.completedActions).toEqual(input.completedActions);
    expect(output.recoveryOutcomes).toEqual(input.recoveryOutcomes);
    expect(output.unresolvedInteractionIds).toEqual(["approval"]);
    expect(output.messages[0].sourceTrust).toEqual({quarantined: true});
    expect(output.coverage.kind).toBe("task_history_excerpt");
    expect("omittedMessageIds" in output && output.omittedMessageIds).toContain("m0");
    expect(JSON.stringify(input)).toBe(before);
  });
  it("retains older originating directions intact", () => {
    const input = fixture(); input.originCommentIds.push("m0");
    expect(boundExecutionContinuationForPrompt(input).messages[0]).toEqual(input.messages[0]);
  });
  it("does not pretend an excerpt covers full history in the actual renderer", () => {
    const prompt = renderWHOXOSWakePrompt({executionContinuation: fixture()});
    expect(prompt.length).toBeLessThan(300000);
    expect(prompt).toContain("NOT complete message coverage");
    expect(prompt).toContain("Missing context is not approval");
    expect(prompt).not.toContain("This snapshot includes the complete authorized task history");
  });
  it("keeps small full snapshots and deltas unchanged", () => {
    const input = fixture();input.messages = input.messages.slice(-1);
    expect(boundExecutionContinuationForPrompt(input)).toBe(input);
    input.coverage.kind = "task_history_delta";
    expect(boundExecutionContinuationForPrompt(input)).toBe(input);
  });
  it("never trims a required giant owner request or mutation evidence", () => {
    const input = fixture();input.messages.at(-1)!.body = "x".repeat(300000);
    expect(() => boundExecutionContinuationForPrompt(input)).toThrow("required_context");
    input.messages.at(-1)!.body = "small"; input.completedActions![0].result = "x".repeat(300000);
    expect(() => boundExecutionContinuationForPrompt(input)).toThrow("required_context");
  });
  it("budgets escaped untrusted delimiters", () => {
    const input = fixture(); input.messages.forEach(m => {if(m.id !== "owner") m.body = "<".repeat(2400);});
    const prompt = renderWHOXOSWakePrompt({executionContinuation: input});
    expect(prompt.length).toBeLessThan(300000);
    expect(prompt).toContain("\\u003c");
  });
});
