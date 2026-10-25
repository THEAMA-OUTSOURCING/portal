// sentry.js — تتبع الأخطاء (Sentry، سيرفرات أوروبا). لازم يتحمّل قبل سكريبت Sentry نفسه في كل صفحة.
// اللي بيتبعت: رسالة الخطأ، ومكانه في الكود، واسم الصفحة، ونوع المتصفح، ودور الحساب (عامل/مشرف/أدمن...).
// اللي مش بيتبعت: الـ IP، والإيميل، والكود، والرقم القومي، وأي حاجة مكتوبة في الخانات، وتسجيل الشاشة.
(function () {
  // أي رقم طويل (رقم قومي 14، موبايل 11، كود موظف) أو إيميل جوه نص الخطأ بيتشال قبل ما يتبعت
  var scrub = function (s) {
    return typeof s !== "string" ? s
      : s.replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "[email]").replace(/\d{4,}/g, "[n]");
  };
  var cleanUrl = function (u) { return typeof u === "string" ? u.split(/[?#]/)[0] : u; };

  window.sentryOnLoad = function () {
    Sentry.init({
      environment: location.hostname === "portal.theamahr.com" ? "production" : "other",
      sendDefaultPii: false,
      tracesSampleRate: 0,
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: 0,
      // أخطاء متصفحات وإضافات مالهاش علاقة بالبوابة
      // «Script error.» = خطأ جاي من سكريبت من موقع تاني (reCAPTCHA / مكتبة الإكسيل / إضافة متصفح) والمتصفح بيخبّي تفاصيله
      ignoreErrors: [/^Script error\.?$/, "ResizeObserver loop", "Non-Error promise rejection captured", "Load failed", "NetworkError"],
      denyUrls: [/extensions\//i, /^chrome:\/\//i, /^moz-extension:\/\//i],
      beforeBreadcrumb: function (b) {
        // مفيش تسجيل للضغطات أو الكلام اللي بيتكتب، وطلبات الشبكة من غير البارامترات
        if (b.category === "ui.input" || b.category === "ui.click") return null;
        if (b.data && b.data.url) b.data.url = cleanUrl(b.data.url);
        if (b.message) b.message = scrub(b.message);
        return b;
      },
      beforeSend: function (e) {
        delete e.user;
        e.tags = e.tags || {}; e.tags.role = window.__sentryRole || "none";
        if (e.request) { e.request.url = cleanUrl(e.request.url); delete e.request.cookies; delete e.request.headers; delete e.request.query_string; }
        if (e.message) e.message = scrub(e.message);
        (e.exception && e.exception.values || []).forEach(function (v) { v.value = scrub(v.value); });
        return e;
      }
    });
    Sentry.setTag("page", location.pathname.split("/").pop() || "index.html");
  };
  // shared.js بيناديها بعد الدخول بدور الحساب بس (من غير إيميل ولا كود)
  // (سكريبت Sentry بيتحمّل بس لما يحصل أول خطأ، فالدور بيتحفظ هنا ويتحط على الخطأ وقت ما يتبعت)
  window.sentryRole = function (role) { window.__sentryRole = role || "none"; };
})();
