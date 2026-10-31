// Harbor Muse service worker: caches the same-origin APP SHELL only.
// Map tiles, map libraries (CDN), and live data (/ships, /view, /health, /ask, /tell-more) are never cached.
const CACHE = 'harbor-shell-v4';
const SHELL = ['/', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png', '/icon-maskable-512.png', '/shiptype.js', '/mmsimid.js', '/cone.js', '/assets/ship-types/cargo.svg', '/assets/ship-types/tanker.svg', '/assets/ship-types/tug.svg', '/assets/ship-types/passenger.svg', '/assets/ship-types/fishing.svg', '/assets/ship-types/unknown.svg', '/assets/markers/cargo.svg', '/assets/markers/tanker.svg', '/assets/markers/tug.svg', '/assets/markers/passenger.svg', '/assets/markers/fishing.svg', '/assets/markers/unknown.svg'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== self.location.origin) return; // cross-origin (tiles, CDN): network only
  const path = u.pathname === '/index.html' ? '/' : u.pathname;
  if (!SHELL.includes(path)) return; // API and anything else: network only
  // Network first so deploys show up; fall back to cached shell offline.
  e.respondWith(fetch(e.request).then((r) => {
    if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(path, copy)); }
    return r;
  }).catch(() => caches.match(path)));
});
