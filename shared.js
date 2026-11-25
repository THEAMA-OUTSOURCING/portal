// shared.js — الحاجات المشتركة بين صفحات البوابة، في مكان واحد بدل ما تبقى متكررة في كل صفحة.
// أي موقع جديد أو تغيير في الإعدادات يتعمل هنا مرة واحدة.
// ===== Firebase (ت5) =====
// نسخة Firebase مكتوبة هنا بس: الصفحات كلها بتاخد دوال Firebase من shared.js (السطور «export … from» تحت).
// الترقية = تغيير الرقم 13.4.0 في السطور دي (ونفس الرقم في كل السطور).
import { initializeApp } from 'https://www.gstatic.com/firebasejs/13.4.0/firebase-app.js';
import { getFirestore, collection, doc, getDoc, getDocs, query, where, writeBatch, serverTimestamp } from 'https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js';
import { getAuth, onAuthStateChanged, EmailAuthProvider, reauthenticateWithCredential, signInWithEmailAndPassword, signOut } from 'https://www.gstatic.com/firebasejs/13.4.0/firebase-auth.js';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'https://www.gstatic.com/firebasejs/13.4.0/firebase-app-check.js';
export { Timestamp, addDoc, collection, deleteDoc, doc, getCountFromServer, getDoc, getDocs, limit, onSnapshot, orderBy, query, runTransaction, serverTimestamp, setDoc, startAfter, updateDoc, where, writeBatch } from 'https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js';
export { EmailAuthProvider, onAuthStateChanged, reauthenticateWithCredential, signInWithEmailAndPassword, signOut, updatePassword } from 'https://www.gstatic.com/firebasejs/13.4.0/firebase-auth.js';

// ===== Firebase =====
export const firebaseConfig = {
  apiKey: "AIzaSyBscBbgFrEd76NjDgNPpymF1nmlvlpprdg",
  authDomain: "theama-salaries.firebaseapp.com",
  projectId: "theama-salaries",
  storageBucket: "theama-salaries.firebasestorage.app",
  messagingSenderId: "469549638177",
  appId: "1:469549638177:web:4e5c1d4c055108312cb960"
};

// App Check: كل طلب لـ Firebase بيتبعت معاه إثبات (reCAPTCHA في الخلفية) إنه جاي من صفحات البوابة نفسها،
// عشان السكريبتات والبوتات اللي بتستخدم المفتاح من برّه تترفض. لازم يتعمل قبل أي استخدام لـ Firestore أو Auth.
// المفتاح مش سري (بيتشاف في أي صفحة). الدومينات المسموحة متحددة في إعدادات المفتاح على Google Cloud.
export const APP_CHECK_KEY = "6LeFr_YtAAAAADMBkt1vAf8bqyUJARWtAgaoogfP";
// لو shared.js اتحمّل مرتين في نفس الصفحة (صفحة قديمة من الكاش بتستورده بـ ?v= قديم، و notify.js/sheet.js بيستوردوه بالـ ?v= الجديد
// → المتصفح بيعتبرهم ملفين ونسختين) — النسخة التانية بتاخد نفس Firebase بتاع الأولى بدل ما تعمل App Check تاني
// (اللي كان بيرمي «reCAPTCHA has already been rendered in this element»)، ومابتكررش الجرس وأزرار التنقل.
const FB_VER = "13.4.0";   // لازم يبقى نفس الرقم اللي في سطور الـ import فوق
if (globalThis.__theamaFB && globalThis.__theamaFB.v !== FB_VER) {
  try { if (!sessionStorage.getItem("fbv-reload")) { sessionStorage.setItem("fbv-reload", "1"); location.reload(); } } catch (e) {}
}
const FIRST_COPY = !globalThis.__theamaFB;
// (من غير ||= — الموبايلات القديمة مابتفهموش وبترمي «Unexpected token '='» والبوابة كلها تقف)
if (!globalThis.__theamaFB) globalThis.__theamaFB = (() => {
  const app = initializeApp(firebaseConfig);
  const appCheck = initializeAppCheck(app, {
    provider: new ReCaptchaEnterpriseProvider(APP_CHECK_KEY),
    isTokenAutoRefreshEnabled: true
  });
  return { v: FB_VER, app, appCheck, db: getFirestore(app), auth: getAuth(app) };
})();
const FB = globalThis.__theamaFB;
export const app = FB.app;
export const appCheck = FB.appCheck;
export const db = FB.db;
export const auth = FB.auth;

// ===== المواقع =====
// مواقع بوابة الحضور (كشوف مصورة) — لازم تفضل نفس القايمة اللي في firestore.rules (attSites) و worker.py (ATT_SITES)
export const ATT_SITES = ["فرع العامرية", "فرع العجمى", "مصنع العامرية", "دمنهور", "كفر الدوار", "المنصورة", "فرع طنطا", "طنطا مصنع"];
// المواقع اللي حضورها بيترفع إكسيل (upload.html) — للمكتب بس حالياً
// مواقع ليها حسابات مشرفين منفصلة = مواقع الحضور + مواقع شيبسي والإمداد دي (حضورها إكسيل، والمشرف ليه الطلبات والبطايق والكشف بس)
// لازم تفضل نفس القايمة اللي في firestore.rules (supSites) و worker.py (SUP_SITES)
export const XL_SUP_SITES = ["قطامية", "ابوصير", "العامرية امداد", "اكتوبر امداد", "مدينة نصر امداد", "طنطا امداد"];
export const SUP_SITES = [...ATT_SITES, ...XL_SUP_SITES];
export const XL_SITES = ["قطامية", "ابوصير", "العامرية امداد", "اكتوبر امداد", "مدينة نصر امداد", "طنطا امداد", "الشرقية للدخان"];
// المديرين الإقليميين: مش مكتوبين هنا (الريبو Public) — علامة regional على الحساب (لوحة الحسابات)، والقواعد بتقراها (isRegional)، وconfig/regionals بيتكتب منها

// ===== أزرار التنقل بين الصفحات =====
// كل صفحة فيها <nav id="pnav"></nav> بس، والأزرار بتترسم هنا حسب دور الحساب.
// الشرط هنا (can) هو نفسه اللي الصفحة بتفتح بيه (canOpen تحت — ت8): الزرار يظهر = الصفحة تفتح. والـ Rules هي الحماية الحقيقية.
// صفحة جديدة؟ ضيفها هنا مرة واحدة.
const hasSites = c => Array.isArray(c.sites) && c.sites.length > 0;
const OFFICE = ["admin", "hr", "accountant", "viewer"];
// أيقونات بسيطة (SVG جوه الكود — من غير مكتبة، عشان تشتغل في كل الصفحات)
const ICON = {
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  chart:  '<path d="M5 20V10M10 20V4M15 20v-7M20 20v-4"/>',
  list:   '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 9h8M8 13h8M8 17h5"/>',
  check:  '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4h6v3H9zM9 13l2 2 4-4"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5M5 20h14"/>',
  home:   '<path d="M4 11l8-7 8 7v9h-5v-6H9v6H4z"/>',
  shirt:  '<path d="M9 3 4 6l2 4 2-1v12h8V9l2 1 2-4-5-3a3 3 0 0 1-6 0z"/>',
  id:     '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="11" r="2"/><path d="M5.5 16c.6-1.6 1.7-2.4 3-2.4s2.4.8 3 2.4M14 10h4M14 14h3"/>',
};
export const NAV_PAGES = [
  { href: "attendance.html", label: "تسجيل الحضور اليومي",  icon: "camera", can: c => ["admin", "hr", "accountant"].includes(c.role) || (c.role === "supervisor" && hasSites(c)) },
  { href: "report.html",     label: "تقارير الحضور",        icon: "chart",  can: c => OFFICE.includes(c.role) || (c.role === "supervisor" && hasSites(c)) },
  { href: "plan.html",       label: "الاحتياج والأعداد",     icon: "list",   can: c => OFFICE.includes(c.role) },
  { href: "hr.html",         label: "اعتماد الحالات",        icon: "check",  can: c => ["admin", "hr", "viewer"].includes(c.role) },
  // السجل: مؤقتاً للأدمن اللي عليه علامة sijil (لحد ما يتراجع) — نفس الشرط في sijil.html والـ Rules (canSijil)
  { href: "sijil.html",      label: "السجل",                 icon: "id",     can: c => c.role === "admin" && c.sijil === true },
  { href: "upload.html",     label: "رفع حضور إكسيل",       icon: "upload", can: c => c.role === "admin" },
  // العُهد: المشرف (ومشرف الشرقية للدخان) يعلّم، والإقليمي والمكتب يشوفوا
  { href: "custody.html",    label: "العُهد",                icon: "shirt",  can: c => OFFICE.includes(c.role) || c.role === "supervisor" },
  { href: "index.html",      label: "البوابة",               icon: "home",   can: c => !!c.role && c.role !== "employee" },
];

