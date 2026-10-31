// Service worker: guarda o app no aparelho para funcionar sem internet.
// Ao alterar qualquer arquivo do app, aumente VERSAO para forçar a atualização.
const VERSAO = 'hora-paga-v22';
const ARQUIVOS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './js/app.js',
  './js/calculo.js',
  './js/storage.js',
  './js/tabela.js',
  './js/icones.js',
  './js/copia.js',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSAO).then((c) => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((chaves) => Promise.all(chaves.filter((k) => k !== VERSAO).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Responde do cache na hora e atualiza o cache em segundo plano quando há internet.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    caches.open(VERSAO).then(async (cache) => {
      const emCache = await cache.match(req, { ignoreSearch: true });
      const rede = fetch(req)
        .then((resp) => {
          if (resp.ok) cache.put(req, resp.clone());
          return resp;
        })
        .catch(() => null);
      if (emCache) {
        e.waitUntil(rede);
        return emCache;
      }
      return (await rede) || (req.mode === 'navigate' ? cache.match('./index.html') : Response.error());
    }),
  );
});
