// @vitest-environment jsdom
import { beforeEach, expect, it } from "vitest";
import { savePendingLoopbackSignIn, readPendingLoopbackSignIn } from "./pendingLoopbackSignIn";
beforeEach(() => sessionStorage.clear());
const value = { connectionId: "one", providerName: "Wasabi", expiresAt: new Date(Date.now() + 60_000).toISOString(), authorizationUrl: "https://mcp.wasabisys.dev/oauth/authorize?state=whox-local-v1.test&redirect_uri=http%3A%2F%2Flocalhost%3A8765%2Fcallback" };
it("restores only the requested connection", () => { savePendingLoopbackSignIn(value); expect(readPendingLoopbackSignIn('one')).toEqual(value); expect(readPendingLoopbackSignIn('two')).toBeNull(); });
it("discards expired links instead of extending the server expiry", () => { savePendingLoopbackSignIn({...value, expiresAt: new Date(0).toISOString()}); expect(readPendingLoopbackSignIn('one')).toBeNull(); expect(sessionStorage.length).toBe(0); });
it("rejects malformed data and non-HTTPS navigation", () => { savePendingLoopbackSignIn({...value, authorizationUrl: 'javascript:alert(1)'}); expect(readPendingLoopbackSignIn('one')).toBeNull(); });
