import { describe, expect, it } from "vitest";
import { voiceToolOutcome } from "./voice-tool-outcome.js";

describe("voice operation diagnostics", () => {
  it("distinguishes a completed search from evidence availability without logging content", () => {
    expect(voiceToolOutcome("organization_api", "search_web", {
      query: "private query", results: [{ title: "private content", url: "https://example.com" }], warnings: ["upstream details"],
    })).toEqual({ outcome: "results_available", resultCount: 1, hasWarnings: true });
    expect(voiceToolOutcome("organization_api", "search_web", { results: [] }))
      .toEqual({ outcome: "empty", resultCount: 0, hasWarnings: false });
  });
  it.each([
    [{ exitCode: 0, output: "secret", truncated: true }, { outcome: "completed", exitCode: 0, outputTruncated: true }],
    [{ exitCode: 1, output: "secret" }, { outcome: "command_failed", exitCode: 1, outputTruncated: false }],
    [{ exitCode: null, timedOut: true }, { outcome: "timed_out", exitCode: null, outputTruncated: false }],
    [{ exitCode: "secret" }, { outcome: "invalid_result" }],
  ])("reports code execution outcome independently of HTTP success", (input, expected) => {
    expect(voiceToolOutcome("voice_workspace", "workspace_command", input)).toEqual(expected);
  });
  it("records pending approval without calling it executed", () => {
    expect(voiceToolOutcome("organization_api", "call_connected_tool", {
      status: "requires_approval", executed: false, instructions: "private", actionRequestId: "private",
    })).toEqual({ outcome: "approval_pending" });
  });
  it("distinguishes remote MCP failure from completed transport", () => {
    expect(voiceToolOutcome("organization_api", "call_connected_tool", {
      status: "completed", result: { error: "private failure", data: { isError: true, content: "private" } },
    })).toEqual({ outcome: "tool_failed" });
    expect(voiceToolOutcome("organization_api", "call_connected_tool", {
      status: "completed", result: { data: { isError: true } },
    })).toEqual({ outcome: "tool_failed" });
    expect(voiceToolOutcome("organization_api", "call_connected_tool", {
      status: "completed", result: { data: { isError: false, content: "private" } },
    })).toEqual({ outcome: "completed" });
  });
  it("does not label malformed known results successful", () => {
    expect(voiceToolOutcome("voice_workspace", "workspace_command", null)).toEqual({ outcome: "invalid_result" });
    expect(voiceToolOutcome("organization_api", "search_web", { results: "private" })).toEqual({ outcome: "invalid_result" });
  });
  it("ignores arbitrary fields, nested output and unrelated status strings", () => {
    expect(voiceToolOutcome("organization_api", "get_task", { status: "requires_approval", executed: false, output: "private" }))
      .toEqual({ outcome: "completed" });
    expect(voiceToolOutcome("organization_api", "list_agents", [{ name: "private" }])).toEqual({ outcome: "completed" });
    expect(voiceToolOutcome("organization_api", "overview", null)).toEqual({ outcome: "completed" });
  });
});