// ===== مين يفتح الصفحة (ت8) =====
// الشرط مكتوب مرة واحدة في NAV_PAGES فوق: نفس الشرط بيظهّر زرار الصفحة في القايمة وبيفتحها أو يقفلها.
// كل صفحة بتبعت اسمها بنفسها (مش من رابط الصفحة — GitHub Pages بيفتح /hr زي /hr.html).
// الـ Rules هي الحماية الحقيقية للبيانات؛ ده بيحدد الصفحة تفتح ولا تقول «مش مسموح».
export function canOpen(claims, href) {
  const p = NAV_PAGES.find(x => x.href === href);
  return !!(p && claims && claims.role && p.can(claims));
}

// شكل الأزرار (و2): شريط صغير، الأيقونة جنب الاسم. على الموبايل سطر واحد بيتسحب بالعرض، وعلى الكمبيوتر بينزل سطر لو مالحقش.
function navStyle() {
  if (document.getElementById("pnav-style")) return;
  const s = document.createElement("style");
  s.id = "pnav-style";
  s.textContent = `
    .pnav{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 12px;}
    .pnav:empty{display:none;}
    .pnav a{display:flex;flex-direction:row;align-items:center;justify-content:center;gap:6px;flex:0 0 auto;min-width:80px;
      padding:9px 12px;border:0;border-radius:16px;background:#fff;color:#1d2024;font-size:13px;font-weight:500;
      line-height:1.25;text-align:center;text-decoration:none;white-space:nowrap;}
    .pnav a:hover{background:#fbeceb;}
    .pnav a svg{width:18px;height:18px;flex:0 0 auto;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;
      stroke-linejoin:round;color:#a61b12;}
    .pnav a.on{background:#a61b12;color:#fff;cursor:default;}
    .pnav a.on:hover{background:#a61b12;}
    .pnav a.on svg{color:#fff;}
    @media (max-width:599px){.pnav{flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch;padding-bottom:2px;}
      .pnav::-webkit-scrollbar{display:none;}}
    @media print{.pnav{display:none !important;}}`;
  document.head.appendChild(s);
}

export function renderNav(el, claims) {
  if (!el) return;
  el.innerHTML = "";
  if (!claims || !claims.role) return;
  const here = (location.pathname.split("/").pop() || "index.html").toLowerCase();
  const pages = NAV_PAGES.filter(p => p.can(claims));
  if (pages.length < 2) return;   // صفحة واحدة بس = مفيش داعي لأزرار
  navStyle();
  for (const p of pages) {
    const a = document.createElement("a");
    a.href = p.href;
    a.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">' + ICON[p.icon] + "</svg>";
    a.appendChild(document.createTextNode(p.label));
    if (p.href === here) { a.className = "on"; a.setAttribute("aria-current", "page"); }
    el.appendChild(a);
  }
  // الشريط بيتسحب على الموبايل: زرار الصفحة الحالية يبقى في النص لو كان برا الشاشة.
  // الصفحة ممكن تكون لسه مستخبية (قبل ما الدخول يخلص)، فبنستنى لحد ما الشريط يبان (لحد 5 ثوانى).
  const on = el.querySelector("a.on");
  if (!on) return;
  let tries = 0;
  (function center() {
    if (!on.isConnected) return;
    if (!el.clientWidth) { if (++tries < 25) setTimeout(center, 200); return; }
    if (el.scrollWidth <= el.clientWidth + 1) return;
    const r = on.getBoundingClientRect(), b = el.getBoundingClientRect();
    if (r.left < b.left || r.right > b.right) el.scrollLeft += (r.left + r.width / 2) - (b.left + b.width / 2);
  })();
}

