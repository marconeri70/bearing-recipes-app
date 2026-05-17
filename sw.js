// sw.js - Motore di Caching PWA per operatività Offline

const CACHE_NAME = 'skf-produzione-v1';

// Risorse critiche da memorizzare nel chip del tablet/telefono
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './css/styles.css',
  './js/main.js',
  './manifest.json',
  'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js'
];

// FASE 1: Installazione e memorizzazione (Download iniziale)
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[PWA] Iniezione cache di base completata.');
        return cache.addAll(ASSETS_TO_CACHE);
      })
      .catch((error) => console.error("[PWA] Errore caching:", error))
  );
  self.skipWaiting(); // Forza l'aggiornamento immediato
});

// FASE 2: Intercettazione del traffico (Ritorna la cache se non c'è rete)
self.addEventListener('fetch', (event) => {
  // Ignora le richieste dirette a Firebase o altri domini esterni per non bloccare il database
  if (event.request.url.includes('firestore') || event.request.url.includes('googleapis')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      // Se trova il file in memoria lo restituisce subito, altrimenti lo scarica dal server
      return cachedResponse || fetch(event.request);
    })
  );
});

// FASE 3: Pulizia delle vecchie versioni
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[PWA] Pulizia vecchia cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});
