const CACHE_PREFIX = 'smartclass-platform-';
const LEGACY_CACHE_PREFIX = 'smartclass-plicker-';
const CACHE_NAME = `${CACHE_PREFIX}v23`;
const APP_ROOT = new URL('./', self.registration.scope).pathname;
const OFFLINE_PAGE = `${APP_ROOT}offline.html`;
const PUBLIC_METRICS = `${APP_ROOT}platform-stats.json`;
const APP_SHELL = [
  APP_ROOT,
  `${APP_ROOT}?source=installed`,
  `${APP_ROOT}?app=plicker&role=scanner&source=installed`,
  `${APP_ROOT}smartclass.webmanifest`,
  `${APP_ROOT}plicker.webmanifest`,
  `${APP_ROOT}icons/plicker-192.png`,
  `${APP_ROOT}icons/plicker-512.png`,
  `${APP_ROOT}icons/plicker-maskable-512.png`,
  `${APP_ROOT}gestureclass/?v=projector-readable-v1`,
  `${APP_ROOT}gestureclass/styles.css?v=projector-readable-v1`,
  `${APP_ROOT}gestureclass/app.js?v=projector-readable-v1`,
  PUBLIC_METRICS,
  OFFLINE_PAGE,
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys
        .filter(key => (key.startsWith(CACHE_PREFIX) || key.startsWith(LEGACY_CACHE_PREFIX)) && key !== CACHE_NAME)
        .map(key => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

async function handleNavigation(request) {
  const cache = await caches.open(CACHE_NAME);

  try {
    const response = await fetch(request, { cache: 'no-store' });
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch {
    return (await cache.match(request)) ||
      (await cache.match(APP_ROOT)) ||
      (await cache.match(OFFLINE_PAGE)) ||
      new Response('Không có kết nối Internet.', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
  }
}

async function handleStaticAsset(request) {
  const cache = await caches.open(CACHE_NAME);

  if (new URL(request.url).pathname.startsWith(`${APP_ROOT}gestureclass/`)) {
    try {
      const fresh = await fetch(request, { cache: 'no-store' });
      if (fresh.ok && fresh.type === 'basic') {
        await cache.put(request, fresh.clone());
      }
      return fresh;
    } catch {
      return (await cache.match(request)) || Response.error();
    }
  }

  const saved = await cache.match(request);
  if (saved) return saved;

  const response = await fetch(request);
  if (response.ok && response.type === 'basic') {
    await cache.put(request, response.clone());
  }
  return response;
}

async function handlePublishedMetrics(request) {
  const cache = await caches.open(CACHE_NAME);
  const saved = await cache.match(request);

  try {
    const response = await fetch(request);
    if (response.ok && response.type === 'basic') {
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    return saved || new Response('{}', {
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  }
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(APP_ROOT)) return;
  if (url.pathname.includes('/api/') || url.pathname.includes('/__/auth/')) return;

  if (url.pathname === PUBLIC_METRICS) {
    event.respondWith(handlePublishedMetrics(request));
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(request));
    return;
  }

  if (['style', 'script', 'worker', 'font', 'image'].includes(request.destination) ||
      url.pathname.endsWith('.webmanifest')) {
    event.respondWith(handleStaticAsset(request));
  }
});