// ===== اسم اللي عمل التعديل =====
// أي حاجة بيعملها حساب أدمن بتتسجل «ادمن» بدل الإيميل، عشان الإيميل مايظهرش لحد في السجلات.
let ACTOR_ROLE = null;
onAuthStateChanged(auth, async user => {
  ACTOR_ROLE = null;
  if (!user) { window.sentryRole?.("none"); return; }
  try { ACTOR_ROLE = (await user.getIdTokenResult()).claims.role || ""; } catch (e) { ACTOR_ROLE = ""; }
  window.sentryRole?.(ACTOR_ROLE);
});
// لو الدور لسه ماتقراش (حفظ في أول لحظة بعد فتح الصفحة): من التوكن اللى مع الحساب نفسه (ب6)
const tokenRole = u => { try { return JSON.parse(atob(String(u?.accessToken || "").split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).role || ""; } catch (e) { return ""; } };
export const actorEmail = u => (ACTOR_ROLE ?? tokenRole(u)) === "admin" ? "ادمن" : (u?.email || "");

// ===== العدّ بالعربى (ب4): عامل واحد / عاملين / ٣ عمال / ١١ عامل =====
// f = شكل الرقم (مثلاً بالأرقام العربى)
const UNITS = {
  "عامل": ["عامل واحد", "عاملين", "عمال"], "يوم": ["يوم واحد", "يومين", "أيام"], "حالة": ["حالة واحدة", "حالتين", "حالات"],
  "بديل": ["بديل واحد", "بديلين", "بدايل"], "سطر": ["سطر واحد", "سطرين", "سطور"], "اسم": ["اسم واحد", "اسمين", "أسماء"],
  "مرة": ["مرة واحدة", "مرتين", "مرات"], "صورة": ["صورة واحدة", "صورتين", "صور"], "ملف": ["ملف واحد", "ملفين", "ملفات"],
};
export function cnt(n, unit, f = String) {
  const k = Math.abs(Math.trunc(+n || 0)), u = UNITS[unit];
  if (!u) return `${f(n)} ${unit}`;
  if (k === 1) return u[0];
  if (k === 2) return u[1];
  return `${f(n)} ${k >= 3 && k <= 10 ? u[2] : unit}`;
}

// ===== وقت السيرفر (ب7) =====
// الفرق بين ساعة الجهاز وساعة السيرفر من هيدر Date (طلب HEAD صغير للموقع نفسه). serverNow() = الوقت بساعة السيرفر،
// وقبل ما الفرق يوصل = ساعة الجهاز. serverClock = وعد بيخلص لما الفرق يتعرف (أو بعد 3 ثوانى لو النت بطيء).
let CLOCK_SKEW = 0;
export const serverNow = () => Date.now() + CLOCK_SKEW;
export const serverClock = Promise.race([
  (async () => {
    try {
      const t0 = Date.now(), r = await fetch("/sw.js?t=" + t0, { method: "HEAD", cache: "no-store" }), t1 = Date.now();
      const d = Date.parse(r.headers.get("date") || ""), age = +(r.headers.get("age") || 0) || 0;
      // رد جاى من كاش (Cloudflare) أو رحلة أطول من 5 ثوانى: الوقت مش مضمون، فنفضل على ساعة الجهاز
      const cached = /^(HIT|STALE|UPDATING|REVALIDATED)$/i.test(r.headers.get("cf-cache-status") || "");
      if (r.ok && !isNaN(d) && !cached && t1 - t0 < 5000) CLOCK_SKEW = d + age * 1000 + 500 - (t0 + t1) / 2;   // الهيدر بالثانية
    } catch (e) {}
  })(),
  new Promise(r => setTimeout(r, 3000)),
]);

// ===== أكتر من الاحتياج (ب8) =====
// الحاضرين في كل وظيفة (ومعاهم بدلاء الراحات والتوقف/الأجازة الرسمية، والغايب اللى ليه بديل) مقارنة بالمطلوب.
// بيرجّع [{ job, n, plan }] للوظايف اللى عدّت. نفس العدّ اللى في إضافة البديل في صفحة الاعتماد.
export function overPlan(entries, plan) {
  const per = {};
  Object.values(entries || {}).forEach(e => {
    if (e.s === "P" || (e.s === "L" && (e.c === "ق" || e.c === "ط")) || (e.s === "A" && e.rep)) per[e.job] = (per[e.job] || 0) + 1;
  });
  const PA = alignPlan(plan || {}, Object.keys(per));
  return Object.keys(per).filter(j => PA[j] != null && per[j] > PA[j]).map(j => ({ job: j, n: per[j], plan: PA[j] }));
}

// ===== صور الكشوف =====
// تصغير صورة الكشف قبل الرفع (نفس الحد اللي الـ Rules بتقبله: أقل من 950 ألف حرف)
export async function compressPage(file) {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  const maxSide = 1800;
  const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
  for (const q of [0.82, 0.72, 0.62, 0.5]) {
    const data = c.toDataURL("image/jpeg", q).split(",")[1];
    if (data.length < 900000) return data;
  }
  throw new Error("الصورة كبيرة جداً");
}
// استبدال صورة كشف (بدل المسح): صورة جديدة بتشاور على القديمة (replaces)، وسجل الاستبدال
// (att_page_replacements/<رقم القديمة>) بيتكتب في نفس العملية. القديمة مابتتمسحش: بتفضل محفوظة ومابتتقريش تاني.
// الـ Rules بتحكم مين يستبدل وامتى: المشرف لحد مراجعة الإقليمي، والإقليمي والمحاسب لحد الاعتماد، والأدمن أي وقت.
export async function replacePage(old, image) {
  const u = auth.currentUser, b = writeBatch(db), nref = doc(collection(db, "att_pages"));
  b.set(nref, { site: old.site, date: old.date, image, uploaded_by: u.uid, uploaded_email: actorEmail(u),
    status: "pending", created_at: serverTimestamp(), replaces: old.id });
  b.set(doc(db, "att_page_replacements", old.id), { site: old.site, date: old.date, page: old.id, new_page: nref.id,
    uploaded_email: old.uploaded_email || "", uploaded_at: old.created_at || null, rows: (old.result?.rows || []).length,
    archived_path: old.archived_path || "", replaced_by: u.uid, replaced_email: actorEmail(u), replaced_at: serverTimestamp() });
  await b.commit();
  return nref.id;
}
// الصورة اللي بدّلت p (لو قرايتها فشلت ومحدش بدّلها هي كمان: p لسه هي المستخدمة)
export function replacedBy(p, pages) {
  for (let i = 0, cur = p; i < 10; i++) {
    const n = pages.find(x => x.replaces === cur.id);
    if (!n) return null;
    if (n.status !== "error") return n;
    cur = n;
  }
  return null;
}

// بترسم الأزرار لوحدها في أي صفحة فيها <nav id="pnav"> بعد الدخول، وبتشيلها بعد الخروج
if (FIRST_COPY) onAuthStateChanged(auth, async user => {
  const el = document.getElementById("pnav");
  if (!el) return;
  if (!user) { el.innerHTML = ""; return; }
  let claims = {};
  try { claims = (await user.getIdTokenResult()).claims || {}; } catch (e) {}
  renderNav(el, claims);
});

// ===== أرقام ونصوص =====
// الأرقام الهندية (٠١٢٣ / ۰۱۲۳ من كيبورد عربي أو فارسي) → إنجليزي. لازم قبل أي replace(/\D/g) أو مقارنة كود/رقم قومي/موبايل،
// لأن \D بيعتبر ٠-٩ مش أرقام فبيمسحها.
export const enDigits = s => String(s ?? "").replace(/[٠-٩]/g, d => d.charCodeAt(0) - 0x0660).replace(/[۰-۹]/g, d => d.charCodeAt(0) - 0x06F0);
// العامل أساسي؟ القوة فيها «اساسي» و«أساسي» (بهمزة ومن غير)، و«جديد» = أساسي مضاف بالبطاقة لسه مستني
export const isBasic = t => ["اساسي", "جديد"].includes(String(t ?? "").replace(/[أإآ]/g, "ا").trim());

// ===== رقم قومي قريب من رقم موجود =====
// قراءة البطاقة أو شيت العميل ممكن تغلط في رقم أو اتنين (زي 7 ← 2، أو رقمين معكوسين).
// nidDiff: عدد الخانات المختلفة بين رقمين قوميين (99 لو مش 14 رقم)
export const nidDiff = (a, b) => {
  a = enDigits(a).replace(/\D/g, ""); b = enDigits(b).replace(/\D/g, "");
  return a.length === 14 && b.length === 14 ? [...a].filter((c, i) => c !== b[i]).length : 99;
};
// نفس الاسم؟ أول 3 أسامي (أو أول اسمين لو واحد فيهم أقصر) — من غير فرق همزة/ة/ى، و«عبد ال...» = «عبدال...»
const nameWords = s => enDigits(s).replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي")
  .replace(/(^|\s)(عبد|ابو)\s+/g, "$1$2").replace(/[^ء-ي\s]/g, " ").split(/\s+/).filter(Boolean);
// عدد أجزاء الاسم: «عبد الناصر» و«ابو مصطفى» و«عز الدين» و«فتح الله» = اسم واحد.
// فـ«محمد عبد الناصر محمد» = 3 (ثلاثي) مش 4.
export const nameParts = s => nameWords(s).filter((w, i) => i === 0 || !["الدين", "الله"].includes(w)).length;
export const sameName = (a, b) => {
  const x = nameWords(a), y = nameWords(b), k = Math.min(3, x.length, y.length);
  return k >= 2 && x.slice(0, k).join(" ") === y.slice(0, k).join(" ");
};
// العمال اللي رقمهم مختلف عن nid في رقم أو اتنين بس وبنفس الاسم (غالباً نفس الشخص ورقمه اتقرا غلط)
export function nearWorkers(nid, name, workers) {
  const seen = new Set(), out = [];
  for (const w of workers || []) {
    const wn = String(w?.nid || "");
    if (!wn || seen.has(wn) || wn === nid) continue;
    const d = nidDiff(nid, wn);
    if (d >= 1 && d <= 2 && sameName(name, w.name)) { seen.add(wn); out.push({ ...w, diff: d }); }
  }
  return out;
}

// ===== المخطط (شيت احتياج بيبسي) =====
// اسم الوظيفة ممكن يختلف في الإملاء بين شيت الاحتياج والكشف (ليلي/ليلى، أ/ا، ة/ه، تشكيل، مسافات زيادة)
// — بنوحّد للمطابقة بس، والاسم اللي بيظهر هو اسم الكشف.
export const jkey = s => String(s ?? "").replace(/[\u064B-\u0652\u0640]/g, "").replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").replace(/\s+/g, " ").trim();
// بيرجّع نسخة من المطلوب {وظيفة: عدد} بأسماء الوظايف زي ما هي مكتوبة في jobs (الكشف)؛ اللي مالوش مقابل بيفضل باسمه
export function alignPlan(plan, jobs) {
  const by = new Map();
  (jobs || []).forEach(j => { const k = jkey(j); if (k && !by.has(k)) by.set(k, j); });
  const out = {};
  Object.entries(plan || {}).forEach(([j, n]) => { const k = by.get(jkey(j)) || j; out[k] = (out[k] || 0) + (Number(n) || 0); });
  return out;
}
const pnorm = s => String(s ?? "").replace(/\s+/g, " ").trim();
const pkey = s => pnorm(s).toLowerCase();
const ckey = (loc, pos) => pnorm(loc) + "|" + pkey(pos);

// بيانات المخطط الساري لشهر: آخر شيت متسجل لحد الشهر ده + تعديلاته + جدول المطابقة.
// بيرجّع null لو مفيش شيت أو مفيش إعدادات.
// الشيت: شيت الشهر نفسه، ولو مش موجود اللى قبله شهر شهر (لحد سنة) — قراية واحدة غالباً بدل كل الشهور (ب10).
// النتيجة محفوظة دقيقتين لكل شهر (التقرير بيطلبها مع كل يوم بيتفتح). fresh = من غير المحفوظ (بعد رفع شيت).
const PLAN_MEMO = new Map(), PLAN_MEMO_MS = 120000, PLAN_BACK = 12;
const prevMonth = m => { const [y, mm] = m.split("-").map(Number); return mm > 1 ? `${y}-${String(mm - 1).padStart(2, "0")}` : `${y - 1}-12`; };
async function latestPlan(month) {
  let m = month;
  for (let i = 0; i <= PLAN_BACK && /^\d{4}-\d{2}$/.test(m); i++, m = prevMonth(m)) {
    const s = await getDoc(doc(db, "plans", m));
    if (s.exists()) return [m, s.data()];
  }
  // أقدم من سنة (أو شهر مكتوب بشكل تاني): زي الأول — كل الشهور
  const plans = await getDocs(collection(db, "plans"));
  let pm = null, plan = null;
  plans.forEach(d => { if (d.id <= month && (!pm || d.id > pm)) { pm = d.id; plan = d.data(); } });
  return [pm, plan];
}
export function fetchPlanBase(month, fresh = false) {
  const hit = PLAN_MEMO.get(month);
  if (!fresh && hit && Date.now() - hit.at < PLAN_MEMO_MS) return hit.p;
  const p = loadPlanBase(month);
  PLAN_MEMO.set(month, { at: Date.now(), p });
  p.catch(() => { if (PLAN_MEMO.get(month)?.p === p) PLAN_MEMO.delete(month); });
  return p;
}
async function loadPlanBase(month) {
  const [pm, plan] = await latestPlan(month);
  if (!plan) return null;
  const [am, st] = await Promise.all([
    getDocs(query(collection(db, "plan_amendments"), where("month", "==", pm))),
    getDoc(doc(db, "plan_settings", "mapping"))
  ]);
  const amends = []; am.forEach(d => amends.push(d.data()));
  amends.sort((a, b) => a.effective_date.localeCompare(b.effective_date) || ((a.created_at?.seconds || 0) - (b.created_at?.seconds || 0)));
  const set = st.exists() ? st.data() : null;
  if (!set) return null;
  return { month, pm, plan, amends, set };
}

// العدد المطلوب ليوم معين: { موقع: { وظيفة: عدد } }
export function planBySite(base, date) {
  const out = {};
  if (!base) return out;
  const { month, pm, plan, amends, set } = base;
  const day = pm === month ? date : pm + "-31";
  const cmap = new Map();
  plan.rows.forEach(r => { const k = ckey(r.loc, r.pos); const e = cmap.get(k) || { loc: pnorm(r.loc), pos: pnorm(r.pos), value: 0 }; e.value += Number(r.hc) || 0; cmap.set(k, e); });
  cmap.forEach((e, k) => { const hits = amends.filter(a => ckey(a.loc, a.pos) === k && a.effective_date <= day); if (hits.length) e.value = hits[hits.length - 1].to; });
  const add = (site, job, n) => { if (!site) return; (out[site] = out[site] || {})[job] = (out[site][job] || 0) + n; };
  cmap.forEach(e => {
    const job = set.posMap?.[pkey(e.pos)]; if (!job) return;
    const split = (set.splits || []).find(x => ckey(x.loc, x.pos) === ckey(e.loc, e.pos));
    if (split?.parts?.length) {
      const sum = split.parts.reduce((a, p) => a + Number(p.count || 0), 0);
      split.parts.forEach((p, i) => add(pnorm(p.site), job, Number(p.count || 0) + (i === 0 ? e.value - sum : 0)));
      return;
    }
    const ov = (set.overrides || []).find(o => ckey(o.loc, o.pos) === ckey(e.loc, e.pos));
    add(ov ? pnorm(ov.site) : set.locMap?.[pnorm(e.loc)], job, e.value);
  });
  return out;
}

// ===== ساعات الحضور والانصراف (مصنع العامرية وفرع العجمى وطنطا مصنع) =====
// المشرف بيكتب الوقت بإيده من غير صبح/مسا: البوابة بتخمّن من بدايات الورديات المعروفة (جدول Code&time PCE)
// والمشرف بيصحح. الحساب بالدقيقة من غير تقريب.
export const TIME_SITES = ["مصنع العامرية", "فرع العجمى", "طنطا مصنع"];
// المواقع اللي فيها بدلاء راحات (قرار محمود 18/11: التلاتة دول بس). باقى المواقع «بديل راحات» مايظهرش
// في إضافة العامل (صفحة الحضور) ولا في اختيار النوع عند الـ HR — أساسي أو يومية بس.
export const REST_SUB_SITES = ["مصنع العامرية", "فرع العجمى", "طنطا مصنع"];
export const hasRestSubs = site => REST_SUB_SITES.includes(String(site || "").trim());
// والعكس (قرار محمود 19/11): «يومية» مقفولة في التلات مواقع دول — أساسي أو بديل راحات بس. باقى المواقع أساسي أو يومية.
export const typeOk = (site, type) => type !== (hasRestSubs(site) ? "يومية" : "بديل راحات");
export const typeErr = site => hasRestSubs(site) ? "الموقع ده مفيهوش يومية — اختار أساسي أو بديل راحات."
  : "الموقع ده مفيهوش بدلاء راحات — اختار أساسي أو يومية.";
// بيشيل النوع المقفول من أي <select> للنوع (بيتشال خالص مش مخفي — موبايلات iPhone بتعرض الاختيار المخفي)
export function typeSelect(sel, site) {
  if (!sel) return;
  if (sel.dataset.full == null) sel.dataset.full = sel.innerHTML;   // من غير ??= (الموبايلات القديمة)
  sel.innerHTML = sel.dataset.full;
  sel.querySelectorAll("option").forEach(o => { if (o.value && !typeOk(site, o.value)) o.remove(); });
}

// ===== الوظايف: قايمة ثابتة لكل شركة (قرار محمود 19/11) =====
// مفيش كتابة حرة للوظيفة لأي حساب (مشرف، إقليمي، محاسب، HR، أدمن) — الاختيار من القايمة دي بس.
// وظيفة جديدة = تتضاف هنا. القايمة من وظايف العمال الشغالين في السجل يوم 19/11/2026 + وظايف شيت احتياج بيبسي،
// من غير الغلطات (مخازن تعبئة، عامل مخزن منوف) ومن غير وظايف المشرفين والإقليميين.
// «سائق شحن امداد» اتلغت (محمود 19/11) — مش في القايمة.
export const JOBS = {
  pepsi: ["مساعد بيع", "عامل", "سائق ونش", "عامل تحميل ليلى", "سائق تحميل ليلى", "سائق مشتريات"],
  chipsy: ["مساعد بيع", "مساعد بيع بالجملة", "مدخل بيانات", "عامل"],
  emdad: ["مساعد امداد", "منسق ساحة امداد"],
  sharqia: ["عامل", "فنى مشغل", "مساعد مشغل", "سائق ونش", "سائق ونش مستوى اول", "مدخل بيانات",
    "مرقاب جودة", "فنى وقاية ادخنة", "فنى توليفات وتجهيزات تجارب", "فنى عينات دخان",
    "عامل مخزن", "عامل مخزن مالية", "عامل مالية", "عامل مخزن مبيعات",
    "سائق نقل مبيعات", "سائق ملاكى", "سائق نقل ثقيل", "خدمات معاونة", "مشرف ادارى", "فنى صيانة سيارات"],
  swvl: ["كابتن سائق سويفل"],
};
const CHIPSY_JOB_SITES = ["قطامية", "ابوصير"];
// الشركة من الموقع (أو الفرع/الشركة لطلبات الإكسيل وشيت الشرقية)
// الموقع الأول، ولو مش معروف من الموقع: الشركة
function groupOfText(t) {
  if (/سويفل|swvl|swivel/i.test(t)) return "swvl";
  if (/شرقي|sharqia/i.test(t)) return "sharqia";
  if (/شيبس|chipsy|cfi/i.test(t) || CHIPSY_JOB_SITES.some(s => t.includes(s))) return "chipsy";
  if (/امداد|emdad/i.test(t)) return "emdad";
  if (/pepsi|بيبس/i.test(t)) return "pepsi";
  return "";
}
export function jobGroup(site, company) {
  const s = String(site || "").trim();
  if (ATT_SITES.includes(s)) return "pepsi";
  return groupOfText(s) || groupOfText(String(company || "")) || "sharqia";   // أي مكان تاني = قطاع/مكان من الشرقية
}
export const jobsFor = (site, company) => JOBS[jobGroup(site, company)];
export const jobOk = (site, job, company) => jobsFor(site, company).includes(String(job || "").trim());
// <option> للوظايف — لو القيمة الحالية مش في القايمة (وظيفة قديمة/غلط): «— اختار —» عشان يختار واحدة صح
export const jobOptions = (site, cur, company) => {
  const list = jobsFor(site, company), c = String(cur || "").trim();
  return (list.includes(c) ? "" : `<option value="" selected>— اختار الوظيفة —</option>`)
    + list.map(j => `<option ${j === c ? "selected" : ""}>${String(j).replace(/[<>&"]/g, "")}</option>`).join("");
};
const SHIFT_STARTS = [6, 7, 8, 9, 15, 20, 22].map(h => h * 60);   // نهار 6/7/8/9، عصر 15، ليل 20/22
// الورديات المعروفة في المواقع الثلاثة (من محمود 8/11/2026):
// المخازن والعمومية والتعبئة (عمال وونش) في مصنع العامرية وطنطا مصنع: 8→15، 15→22، 22→8
// إنتاج وجودة مصنع العامرية: 8→20، 20→8 — العجمى: 8→15، 15→22 أو 15→24
const SHIFT_PAIRS = [[8, 15], [15, 22], [22, 8], [8, 20], [20, 8], [15, 24]].map(([a, b]) => [a * 60, (b % 24) * 60]);
const PAIR_MISS = 40;   // وقت مش على وردية معروفة: أقل احتمال (عشان «8 → 3» تبقى 8 → 15 مش 20 → 3)
const onPair = (i, o) => i != null && o != null && SHIFT_PAIRS.some(([a, b]) => Math.abs(i - a) <= 30 && Math.min(Math.abs(o - b), 1440 - Math.abs(o - b)) <= 30);
export const isHelperJob = job => /مساعد بيع/.test(String(job || ""));   // حضور بس: 8 ساعات ثابتة من غير إضافي
export const toMin = s => { const m = /^(\d{1,2})(?::(\d{2}))?$/.exec(String(s || "").trim()); return m && +m[1] <= 24 && +(m[2] || 0) < 60 ? (+m[1] % 24) * 60 + +(m[2] || 0) : null; };
export const hhmm = m => m == null ? "" : String(Math.floor(((m % 1440) + 1440) % 1440 / 60)).padStart(2, "0") + ":" + String(((m % 60) + 60) % 60).padStart(2, "0");
const near = t => Math.min(...SHIFT_STARTS.map(s => { const d = Math.abs(t - s) % 1440; return Math.min(d, 1440 - d); }));
// الساعة المكتوبة (1–12) ممكن تبقى صبح أو مسا
// لو المشرف كاتب ص أو م: السيرفر بيكتب م بنظام 24 ساعة ("3م" → "15:00")، وص بصفر في الأول ("8ص" → "08:00") = الصبح أكيد
const cands = v => { const t = toMin(v); if (t == null) return [null]; const h = Math.floor(t / 60);
  if (/^0\d:/.test(String(v).trim())) return [t];
  return h >= 13 || h === 0 ? [t] : h === 12 ? [t, t - 720] : [t, t + 720]; };
// أقصى وردية لأي وظيفة 12 ساعة: أي حضور وانصراف بيطلعوا أكتر من كده مش منطقيين
export const MAX_SHIFT_MIN = 12 * 60;
// لو الحضور والانصراف اتكتبوا معكوسين (زي 15:00 → 08:00 = 17 ساعة وهي 08:00 → 15:00):
// بيرجّع الوقتين متعدلين لو المدة أكتر من 12 ساعة والعكس 12 ساعة أو أقل، وإلا null
export function fixReversed(inHM, outHM) {
  const a = toMin(inHM), o = toMin(outHM);
  if (a == null || o == null) return null;
  const d = (o - a + 1440) % 1440, r = (a - o + 1440) % 1440;
  return o < a && d > MAX_SHIFT_MIN && r > 0 && r <= MAX_SHIFT_MIN ? { in: hhmm(o), out: hhmm(a) } : null;
}
// بيرجّع { in, out, unsure, swapped }: unsure = الصبح والمسا محتملين بنفس الدرجة (زي 8 → 8)، والمشرف لازم يأكد
// prevIn = وقت حضور نفس العامل في اليوم اللي قبله (لو متأكد): لو الصبح والمسا محتملين، بناخد الأقرب لامبارح
// swapped = مفيش قراية منطقية (4–12 ساعة) غير لما الحضور والانصراف يتعكسوا — اتعكسوا والمحاسب يأكد
export function guessTimes(tin, tout, dayOnly = false, prevIn = null) {
  let g = guessTimes1(tin, tout, dayOnly, prevIn);
  if (g.bad && tin && tout) { const s = guessTimes1(tout, tin, dayOnly, prevIn); if (!s.bad) g = { ...s, swapped: true }; }
  // ٢ و٣ بخط الإيد شبه بعض: لو الوقت مش على وردية معروفة، وتغيير ٢↔٣ في ساعة الحضور أو الانصراف بيخليه على وردية بالظبط
  // (زي «2 → 10» وهي 3 → 10 = 15:00 → 22:00) — بناخد التصليح، والمحاسب بيتأكد من الورقة
  if (dayOnly || !tin || !tout || onPair(toMin(g.in), toMin(g.out))) return g;
  for (const [a, b] of [...swap23(tin).map(x => [x, tout]), ...swap23(tout).map(x => [tin, x])]) {
    const f = guessTimes1(a, b, dayOnly, prevIn);
    if (!f.bad && !f.unsure && onPair(toMin(f.in), toMin(f.out))) return { ...f, fixed23: true };
  }
  return g;
}
// الوقت نفسه بس ٢ مكان ٣ أو العكس في رقم واحد من الساعة (الدقايق لازم صفر): «2» → «3»، «23» → «22»/«33»،
// و«14:00» (السيرفر حوّل «٢م») → «15:00». الأوقات اللي مش منطقية بتتشال في guessTimes1
function swap23(v) {
  const m = /^(0?)(\d{1,2})(?::00)?$/.exec(String(v || "").trim()); if (!m) return [];
  const h = +m[2], out = new Set();
  // الساعة زي ما هي («23» → «22»)، وبنظام 12 لو بعد الضهر («14» من «٢م» → «15»)
  for (const pm of h > 12 ? [0, 12] : [0]) {
    const txt = String(h - pm);
    [...txt].forEach((c, i) => { if (c === "2" || c === "3") {
      const n = +(txt.slice(0, i) + (c === "2" ? "3" : "2") + txt.slice(i + 1)) + pm;
      if (n <= 24) out.add(m[1] + n + ":00"); } });
  }
  return [...out];
}

function guessTimes1(tin, tout, dayOnly, prevIn) {
  const best = [];
  // مساعد البيع شغله نهار بس
  for (const i of cands(tin).filter(x => !dayOnly || x == null || (x >= 300 && x < 1080))) for (const o of cands(tout)) {
    if (i == null && o == null) continue;
    let score;
    if (i == null) score = 500;                              // من غير حضور: الانصراف لوحده مش كفاية
    else if (o == null) score = near(i);
    else { const d = (o - i + 1440) % 1440; score = near(i) + (d >= 240 && d <= MAX_SHIFT_MIN ? 0 : 10000) + (onPair(i, o) ? 0 : PAIR_MISS); }
    best.push({ in: i, out: o, score });
  }
  if (!best.length) return { in: "", out: "", unsure: false };
  best.sort((a, b) => a.score - b.score);
  let b = best[0], rival = best.find(x => x.in !== b.in && x.score - b.score < 30);
  const p = toMin(prevIn);
  if (rival && p != null && b.in != null && rival.in != null) {
    const dist = t => { const d = Math.abs(t - p) % 1440; return Math.min(d, 1440 - d); };
    if (dist(rival.in) < dist(b.in)) b = rival;
    return { in: hhmm(b.in), out: hhmm(b.out), unsure: false, prev: true, bad: b.score >= 10000 };
  }
  // وكمان لو الحضور بعيد ساعة أو أكتر عن أي وردية معروفة
  return { in: hhmm(b.in), out: hhmm(b.out), unsure: !!rival || (b.in != null && b.score >= 60), bad: b.score >= 10000 };
}
// دقايق متداخلة مع النهار (6 الصبح لـ 6 المسا) في فترة [a, b) — b ممكن يعدّي نص الليل
function dayPart(a, b) {
  let n = 0;
  for (let k = Math.floor(a / 1440) - 1; k <= Math.floor(b / 1440) + 1; k++) {
    const s = k * 1440 + 360, e = k * 1440 + 1080;
    n += Math.max(0, Math.min(b, e) - Math.max(a, s));
  }
  return n;
}
// الساعات بالدقيقة: min = الكل، dmin/nmin = نهاري/ليلي، ot = اللي فوق 8 ساعات من آخر الوردية (otd/otn نهاري/ليلي منه)
export function calcHours(inHM, outHM, job) {
  const a = toMin(inHM);
  if (a == null) return null;
  if (isHelperJob(job)) { const d = dayPart(a, a + 480); return { min: 480, dmin: d, nmin: 480 - d, ot: 0, otd: 0, otn: 0, helper: true }; }
  const o = toMin(outHM);
  if (o == null) return null;
  const b = o > a ? o : o + 1440;   // الانصراف قبل الحضور = تاني يوم
  const min = b - a, d = dayPart(a, b), ot = Math.max(0, min - 480), otd = dayPart(b - ot, b);
  return { min, dmin: d, nmin: min - d, ot, otd, otn: ot - otd };
}
// مأمورية في المواقع دي: بتاخد الوردية العادية للوظيفة من جدول Code&time (كل وظايف المواقع الثلاثة: 7 ساعات 08:00 → 15:00)
export const MISSION_SHIFT = { in: "08:00", out: "15:00" };
// المشرف بيشطب على العامل ويكتب في الملاحظات «مأمورية» أو «توقف»
export function specialOf(r) {
  const t = String((r?.note || "") + " " + (r?.word || "")).replace(/[أإآ]/g, "ا");
  return /مامور/.test(t) ? "mission" : /توقف/.test(t) ? "stop" : "";
}
export const hrsTxt = m => { const h = Math.floor(m / 60), mi = m % 60; return mi ? `${h}:${String(mi).padStart(2, "0")}` : String(h); };

// ===== جدول الأكواد الإنجليزي (job_codes/table) =====
// كل سطر: الكود العربي «الموقع/الوظيفة/القسم» (زي تابة CODE في «قوة كاملة») ← كود العميل (CODE - HC) اللي السكيل بيقراه
export const JC_DOC = ["job_codes", "table"];
const cNorm = s => String(s ?? "").replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").replace(/\s+/g, "").toLowerCase();
const cKey = (site, job, sec) => cNorm(site) + "/" + cNorm(job) + "/" + cNorm(sec);
export function codeMap(rows) {
  const m = new Map();
  (rows || []).forEach(r => { const p = String(r.ar || "").split("/"); if (r.hc) m.set(cKey(p[0], p[1], p.slice(2).join("/")), r.hc); });
  return m;
}
// بالقسم لو موجود، وإلا من غير قسم، وإلا لو الوظيفة ليها كود واحد بس في الموقع
export function codeFor(map, site, job, sec) {
  const hit = map.get(cKey(site, job, sec)) || map.get(cKey(site, job, ""));
  if (hit) return hit;
  const pre = cNorm(site) + "/" + cNorm(job) + "/", all = [...new Set([...map].filter(([k]) => k.startsWith(pre)).map(([, v]) => v))];
  return all.length === 1 ? all[0] : "";
}

// ===== توحيد الزراير في كل الصفحات =====
// الأحمر المليان = الزرار الأساسي (زي ما هو)، الأخضر = اعتماد/تأكيد، والأحمر المفرغ = مسح/شيل/رفض/إلغاء اعتماد
// (عشان «اعتمد» و«امسح» مايبقوش شبه بعض). بيتحط بعد CSS الصفحة فبيكسب.
{
  const s = document.createElement("style");
  s.textContent = `
.btn.ok{background:#16683a;color:#fff;border:none;}
.btn.ok:hover{background:#13612c;}
.btn.danger{background:#fff;color:#a61b12;border:1px solid #e0a09a;}
.btn.danger:hover{background:#fdecea;}
.btn:disabled{opacity:.5;cursor:not-allowed;}
/* و5: شكل واحد للتابات في كل الصفحات (الحالات والاحتياج والتقارير): خط أحمر تحت التاب المفتوح */
.tabs{display:flex;flex-wrap:nowrap;gap:2px;margin-bottom:14px;border-bottom:1px solid #e0ded6;overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch;}
.tabs::-webkit-scrollbar{display:none;}
.tab{padding:9px 14px;cursor:pointer;background:none;border:none;border-bottom:3px solid transparent;border-radius:0;color:#6a6e75;font:inherit;font-weight:500;white-space:nowrap;flex:0 0 auto;}
.tab:hover{color:#1d2024;}
.tab[aria-selected=true]{color:#a61b12;border-bottom-color:#a61b12;font-weight:600;}
.tab:focus-visible{outline:3px solid #9cc2ee;outline-offset:-3px;}
.btn:focus-visible,.tbl:focus-visible{outline:3px solid #9cc2ee;outline-offset:2px;}
@media (pointer:coarse){.btn{min-height:44px;}.btn.small{min-height:40px;}
  details.why>summary{padding:12px 2px;}
  .tab{min-height:44px;}
  .sv-out{min-height:44px;padding:0 16px;}
  button[data-ext]{min-height:44px!important;}
  #fp-card>summary{padding:12px 0;}
  #pay-days{min-height:44px;}
  details.fold>summary:has(>h2){min-height:44px;}}
/* و6: التابات وشريط الصفحات لما يتسحبوا بالعرض، الطرف اللي وراه باقى بيبهت */
.sfade-s{-webkit-mask-image:linear-gradient(to left,transparent 0,#000 32px);mask-image:linear-gradient(to left,transparent 0,#000 32px);}
.sfade-e{-webkit-mask-image:linear-gradient(to right,transparent 0,#000 32px);mask-image:linear-gradient(to right,transparent 0,#000 32px);}
.sfade-s.sfade-e{-webkit-mask-image:linear-gradient(to right,transparent 0,#000 32px,#000 calc(100% - 32px),transparent 100%);mask-image:linear-gradient(to right,transparent 0,#000 32px,#000 calc(100% - 32px),transparent 100%);}`;
  document.head.appendChild(s);
}

// ===== و6: شريط بيتسحب بالعرض (.pnav و .tabs) — علامة إن فيه باقى، والتاب المختار يبان =====
// الصفحة من اليمين: أول الشريط يمين (sfade-s = فيه حاجات قبل، يمين)، وآخره شمال (sfade-e = فيه باقى، شمال).
function edgeFade(el) {
  const max = el.scrollWidth - el.clientWidth;
  const pos = Math.abs(el.scrollLeft);
  el.classList.toggle("sfade-s", max > 2 && pos > 2);
  el.classList.toggle("sfade-e", max > 2 && pos < max - 2);
}
// يسحب الشريط بالعرض بس (من غير ما الصفحة تتحرك لفوق أو تحت) لحد ما الزرار يبان كله
function showInStrip(el, t) {
  if (!t || el.scrollWidth <= el.clientWidth) return;
  const r = t.getBoundingClientRect(), c = el.getBoundingClientRect();
  if (r.left < c.left) el.scrollLeft -= c.left - r.left + 24;
  else if (r.right > c.right) el.scrollLeft += r.right - c.right + 24;
}
if (typeof document !== "undefined" && typeof ResizeObserver !== "undefined") {
  const seen = new WeakSet();
  const ro = new ResizeObserver(es => es.forEach(e => edgeFade(e.target)));
  const hook = () => document.querySelectorAll(".pnav,.tabs").forEach(el => {
    if (seen.has(el)) return;
    if (!el.children.length) return;   // الشريط لسه ماترسمش
    seen.add(el);
    el.addEventListener("scroll", () => edgeFade(el), { passive: true });
    el.addEventListener("click", e => { const t = e.target.closest(".tab,a"); if (t && el.contains(t)) showInStrip(el, t); });
    ro.observe(el);
    showInStrip(el, el.querySelector("a.on,[aria-selected=true]"));   // الصفحة أو التاب المفتوح يبان من الأول
    edgeFade(el);
  });
  let pend = false;
  const go = () => { if (!pend) { pend = true; (window.requestAnimationFrame || setTimeout)(() => { pend = false; try { hook(); } catch (x) {} }); } };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", go); else go();
  new MutationObserver(go).observe(document.documentElement, { childList: true, subtree: true });
}

// ===== رسايل التأكيد والتنبيه (بدل confirm / alert / prompt بتوع المتصفح) =====
// نفس الشكل في كل الصفحات، بالعربي ومن اليمين، وزرار «إلغاء» واضح. كلهم بيرجعوا Promise:
//   if (!(await ask("تمسح الصورة دي؟", { ok: "امسح", danger: true }))) return;
//   await tell("ماتحفظش: …");
//   const why = await askText("سبب الرفض (إجباري):", { required: true });   // null لو اتلغى
// النص بيتحط كـ textContent (مفيش HTML)، و \n بتنزل سطر.
let dlgCss = false;
function dlg(msg, { ok = "تمام", cancel = "إلغاء", danger = false, input = null, value = "", required = false, user = "" } = {}) {
  if (!dlgCss) {
    dlgCss = true;
    const s = document.createElement("style");
    s.textContent = `
dialog.tdlg{border:0;border-radius:14px;padding:0;width:min(420px,calc(100vw - 32px));box-shadow:0 12px 40px rgba(0,0,0,.25);direction:rtl;font:inherit;color:#1f2328;}
dialog.tdlg::backdrop{background:rgba(20,22,26,.45);}
dialog.tdlg form{padding:20px 20px 16px;margin:0;}
dialog.tdlg p{margin:0 0 16px;white-space:pre-line;line-height:1.7;font-size:15.5px;max-height:60vh;overflow:auto;}
dialog.tdlg input{width:100%;box-sizing:border-box;margin:0 0 6px;padding:10px 12px;font:inherit;font-size:15px;border:1px solid #d0d4da;border-radius:10px;}
dialog.tdlg .err{color:#c0392b;font-size:13px;min-height:18px;margin:0 0 6px;}
dialog.tdlg .acts{display:flex;gap:10px;justify-content:flex-start;}
dialog.tdlg button{min-height:44px;min-width:96px;padding:0 18px;border-radius:10px;font:inherit;font-size:15px;font-weight:600;cursor:pointer;border:1px solid transparent;}
dialog.tdlg .ok{background:#16683a;color:#fff;}
dialog.tdlg .ok.danger{background:#a61b12;}
dialog.tdlg .no{background:#fff;color:#1f2328;border-color:#d0d4da;}
dialog.tdlg button:focus-visible{outline:3px solid #9cc2ee;outline-offset:2px;}`;
    document.head.appendChild(s);
  }
  if (typeof window.HTMLDialogElement !== "function" || !window.HTMLDialogElement.prototype.showModal) {
    // موبايلات قديمة جداً (آيفون قبل iOS 15.4): رسايل المتصفح العادية بدل ما الزرار مايعملش حاجة
    return Promise.resolve(input !== null ? window.prompt(msg, value) : cancel ? window.confirm(msg) : (window.alert(msg), true));
  }
  return new Promise(resolve => {
    const d = document.createElement("dialog");
    d.className = "tdlg";
    // user = إيميل الحساب في رسالة تأكيد الباسورد: خانة اسم مستخدم مخفية + current-password، عشان مدير الباسوردات
    // (جوجل) يتعرف على الرسالة ويعرض الباسورد المحفوظ بدل ما يتكتب بالإيد. من غير user الخانة زى ما كانت (autocomplete=off).
    d.innerHTML = `<form method="dialog"><p></p>${input !== null ? `${user ? `<input class="u" type="text" name="username" autocomplete="username" readonly hidden>` : ""}<input class="v" type="${input}" ${user ? `name="password" autocomplete="current-password"` : `autocomplete="off"`}><div class="err"></div>` : ""}<div class="acts"><button class="ok" value="ok"></button>${cancel ? `<button class="no" value="no" formnovalidate></button>` : ""}</div></form>`;
    d.querySelector("p").textContent = String(msg ?? "");
    const okB = d.querySelector(".ok"), noB = d.querySelector(".no"), inp = d.querySelector("input.v");
    if (user && d.querySelector("input.u")) d.querySelector("input.u").value = user;
    okB.textContent = ok; if (danger) okB.classList.add("danger");
    if (noB) noB.textContent = cancel;
    if (inp) inp.value = value;
    d.querySelector("form").addEventListener("submit", e => {
      if (e.submitter === okB && inp && required && !inp.value.trim()) { e.preventDefault(); d.querySelector(".err").textContent = "لازم تكتب حاجة هنا"; inp.focus(); }
    });
    d.addEventListener("close", () => {
      const yes = d.returnValue === "ok";
      d.remove();
      resolve(inp ? (yes ? inp.value : null) : yes);
    });
    document.body.appendChild(d);
    d.showModal();
    (inp || (danger && noB) || okB).focus();   // في الحاجات الخطيرة الفوكس على «إلغاء» عشان Enter مايمسحش بالغلط
  });
}
export const ask = (msg, o = {}) => dlg(msg, o);
export const tell = (msg, o = {}) => dlg(msg, { cancel: "", ...o });
export const askText = (msg, o = {}) => dlg(msg, { input: "text", ...o });

// ===== تأكيد الباسورد قبل قراية المرتبات والكارنيهات =====
// الـ Rules (freshDay) بتشترط إن حساب المكتب أو المشاهد كتب باسورده من أقل من 12 ساعة قبل ما يقرا المرتبات أو كارنيهات
// العمال — عشان جهاز مسروق أو متساب مفتوح مايسحبش بيانات العمال. المشرف داخل في الكارنيهات. العامل مش داخل في ده.
//   ensureFresh("payroll" | "cards")  بتطلب الباسورد لو المدة عدّت (أو قربت تعدّى). بترجّع false لو المستخدم لغى.
//   freshRead(kind, fn)               نفس الكلام وبعدين بتنفّذ القراية fn. لو الـ Rules رفضت والجلسة قريبة من المدة
//                                     (ساعة الجهاز ممكن تكون متأخرة) بتطلب الباسورد مرة وتجرب تانى.
const FRESH_SEC = 12 * 3600, FRESH_EARLY = 300, FRESH_SKEW = 2 * 3600;
const FRESH_WHO = {
  payroll: c => c.role === "admin" || c.role === "viewer" || (c.role === "accountant" && c.payroll === true),
  cards: c => ["admin", "viewer", "hr", "supervisor"].includes(c.role),
};
// عمر آخر كتابة للباسورد بالثوانى — أو null لو الحساب ده مش مشروط عليه (عامل / مالوش صلاحية أصلاً)
async function loginAge(kind) {
  const u = auth.currentUser;
  if (!u) return null;
  const c = (await u.getIdTokenResult()).claims || {};
  if (!FRESH_WHO[kind](c)) return null;
  return Date.now() / 1000 - (Number(c.auth_time) || 0);
}
const freshCancelled = () => Object.assign(new Error("لازم تأكد الباسورد الأول — مفيش حاجة اتقرت."), { code: "reauth-cancelled" });
export async function reauth() {
  const u = auth.currentUser;
  if (!u || !u.email) return false;
  for (;;) {
    const pw = await askText("عدّى 12 ساعة على آخر مرة كتبت فيها الباسورد.\nاكتب باسورد حسابك عشان تكمل:", { input: "password", ok: "تأكيد", user: u.email });
    if (!pw) return false;
    try {
      await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email, pw));
      await u.getIdToken(true);   // توكن جديد بوقت الدخول الجديد قبل القراية
      return true;
    } catch (err) {
      const c = err.code || "", wrong = /wrong-password|invalid-credential|invalid-login/.test(c);
      await tell(wrong ? "الباسورد غلط — جرّب تانى." : c === "auth/too-many-requests" ? "محاولات كتير — استنى شوية وجرّب تانى."
        : "ماقدرتش أتأكد من الباسورد: " + err.message);
      if (!wrong) return false;
    }
  }
}
export async function ensureFresh(kind) {
  const age = await loginAge(kind);
  return age === null || age < FRESH_SEC - FRESH_EARLY || reauth();
}
export async function freshRead(kind, fn) {
  if (!await ensureFresh(kind)) throw freshCancelled();
  try { return await fn(); }
  catch (e) {
    if (e?.code !== "permission-denied") throw e;
    const age = await loginAge(kind).catch(() => null);
    if (age === null || age < FRESH_SEC - FRESH_SKEW) throw e;   // الرفض مالوش علاقة بالمدة
    if (!await reauth()) throw freshCancelled();
    return await fn();
  }
}

