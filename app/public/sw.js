// Patas service worker (ported from Gastos v3): keeps a copy of the app's own files so it opens with no signal.
// Rules from Kenshin's v3 review (M9, M10):
//  - Only this site's own GET requests. Supabase and Turnstile are never
//    touched, so no account data, token or API answer ever lands in the cache.
//  - Page loads try the network first (3 s), so a fixed build reaches everyone at their next open.
//  - The files are cached as one all-or-nothing set per build. scripts/write-sw.mjs fills in the
//    list and the version after `expo export`; this file is not usable before that.
const VERSION = '__VERSION__';
const PRECACHE = __PRECACHE__;
const CACHE = 'patas-shell-' + VERSION;
const SHELL = new Set(PRECACHE.filter((p) => !/^\/(_expo|assets)\//.test(p)));

self.addEventListener('install', (e) => {
  // addAll is all-or-nothing: a half-downloaded build can never become the active one.
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('patas-shell-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const cacheable = (res) => res && res.ok && res.type === 'basic' && !res.redirected;

async function networkFirst(req, ms) {
  const cache = await caches.open(CACHE);
  try {
    const res = await Promise.race([fetch(req), new Promise((_, no) => setTimeout(() => no(new Error('slow')), ms))]);
    // Only the start page becomes the offline copy; a direct visit to another file must not replace it (audit L-7).
    if (cacheable(res) && new URL(req.url).pathname === '/') cache.put('/', res.clone());
    return res;
  } catch {
    return (await cache.match('/')) || Response.error();
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (cacheable(res)) cache.put(req, res.clone());
  return res;
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  const fresh = fetch(req)
    .then((res) => {
      if (cacheable(res)) cache.put(req, res.clone());
      return res;
    })
    .catch(() => hit);
  return hit || fresh;
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET') return; // POST/PATCH (Supabase writes) are never touched
  if (url.origin !== self.location.origin) return; // Supabase and Turnstile: straight to the network
  if (url.pathname.startsWith('/.well-known/')) return; // Android app link check: always live
  if (url.pathname === '/sw.js') return;
  if (url.search) return; // nothing with a query string is ever cached
  if (req.mode === 'navigate') return e.respondWith(networkFirst(req, 3000));
  if (/^\/(_expo\/static\/|assets\/)/.test(url.pathname)) return e.respondWith(cacheFirst(req)); // hashed files
  if (SHELL.has(url.pathname)) return e.respondWith(staleWhileRevalidate(req)); // manifest, icons, favicon
  // anything else: not handled, normal network
});

// Reminders (Phase 6f). The sender's message is the Declarative Web Push shape
// ({web_push: 8030, notification: {...}}); iPhone 18.4+ shows it by itself, everything else lands here.
// Only the title and body are used, both cut short; a tap always opens Patas itself, never a link
// from the message, so a forged push can't send anyone elsewhere.
self.addEventListener('push', (e) => {
  let title = 'Patas';
  let body = 'You have payments due soon.';
  try {
    const n = e.data ? e.data.json().notification : null;
    if (n && typeof n.title === 'string') title = n.title.slice(0, 40);
    if (n && typeof n.body === 'string') body = n.body.slice(0, 160);
  } catch {
    /* not JSON: keep the plain words */
  }
  e.waitUntil(self.registration.showNotification(title, { body, icon: '/icon-192.png', badge: '/icon-192.png', tag: 'patas-digest', renotify: true }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      const mine = wins.find((w) => new URL(w.url).origin === self.location.origin);
      return mine ? mine.focus() : self.clients.openWindow('/');
    }),
  );
});
