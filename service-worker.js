const CACHE_PREFIX = `total-eng-address-${encodeURIComponent(self.registration.scope)}-`;
const CACHE_NAME = `${CACHE_PREFIX}v3-7-3`;
const APP_SHELL = [
  './',
  './index.html',
  './style.css?v=3.7.3',
  './manifest.json?v=3.7.3',
  './robots.txt',
  './js/app.js?v=3.7.3',
  './js/contacts.js?v=3.7.3',
  './data/sites.json',
  './img/logo.png',
  './img/favicon-32.png',
  './img/icon-180.png',
  './img/icon-192.png',
  './img/icon-512.png',
  './img/icon-maskable-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )),
      self.clients.claim()
    ])
  );
});

async function cacheResponse(request, response) {
  if (!response || !response.ok || response.type !== 'basic') {
    return response;
  }

  const cache = await caches.open(CACHE_NAME);
  await cache.put(request, response.clone());
  return response;
}

async function networkFirst(request, fallbackUrl) {
  try {
    const response = await fetch(request, { cache: 'no-store' });
    return cacheResponse(request, response);
  } catch (error) {
    const cached = await caches.match(request, { ignoreSearch: true });
    if (cached) return cached;
    if (fallbackUrl) return caches.match(fallbackUrl);
    throw error;
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request, { ignoreSearch: true });
  if (cached) return cached;

  const response = await fetch(request);
  return cacheResponse(request, response);
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== 'GET' || url.origin !== self.location.origin) {
    return;
  }

  if (url.pathname.endsWith('/recover.html')) {
    event.respondWith(fetch(request, { cache: 'no-store' }));
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, './index.html'));
    return;
  }

  const updateSensitiveFile = url.pathname.endsWith('.html')
    || url.pathname.endsWith('/data/sites.json')
    || url.pathname.endsWith('/js/app.js')
    || url.pathname.endsWith('/js/contacts.js')
    || url.pathname.endsWith('/style.css')
    || url.pathname.endsWith('/manifest.json')
    || url.pathname.endsWith('/service-worker.js');

  if (updateSensitiveFile) {
    event.respondWith(networkFirst(request));
    return;
  }

  event.respondWith(cacheFirst(request));
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