// ===== esc: نص من البيانات جوه HTML (ت4 — كانت متعرّفة في كل صفحة لوحدها) =====
// و6 (قرار محمود 24 نوفمبر): شكل تاريخ واحد في كل البوابة — 20-11-2026 بأرقام إنجليزي، وبالوقت «20-11-2026 2:30 م».
// بياخد Date أو Timestamp بتاع Firestore أو "2026-11-20" أو رقم (ms). أي نص تاني بيرجع زي ما هو.
// { time: true } = الساعة كمان (مش للنص "2026-11-20" اللي مالوش ساعة)، { day: true } = اسم اليوم قبله.
const AR_DAYS = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
export function dTxt(v, o) {
  o = o || {};
  if (v == null || v === "" || v === false) return "";
  let d = null, dateOnly = false;
  if (typeof v.toDate === "function") d = v.toDate();
  else if (v instanceof Date) d = v;
  else if (typeof v === "number") { if (!(v > 0)) return ""; d = new Date(v); }
  else if (typeof v !== "string") return "";
  else {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v).trim());
    if (!m) return String(v);
    d = new Date(+m[1], +m[2] - 1, +m[3]); dateOnly = true;
    if (d.getMonth() !== +m[2] - 1 || d.getDate() !== +m[3]) return String(v);   // تاريخ مش موجود (2026-13-45) = زي ما هو
  }
  if (!d || isNaN(d.getTime())) return typeof v === "string" ? v : "";
  const p = n => String(n).padStart(2, "0");
  // التاريخ والساعة كل واحد معزول (LRI…PDI): من غيرها، بعد كلمة عربي زي «لحد» المتصفح بيقلب 23-11-2026 لـ 2026-11-23
  const iso = t => "\u2066" + t + "\u2069";
  let s = iso(p(d.getDate()) + "-" + p(d.getMonth() + 1) + "-" + d.getFullYear());
  if (o.day) s = AR_DAYS[d.getDay()] + " " + s;
  if (o.time && !dateOnly) { const h = d.getHours(); s += " " + iso(((h % 12) || 12) + ":" + p(d.getMinutes())) + " " + (h < 12 ? "ص" : "م"); }
  return s;
}

