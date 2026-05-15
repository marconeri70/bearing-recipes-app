// service-worker.js - Versione Killer/Reset

self.addEventListener('install', (e) => {
  // Forza l'installazione immediata bypassando le code
  self.skipWaiting(); 
});

self.addEventListener('activate', (e) => {
  // Distrugge SPietatamente tutte le vecchie cache locali
  e.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          console.log("[SYS] Eliminazione vecchia cache:", cacheName);
          return caches.delete(cacheName);
        })
      );
    }).then(() => {
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', (e) => {
  // Pass-through totale: ignora la cache e chiedi sempre alla rete
  e.respondWith(fetch(e.request));
});
