// Finanças service worker. Caches only the app shell, never financial data:
// - /_next/static/* (content-hashed JS, CSS, fonts) and icons: cache first
// - page navigations: always the network; without a connection, /offline.html
// - everything else (pages' data, server actions, API): network only, never stored
const SHELL_CACHE = "shell-v1";
const STATIC_CACHE = "static-v1";
const STATIC_LIMIT = 300;
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll([OFFLINE_URL, "/icon/192"]))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  const keep = [SHELL_CACHE, STATIC_CACHE];
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !keep.includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
    return;
  }
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icon") || url.pathname.startsWith("/apple-icon")) {
    event.respondWith(cacheFirst(request));
  }
});

async function cacheFirst(request) {
  const hit = await caches.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(STATIC_CACHE);
    await cache.put(request, response.clone());
    trim(cache);
  }
  return response;
}

// Each deploy adds new hashed files; keep the cache from growing forever.
async function trim(cache) {
  const keys = await cache.keys();
  for (const key of keys.slice(0, Math.max(0, keys.length - STATIC_LIMIT))) await cache.delete(key);
}
