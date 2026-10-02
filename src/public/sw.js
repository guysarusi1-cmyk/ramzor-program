// Service worker: keeps the app (the single page + icons) available offline, and picks up new releases.
// The data (children, stars, bonuses) always comes live from Supabase and is NEVER cached here.
const VERSION = '@build@';
const CACHE = 'ramzor-' + VERSION;
const SHELL = ['./', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('ramzor-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if(req.method !== 'GET') return;
  const url = new URL(req.url);

  // fonts: use the cached copy if there is one, refresh it in the background
  if(url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com'){
    event.respondWith(caches.open(CACHE).then(cache =>
      cache.match(req).then(hit => {
        const fresh = fetch(req).then(res => { cache.put(req, res.clone()); return res; }).catch(() => hit);
        return hit || fresh;
      })));
    return;
  }

  // anything else on another origin (Supabase API, realtime, WhatsApp...) is not ours to touch
  if(url.origin !== self.location.origin) return;

  // the page itself: newest copy when online, the saved copy when offline
  if(req.mode === 'navigate'){
    event.respondWith(
      fetch(req).then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put('./', copy)); return res; })
        .catch(() => caches.match('./'))
    );
    return;
  }

  // icons, manifest: saved copy first
  event.respondWith(caches.match(req).then(hit => hit || fetch(req)));
});
