import { describe, expect, it } from "vitest";
import { typesafeRuntimeTransition } from "../services/typesafe-runtime-transition.js";

describe("TypeSafe runtime transition", () => {
  const existing = { aiConnection: { provider: "openai", mode: "responsible_user" }, heartbeat: { enabled: false }, customPolicy: "preserved" };
  it("detaches only the incompatible managed binding on an explicit switch", () => {
    const result = typesafeRuntimeTransition("codex_local", "typesafe", existing, null);
    expect(result.detachAiConnection).toBe(true);
    expect(result.runtimeConfig).toEqual({ heartbeat: { enabled: false }, customPolicy: "preserved" });
    expect(existing.aiConnection.provider).toBe("openai");
  });
  it("preserves explicit runtime edits and never mutates the request", () => {
    const requested = { heartbeat: { enabled: true }, aiConnection: existing.aiConnection };
    expect(typesafeRuntimeTransition("codex_local", "typesafe", existing, requested).runtimeConfig).toEqual({ heartbeat: { enabled: true }, customPolicy: "preserved" });
    expect(requested.aiConnection).toEqual(existing.aiConnection);
  });
  it("keeps normal binding validation for chat-provider switches", () => {
    const requested = { aiConnection: { provider: "anthropic" } };
    expect(typesafeRuntimeTransition("codex_local", "claude_local", existing, requested)).toEqual({ detachAiConnection: false, runtimeConfig: requested });
  });
  it("does not detach a binding during an ordinary same-harness update", () => {
    expect(typesafeRuntimeTransition("typesafe", "typesafe", existing, null)).toEqual({ detachAiConnection: false, runtimeConfig: null });
  });
});
