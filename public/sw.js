// Pub Crawls service worker. Den viser push-beskeder og åbner appen, når man trykker på dem.
// Den gemmer ingen sider, så man altid får den nyeste udgave af appen.

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
    data = { body: event.data ? event.data.text() : "" };
  }
  const title = typeof data.title === "string" && data.title ? data.title : "Pub Crawl";
  const url = typeof data.url === "string" && data.url.startsWith("/") ? data.url : "/";
  const tag = typeof data.tag === "string" && data.tag ? data.tag : undefined;
  event.waitUntil(
    self.registration.showNotification(title, {
      body: typeof data.body === "string" ? data.body : "",
      tag,
      renotify: Boolean(tag),
      icon: "/apple-icon",
      badge: "/push-badge",
      vibrate: [200, 100, 200],
      data: { url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/", self.location.origin);
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      // Er turen allerede åben, hentes den bare frem.
      const same = windows.find((c) => new URL(c.url).pathname === target.pathname);
      if (same) return same.focus();
      const any = windows.find((c) => new URL(c.url).origin === target.origin);
      if (any) {
        try {
          await any.focus();
          return await any.navigate(target.href);
        } catch {
          // Vinduet kunne ikke styres. Så åbner vi et nyt.
        }
      }
      return self.clients.openWindow(target.href);
    })(),
  );
});
