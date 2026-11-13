/* Yaba's offline helper. Keeps the shop's own photos and the site shell so the site still opens with no internet.
   Payments, login and admin calls are never cached. */
const SHELL = 'yabas-shell-v1';
const PHOTOS = 'yabas-photos-v1';
const PHOTO_HOSTS = ['res.cloudinary.com', '.supabase.co'];

self.addEventListener('install', (e) => { e.waitUntil(caches.open(SHELL).then((c) => c.addAll(['/', '/yabas_logo.png'])).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => ![SHELL, PHOTOS].includes(k)).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Pages: online first, saved copy when offline
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then((r) => { const copy = r.clone(); caches.open(SHELL).then((c) => c.put('/', copy)); return r; }).catch(() => caches.match('/')));
    return;
  }
  // Our own built files (hashed names, safe to keep)
  if (url.origin === self.location.origin && url.pathname.startsWith('/assets/')) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((r) => { const copy = r.clone(); caches.open(SHELL).then((c) => c.put(req, copy)); return r; })));
    return;
  }
  // Photos: show saved copy at once, refresh it quietly in the background
  const isPhoto = req.destination === 'image' && PHOTO_HOSTS.some((h) => url.hostname === h || url.hostname.endsWith(h));
  if (isPhoto && !url.pathname.includes('/auth/') ) {
    e.respondWith(caches.open(PHOTOS).then((c) => c.match(req).then((hit) => {
      const net = fetch(req).then((r) => { if (r.ok || r.type === 'opaque') c.put(req, r.clone()); return r; }).catch(() => hit);
      return hit || net;
    })));
  }
});
