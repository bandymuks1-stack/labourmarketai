/*
 * LabourMarket.ai service worker — PUSH ONLY (COM-3 push channel).
 *
 * Registered only when a person turns push notifications on in their account
 * (components/app/web-push-opt-in.tsx); never on page load. It deliberately
 * has NO fetch handler: no offline cache, no request interception, nothing
 * that could serve a stale page or change how the site loads.
 *
 * A push carries only the notification's type title and a link on this
 * origin (lib/notifications/web-push-dispatch.ts) — never message text.
 */
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  const title = typeof data.title === "string" && data.title ? data.title : "LabourMarket.ai";
  const url = typeof data.url === "string" ? data.url : "/";
  event.waitUntil(
    self.registration.showNotification(title, {
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: typeof data.tag === "string" ? data.tag : undefined,
      data: { url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  let target = "/";
  try {
    const u = new URL(event.notification.data && event.notification.data.url, self.location.origin);
    // Same origin only: a push can never open somewhere else.
    if (u.origin === self.location.origin) target = u.href;
  } catch {
    target = "/";
  }
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if (w.url === target && "focus" in w) return w.focus();
      }
      return self.clients.openWindow(target);
    }),
  );
});
