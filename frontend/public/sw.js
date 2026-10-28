/* Jagora's service worker: the app's look (code, fonts, sky, icons) is kept on the phone, so Jagora opens fast and
   still shows itself on a bad network. Pages are fetched fresh when possible and fall back to the saved copy. */
const CACHE = "jagora-v8";
const SHELL = ["/app", "/start", "/fonts/jagora-sans.woff2", "/fonts/jagora-text.woff2", "/sky/sky-phone.webp", "/brand/mark-64.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  // build files, fonts, images: from the phone first
  // build files, fonts, images and the speech detector (/vad/, a few MB, downloaded once): from the phone first
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/vad/") || /\.(woff2|webp|png|svg|jpg)$/.test(url.pathname)) {
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      })),
    );
    return;
  }
  // pages: fresh from the network, saved copy if offline
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      }).catch(() => caches.match(req).then((hit) => hit || caches.match("/app"))),
    );
  }
});

/* Notifications from the server: reminders, scheduled task results, watched pages. A tap opens that chat. */
self.addEventListener("push", (e) => {
  let d = {};
  try {
    d = e.data ? e.data.json() : {};
  } catch {
    d = { body: e.data ? e.data.text() : "" };
  }
  e.waitUntil(
    self.registration.showNotification(d.title || "Jagora", {
      body: d.body || "",
      tag: d.tag || undefined,
      icon: "/icons/icon-192.png",
      data: { url: d.url || "/app" },
    }),
  );
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "/app";
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if (new URL(w.url).pathname.startsWith("/app") && "focus" in w) {
          w.postMessage({ type: "open-chat", url });
          return w.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
