import { describe, expect, it } from "vitest";
import type { AdapterEnvironmentTestResult } from "@whoxos/adapter-utils";
import { aiConnectionValidationError } from "./ai-connection-validation-error.js";

function result(code: string): AdapterEnvironmentTestResult {
  return { adapterType: "codex_local", status: "fail", testedAt: new Date().toISOString(), checks: [
    { code, level: "error", message: "private probe message", detail: "Bearer private-token /private/auth.json" },
    { code: "ai_connection_validation_incomplete", level: "error", message: "Hello test missing" },
  ] };
}

describe("managed account save validation errors", () => {
  it.each(["codex_hello_probe_auth_required", "adapter_auth_missing", "ai_connection_api_key_rejected"])(
    "explains authentication failure %s without exposing credentials", (code) => {
      const error = aiConnectionValidationError("openai", result(code));
      expect(error.status).toBe(422);
      expect(error.message).toContain("Reconnect this account in Connectors");
      expect(error.details).toEqual({ code: "ai_connection_authentication_failed", provider: "openai" });
      expect(JSON.stringify(error)).not.toContain("private");
    },
  );
  it("preserves a blocking verdict for an unavailable engine", () => {
    const error = aiConnectionValidationError("openai", result("adapter_engine_unavailable"));
    expect(error.status).toBe(422);
    expect(error.message).toContain("execution engine is unavailable");
    expect(error.message).not.toContain("Reconnect");
  });
  it("explains a missing CLI without claiming model access was denied", () => {
    const error = aiConnectionValidationError("openai", result("codex_command_unresolvable"));
    expect(error.status).toBe(422);
    expect(error.message).toContain("Install or repair the Codex CLI");
    expect(error.message).not.toContain("access to that model");
    expect(JSON.stringify(error)).not.toContain("private");
  });
  it("distinguishes a model test failure from an authentication failure", () => {
    const error = aiConnectionValidationError("openai", result("codex_hello_probe_failed"));
    expect(error.status).toBe(422);
    expect(error.message).toContain("has access to that model");
    expect(error.details).toEqual({ code: "ai_connection_validation_failed", provider: "openai" });
    expect(JSON.stringify(error)).not.toContain("private");
  });
});
