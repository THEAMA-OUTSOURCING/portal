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
      // auth/network-request-failed و reCAPTCHA Timeout = نت المستخدم ضعيف أو فاصل (Firebase Auth / App Check) — مش عطل في البوابة
      ignoreErrors: [/^Script error\.?$/, "ResizeObserver loop", "Non-Error promise rejection captured", "Load failed", "NetworkError",
        /auth\/network-request-failed/, /^reCAPTCHA Timeout/],
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

  // ===== لو كود الصفحة ماتحملش =====
  // بيحصل لما النت يفصل وهو بيحمّل مكتبات Firebase، أو لما الموبايل يجيب نسخة قديمة من shared.js بعد تحديث البوابة.
  // من غيره الزراير (زي «دخول») بتبقى ميتة والعامل مش فاهم في إيه — فبنظهرله شريط فيه زرار «تحديث».
  // shared.js بيحط window.__portalReady أول ما يتحمّل، وكل الصفحات بتستورده.
  window.addEventListener("load", function () {
    if (window.__portalReady || document.getElementById("load-fail")) return;
    var b = document.createElement("div");
    b.id = "load-fail"; b.setAttribute("role", "alert");
    b.style.cssText = "position:fixed;left:0;right:0;bottom:0;z-index:6000;background:#a61b12;color:#fff;direction:rtl;" +
      "font-family:'IBM Plex Sans Arabic','Segoe UI',Tahoma,sans-serif;padding:14px 16px calc(14px + env(safe-area-inset-bottom));" +
      "display:flex;align-items:center;gap:12px;justify-content:space-between;box-shadow:0 -4px 16px rgba(0,0,0,.25)";
    b.innerHTML = '<span style="font-size:14px;line-height:1.6">الصفحة ماتحملتش كاملة — غالبًا النت ضعيف.<br>اتأكد من الاتصال واضغط «تحديث».</span>' +
      '<button type="button" style="flex:none;background:#fff;color:#a61b12;border:0;border-radius:10px;padding:10px 18px;font:inherit;font-weight:700;font-size:15px;cursor:pointer">تحديث</button>';
    b.querySelector("button").onclick = function () {
      // لو فيه نت: نمسح النسخ المحفوظة (ممكن تكون قديمة) قبل التحديث، عشان الصفحة تيجي كلها جديدة من السيرفر
      var go = function () { location.reload(); };
      if (navigator.onLine && window.caches) {
        caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return /^theama-/.test(k); }).map(function (k) { return caches.delete(k); })); })
          .then(go, go);
      } else go();
    };
    document.body.appendChild(b);
  });
})();
