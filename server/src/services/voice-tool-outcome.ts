/** Content-free diagnostics: HTTP completion alone does not prove useful evidence or execution. */
export function voiceToolOutcome(tool: string, operation: unknown, result: unknown) {
  const value = result && typeof result === "object" && !Array.isArray(result)
    ? result as Record<string, unknown> : null;
  if (tool === "voice_workspace") {
    if (!value || !(value.exitCode === null || typeof value.exitCode === "number" && Number.isInteger(value.exitCode))) {
      return { outcome: "invalid_result" };
    }
    const exitCode = typeof value.exitCode === "number" && Number.isInteger(value.exitCode)
      ? value.exitCode : null;
    return {
      outcome: value.timedOut === true ? "timed_out" : exitCode === 0 ? "completed" : "command_failed",
      exitCode,
      outputTruncated: value.truncated === true,
    };
  }
  if (tool === "organization_api" && operation === "search_web") {
    if (!value || !Array.isArray(value.results)) return { outcome: "invalid_result" };
    return {
      outcome: value.results.length === 0 ? "empty" : "results_available",
      resultCount: Math.min(value.results.length, 100),
      hasWarnings: Array.isArray(value.warnings) && value.warnings.length > 0,
    };
  }
  if (tool === "organization_api" && operation === "call_connected_tool"
    && value?.status === "requires_approval" && value.executed === false) {
    return { outcome: "approval_pending" };
  }
  if (tool === "organization_api" && operation === "call_connected_tool" && value) {
    const nested = value.result && typeof value.result === "object" ? value.result as Record<string, unknown> : null;
    const data = nested?.data && typeof nested.data === "object" ? nested.data as Record<string, unknown> : null;
    if (value.status === "failed" || nested?.error || data?.isError === true) return { outcome: "tool_failed" };
  }
  return { outcome: "completed" };
}
