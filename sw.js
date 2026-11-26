// sw.js - PWA Ricette Lavorazione Cuscinetti
// Cache network-first per evitare che il telefono resti bloccato su vecchie versioni.

const CACHE_NAME = 'bearing-recipes-v35-vision';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './archivio-locale.html',
  './cloudflare-ricette.html',
  './js/api/cloudflare-transfer.js?v=16',
  './css/styles.css',
  './css/styles.css?v=v10.2-diametri',
  './js/main.js',
  './js/main.js?v=v10.2-diametri',
  './js/api/vision.js',
  './js/api/cloud-client.js',
  './js/api/firebase-config.js',
  './js/api/firebase-recovery.js',
  './js/api/firebase-recovery.js?v=v10.2-diametri',
  './js/api/firebase-sync.js',
  './js/api/firebase-sync.js?v=v10.2-diametri',
  './js/api/csv-manager.js',
  './js/api/bearing-logic.js',
  './js/api/auth.js',
  './manifest.json',
  './tabella_gioco.csv',
  './tabella_gioco_normale_skf.csv',
  './tabella_gioco_diviso_skf.csv',
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
      names.map(name => name.startsWith("bearing-recipes-") && name !== CACHE_NAME ? caches.delete(name) : null)
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Non interferire con risorse esterne, Drive, API, Firebase ecc.
  if (url.origin !== self.location.origin || req.method !== "GET") return;

  event.respondWith(
    fetch(req)
      .then((networkResponse) => {
        const clone = networkResponse.clone();
        if (networkResponse.ok) caches.open(CACHE_NAME).then(cache => cache.put(req, clone));
        return networkResponse;
      })
      .catch(() => caches.match(req))
  );
});