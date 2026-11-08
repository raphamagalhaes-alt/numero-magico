/*
 * Service worker do MODO SITE: permite instalar como app e abrir offline.
 * Guarda apenas arquivos do próprio site (programa e dados abertos). Nunca intercepta
 * chamadas a outros endereços (ex.: brapi com a sua chave) e não guarda dados pessoais.
 */
const CACHE = 'numero-magico-v1';
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['./', './index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png'])).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return; // só arquivos do próprio site
  const fresh = req.mode === 'navigate' || url.pathname.endsWith('/data/open-data.json');
  if (fresh) {
    // páginas e dados abertos: rede primeiro (sempre atualizados), cópia local se estiver offline
    e.respondWith(fetch(req).then((r) => { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); return r; }).catch(() => caches.match(req).then((r) => r || caches.match('./index.html'))));
    return;
  }
  // arquivos do programa (com hash no nome): cópia local primeiro
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((r) => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); } return r; })));
});
