// Service worker: guarda os arquivos do sistema para abrir mais rápido.
// Os dados em si vêm sempre do banco (as requisições ao Supabase não passam pelo cache).
const CACHE = 'berbert-v28';
const ARQUIVOS = [
  './', './index.html', './css/style.css', './manifest.json',
  './js/vendor/supabase.js', './js/config.js', './js/db.js', './js/faes.js', './js/ligacoes.js', './js/app.js', './os.html', './js/os.js',
  './img/logo-clara.webp', './img/logo-escura.webp', './img/app-192.png', './img/app-512.png', './img/app-maskable-512.png', './img/app-apple-180.png', './img/favicon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARQUIVOS)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});

// Ao tocar numa notificação (ex.: conta a vencer), abre o sistema na tela do Financeiro.
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((lista) => {
    const aberto = lista.find((c) => c.url.startsWith(self.registration.scope));
    if (aberto) { aberto.postMessage({ abrir: 'financeiro' }); return aberto.focus(); }
    return self.clients.openWindow(self.registration.scope);
  }));
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
