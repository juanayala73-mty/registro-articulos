// Sube este número cada vez que publiques cambios para que los teléfonos tomen la versión nueva.
const VERSION = "beta-0.3";
const ARCHIVOS = ["./", "index.html", "app.js", "columnas.js", "manifest.webmanifest", "icono.svg",
  "icono-192.png", "icono-512.png", "icono-180.png", "libs/html5-qrcode.min.js", "libs/xlsx.full.min.js", "libs/jszip.min.js"];
self.addEventListener("install", e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(ARCHIVOS))); self.skipWaiting(); });
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))));
  self.clients.claim();
});
// Primero la red (para recibir cambios), y si no hay internet, la copia guardada.
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  e.respondWith(fetch(e.request).then(r => {
    const copia = r.clone(); caches.open(VERSION).then(c => c.put(e.request, copia)); return r;
  }).catch(() => caches.match(e.request)));
});
