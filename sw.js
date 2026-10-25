// Service Worker بسيط: الصفحات من النت الأول (عشان التحديثات توصل على طول)، ولو النت فاصل من النسخة المحفوظة.
const CACHE = "theama-v4";   // اتغيّر مع إصلاحات الموبايل وصورة اللينك — النسخة القديمة من الكاش بتتمسح لوحدها
const PAGES = ["./", "./index.html", "./attendance.html", "./report.html", "./plan.html", "./hr.html", "./upload.html", "./shared.js", "./sentry.js", "./sheet.js", "./xl-attendance.js", "./manifest.json", "./icon-192.png", "./icon-512.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(PAGES)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return; // Firebase وأي حاجة برّه: من غير تدخل
  e.respondWith(fetch(e.request).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; })
    .catch(() => caches.match(e.request, { ignoreSearch: true })));
});
