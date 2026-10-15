/* Service Worker del CRM San Ou (PWA instalable).
   Estrategia NETWORK-FIRST para todo lo del mismo dominio: SIEMPRE intenta traer
   lo más nuevo del servidor (así pedidos, clientes, productos, stock, etc. nunca
   quedan viejos). El cache solo se usa como respaldo si NO hay internet.
   Los pedidos al backend del CRM (Apps Script, script.google.com) y cualquier otro
   dominio (fuentes, CDN, ipapi, analytics) NO se tocan ni se cachean: pasan directo
   a la red, siempre en vivo. */
const CACHE = 'sanou-v2';
const SHELL = [
  '/', '/index.html', '/styles.css', '/script.js',
  '/panel.html', '/panel.css', '/panel.js', '/catalogo-productos.js',
  '/icon-192.png', '/icon-512.png', '/tuerca-icon.png'
];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL).catch(() => {})));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;                       // escrituras (POST) nunca se tocan
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;        // backend/CDN/otros dominios: directo a la red, sin cachear

  // Solo guardamos en cache el "shell" estático (documento, JS, CSS, íconos) para el modo offline.
  // Las imágenes de productos y demás pasan por red pero no se guardan (para no mostrar nada viejo).
  const cacheable = ['document', 'script', 'style', 'manifest'].includes(req.destination);

  e.respondWith((async () => {
    try {
      const fresh = await fetch(req);                     // NETWORK-FIRST: siempre lo más nuevo
      if (cacheable && fresh && fresh.status === 200 && fresh.type === 'basic') {
        const c = await caches.open(CACHE);
        c.put(req, fresh.clone());
      }
      return fresh;
    } catch (err) {
      const cached = await caches.match(req);             // sin internet: respaldo del cache
      if (cached) return cached;
      if (req.mode === 'navigate') {
        const shell = await caches.match('/panel.html');
        if (shell) return shell;
      }
      throw err;
    }
  })());
});

// ── Notificaciones de compras web (CRM instalado como app) ──
// El aviso llega sin contenido; acá se pide el texto al backend con la clave del panel
// (guardada por el CRM al activar las notificaciones). Si no se puede, se muestra un aviso genérico.
const API = 'https://script.google.com/macros/s/AKfycbxMW0TTu37oiDySEaGgF--ZLXoz3JNEWhoHvzGViQ4vVQMJGX5AeIi-9C4IcY1Uc1P2/exec';
self.addEventListener('push', (e) => {
  e.waitUntil((async () => {
    let titulo = '🛒 Nueva compra en la web', cuerpo = 'Tocá para ver el pedido en el CRM.';
    try {
      const c = await caches.open('sanou-push');
      const r = await c.match('/__push_auth');
      const auth = r ? await r.text() : '';
      if (auth) {
        const res = await fetch(API + '?action=push_ultimos&tab=Pedidos&auth=' + encodeURIComponent(auth) + '&_=' + Date.now());
        const j = await res.json();
        const a = j && j.ok && j.avisos && j.avisos[0];
        if (a && Date.now() - a.ts < 15 * 60 * 1000) { titulo = a.t; cuerpo = a.b; }
      }
    } catch (err) { /* sin conexión o sin clave: aviso genérico */ }
    await self.registration.showNotification(titulo, {
      body: cuerpo, icon: '/icon-192.png', badge: '/tuerca-icon.png',
      tag: 'sanou-web-' + Date.now(), renotify: true, vibrate: [120, 60, 120],
      data: { url: '/panel.html#pedidos-web' }
    });
  })());
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/panel.html';
  e.waitUntil((async () => {
    const abiertas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of abiertas) {
      if (w.url.indexOf('/panel.html') >= 0) { await w.focus(); w.postMessage({ tipo: 'ir-pedidos-web' }); return; }
    }
    await self.clients.openWindow(url);
  })());
});
