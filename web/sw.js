/* sw.js — DietOpt PWA offline mode.
   Works offline once cached. Update VERSION on file updates. */
const VERSION = 'dietopt-v4.0.0';
const ASSETS = [
  './', 'index.html', 'manifest.webmanifest',
  'css/fonts.css', 'css/app.css',
  'js/app.js', 'js/optimizer.js', 'js/simplex.js', 'js/recipes.js',
  'js/i18n.js', 'js/builder.js',
  'data/products.json',
  'fonts/Onest-cyrillic.woff2', 'fonts/Onest-latin.woff2',
  'fonts/JetBrainsMono-cyrillic.woff2', 'fonts/JetBrainsMono-latin.woff2',
  'icons/favicon.svg', 'icons/icon-192.png', 'icons/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Network first, cache fallback for offline
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    fetch(req).then(res => {
      const copy = res.clone();
      caches.open(VERSION).then(c => c.put(req, copy));
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match('index.html')))
  );
});
