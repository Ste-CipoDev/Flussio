const CACHE_NAME = 'flussio-cache-v2'; // Bumped cache version
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './favicon.svg',
  './icon-192.png',
  './icon-512.png'
];

// Install Event: pre-cache critical assets
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

// Activate Event: clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event: Mixed Caching Strategy
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Skip caching for Supabase requests, non-GET requests, or browser extensions
  if (
    event.request.method !== 'GET' || 
    url.hostname.includes('supabase.co') || 
    url.protocol === 'chrome-extension:' ||
    url.pathname.includes('/auth/')
  ) {
    return;
  }

  // 1. Navigation Requests (HTML): Network-First to prevent White Screen of Death
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          return caches.match(event.request).then((cachedResponse) => {
            return cachedResponse || caches.match('./index.html');
          });
        })
    );
    return;
  }

  // 2. Immutable assets (Vite hashed bundles inside /assets/) - Cache-First
  // and other assets (like manifest, icons, Google Fonts) - Stale-While-Revalidate
  const isHashedAsset = url.pathname.includes('/assets/');

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        if (isHashedAsset) {
          // Serve immediately and do not check network
          return cachedResponse;
        }
        
        // Serve immediately, but update in background
        fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse.status === 200 && (networkResponse.type === 'basic' || networkResponse.type === 'cors')) {
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, networkResponse);
              });
            }
          })
          .catch(() => {});
          
        return cachedResponse;
      }

      // Fetch from network and cache dynamically
      return fetch(event.request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200) {
          return networkResponse;
        }

        if (networkResponse.type === 'basic' || networkResponse.type === 'cors') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }

        return networkResponse;
      });
    })
  );
});