// و12: أي خانة مالهاش اسم لقارئ الشاشة (label / aria-label) بتاخده من الـ placeholder، أو من عنوان العمود لو جوه جدول.
// بيشتغل على الصفحة كلها وعلى أي حاجة بتترسم بعدين (القوايم والجداول اللي بتتبني بالـ JS).
function nameControls() {
  document.querySelectorAll("input:not([type=hidden]):not([aria-label]):not([aria-labelledby]),select:not([aria-label]):not([aria-labelledby]),textarea:not([aria-label]):not([aria-labelledby])").forEach(el => {
    if ((el.labels && el.labels.length) || el.closest("label")) return;
    let t = el.getAttribute("placeholder") || "";
    if (!t) { const td = el.closest("td"), tb = td && td.closest("table"); const th = tb && tb.tHead && tb.tHead.rows[0] && tb.tHead.rows[0].cells[td.cellIndex]; if (th) t = th.textContent.trim(); }
    if (!t) t = el.title || "";
    if (t) el.setAttribute("aria-label", t.slice(0, 80));
  });
}
let NAME_PENDING = false;
if (typeof document !== "undefined" && typeof MutationObserver !== "undefined") {
  const run = () => { NAME_PENDING = false; try { nameControls(); } catch (e) {} };
  const later = () => { if (!NAME_PENDING) { NAME_PENDING = true; (window.requestAnimationFrame || setTimeout)(run); } };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", later); else later();
  new MutationObserver(later).observe(document.documentElement, { childList: true, subtree: true });
}

