import { useEffect, useState } from "react";
import { Bell, Download, Share2, Check } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { isChromelessDisplayMode } from "../lib/pwa-display-mode";
import { disableMobilePush, enableMobilePush, testMobilePush, pushConfig, type PushConfig } from "../lib/mobile-push";

type InstallPrompt = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: string }> };
export function InstallAppDialog() {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [installed, setInstalled] = useState(isChromelessDisplayMode);
  const [config, setConfig] = useState<PushConfig | null>(null);
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const supported = "Notification" in window && "PushManager" in window;
  useEffect(() => {
    const show = () => setOpen(true);
    const capture = (event: Event) => { event.preventDefault(); setPrompt(event as InstallPrompt); };
    const done = () => { setInstalled(true); setPrompt(null); };
    window.addEventListener("overview-install-app", show);
    window.addEventListener("beforeinstallprompt", capture);
    window.addEventListener("appinstalled", done);
    return () => { window.removeEventListener("overview-install-app", show); window.removeEventListener("beforeinstallprompt", capture); window.removeEventListener("appinstalled", done); };
  }, []);
  useEffect(() => {
    if (!open) return;
    setError(""); setMessage("");
    void pushConfig().then(setConfig).catch(() => setError("Could not load notification settings. Close and reopen to retry."));
    if (supported) void navigator.serviceWorker.getRegistration("/").then(async r => setSubscribed(Boolean(await r?.pushManager.getSubscription()))).catch(() => setSubscribed(false));
  }, [open, supported]);
  const perform = async (action: () => Promise<unknown>, success: string) => {
    setBusy(true); setError(""); setMessage("");
    try { await action(); setMessage(success); } catch (e) { setError(e instanceof Error ? e.message : "Please try again."); } finally { setBusy(false); }
  };
  return <Dialog open={open} onOpenChange={setOpen}><DialogContent className="sm:max-w-lg">
    <DialogHeader><DialogTitle>Install WHOXOS</DialogTitle><DialogDescription>Your organizations and Admin tools, ready from your Home Screen.</DialogDescription></DialogHeader>
    <div className="space-y-5">
      {installed ? <p className="flex items-center gap-2 text-sm"><Check className="size-4" />You’re using the installed app.</p> : ios ? <div className="space-y-2 text-sm"><p>In Safari, tap <Share2 className="inline size-4" aria-label="Share" /> Share, then <strong>Add to Home Screen</strong>. Keep <strong>Open as Web App</strong> enabled if shown, then tap Add.</p><p className="text-muted-foreground">Open WHOXOS from its new icon and sign in. iOS 16.4 or later is required for push notifications.</p></div> : prompt ? <Button disabled={busy} onClick={() => void perform(async () => { await prompt.prompt(); const choice = await prompt.userChoice; setPrompt(null); if (choice.outcome !== "accepted") throw new Error("Installation was cancelled. You can try again from your browser’s install menu."); }, "Installation requested.")}><Download className="size-4" />Install app</Button> : <p className="text-sm">Use your browser’s menu to choose Install app or Add to Home Screen. On a Mac, use Safari → File → Add to Dock.</p>}
      <details className="rounded-lg border border-border p-3 text-sm"><summary className="cursor-pointer font-medium">Install with an iOS configuration profile</summary><div className="mt-3 space-y-3"><p>This removable profile adds only the WHOXOS Home Screen icon. It does not enroll or manage your device or install certificates. The profile is unsigned; iOS will show that during installation.</p><p className="text-muted-foreground">Download in Safari, then open Settings → Profile Downloaded → Install. For the verified Apple Web Push installation path, use Add to Home Screen above.</p><Button variant="outline" asChild><a href="/overview-labs.mobileconfig"><Download className="size-4" />Download iOS profile</a></Button></div></details>
      <div className="space-y-3 border-t border-border pt-4"><h3 className="text-sm font-medium">Notifications on this device</h3><p className="text-sm text-muted-foreground">Get agent replies, task updates, approvals, failures, and Admin activity. Notifications use Apple’s push service on iOS.</p>
        {ios && !installed ? <p className="text-sm">Open the app from your Home Screen to enable notifications.</p> : !supported ? <p className="text-sm">This browser does not support push notifications.</p> : <div className="install-app-actions flex flex-wrap gap-2">
          <Button disabled={busy || !config?.enabled} onClick={() => void perform(async () => { if (subscribed) { await disableMobilePush(); setSubscribed(false); } else if (config) { await enableMobilePush(config); setSubscribed(true); } }, subscribed ? "Notifications disabled on this device." : "Notifications enabled on this device.")}><Bell className="size-4" />{subscribed ? "Disable notifications" : "Enable notifications"}</Button>
          {subscribed && <Button variant="outline" disabled={busy} onClick={() => void perform(testMobilePush, "Test notification queued. Check your device’s notifications.")}>Send test notification</Button>}
        </div>}
        {config && !config.enabled && <p className="text-sm text-muted-foreground">Push notifications are not configured on this server yet.</p>}
      </div>
      {message && <p role="status" className="text-sm">{message}</p>}{error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  </DialogContent></Dialog>;
}
