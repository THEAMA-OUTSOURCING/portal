// تسجيل الـ Service Worker (كان سطر جوه الصفحة — اتنقل هنا عشان الـ CSP)
if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
