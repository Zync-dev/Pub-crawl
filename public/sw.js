// Pub Crawls service worker. Den viser push-beskeder og åbner appen, når man trykker på dem.
// Den gemmer ingen af appens sider, så man altid får den nyeste udgave. Kun én lille side til, når nettet
// er væk, så man ikke møder browserens egen fejlside, når appen åbnes uden forbindelse.

const OFFLINE_CACHE = "pc-offline-v1";
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      // Uden net lige nu? Så installeres den alligevel, så beskederne virker. Siden kommer næste gang.
      try {
        const cache = await caches.open(OFFLINE_CACHE);
        await cache.add(new Request(OFFLINE_URL, { cache: "reload" }));
      } catch {}
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith("pc-") && k !== OFFLINE_CACHE).map((k) => caches.delete(k)));
      try {
        await self.registration.navigationPreload?.enable();
      } catch {}
      await self.clients.claim();
    })(),
  );
});

// Kun når en side åbnes: nettet først, og kun uden net den gemte side.
self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(
    (async () => {
      try {
        const preloaded = await event.preloadResponse;
        if (preloaded) return preloaded;
        return await fetch(event.request);
      } catch {
        const offline = await caches.match(OFFLINE_URL);
        return offline ?? Response.error();
      }
    })(),
  );
});

// Kun stier i appen selv. "//fremmed.dk" og hele adresser på andre sider bliver til forsiden.
function appUrl(raw) {
  if (typeof raw !== "string" || !raw.startsWith("/")) return "/";
  try {
    const url = new URL(raw, self.location.origin);
    return url.origin === self.location.origin ? url.pathname + url.search : "/";
  } catch {
    return "/";
  }
}

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  const title = typeof data.title === "string" && data.title ? data.title : "Pub Crawl";
  const url = appUrl(data.url);
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
  const target = new URL(appUrl(event.notification.data?.url), self.location.origin);
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      // Er turen allerede åben, hentes den bare frem.
      const same = windows.find((c) => new URL(c.url).pathname === target.pathname);
      if (same) return same.focus();
      // Et andet vindue med appen flyttes først og hentes så frem. Et tryk må kun hente ét vindue frem,
      // så focus() kommer først, når navigate() er lykkedes. Ellers er der stadig lov til at åbne et nyt.
      const any = windows.find((c) => new URL(c.url).origin === target.origin);
      if (any) {
        try {
          const moved = await any.navigate(target.href);
          if (moved) return moved.focus();
        } catch {
          // Vinduet kunne ikke styres (fx uden service worker). Så åbner vi et nyt.
        }
      }
      return self.clients.openWindow(target.href);
    })(),
  );
});
