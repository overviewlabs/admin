import type { AdapterEnvironmentTestResult } from "@whoxos/adapter-utils";
import type { AiProvider } from "@whoxos/shared";
import { unprocessable } from "../errors.js";

/** Public diagnostics must not contain probe output, credential paths, or tokens. */
export function aiConnectionValidationError(provider: AiProvider, result: AdapterEnvironmentTestResult) {
  const providerName = { openai: "OpenAI", anthropic: "Claude", openrouter: "OpenRouter", xai: "Grok", gemini: "Gemini" }[provider];
  const authenticationFailed = result.checks.some((check) =>
    /(?:auth_required|auth_missing|credentials_missing|api_key_rejected)$/.test(check.code),
  );
  const engineUnavailable = result.checks.some((check) => check.code === "adapter_engine_unavailable" || check.code === "codex_acp_command_missing");
  const commandUnavailable = result.checks.some((check) => check.code === "codex_command_unresolvable");
  const message = authenticationFailed
    ? `${providerName} rejected the selected account's authentication. Reconnect this account in Connectors, then test and save the agent again.`
    : engineUnavailable
      ? "The selected execution engine is unavailable in this agent's environment. Run Test to check the runtime installation before saving."
      : commandUnavailable
        ? "Codex is unavailable in this agent’s environment. Install or repair the Codex CLI, then test and save the agent again."
        : `The selected ${providerName} account could not run the agent's configured model. Run Test to see the failure and verify this account has access to that model.`;
  return unprocessable(message, {
    code: authenticationFailed ? "ai_connection_authentication_failed" : "ai_connection_validation_failed",
    provider,
  });
}
