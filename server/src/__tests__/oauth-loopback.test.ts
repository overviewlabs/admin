import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { loopbackOAuthProvider, startToolOAuthSchema } from "@whoxos/shared";
import { oauthStateExpiresAt, callbackRedirectForConsumedState, LOCALHOST_OAUTH_CALLBACK, loopbackOAuthState } from "../services/oauth-loopback.js";

const hosted = "https://overviewlabs.ai/api/tools/oauth/callback";
describe("localhost OAuth callback context", () => {
  it("allows only reviewed exact endpoints and retains Wasabi callback binding", () => {
    expect(loopbackOAuthProvider({url: "https://mcp.wasabisys.dev/s3"})).toBe("wasabi");
    for (const url of ["https://mcp.wasabisys.dev/iam", "https://mcp.wasabisys.dev/s3?x=1", "https://mcp.wasabisys.dev.evil.test/s3", "http://mcp.wasabisys.dev/s3"]) {
      expect(loopbackOAuthProvider({url, sourceTemplateKey: "wasabi"})).toBeNull();
    }
    expect(loopbackOAuthProvider({url: "https://agent.robinhood.com/mcp/trading"})).toBeNull();
    const state = loopbackOAuthState(randomBytes(32).toString("base64url"), "wasabi-client");
    expect(callbackRedirectForConsumedState(state, hosted, "wasabi-client", "wasabi")).toBe(LOCALHOST_OAUTH_CALLBACK);
    expect(() => callbackRedirectForConsumedState(state, hosted, "replaced-client", "wasabi")).toThrow("replaced");
    expect(() => callbackRedirectForConsumedState(state, hosted, "wasabi-client", null)).toThrow("replaced");
  });
  it("retains the original redirect for a consumed loopback state", () => {
    const state = loopbackOAuthState(randomBytes(32).toString("base64url"), "client-one");
    expect(callbackRedirectForConsumedState(state, hosted, "client-one", "robinhood")).toBe(LOCALHOST_OAUTH_CALLBACK);
    expect(callbackRedirectForConsumedState("existing-hosted-state", hosted, "client-one", "robinhood")).toBe(hosted);
  });
  it("rejects a registration replaced while authorization was pending", () => {
    const state = loopbackOAuthState(randomBytes(32).toString("base64url"), "client-one");
    expect(() => callbackRedirectForConsumedState(state, hosted, "client-two", "robinhood")).toThrow("replaced");
    expect(() => callbackRedirectForConsumedState(state, hosted, "client-one", "notion")).toThrow("replaced");
    expect(() => callbackRedirectForConsumedState("whox-local-v1.bad", hosted, "client-one", "robinhood")).toThrow("replaced");
  });
  it("allows a named callback mode without accepting an arbitrary redirect URL", () => {
    expect(startToolOAuthSchema.parse({ asCurrentUser: true, callbackMode: "localhost" })).toMatchObject({ callbackMode: "localhost" });
    expect(startToolOAuthSchema.safeParse({ redirectUri: "https://attacker.example" }).success).toBe(false);
    expect(startToolOAuthSchema.safeParse({ callbackMode: "http://attacker.example" }).success).toBe(false);
  });
});

it("allows thirty minutes for manual loopback sign-in without changing hosted OAuth expiry", () => {
  expect(oauthStateExpiresAt("whox-local-v1.client.random", 0).getTime()).toBe(30 * 60_000);
  expect(oauthStateExpiresAt("hosted-state", 0).getTime()).toBe(10 * 60_000);
});
