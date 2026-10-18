import { createHash } from "node:crypto";
import { badRequest } from "../errors.js";

export const LOCALHOST_OAUTH_CALLBACK = "http://localhost:8765/callback";
const STATE_PREFIX = "whox-local-v1.";

function clientBinding(clientId: string) {
  return createHash("sha256").update(clientId).digest("base64url");
}

/**
 * The entire opaque state (including this versioned context) is stored in the
 * OAuth state table. Only a successful, actor-bound, atomic state consumption
 * may interpret it. This preserves the original redirect without a mutable
 * connection setting or a callback-supplied redirect override.
 */
export function loopbackOAuthState(randomToken: string, clientId: string) {
  return `${STATE_PREFIX}${clientBinding(clientId)}.${randomToken}`;
}

export function callbackRedirectForConsumedState(
  state: string,
  browserRedirect: string,
  clientId: string,
  provider: string | null,
) {
  if (!state.startsWith(STATE_PREFIX)) return browserRedirect;
  const parts = state.slice(STATE_PREFIX.length).split(".");
  if (
    (provider !== "robinhood" && provider !== "wasabi") || parts.length !== 2 ||
    parts[0] !== clientBinding(clientId) || !/^[A-Za-z0-9_-]{32,}$/.test(parts[1])
  ) {
    throw badRequest("This localhost sign-in was replaced. Start a new sign-in from WHOXOS.", {
      code: "oauth_localhost_flow_replaced",
    });
  }
  return LOCALHOST_OAUTH_CALLBACK;
}

export type PastedOAuthCallback = { state: string; code?: string; error?: string; iss?: string };
export function parseLocalhostOAuthCallback(value: string): PastedOAuthCallback {
  let url: URL;
  try { url = new URL(value.trim()); } catch { throw badRequest("Paste the complete localhost callback URL from the provider tab."); }
  if (`${url.origin}${url.pathname}` !== LOCALHOST_OAUTH_CALLBACK || url.username || url.password || url.hash) {
    throw badRequest("Expected the localhost callback URL from the provider.");
  }
  for (const key of ["state", "code", "error", "iss"]) {
    if (url.searchParams.getAll(key).length > 1) throw badRequest("Invalid authorization callback.");
  }
  const state = url.searchParams.get("state") ?? "";
  const code = url.searchParams.get("code") || undefined;
  const error = url.searchParams.get("error") || undefined;
  if (!state.startsWith(STATE_PREFIX) || Boolean(code) === Boolean(error)) throw badRequest("The callback URL is incomplete. Copy the entire address after signing in.");
  return { state, code, error, iss: url.searchParams.get("iss") || undefined };
}

/** Manual provider sign-in may include MFA and account setup in another tab. */
export function oauthStateExpiresAt(state: string, now = Date.now()) {
  return new Date(now + (state.startsWith(STATE_PREFIX) ? 30 : 10) * 60 * 1000);
}
