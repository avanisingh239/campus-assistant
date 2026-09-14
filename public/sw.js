// Minimal PWA app-shell service worker (docs/architecture.md §4.3).
//
// Scope: cache the static app shell only (this file's own asset list) for
// instant offline startup. It must NEVER cache raw message text or any
// other dynamic/API response — the "Privacy Boundary for Offline Storage"
// decision in docs/architecture.md §4.3 is absolute: only sanitized,
// structured data may ever be cached offline, and that structured-data
// caching (via IndexedDB) is Phase 2, not implemented here. This service
// worker doesn't intercept API/data routes at all.

const CACHE_NAME = "campus-assistant-shell-v1";
const SHELL_ASSETS = ["/manifest.json", "/icons/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      ),
    ),
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  const isShellAsset = SHELL_ASSETS.includes(url.pathname);

  if (!isShellAsset || event.request.method !== "GET") {
    return; // let everything else hit the network normally
  }

  event.respondWith(
    caches.match(event.request).then((cached) => cached ?? fetch(event.request)),
  );
});
