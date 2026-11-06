const CACHE_NAME = 'silverstone-shell-v2';
const APP_SHELL = ['/', '/index.html', '/manifest.webmanifest', '/silverstone.svg'];

async function precacheAppShell() {
  const pageResponse = await fetch('/index.html', { cache: 'no-cache' });
  if (!pageResponse.ok) throw new Error('Could not load the Silverstone app shell.');
  const html = await pageResponse.clone().text();
  const buildAssets = [...html.matchAll(/(?:src|href)=["'](\/assets\/[^"']+)["']/g)].map((match) => match[1]);
  const cache = await caches.open(CACHE_NAME);
  await cache.addAll([...new Set([...APP_SHELL, ...buildAssets])]);
}

self.addEventListener('install', (event) => {
  event.waitUntil(precacheAppShell());
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys
        .filter((key) => (key.startsWith('silverstone-') || key === 'orbit-shell-v1') && key !== CACHE_NAME)
        .map((key) => caches.delete(key))),
    ),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', copy)).catch(() => undefined));
          return response;
        })
        .catch(() => caches.match('/index.html')),
    );
    return;
  }

  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(request).then(async (cached) => {
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) {
          const copy = response.clone();
          event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => undefined));
        }
        return response;
      }),
    );
  }
});
