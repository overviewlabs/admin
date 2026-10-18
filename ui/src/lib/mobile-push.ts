import { api } from "../api/client";
export type PushConfig = { enabled: boolean; publicKey?: string };
export const pushConfig = () => api.get<PushConfig>("/mobile-push/config");
export async function enableMobilePush(config: PushConfig) {
  if (!config.enabled || !config.publicKey) throw new Error("Notifications are not configured on the server.");
  if (!("Notification" in window) || !("PushManager" in window)) throw new Error("Install WHOXOS on your Home Screen, then open it there to enable notifications.");
  // Permission must be requested directly from the user's tap on iOS.
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error(permission === "denied" ? "Notifications are blocked. Allow them in your device’s notification settings." : "Notification permission was not granted.");
  await navigator.serviceWorker.register("/sw.js");
  const registration = await navigator.serviceWorker.ready;
  const raw = atob(config.publicKey.replace(/-/g, "+").replace(/_/g, "/"));
  const applicationServerKey = Uint8Array.from(raw, char => char.charCodeAt(0));
  const subscription = await registration.pushManager.getSubscription() ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });
  await api.post("/mobile-push/subscriptions", subscription.toJSON());
  return subscription;
}
export async function disableMobilePush() {
  if (!("serviceWorker" in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration("/");
  const subscription = await registration?.pushManager?.getSubscription();
  if (!subscription) return;
  try { await api.post("/mobile-push/unsubscribe", { endpoint: subscription.endpoint }); }
  finally { await subscription.unsubscribe(); }
}

export async function testMobilePush() {
  const registration = await navigator.serviceWorker.getRegistration("/");
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) throw new Error("Enable notifications on this device first.");
  return api.post("/mobile-push/test", {endpoint:subscription.endpoint});
}
