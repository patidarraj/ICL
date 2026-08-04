const CACHE_NAME = 'carrom-tm-v62';

// No install-time precache here on purpose: cache.addAll() over ~30 of the app's own files
// used to fire during install, which happens concurrently with the browser's own first-ever
// page load already fetching those exact same files — doubling network contention during the
// single worst moment for it (a brand-new visitor's first load). The fetch handler below
// already caches every response as it's actually used, so nothing is lost by not precaching;
// it just means the cache fills in organically instead of racing the page for bandwidth.
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
    ))
  );
  self.clients.claim();
});

// Stale-while-revalidate: serve instantly from cache if we have it, while a fresh copy
// fetches in the background to update the cache for next time. This used to be network-first
// (always wait on a live fetch before showing anything, even on a repeat visit with nothing
// changed) specifically to avoid serving stale JS after a deploy — but CACHE_NAME is bumped
// on every deploy and activate() wipes any cache under the old name, so that guarantee still
// holds here: a new deploy gets a clean cache regardless, it just no longer forces every
// single visit — first or hundredth — to wait on a full network round trip for every asset.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(event.request);
      const fetchPromise = fetch(event.request).then((response) => {
        cache.put(event.request, response.clone());
        return response;
      }).catch(() => cached);
      return cached || fetchPromise;
    })
  );
});
