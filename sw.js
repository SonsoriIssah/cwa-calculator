// sw.js — minimal service worker. Its main job is satisfying the install
// criteria for "Add to Home Screen" on Android/Chrome (which requires an
// active service worker with a fetch handler); best-effort offline caching
// of the app's own files is a bonus, not a guarantee — Tailwind CSS, Google
// Fonts and Material Symbols are loaded from CDNs and still need a network
// connection (see README).

const CACHE_NAME = "cwa-calculator-v1";

const PRECACHE_URLS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/styles.css",
  "./js/catalog.js",
  "./js/calculator.js",
  "./js/plan-export.js",
  "./js/app.js",
  "./js/vendor/jspdf.umd.min.js",
  "./data/courses.csv",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png",
  "./icons/favicon-32.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Network-first for same-origin GETs, so catalog/code updates show up
// promptly whenever there's a connection; falls back to the cached copy only
// when the network fails (offline, or a fresh install with nothing fetched
// yet). Cross-origin requests (Tailwind CDN, Google Fonts) pass straight
// through untouched.
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || event.request.method !== "GET") return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
