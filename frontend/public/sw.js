/* Jagora's service worker: the app's look (code, fonts, sky, icons) is kept on the phone, so Jagora opens fast and
   still shows itself on a bad network. Pages are fetched fresh when possible and fall back to the saved copy. */
const CACHE = "jagora-v5";
const SHELL = ["/app", "/start", "/fonts/jagora-sans.woff2", "/fonts/vollkorn-400.woff2", "/sky/beach-phone.webp", "/brand/mark-64.png"];

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
  if (url.pathname.startsWith("/_next/static/") || /\.(woff2|webp|png|svg|jpg)$/.test(url.pathname)) {
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
