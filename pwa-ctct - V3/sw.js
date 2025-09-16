// sw.js — PWA CTĐ, CTCT (tự cập nhật, không cần đổi version thủ công)
const STATIC_CACHE  = 'static-cache-v1';
const RUNTIME_CACHE = 'runtime-cache-v1';

// LƯU Ý: dùng đường dẫn TƯƠNG ĐỐI (không có dấu '/'),
// để chạy tốt dù deploy ở root hay trong sub-folder.
const OFFLINE_SHELL = 'index.html';
const STATIC_ASSETS = [
  // HTML shell để có fallback khi offline
  'index.html',

  // CSS / JS / manifest
  'style.css',
  'app.js',
  'manifest.webmanifest',

  // Icon PWA
  'icons/icon-192.png',
  'icons/icon-512.png'
  // Thêm các icon khác nếu có: 'icons/book.png', 'icons/exam.png', 'icons/result.png', 'icons/bg.png', ...
];

// -- Helpers ----------------------------------------------------------
async function staleWhileRevalidate(req, cacheName = STATIC_CACHE) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req, { ignoreSearch: true });

  const fetchPromise = fetch(req).then((res) => {
    // Lưu cả opaque OK (cross-origin)
    try { cache.put(req, res.clone()); } catch (_) {}
    return res;
  }).catch(() => null);

  // Trả ngay bản cache nếu có; đồng thời cập nhật nền.
  return cached || (await fetchPromise) || new Response('Offline', { status: 503 });
}

async function networkFirst(req, cacheName = RUNTIME_CACHE) {
  const cache = await caches.open(cacheName);
  try {
    const fresh = await fetch(req, { cache: 'no-store' });
    cache.put(req, fresh.clone());
    return fresh;
  } catch (_) {
    const cached = await cache.match(req, { ignoreSearch: true }) ||
                   await caches.match(req, { ignoreSearch: true });
    return cached || new Response('Offline', { status: 503 });
  }
}

// -- Install: precache các tài nguyên tĩnh ---------------------------
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// -- Activate: dọn cache cũ ------------------------------------------
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => ![STATIC_CACHE, RUNTIME_CACHE].includes(k))
          .map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// -- Fetch strategies -------------------------------------------------
// * HTML (điều hướng): network-first + fallback OFFLINE_SHELL
// * JS/JSON/API: network-first (luôn cố lấy bản mới, offline dùng cache)
// * CSS/ảnh/icon: stale-while-revalidate (tự cập nhật nền, không kẹt cache)
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const isNavigate = req.mode === 'navigate' ||
                     req.headers.get('accept')?.includes('text/html');

  const isJS   = url.pathname.endsWith('.js');
  const isJSON = url.pathname.endsWith('.json') ||
                 url.searchParams.get('action') === 'questions';
  const isCSS  = url.pathname.endsWith('.css');
  const isImg  = /\.(png|jpg|jpeg|gif|svg|webp|ico)$/i.test(url.pathname);

  if (isNavigate) {
    // HTML: network-first, fallback về shell
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req, { cache: 'no-store' });
        // Cập nhật shell nếu cần (không bắt buộc)
        const shellCache = await caches.open(STATIC_CACHE);
        try { shellCache.put(OFFLINE_SHELL, fresh.clone()); } catch (_) {}
        return fresh;
      } catch (_) {
        return (await caches.match(OFFLINE_SHELL)) ||
               new Response('Offline', { status: 503 });
      }
    })());
    return;
  }

  if (isJS || isJSON) {
    event.respondWith(networkFirst(req));
    return;
  }

  if (isCSS || isImg) {
    event.respondWith(staleWhileRevalidate(req));
    return;
  }

  // Mặc định: network-first
  event.respondWith(networkFirst(req));
});
