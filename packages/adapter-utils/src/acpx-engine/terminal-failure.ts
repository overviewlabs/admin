/** Provider-authored typed failure metadata. Free-form titles/details never leave the wire. */
export interface AcpxTerminalFailure {
  category: "connection" | "access" | "limit" | "service" | "request" | "unknown";
  actions: Array<"retry" | "new_session" | "login">;
  code: string;
  message: string;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : undefined;
}

function terminalFailure(result: unknown): AcpxTerminalFailure | undefined {
  const response = record(result);
  if (typeof response?.stopReason !== "string") return;
  const air = record(record(record(response._meta)?.jetbrains)?.air);
  if (!Number.isInteger(air?.version) || Number(air?.version) < 1) return;
  const failure = record(air?.sessionFailure);
  if (failure?.severity !== "error") return;
  const category = ["connection", "access", "limit", "service", "request"].includes(String(failure.category))
    ? failure.category as AcpxTerminalFailure["category"] : "unknown";
  // An unknown/malformed action is never interpreted as permission to retry.
  const validActions = Array.isArray(failure.actions) && failure.actions.every(
    action => action === "retry" || action === "new_session" || action === "login",
  );
  const actions: AcpxTerminalFailure["actions"] = validActions
    ? [...new Set(failure.actions as AcpxTerminalFailure["actions"])] : [];
  let code = category === "limit" ? "acpx_provider_limit_failure" : "acpx_turn_failed";
  let message = `The agent provider reported a terminal ${category} failure.`;
  if (category === "limit") {
    if (validActions && actions.length === 1 && actions[0] === "retry") {
      code = "acpx_provider_rate_limit";
      message = "The agent provider reached a temporary limit and recommends retrying later. No automatic retry was started.";
    } else if (validActions && actions.length === 1 && actions[0] === "new_session") {
      code = "acpx_provider_session_limit";
      message = "The agent provider reached a session limit and requires a new session. Review completed work before resuming.";
    } else if (validActions && actions.length === 0) {
      code = "acpx_provider_limit_exhausted";
      message = "The agent provider reached a usage limit and did not offer a retry. Check the connected account's allowance before resuming.";
    } else {
      message = "The agent provider reached a limit. Check the connected account's allowance and session status before resuming.";
    }
  }
  return { category, actions, code, message };
}

/** Correlates the actual session/prompt response, excluding notices and old-session failures. */
export function createAcpxTerminalFailureTracker() {
  let promptId: string | number | undefined;
  let failure: AcpxTerminalFailure | undefined;
  let closed = false;
  return {
    observe(direction: "inbound" | "outbound", value: unknown) {
      if (closed) return;
      const message = record(value);
      if (!message) return;
      if (direction === "outbound" && message.method === "session/prompt") {
        promptId = typeof message.id === "string" || typeof message.id === "number" ? message.id : undefined;
        failure = undefined;
      } else if (direction === "inbound" && promptId !== undefined && message.id === promptId) {
        failure = terminalFailure(message.result);
      }
    },
    get failure() { return failure; },
    close() { closed = true; promptId = undefined; },
  };
}
