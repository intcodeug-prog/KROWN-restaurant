const CACHE_NAME = 'krown-erp-v6-offline-shell';
const OFFLINE_URL = '/';
const CORE_ASSETS = ['/', '/manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(
        names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))
      ))
      .then(() => self.clients.claim())
  );
});

function isApi(pathname) {
  return pathname.startsWith('/api/');
}

function isAuthOrDeviceApi(pathname) {
  return pathname.startsWith('/api/auth/') || pathname.startsWith('/api/devices/');
}

function isNextAsset(pathname) {
  return pathname.startsWith('/_next/static/') || pathname.startsWith('/_next/image');
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // API responses are handled by lib/sync.ts, which scopes its IndexedDB cache
  // by organization + branch + device. Do not create a second, unscoped API cache
  // in the service worker.
  if (isApi(url.pathname)) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);

    // Next.js immutable chunks and static assets are safe to serve cache-first.
    if (isNextAsset(url.pathname)) {
      if (cached) return cached;
      try {
        const network = await fetch(request);
        if (network.ok) event.waitUntil(cache.put(request, network.clone()).catch(() => undefined));
        return network;
      } catch {
        return new Response('', { status: 503, statusText: 'Offline' });
      }
    }

    // Navigations use the latest online document, while retaining the last known
    // document for immediate offline startup. Every successful route visit is
    // cached, so an already-used PWA can reopen without internet.
    if (request.mode === 'navigate') {
      try {
        const network = await fetch(request);
        if (network.ok) event.waitUntil(cache.put(request, network.clone()).catch(() => undefined));
        return network;
      } catch {
        if (cached) return cached;
        const shell = await cache.match(OFFLINE_URL);
        if (shell) return shell;
        return new Response('<!doctype html><title>KROWN</title><body>KROWN is ready to work offline. Reopen the application.</body>', {
          status: 503,
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
      }
    }

    // Other same-origin static GETs: return cached immediately when available and
    // refresh the cache in the background; otherwise fetch and cache them.
    if (cached) {
      event.waitUntil(
        fetch(request).then((network) => network.ok ? cache.put(request, network.clone()) : undefined).catch(() => undefined)
      );
      return cached;
    }

    try {
      const network = await fetch(request);
      if (network.ok) event.waitUntil(cache.put(request, network.clone()).catch(() => undefined));
      return network;
    } catch {
      return new Response('', { status: 503, statusText: 'Offline' });
    }
  })());
});
