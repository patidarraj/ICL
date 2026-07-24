const CACHE_NAME = 'carrom-tm-v33';
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './assets/css/style.css',
  './assets/css/responsive.css',
  './assets/css/dashboard.css',
  './assets/css/schedule.css',
  './assets/css/standings.css',
  './assets/css/teams.css',
  './assets/css/bracket.css',
  './assets/css/stats.css',
  './assets/css/admin.css',
  './assets/css/rules.css',
  './assets/css/scoreboard.css',
  './assets/js/app.js',
  './assets/js/router.js',
  './assets/js/dashboard.js',
  './assets/js/schedule.js',
  './assets/js/standings.js',
  './assets/js/teams.js',
  './assets/js/bracket.js',
  './assets/js/stats.js',
  './assets/js/admin.js',
  './assets/js/storage.js',
  './assets/js/utilities.js',
  './assets/js/charts.js',
  './assets/js/notifications.js',
  './assets/js/team-logo.js',
  './assets/js/rules.js',
  './assets/js/match-alerts.js',
  './assets/js/scoreboard.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)).catch(() => {})
  );
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

// Network-first: always try to fetch the latest app code/styles, only falling back to the
// cached copy if the network is unavailable. Serving stale JS from a cache-first strategy
// previously caused the app to silently run outdated logic after every deploy.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request).then((response) => {
      const clone = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
      return response;
    }).catch(() => caches.match(event.request))
  );
});
