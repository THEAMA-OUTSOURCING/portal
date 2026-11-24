// Service Worker بسيط: الصفحات من النت الأول (عشان التحديثات توصل على طول)، ولو النت فاصل من النسخة المحفوظة.
const CACHE = "theama-v20";   // v20: صفحات الاحتياج والتقرير والحضور والحالات وكلمة السر (المرحلة 5 دفعة 2)   // v19: شكل الرأس والتنقل (المرحلة 5 دفعة 1)   // v18: Firebase من shared.js بس (13.4.0) و esc والدخول من shared.js   // v17: الصفحة نفسها بتتسأل السيرفر كل مرة (مش من كاش المتصفح) عشان ماتتخلطش صفحة قديمة مع سكريبت جديد   // v16: سكريبت Sentry من فولدر vendor (مش من موقع Sentry)   // v15: مكتبات PDF والإكسيل من فولدر vendor (مش من CDN)   // v14: صفحة العامل أخف (أيقونات مصغّرة، والإكسيل للإدارة بس)   // v13: سكريبتات الصفحات في ملفات لوحدها (CSP)
// بيتحمّل مقدماً: صفحة البوابة (اللي العامل بيفتحها) وملفاتها بس. باقي الصفحات (الحضور، التقارير...) بتتحفظ لوحدها
// أول ما حساب إدارة أو مشرف يفتحها (الـ fetch تحت بيحفظ أي ملف اتحمّل) — عشان موبايل العامل مايحمّلش صفحات الإدارة.
const PAGES = ["./", "./index.html", "./page-index.js", "./boot.js", "./sw-reg.js", "./shared.js", "./notify.js", "./sentry.js", "./vendor/sentry-loader.js", "./vendor/tabler-subset.css", "./vendor/tabler-subset.woff2", "./manifest.json", "./logo.jpg", "./icon-192.png", "./icon-512.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(PAGES)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return; // Firebase وأي حاجة برّه: من غير تدخل
  // الملفات (JS وغيرها) بتتسأل السيرفر كل مرة (cache: no-cache — لو ماتغيرتش بيرجع رد صغير 304)،
  // عشان بعد أي تحديث للبوابة الموبايل مايخلطش صفحة جديدة مع shared.js قديم من كاش المتصفح.
  // والصفحات نفسها (navigate) كمان. من غير كده الصفحة كانت بتيجي قديمة من كاش المتصفح والسكريبت جديد، في حالتين:
  // تاب رجع بعد ما الموبايل قفله (المتصفح بيطلب الصفحة "من الكاش" مهما كانت قديمة)، أو فتحة جديدة في خلال 10 دقايق من تحديث
  // للبوابة (GitHub بيعتبر الصفحة المحفوظة صالحة 10 دقايق). النتيجة: index.html قديمة مع page-index.js جديد → زرار «عرض المرتب»
  // وقع (Sentry JAVASCRIPT-M، 19 نوفمبر).
  // طلب الصفحة نفسه مايتعدلش، فبنطلب نفس العنوان من جديد بـ no-cache؛ ولو السيرفر عمل تحويل (redirect) بنرجع للطلب الأصلي
  // (المتصفح مابيقبلش رد متحوّل لطلب صفحة). ولو النت واقع: النسخة المحفوظة على طول، من غير محاولة تانية (على النت الضعيف بتطوّل الانتظار).
  const fresh = e.request.mode === "navigate"
    ? fetch(e.request.url, { cache: "no-cache", credentials: "same-origin" }).then(r => r.redirected ? fetch(e.request) : r)
    : fetch(new Request(e.request, { cache: "no-cache" }));
  e.respondWith(fresh.then(r => { if (r.ok && r.status === 200) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {}); } return r; })   // الرد الغلط (404/500) مايتحفظش
    .catch(() => caches.match(e.request, { ignoreSearch: true })));
});
