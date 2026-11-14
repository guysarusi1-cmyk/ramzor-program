// The app's service worker: it only lets the site be installed on a phone. Every request still goes to the network as usual
// (the schedule must always be fresh), so nothing is kept offline.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
