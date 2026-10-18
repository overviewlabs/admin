import { useEffect, useState } from "react";
import { api } from "@/api/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { clearPendingLoopbackSignIn, savePendingLoopbackSignIn } from "./pendingLoopbackSignIn";

type Completion = { completed: boolean; connectionId: string; resolvedByCallback?: boolean; returnTo?: string };
export function OAuthCallbackPasteDialog({ connectionId, authorizationUrl, providerName = "Robinhood", onComplete, onCancel, expiresAt, onRestart }: {
  expiresAt?: string; onRestart?: () => Promise<void>;
  connectionId: string; authorizationUrl: string; providerName?: string; onComplete: (result: Completion) => void; onCancel: () => void;
}) {
  const [callbackUrl, setCallbackUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [restarting, setRestarting] = useState(false);
  useEffect(() => {
    setError(null); setCallbackUrl("");
    if (expiresAt) savePendingLoopbackSignIn({ connectionId, providerName, authorizationUrl, expiresAt });
  }, [connectionId, providerName, authorizationUrl, expiresAt]);
  const cancel = () => { clearPendingLoopbackSignIn(connectionId); onCancel(); };
  async function restart() {
    if (!onRestart || pending || restarting) return;
    setRestarting(true); setError(null);
    try { await onRestart(); }
    catch { setError("Could not start a new sign-in. Please try again."); }
    finally { setRestarting(false); }
  }
  async function finish() {
    if (pending || restarting) return;
    setError(null);
    try {
      const callback = new URL(callbackUrl.trim());
      if (`${callback.origin}${callback.pathname}` !== "http://localhost:8765/callback" || callback.username || callback.password || callback.hash) {
        setError("Copy the address after sign-in redirects to http://localhost:8765/callback. Do not paste the provider sign-in page address."); return;
      }
      if (["state", "code", "error", "iss"].some(key => callback.searchParams.getAll(key).length > 1)
          || !callback.searchParams.get("state")?.startsWith("whox-local-v1.")
          || Boolean(callback.searchParams.get("code")) === Boolean(callback.searchParams.get("error"))) {
        setError("The callback URL is incomplete. Copy the entire address from the localhost tab."); return;
      }
      // The server binds every pending state to its connection, actor, expiry,
      // client and PKCE verifier. A newer UI attempt must not reject a still-valid
      // callback from the same user's earlier provider tab.

    } catch { setError("Paste the complete localhost callback URL from your address bar."); return; }
    setPending(true);
    try {
      const result = await api.post<Completion>(`/tools/oauth/${connectionId}/callback-url`, { callbackUrl: callbackUrl.trim() });
      if (!result.completed) throw new Error("Authorization did not complete. Please try again.");
      clearPendingLoopbackSignIn(connectionId);
      setCallbackUrl(""); onComplete(result);
    } catch (err) { setError(err instanceof Error ? err.message : "Could not finish linking. Please try again."); }
    finally { setPending(false); }
  }
  return <Dialog open onOpenChange={open => { if (!open && !pending && !restarting) cancel(); }}>
    <DialogContent className="sm:max-w-xl" onInteractOutside={event => event.preventDefault()}>
      <DialogHeader>
        <DialogTitle>Finish connecting {providerName}</DialogTitle>
        <DialogDescription>Sign in to {providerName} in the new tab, then return here to finish linking your account.</DialogDescription>
      </DialogHeader>
      <p className="text-sm text-muted-foreground">You can switch tabs while signing in. Return here to paste the callback URL.</p>
      <ol className="list-decimal pl-5 space-y-2 text-sm">
        <li>Complete sign-in and approve access in the {providerName} tab.</li>
        <li>When it redirects to localhost, copy the entire URL from the address bar. A “cannot connect” page is expected; no local server is needed.</li>
        <li>Paste that URL below and select Finish linking.</li>
      </ol>
      <Button variant="outline" asChild><a href={authorizationUrl} target="_blank" rel="noopener noreferrer">Open {providerName} in a new tab</a></Button>
      <form className="space-y-4" onSubmit={event => { event.preventDefault(); void finish(); }}>
        <label className="block space-y-2 text-sm">
          <span>Localhost callback URL</span>
          <Input type="password" autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={16384} value={callbackUrl} disabled={pending} placeholder="Paste the full localhost URL" onChange={event => setCallbackUrl(event.target.value)} />
        </label>
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        <div className="flex flex-wrap justify-end gap-2">
          {onRestart && <Button type="button" variant="outline" disabled={pending || restarting} onClick={() => void restart()}>{restarting ? "Starting…" : "Start a new sign-in"}</Button>}
          <Button type="button" variant="ghost" disabled={pending} onClick={cancel}>Cancel</Button>
          <Button type="submit" disabled={pending || restarting || !callbackUrl.trim()}>{pending ? "Finishing…" : "Finish linking"}</Button>
        </div>
      </form>
    </DialogContent>
  </Dialog>;
}