// ===== و1: خانات التاريخ واختيار الملف بشكل البوابة، مش بلغة الجهاز =====
// المتصفح بيعرض <input type=date> بلغة الجهاز («11/24/2026») واختيار الملف «Choose File / No file chosen».
// الخانة نفسها مابتتغيرش (نفس الـ id ونفس التقويم بتاع الموبايل ونفس القيمة 2026-11-24 اللي الكود بيقراها):
// النص الأصلي بيتخفى، ومكانه صورة صغيرة (SVG) جوه الخانة فيها «24-11-2026» أو «11-2026» أو اسم الملف بالعربي.
// على الكمبيوتر: الضغط على الخانة بيفتح التقويم، ولو حد بدأ يكتب التاريخ بالكيبورد بيظهر النص الأصلي لحد ما يخرج من الخانة.
const TV_TYPES = new Set(["date", "month", "file"]);
const tvOn = el => el instanceof HTMLInputElement && TV_TYPES.has(el.type);   // el.type مش الـ attribute: month على فايرفوكس = text
const xmlEsc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
function tvText(el) {
  if (el.type === "file") {
    const fs = el.files ? [...el.files] : [];
    if (!fs.length) return { t: el.webkitdirectory ? "اضغط هنا واختار الفولدر" : el.multiple ? "اضغط هنا واختار الملفات" : "اضغط هنا واختار الملف", muted: true, rtl: true };
    if (fs.length > 1) return { t: "اتختار " + cnt(fs.length, "ملف"), rtl: true };
    let n = fs[0].name;
    if (n.length > 44) n = n.slice(0, 20) + "…" + n.slice(-20);
    // اسم عربي فيه أرقام وامتداد: الجزء الإنجليزي (2026.xlsx) معزول، وإلا بيتقلب «xlsx.2026»
    if (/[\u0600-\u06FF]/.test(n)) return { t: n.replace(/[A-Za-z0-9][\w.()\- ]*[\w)]|[A-Za-z0-9]/g, m => "\u2066" + m + "\u2069"), rtl: true };
    return { t: n };
  }
  const v = el.value;
  if (!v) return { t: el.type === "month" ? "اختار الشهر" : "اختار اليوم", muted: true, rtl: true };
  const m = el.type === "month" ? /^(\d{4})-(\d{2})$/.exec(v) : /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return null;
  return { t: el.type === "month" ? m[2] + "-" + m[1] : m[3] + "-" + m[2] + "-" + m[1] };
}
function tvPaint(el) {
  if (!tvOn(el)) return;
  const r = tvText(el), key = r ? r.t + "|" + (r.muted ? 1 : 0) : "";
  if (el.__tv === key) return;
  el.__tv = key;
  if (!r) { el.classList.remove("tv"); return; }   // قيمة غريبة: النص الأصلي زي ما هو
  const cs = getComputedStyle(el), fs = parseFloat(cs.fontSize) || 14, h = Math.ceil(fs * 1.7), w = 900;
  // كروم بيرسم خانة التاريخ من الشمال لليمين حتى في صفحة عربي (التاريخ شمال وأيقونة التقويم يمين)، فالنص بيتحط شمال.
  // خانة الملف بتمشي مع الصفحة (يمين).
  const left = el.type !== "file", side = left ? "left" : "right";
  const x = left ? 1 : w - 1, anchor = left === !r.rtl ? "start" : "end";
  const txt = `<text x="${x}" y="${h / 2}" direction="${r.rtl ? "rtl" : "ltr"}" text-anchor="${anchor}"`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${txt} dominant-baseline="central" font-family="IBM Plex Sans Arabic,Segoe UI,Tahoma,Arial,sans-serif" font-size="${fs}" fill="${r.muted ? "#8a8f98" : "#1d2024"}">${xmlEsc(r.t)}</text></svg>`;
  el.style.setProperty("--tv-img", `url("data:image/svg+xml,${encodeURIComponent(svg)}")`);
  el.style.setProperty("--tv-pos", side + " " + (parseFloat(left ? cs.paddingLeft : cs.paddingRight) || 10) + "px center");
  el.classList.add("tv");
}
function tvScan() {
  document.querySelectorAll("input[type=date],input[type=month],input[type=file]").forEach(tvPaint);
  // و11: جدول بيتسحب (.tbl) يتوصله بالكيبورد (Tab وبعدين الأسهم)، وقارئ الشاشة يقول اسمه
  document.querySelectorAll(".tbl:not([tabindex])").forEach(el => {
    if (el.scrollWidth <= el.clientWidth + 1 && el.scrollHeight <= el.clientHeight + 1) return;
    el.tabIndex = 0;
    el.setAttribute("role", "region");
    if (!el.hasAttribute("aria-label")) {
      const h = el.closest(".card,section,details")?.querySelector("h2,h3,summary");
      el.setAttribute("aria-label", ((h && h.textContent.trim()) || "جدول").slice(0, 60));
    }
  });
}
if (typeof document !== "undefined" && typeof MutationObserver !== "undefined" && typeof HTMLInputElement !== "undefined") {
  const s = document.createElement("style");
  s.textContent = `
input.tv{background-image:var(--tv-img)!important;background-repeat:no-repeat!important;background-position:var(--tv-pos)!important;color:transparent!important;}
input.tv.tv-edit{background-image:none!important;color:inherit!important;}
input.tv[type=file]::file-selector-button{display:none;}
input.tv[type=file]{cursor:pointer;min-height:44px;}`;
  document.head.appendChild(s);
  // سطر لوحده: المتصفح اللي مايعرفش ::-webkit-datetime-edit بيتجاهل القاعدة كلها
  const s2 = document.createElement("style");
  s2.textContent = `input.tv:not(.tv-edit)::-webkit-datetime-edit{opacity:0;}`;
  document.head.appendChild(s2);
  // القيمة اللي الكود بيحطها (el.value = "2026-11-24" أو el.value = "" بعد الرفع) مابتطلعش event، فبنلقطها هنا
  const pv = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
  if (pv && pv.set && pv.configurable) {
    Object.defineProperty(HTMLInputElement.prototype, "value", {
      ...pv,
      set(v) { pv.set.call(this, v); if (this.__tv !== undefined || tvOn(this)) tvPaint(this); }
    });
  }
  document.addEventListener("input", e => tvPaint(e.target), true);
  document.addEventListener("change", e => tvPaint(e.target), true);
  document.addEventListener("keydown", e => {
    const el = e.target;
    if (tvOn(el) && el.type !== "file" && e.key.length === 1) el.classList.add("tv-edit");   // بيكتب التاريخ بإيده
  }, true);
  document.addEventListener("focusout", e => { const el = e.target; if (tvOn(el)) { el.classList.remove("tv-edit"); el.__tv = null; tvPaint(el); } }, true);
  const fine = window.matchMedia && window.matchMedia("(pointer:fine)").matches;
  document.addEventListener("click", e => {
    const el = e.target;
    if (fine && tvOn(el) && el.type !== "file" && !el.disabled && !el.readOnly && typeof el.showPicker === "function") { try { el.showPicker(); } catch (x) {} }
  }, true);
  let pend = false;
  const later = () => { if (!pend) { pend = true; (window.requestAnimationFrame || setTimeout)(() => { pend = false; try { tvScan(); } catch (x) {} }); } };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", later); else later();
  // class / hidden / open كمان: جدول كان مستخبى وبان (تاب أو كارت اتفتح)
  new MutationObserver(later).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "hidden", "open"] });
}
export const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// ===== الدخول والخروج لصفحات الإدارة (ت4) =====
// كل صفحة إدارة فيها نفس الفورم: l-email / l-pass / l-btn / l-err، وزرارين خروج: logout و d-out (شاشة «مش مسموح»).
// صفحة العامل (index.html) ليها دخول مختلف (الكود والرقم القومي) فمش بتستخدم دول.
const LOGIN_ERR = {
  "auth/network-request-failed": "مفيش اتصال بالنت — اتأكد من النت وجرّب تاني",
  "auth/too-many-requests": "محاولات كتير غلط — استنى شوية وجرّب تاني",
  "auth/user-disabled": "الحساب ده متوقف — كلّم الإدارة",
};
export async function staffLogin(email, pass) {
  await signInWithEmailAndPassword(auth, String(email || "").trim(), pass);
}
// الخروج: نسخة السجل من المتصفح بتتمسح الأول (حتى لو الخروج اتأخر أو النت فاصل)، وبعدين الصفحة بتتحمّل من جديد
export function staffLogout() {
  purgeSijilCache();
  return signOut(auth).catch(() => {}).finally(() => location.reload());
}
export function wireStaffLogin() {
  const $ = id => document.getElementById(id);
  const err = $("l-err");
  $("l-btn")?.addEventListener("click", async () => {
    if (err) { err.className = "msg"; err.textContent = ""; }
    try { await staffLogin($("l-email").value, $("l-pass").value); }
    catch (e) { if (err) { err.className = "msg show err"; err.textContent = LOGIN_ERR[e?.code] || "الإيميل أو الباسورد غلط"; } }
  });
  ["logout", "d-out"].forEach(id => $(id)?.addEventListener("click", staffLogout));
}

