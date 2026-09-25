/* ==========================================
   Семейный Бюджет — Service Worker (Offline-First)
   ========================================== */

const CACHE_NAME = 'budget-pwa-v22';

const STATIC_SHELL = [
  './',
  './index.html',
  './style.css',
  './core.js',
  './auth-profile.js',
  './backup-manager.js',
  './ui-tools.js',
  './transactions.js',
  './investments.js',
  './budget.js',
  './statement-parser.js',
  './default-rules.js',
  './iconsSVG.js',
  './app.js',
  './manifest.json',
  './favicon.svg',
  './icon.svg'
];

// Установка: Предзагрузка критического App Shell в Cache Storage
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_SHELL);
    }).then(() => {
      return self.skipWaiting();
    })
  );
});

// Активация: Очистка старых версий кэша
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => {
      return self.clients.claim();
    })
  );
});

// Обработка сетевых запросов
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Исключаем вызовы Firebase Firestore, Auth и Cloud Storage (у них собственный IndexedDB кэш)
  if (
    url.hostname.includes('firestore.googleapis.com') ||
    url.hostname.includes('identitytoolkit.googleapis.com') ||
    url.hostname.includes('securetoken.googleapis.com') ||
    url.hostname.includes('firebaseinstallations.googleapis.com') ||
    request.method !== 'GET'
  ) {
    return;
  }

  // 1. Для внешних CDN скриптов и шрифтов (Lucide, Chart.js, PDF.js, Google Fonts, Tailwind)
  if (url.origin !== self.location.origin) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) return cachedResponse;

        return fetch(request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return networkResponse;
        }).catch(() => {
          return cachedResponse || new Response('', { status: 408, statusText: 'Offline' });
        });
      })
    );
    return;
  }

  // 2. Для навигации (HTML страницы): Network-First с мгновенным переключением на кэш при отсутствии сети
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
        }
        return networkResponse;
      }).catch(async () => {
        const cached = await caches.match(request);
        return cached || await caches.match('./index.html') || await caches.match('./');
      })
    );
    return;
  }

  // 3. Для локальных статических файлов (JS, CSS, SVG, JSON): Stale-While-Revalidate
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      const fetchPromise = fetch(request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
        }
        return networkResponse;
      }).catch(() => {
        return cachedResponse;
      });

      return cachedResponse || fetchPromise;
    })
  );
});
