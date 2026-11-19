/* IQ — Service Worker (نسخة الآيفون)
   لتحديث التطبيق لاحقاً: غيّر رقم VERSION بالأسفل ثم ارفع الملف. */
const VERSION = 'v1';
const CORE = 'iq-core-' + VERSION;   // ملفات التطبيق نفسه
const DATA = 'iq-data-' + VERSION;   // بيانات خارجية (json / مكتبات)

const CORE_FILES = [
  './', 'index.html', 'manifest.json',
  'icon-180.png', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png'
];

/* التثبيت: خزّن ملفات التطبيق (إن فشل ملف لا يفشل الباقي) */
self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CORE);
    await Promise.all(CORE_FILES.map(f => c.add(new Request(f, { cache: 'reload' })).catch(() => {})));
    await self.skipWaiting();
  })());
});

/* التفعيل: احذف الكاش القديم */
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keep = [CORE, DATA];
    for (const k of await caches.keys()) if (k.startsWith('iq-') && !keep.includes(k)) await caches.delete(k);
    await self.clients.claim();
  })());
});

const withTimeout = (p, ms) => new Promise((ok, no) => { const t = setTimeout(() => no(new Error('timeout')), ms); p.then(v => { clearTimeout(t); ok(v); }, x => { clearTimeout(t); no(x); }); });

/* صفحات التطبيق: الشبكة أولاً (4 ثوانٍ) ثم النسخة المخزنة */
async function pageHandler(req) {
  const c = await caches.open(CORE);
  try {
    const r = await withTimeout(fetch(req), 4000);
    if (r && r.ok) c.put(req, r.clone());
    return r;
  } catch (e) {
    return (await c.match(req, { ignoreSearch: true })) || (await c.match('index.html')) || Response.error();
  }
}

/* بيانات خارجية: الشبكة أولاً، وعند الانقطاع آخر نسخة محفوظة */
async function dataHandler(req) {
  const c = await caches.open(DATA);
  const u = new URL(req.url); u.search = '';            // نتجاهل ?t=... كي لا يتضخم الكاش
  const key = u.href;
  try {
    const r = await fetch(req);
    if (r && r.status === 200) c.put(key, r.clone());
    return r;
  } catch (e) {
    const hit = await c.match(key);
    if (hit) return hit;
    return new Response(JSON.stringify({ offline: true }), { status: 503, headers: { 'Content-Type': 'application/json' } });
  }
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;                     // لا نتدخل في POST (السيرفر)
  if (req.headers.has('range')) return;                 // الفيديو والملفات الكبيرة
  const u = new URL(req.url);
  if (u.origin === location.origin) {
    if (req.mode === 'navigate') return e.respondWith(pageHandler(req));
    return e.respondWith(caches.match(req, { ignoreSearch: true }).then(h => h || fetch(req)));
  }
  if (u.hostname === 'raw.githubusercontent.com' || u.hostname === 'cdnjs.cloudflare.com') {
    return e.respondWith(dataHandler(req));
  }
  /* باقي المواقع (supabase، يوتيوب، تيليجرام...) تمر مباشرة */
});
