// sw.js - PWA Ricette Lavorazione Cuscinetti
// Cache network-first per evitare che il telefono resti bloccato su vecchie versioni.

const CACHE_NAME = 'bearing-recipes-v8-completo';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './css/styles.css',
  './js/main.js',
  './js/api/vision.js',
  './js/api/firebase-config.js',
  './js/api/csv-manager.js',
  './js/api/bearing-logic.js',
  './js/api/auth.js',
  './manifest.json',
  './tabella_gioco.csv',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS_TO_CACHE))
      .catch((error) => console.warn('[PWA] Cache iniziale parziale:', error))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) => Promise.all(
      names.map((name) => name !== CACHE_NAME ? caches.delete(name) : null)
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Non interferire con risorse esterne, Drive, API, Firebase ecc.
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(req)
      .then((networkResponse) => {
        const clone = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
        return networkResponse;
      })
      .catch(() => caches.match(req))
  );
});
