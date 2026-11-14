// TeXBea offline: the app, the LaTeX engines and every TeX package already used are kept in the browser cache,
// so the editor opens and compiles without a connection. Bea's model is cached by WebLLM itself.
// precache.json is written at build time (vite.config.js) with the files of this version.
const SHELL = 'texbea-shell';
const TEX = 'texbea-texlive';
const FONTS = 'texbea-fonts';
const KEEP = [SHELL, TEX, FONTS];
const TEXLIVE = 'texlive.texlyre.org';
const base = new URL('./', self.location).href;

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL);
      let files = [];
      try {
        files = await (await fetch(base + 'precache.json', { cache: 'no-store' })).json();
      } catch {}
      // The page itself first, then the rest: one missing file must not stop the install.
      await cache.add(new Request(base, { cache: 'reload' }));
      await Promise.allSettled(files.map((f) => cache.add(new Request(base + f, { cache: 'reload' }))));
      self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) if (!KEEP.includes(name)) await caches.delete(name);
      // Files of older versions: keep only what this version lists.
      try {
        const files = new Set((await (await fetch(base + 'precache.json')).json()).map((f) => base + f));
        const cache = await caches.open(SHELL);
        for (const req of await cache.keys())
          if (req.url.startsWith(base + 'assets/') && !files.has(req.url)) await cache.delete(req);
      } catch {}
      await self.clients.claim();
    })(),
  );
});

async function cacheFirst(request, name, keep = (r) => r.ok) {
  const cache = await caches.open(name);
  const hit = await cache.match(request, { ignoreVary: true });
  if (hit) return hit;
  const response = await fetch(request);
  if (keep(response)) cache.put(request, response.clone());
  return response;
}

async function networkFirst(request, name, fallback) {
  const cache = await caches.open(name);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(fallback || request, response.clone());
    return response;
  } catch (e) {
    const hit =
      (await cache.match(fallback || request, { ignoreVary: true })) ||
      (await cache.match(request, { ignoreVary: true }));
    if (hit) return hit;
    throw e;
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  // The cloud API carries private data and sign-in redirects: never cached, never answered by the worker.
  if (url.pathname.startsWith('/api/')) return;
  if (request.mode === 'navigate' && url.href.startsWith(base))
    return event.respondWith(networkFirst(request, SHELL, base));
  if (url.href.startsWith(base + 'assets/')) return event.respondWith(cacheFirst(request, SHELL));
  if (url.href.startsWith(base)) return event.respondWith(networkFirst(request, SHELL));
  // TeX packages: a file never changes for a given name; only real files (200) are kept, not "missing" answers.
  if (url.hostname === TEXLIVE) return event.respondWith(cacheFirst(request, TEX, (r) => r.status === 200));
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com')
    return event.respondWith(cacheFirst(request, FONTS, (r) => r.ok || r.type === 'opaque'));
});
