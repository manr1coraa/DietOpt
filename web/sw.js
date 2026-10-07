/* DietOpt offline shell. Bump VERSION whenever static app files or data change. */
const VERSION = 'dietopt-v5.0.0';
const ASSETS = [
  './', 'index.html', 'manifest.webmanifest',
  'css/fonts.css', 'css/app.css',
  'js/app.js', 'js/optimizer.js', 'js/simplex.js', 'js/recipes.js',
  'js/i18n.js', 'js/builder.js', 'js/market-data.js',
  'data/catalog/products.json',
  'data/markets/de.json', 'data/markets/ua.json',
  'fonts/Onest-cyrillic.woff2', 'fonts/Onest-latin.woff2',
  'fonts/JetBrainsMono-cyrillic.woff2', 'fonts/JetBrainsMono-latin.woff2',
  'icons/favicon.svg', 'icons/icon-192.png', 'icons/icon-512.png',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(VERSION)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== VERSION).map(key => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

// Network first, cache fallback for offline use.
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== location.origin) return;
  event.respondWith(
    fetch(request).then(response => {
      const copy = response.clone();
      caches.open(VERSION).then(cache => cache.put(request, copy));
      return response;
    }).catch(() => caches.match(request, { ignoreSearch: true }).then(cached => cached || caches.match('index.html'))),
  );
});
