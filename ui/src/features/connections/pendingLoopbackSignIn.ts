// Tab-local recovery only. Never persist the callback code, verifier or tokens.
export type PendingLoopbackSignIn = {
  connectionId: string;
  providerName: string;
  authorizationUrl: string;
  expiresAt: string;
};
const prefix = "overview.pending-loopback.v1.";
export function clearPendingLoopbackSignIn(connectionId: string) {
  try { sessionStorage.removeItem(prefix + connectionId); } catch { /* Storage can be unavailable. */ }
}
export function savePendingLoopbackSignIn(value: PendingLoopbackSignIn) {
  try { sessionStorage.setItem(prefix + value.connectionId, JSON.stringify(value)); } catch { /* Keep the in-memory flow usable. */ }
}
export function readPendingLoopbackSignIn(connectionId: string): PendingLoopbackSignIn | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(prefix + connectionId) ?? "null");
    if (!value) return null;
    if (value.connectionId !== connectionId || typeof value.providerName !== "string"
      || !Number.isFinite(Date.parse(value.expiresAt)) || Date.parse(value.expiresAt) <= Date.now()) {
      clearPendingLoopbackSignIn(connectionId); return null;
    }
    const url = new URL(value.authorizationUrl);
    if (url.protocol !== "https:" || url.username || url.password
      || url.searchParams.get("redirect_uri") !== "http://localhost:8765/callback"
      || !url.searchParams.get("state")?.startsWith("whox-local-v1.")) {
      clearPendingLoopbackSignIn(connectionId); return null;
    }
    return value;
  } catch { clearPendingLoopbackSignIn(connectionId); return null; }
}
