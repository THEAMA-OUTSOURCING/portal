// Service Worker بسيط: الصفحات من النت الأول (عشان التحديثات توصل على طول)، ولو النت فاصل من النسخة المحفوظة.
const CACHE = "theama-v14";   // v14: صفحة العامل أخف (أيقونات مصغّرة، والإكسيل للإدارة بس)   // v13: سكريبتات الصفحات في ملفات لوحدها (CSP)
// بيتحمّل مقدماً: صفحة البوابة (اللي العامل بيفتحها) وملفاتها بس. باقي الصفحات (الحضور، التقارير...) بتتحفظ لوحدها
// أول ما حساب إدارة أو مشرف يفتحها (الـ fetch تحت بيحفظ أي ملف اتحمّل) — عشان موبايل العامل مايحمّلش صفحات الإدارة.
const PAGES = ["./", "./index.html", "./page-index.js", "./boot.js", "./sw-reg.js", "./shared.js", "./notify.js", "./sentry.js", "./vendor/tabler-subset.css", "./vendor/tabler-subset.woff2", "./manifest.json", "./logo.jpg", "./icon-192.png", "./icon-512.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(PAGES)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return; // Firebase وأي حاجة برّه: من غير تدخل
  // الملفات (JS وغيرها) بتتسأل السيرفر كل مرة (cache: no-cache — لو ماتغيرتش بيرجع رد صغير 304)،
  // عشان بعد أي تحديث للبوابة الموبايل مايخلطش صفحة جديدة مع shared.js قديم من كاش المتصفح.
  // الصفحات نفسها (navigate) مايتعملهاش كده لأن المتصفح مش بيسمح بتعديل طلبها.
  const req = e.request.mode === "navigate" ? e.request : new Request(e.request, { cache: "no-cache" });
  e.respondWith(fetch(req).then(r => { if (r.ok && r.status === 200) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {}); } return r; })   // الرد الغلط (404/500) مايتحفظش
    .catch(() => caches.match(e.request, { ignoreSearch: true })));
});
