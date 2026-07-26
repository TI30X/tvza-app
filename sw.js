/* TVZA Service Worker v74 - offline-first */

const CACHE = 'tvza-v74';
const FIREBASE_SDK = [
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js',
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js',
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js',
];
const SHELL = [
  './',
  './index.html',
  './login.html',
  './assets/css/style.css',
  './assets/css/ui-fx.css',
  './assets/js/theme.js',
  './assets/js/ui-fx.js',
  './assets/js/welcome.js',
  './manifest.json',
  './assets/js/firebase-config.js',
  './assets/js/notifications.js',
  './assets/js/foods.js',
  './assets/js/itinerary.js',
  './assets/js/shell.js',
  './pages/bereiche.html',
  './pages/skitracker.html',
  './pages/foodtracker.html',
  './pages/watchlist.html',
  './pages/weather.html',
  './pages/messages.html',
  './pages/planner.html',
  './pages/planner-trips.html',
  './pages/guest.html',
  './pages/maturaarbeit.html',
  './pages/maturaarbeit-tracker.html',
  './public.html',
  './assets/icons/TvZ_Logo.svg',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  ...FIREBASE_SDK,
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(c => Promise.allSettled(SHELL.map(url => c.add(url))))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  const isGstatic = url.hostname === 'www.gstatic.com';
  if (url.origin !== self.location.origin && !isGstatic) return;

  const isHtml = event.request.mode === 'navigate' ||
    (event.request.headers.get('accept') || '').includes('text/html');

  if (isHtml) {
    // Pages: network-first. Always fetch the latest HTML when online so
    // edits show up on the very next load — only fall back to the cached
    // copy when there's no network (offline-first still holds up).
    event.respondWith(
      fetch(event.request).then(res => {
        if (res && res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(event.request, clone));
        }
        return res;
      }).catch(() => caches.match(event.request))
    );
    return;
  }

  // Static assets (CSS/JS/images/Firebase SDK): cache-first with a
  // background refresh — fast loads, still works offline, and self-heals
  // next time the asset changes.
  event.respondWith(
    caches.match(event.request).then(cached => {
      const network = fetch(event.request).then(res => {
        if (res && res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(event.request, clone));
        }
        return res;
      }).catch(() => null);
      return cached || network;
    })
  );
});
