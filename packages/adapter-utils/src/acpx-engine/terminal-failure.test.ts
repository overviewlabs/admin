import { describe, expect, it } from "vitest";
import { createAcpxTerminalFailureTracker } from "./terminal-failure.js";

const response = (actions: unknown, extra: Record<string, unknown> = {}) => ({
  id: 7,
  result: { stopReason: "end_turn", _meta: { jetbrains: { air: {
    version: 1, sessionFailure: { category: "limit", severity: "error", actions,
      title: "private bearer credential and provider details", ...extra },
  } } } },
});
function tracker() {
  const state = createAcpxTerminalFailureTracker();
  state.observe("outbound", { id: 7, method: "session/prompt", params: { private: "not retained" } });
  return state;
}

describe("ACP terminal failure metadata", () => {
  it.each([
    [["retry"], "acpx_provider_rate_limit"],
    [["new_session"], "acpx_provider_session_limit"],
    [[], "acpx_provider_limit_exhausted"],
  ])("retains provider recovery guidance %j without free-form details", (actions, code) => {
    const state = tracker();
    state.observe("inbound", response(actions));
    expect(state.failure).toMatchObject({ category: "limit", actions, code });
    expect(JSON.stringify(state.failure)).not.toMatch(/private|bearer|credential|details/);
  });

  it.each([undefined, null, ["arbitrary-action"], ["retry", 7]])("does not infer quota exhaustion or retry from invalid actions %j", actions => {
    const state = tracker(); state.observe("inbound", response(actions));
    expect(state.failure).toMatchObject({ code: "acpx_provider_limit_failure", actions: [] });
  });

  it("ignores warnings, notices, mismatched replies, and outbound spoofing", () => {
    const state = tracker();
    state.observe("inbound", response([], { severity: "warning" }));
    expect(state.failure).toBeUndefined();
    state.observe("inbound", { ...response([]), id: 8 });
    state.observe("outbound", response([]));
    state.observe("inbound", { method: "session/update", params: response([]).result });
    expect(state.failure).toBeUndefined();
  });

  it("clears previous results for the next prompt and ignores late replies after close", () => {
    const state = tracker(); state.observe("inbound", response([]));
    expect(state.failure).toBeDefined();
    state.observe("outbound", { id: 8, method: "session/prompt" });
    state.observe("inbound", response([]));
    expect(state.failure).toBeUndefined();
    state.close(); state.observe("inbound", { ...response([]), id: 8 });
    expect(state.failure).toBeUndefined();
  });

  it("requires versioned metadata and a terminal prompt response", () => {
    const state = tracker();
    state.observe("inbound", { id: 7, result: { _meta: response([]).result._meta } });
    state.observe("inbound", { id: 7, result: { stopReason: "end_turn", _meta: { jetbrains: { air: { version: 0, sessionFailure: { category: "limit", severity: "error", actions: [] } } } } } });
    expect(state.failure).toBeUndefined();
  });
});