// ===== فورم الدخول (l-form) =====
// Enter في الإيميل أو الباسورد بيدوس «دخول» لوحده (زرار submit)، والفورم نفسه مايعملش تحديث للصفحة
document.addEventListener("submit", e => { if (e.target?.id === "l-form") e.preventDefault(); });

// ===== شاشة التحميل =====
// كل صفحة فيها <div id="boot"> (لوجو + «جاري التحميل…») ظاهر من الـ HTML نفسه، عشان المستخدم مايشوفش صفحة فاضية
// لحد ما Firebase يتحمّل. بيستخبى لوحده بالـ CSS أول ما الدخول أو الصفحة يظهروا، وهنا احتياطي للمتصفحات القديمة.
onAuthStateChanged(auth, () => { setTimeout(() => document.getElementById("boot")?.remove(), 0); });

// نسخة السجل المحفوظة في المتصفح (page-sijil.js — أرقام قومية وتليفونات وأرقام تأمين) بتتمسح أول ما الحساب يخرج،
// من أى صفحة وفي أى تاب، مش من صفحة السجل بس. قبل كده الخروج من صفحة تانية كان بيسيبها على الجهاز لحد 7 أيام.
function purgeSijilCache() {
  try { Object.keys(localStorage).filter(k => k.startsWith("sijil_v1")).forEach(k => localStorage.removeItem(k)); } catch (e) {}
}
onAuthStateChanged(auth, user => { if (!user) purgeSijilCache(); });

// علامة إن كود الصفحة اتحمّل كامل (sentry.js بيشيّك عليها: لو مش موجودة بعد تحميل الصفحة يبقى الكود ماتحملش ويظهر شريط «تحديث»)
window.__portalReady = true;

// جرس الإشعارات (notify.js): بيظهر لوحده في كل الصفحات لحسابات الإدارة والمشرفين، ومش بيظهر للعمال.
// بيتحمّل لوحده بـ import() — لو فيه مشكلة فيه، الجرس بس اللي يختفي والبوابة تفضل شغالة
if (FIRST_COPY) import('./notify.js?v=20261125f').then(m => m.initBell(auth, db, SUP_SITES)).catch(e => console.warn("bell:", e));
