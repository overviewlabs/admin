import { describe, expect, it } from "vitest";

import {
  WHOXOS_RUNNER_DEFAULT_MODELS,
  isWHOXOSRunnerProvider,
  resolveWHOXOSRunnerModel,
  resolveWHOXOSRunnerPermissionMode,
} from "./whoxos-runner-permissions.js";

describe("WHOXOS Runner permission defaults", () => {
  it("defaults Codex to the only qualified non-interactive mode", () => {
    expect(resolveWHOXOSRunnerPermissionMode("codex", undefined)).toBe(
      "never",
    );
    expect(resolveWHOXOSRunnerPermissionMode("codex", "on-request")).toBe("never");
    expect(resolveWHOXOSRunnerPermissionMode("codex", "untrusted")).toBe("never");
  });

  it("uses interactive defaults for dormant non-Codex providers", () => {
    expect(resolveWHOXOSRunnerPermissionMode("opencode", undefined)).toBe(
      "ask",
    );
    expect(resolveWHOXOSRunnerPermissionMode("acpx", undefined)).toBe(
      "approve-reads",
    );
  });

  it("recognizes only exact provider identifiers", () => {
    expect(isWHOXOSRunnerProvider("codex")).toBe(true);
    expect(isWHOXOSRunnerProvider("opencode")).toBe(true);
    expect(isWHOXOSRunnerProvider("claude_managed")).toBe(true);
    expect(isWHOXOSRunnerProvider("aws_agentcore")).toBe(true);
    expect(isWHOXOSRunnerProvider("acpx")).toBe(true);
    expect(isWHOXOSRunnerProvider("toString")).toBe(false);
    expect(isWHOXOSRunnerProvider("__proto__")).toBe(false);
  });

  it("keeps managed provider permissions under the qualified profile", () => {
    expect(resolveWHOXOSRunnerPermissionMode("claude_managed", "never"))
      .toBe("provider-managed");
    expect(resolveWHOXOSRunnerPermissionMode("aws_agentcore", "approve-all"))
      .toBe("provider-managed");
  });

  it("uses the Codex default for missing or blank models", () => {
    expect(resolveWHOXOSRunnerModel("codex", undefined)).toBe(
      WHOXOS_RUNNER_DEFAULT_MODELS.codex,
    );
    expect(resolveWHOXOSRunnerModel("codex", "   ")).toBe(
      WHOXOS_RUNNER_DEFAULT_MODELS.codex,
    );
  });

  it("preserves an explicit Codex model", () => {
    expect(resolveWHOXOSRunnerModel("codex", "gpt-5.5")).toBe("gpt-5.5");
    expect(resolveWHOXOSRunnerModel("codex", "  gpt-5.5  ")).toBe("gpt-5.5");
  });
});
