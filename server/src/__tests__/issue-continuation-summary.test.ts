import { describe, expect, it } from "vitest";
import {
  ISSUE_CONTINUATION_SUMMARY_MAX_BODY_CHARS,
  buildContinuationSummaryMarkdown,
  continuationSummaryParksExecutor,
  extractContinuationSummaryNextAction,
} from "../services/issue-continuation-summary.js";

describe("issue continuation summaries", () => {
  it("builds bounded issue-local handoff context with required sections", () => {
    const body = buildContinuationSummaryMarkdown({
      issue: {
        id: "issue-1",
        identifier: "PAP-1579",
        title: "Add continuation summaries",
        description: [
          "## Objective",
          "",
          "Keep work resumable after adapter session reset.",
          "",
          "## Acceptance Criteria",
          "",
          "- Summary is issue-local",
          "- Wake context includes the summary",
        ].join("\n"),
        status: "in_progress",
        priority: "medium",
      },
      run: {
        id: "run-1",
        status: "succeeded",
        error: null,
        resultJson: {
          summary: "Updated server/src/services/heartbeat.ts and packages/adapter-utils/src/server-utils.ts.",
        },
        stdoutExcerpt: null,
        stderrExcerpt: null,
        finishedAt: new Date("2026-04-18T12:00:00.000Z"),
      },
      agent: {
        id: "agent-1",
        name: "CodexCoder",
        adapterType: "codex_local",
      },
    });

    expect(body).toContain("# Continuation Summary");
    expect(body).toContain("## Objective");
    expect(body).toContain("Keep work resumable after adapter session reset.");
    expect(body).toContain("## Acceptance Criteria");
    expect(body).toContain("- Summary is issue-local");
    expect(body).toContain("## Recent Concrete Actions");
    expect(body).toContain("Run `run-1` finished with status `succeeded`");
    expect(body).toContain("`server/src/services/heartbeat.ts`");
    expect(body).toContain("## Commands Run");
    expect(body).toContain("## Blockers / Decisions");
    expect(body).toContain("## Next Action");
    expect(body.length).toBeLessThanOrEqual(ISSUE_CONTINUATION_SUMMARY_MAX_BODY_CHARS);
  });

  it("uses failure state to point the next run at the error", () => {
    const body = buildContinuationSummaryMarkdown({
      issue: {
        id: "issue-1",
        identifier: "PAP-1579",
        title: "Add continuation summaries",
        description: null,
        status: "in_progress",
        priority: "medium",
      },
      run: {
        id: "run-2",
        status: "failed",
        error: "adapter failed",
        errorCode: "adapter_failed",
        resultJson: null,
      },
      agent: {
        id: "agent-1",
        name: "CodexCoder",
        adapterType: "codex_local",
      },
    });

    expect(body).toContain("Latest run error (adapter_failed): adapter failed");
    expect(body).toContain("Inspect the failed run, fix the cause");
  });

  it.each(["failed", "timed_out", "cancelled"])("does not carry a generated %s recovery action past a successful run", (status) => {
    const issue = {
      id: "issue-1", identifier: "TASK-102", title: "Acquire the approved source",
      description: null, status: "in_progress", priority: "medium",
    };
    const agent = { id: "agent-1", name: "Data", adapterType: "codex_local" };
    const previousSummaryBody = buildContinuationSummaryMarkdown({
      issue, agent, run: { id: "previous-run", status, error: "Prior execution did not finish." },
    });
    const body = buildContinuationSummaryMarkdown({
      issue, agent, previousSummaryBody,
      run: {
        id: "successful-run", status: "succeeded", error: null,
        resultJson: { summary: "Approved source completed. Retain the receipt for the next protected read; do not replay." },
      },
    });

    expect(body).toContain("Approved source completed.");
    expect(extractContinuationSummaryNextAction(body)).toBe(
      "Resume implementation from the acceptance criteria, latest comments, and this summary.",
    );
    expect(body).not.toContain("Inspect the failed run");
    expect(body).not.toContain("Confirm the cancellation reason");
  });

  it.each([
    "Wait for reviewer feedback or approval before continuing executor work.",
    "Use the completed manifest for the protected read. Do not repeat acquisition.",
  ])("preserves explicit handoffs and review waits after success: %s", (nextAction) => {
    const body = buildContinuationSummaryMarkdown({
      issue: {
        id: "issue-1", identifier: "TASK-102", title: "Acquire the approved source",
        description: null, status: "in_progress", priority: "medium",
      },
      agent: { id: "agent-1", name: "Data", adapterType: "codex_local" },
      run: { id: "successful-run", status: "succeeded", error: null },
      previousSummaryBody: `# Continuation Summary\n\n## Next Action\n\n- ${nextAction}`,
    });

    expect(extractContinuationSummaryNextAction(body)).toBe(nextAction);
    expect(continuationSummaryParksExecutor(body)).toBe(nextAction.startsWith("Wait for"));
  });

  it("detects continuation summaries that explicitly park executor work for review", () => {
    const body = [
      "# Continuation Summary",
      "",
      "## Next Action",
      "",
      "- Wait for reviewer feedback or approval before continuing executor work.",
    ].join("\n");

    expect(extractContinuationSummaryNextAction(body)).toBe(
      "Wait for reviewer feedback or approval before continuing executor work.",
    );
    expect(continuationSummaryParksExecutor(body)).toBe(true);
  });

  it("does not park executor work when the next action is still runnable", () => {
    const body = [
      "# Continuation Summary",
      "",
      "## Next Action",
      "",
      "- Re-check run `25145432006`, then move the issue to `in_review` if the final step is green.",
    ].join("\n");

    expect(continuationSummaryParksExecutor(body)).toBe(false);
  });
});
