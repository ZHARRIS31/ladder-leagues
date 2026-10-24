/* Lets the app open quickly and install to the home screen.
   Always tries the network first, so players never see an old version for long.
   League data comes from Google and is never cached here. */
const CACHE = "mtc-ladder-v2";
const SHELL = ["./", "./index.html", "./styles.css", "./ladder-core.js", "./app.js", "./manifest.webmanifest", "./icon.svg"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)));
  self.skipWaiting();
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== self.location.origin) return;
  // "no-cache" makes the browser check GitHub for a newer file every time, instead of reusing its own copy for up to 10 minutes.
  e.respondWith(
    fetch(new Request(e.request.url, { cache: "no-cache", credentials: "same-origin" }))
      .then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return res; })
      .catch(() => caches.match(e.request))
  );
});
