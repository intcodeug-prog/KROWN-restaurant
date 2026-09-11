const CACHE_NAME = 'krown-erp-v5-offline-shell';
const OFFLINE_URL = '/';
const CORE_ASSETS = ['/', '/manifest.json', '/krown-logo.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) => Promise.all(
      names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never let service-worker caching interfere with authentication or device security.
  if (url.pathname.startsWith('/api/auth/') || url.pathname.startsWith('/api/devices/')) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);

    try {
      const network = await fetch(request);
      if (network && network.ok) {
        // Cache successful application/static responses so an already-used PWA
        // remains usable when connectivity disappears later.
        const copy = network.clone();
        event.waitUntil(cache.put(request, copy).catch(() => undefined));
      }
      return network;
    } catch {
      // Navigation requests fall back to the cached application shell. Other
      // requests use their previously cached response when one exists.
      if (cached) return cached;
      if (request.mode === 'navigate') {
        const shell = await cache.match(OFFLINE_URL);
        if (shell) return shell;
      }
      return new Response('', { status: 503, statusText: 'Offline' });
    }
  })());
});
