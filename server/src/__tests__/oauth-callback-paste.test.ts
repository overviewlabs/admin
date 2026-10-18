import { describe, expect, it } from "vitest";
import { LOCALHOST_OAUTH_CALLBACK, loopbackOAuthState, parseLocalhostOAuthCallback } from "../services/oauth-loopback.js";
const state = loopbackOAuthState("a".repeat(48), "client");
const callback = `${LOCALHOST_OAUTH_CALLBACK}?state=${state}&code=private-code`;
describe("pasted Robinhood callback", () => {
  it("accepts a complete loopback URL without fetching it", () => {
    expect(parseLocalhostOAuthCallback(` ${callback} `)).toEqual({ state, code: "private-code", error: undefined, iss: undefined });
  });
  it("accepts a provider denial for the existing denial handler", () => {
    expect(parseLocalhostOAuthCallback(`${LOCALHOST_OAUTH_CALLBACK}?state=${state}&error=access_denied`).error).toBe("access_denied");
  });
  it.each([
    "not a url", callback.replace("localhost", "evil.example"), callback.replace("http:", "https:"),
    callback.replace(":8765", ":8766"), callback.replace("/callback?", "/other?"),
    callback.replace("localhost", "user:password@localhost"), callback+"#fragment", callback+"&state=other",
    callback+"&code=other", callback+"&error=access_denied", callback.replace("&code=private-code", ""),
    callback.replace(state, "hosted-state"),
  ])("rejects malformed or unrelated URLs without reflecting them: %s", value => {
    expect(() => parseLocalhostOAuthCallback(value)).toThrow();
    try { parseLocalhostOAuthCallback(value); } catch (error) { expect(String(error)).not.toContain("private-code"); }
  });
});
