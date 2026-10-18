// Stamped during the production build so each release updates parked clients.
const BUILD_ID = "__WHOXOS_BUILD_ID__";
const CACHE_NAME = `overview-static-${BUILD_ID}`;
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if ((key.startsWith("whoxos-") || key.startsWith("overview-static-")) && key !== CACHE_NAME) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});
self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  // Never persist authenticated API responses or embedded Admin pages offline.
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/admin-portal/")) return;
  const staticAsset = url.pathname.startsWith("/assets/");
  if (!staticAsset && request.mode !== "navigate") return;
  event.respondWith((async () => {
    try {
      const response = await fetch(request);
      if (staticAsset && response.ok) {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, response.clone());
      }
      return response;
    } catch {
      if (staticAsset) return await caches.match(request) ?? Response.error();
      return new Response('<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>WHOXOS · Offline</title><style>body{font:16px system-ui;margin:0;min-height:100dvh;display:grid;place-items:center;background:#151515;color:#eee}main{max-width:28rem;padding:2rem}button{font:inherit;padding:.8rem 1.2rem;border-radius:1rem}</style><main><h1>You’re offline</h1><p>Reconnect to use WHOXOS. Your server work continues while you’re away.</p><button onclick="location.reload()">Try again</button></main></html>', {status:503,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}});
    }
  })());
});
self.addEventListener("push", event => {
  event.waitUntil((async () => {
    let data = {};
    try { data = event.data?.json() ?? {}; } catch {}
    const url = new URL(typeof data.url === "string" ? data.url : "/", self.location.origin);
    await self.registration.showNotification(typeof data.title === "string" ? data.title : "WHOXOS", {
      body: typeof data.body === "string" ? data.body : "You have a new update.",
      icon:"/android-chrome-192x192.png",badge:"/android-chrome-192x192.png",
      tag:typeof data.tag === "string" ? data.tag : "overview-update",
      data:{url:url.origin === self.location.origin ? url.href : self.location.origin},
    });
  })());
});
self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil((async () => {
    const url = new URL(event.notification.data?.url ?? "/", self.location.origin);
    if (url.origin !== self.location.origin) return;
    const windows = await self.clients.matchAll({type:"window",includeUncontrolled:true});
    const client = windows.find(w => new URL(w.url).origin === self.location.origin && !new URL(w.url).pathname.startsWith("/admin-portal/"));
    if (client) { await client.navigate(url.href); await client.focus(); }
    else await self.clients.openWindow(url.href);
  })());
});
