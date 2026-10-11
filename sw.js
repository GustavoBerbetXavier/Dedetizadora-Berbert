// Service worker: guarda os arquivos do sistema para abrir mais rápido.
// Os dados em si vêm sempre do banco (as requisições ao Supabase não passam pelo cache).
const CACHE = 'berbert-v5';
const ARQUIVOS = [
  './', './index.html', './css/style.css', './manifest.json',
  './js/vendor/supabase.js', './js/config.js', './js/db.js', './js/app.js',
  './img/logo-clara.webp', './img/logo-escura.webp', './img/icon-192.png', './img/icon-512.png', './img/favicon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARQUIVOS)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});

// Busca na rede primeiro (para pegar atualizações) e usa o cache se estiver offline.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || !e.request.url.startsWith(self.location.origin)) return;
  e.respondWith(
    fetch(e.request)
      .then((r) => {
        const copia = r.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copia));
        return r;
      })
      .catch(() => caches.match(e.request))
  );
});
