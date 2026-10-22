// shared.js — الحاجات المشتركة بين صفحات البوابة، في مكان واحد بدل ما تبقى متكررة في كل صفحة.
// أي موقع جديد أو تغيير في الإعدادات يتعمل هنا مرة واحدة.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getFirestore, collection, doc, getDoc, getDocs, query, where } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app-check.js';

// ===== Firebase =====
export const firebaseConfig = {
  apiKey: "AIzaSyBscBbgFrEd76NjDgNPpymF1nmlvlpprdg",
  authDomain: "theama-salaries.firebaseapp.com",
  projectId: "theama-salaries",
  storageBucket: "theama-salaries.firebasestorage.app",
  messagingSenderId: "469549638177",
  appId: "1:469549638177:web:4e5c1d4c055108312cb960"
};
export const app = initializeApp(firebaseConfig);
// App Check: كل طلب لـ Firebase بيتبعت معاه إثبات (reCAPTCHA في الخلفية) إنه جاي من صفحات البوابة نفسها،
// عشان السكريبتات والبوتات اللي بتستخدم المفتاح من برّه تترفض. لازم يتعمل قبل أي استخدام لـ Firestore أو Auth.
// المفتاح مش سري (بيتشاف في أي صفحة). الدومينات المسموحة متحددة في إعدادات المفتاح على Google Cloud.
export const APP_CHECK_KEY = "6LeFr_YtAAAAADMBkt1vAf8bqyUJARWtAgaoogfP";
export const appCheck = initializeAppCheck(app, {
  provider: new ReCaptchaEnterpriseProvider(APP_CHECK_KEY),
  isTokenAutoRefreshEnabled: true
});
export const db = getFirestore(app);
export const auth = getAuth(app);

// ===== المواقع =====
// مواقع بوابة الحضور (كشوف مصورة) — لازم تفضل نفس القايمة اللي في firestore.rules (attSites) و worker.py (ATT_SITES)
export const ATT_SITES = ["فرع العامرية", "فرع العجمى", "مصنع العامرية", "دمنهور", "كفر الدوار", "المنصورة", "فرع طنطا", "طنطا مصنع"];
// المواقع اللي حضورها بيترفع إكسيل (upload.html) — للمكتب بس حالياً
// مواقع ليها حسابات مشرفين منفصلة = مواقع الحضور + مواقع شيبسي والإمداد دي (حضورها إكسيل، والمشرف ليه الطلبات والبطايق والكشف بس)
// لازم تفضل نفس القايمة اللي في firestore.rules (supSites) و worker.py (SUP_SITES)
export const XL_SUP_SITES = ["قطامية", "ابوصير", "العامرية امداد", "اكتوبر امداد", "مدينة نصر امداد", "طنطا امداد"];
export const SUP_SITES = [...ATT_SITES, ...XL_SUP_SITES];
export const XL_SITES = ["قطامية", "ابوصير", "العامرية امداد", "اكتوبر امداد", "مدينة نصر امداد", "طنطا امداد", "الشرقية للدخان"];
// المديرين الإقليميين: مش مكتوبين هنا (الريبو Public) — في firestore.rules (isRegional) وفي Firestore (config/regionals)

// ===== أزرار التنقل بين الصفحات =====
// كل صفحة فيها <nav id="pnav"></nav> بس، والأزرار بتترسم هنا حسب دور الحساب.
// الزرار بيظهر بس لو الصفحة نفسها بتسمح للدور ده (نفس الشروط اللي في كل صفحة، والـ Rules هي الحماية الحقيقية).
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
};
export const NAV_PAGES = [
  { href: "attendance.html", label: "تسجيل الحضور اليومي",  icon: "camera", can: c => c.role === "admin" || (c.role === "supervisor" && hasSites(c)) },
  { href: "report.html",     label: "تقارير الحضور",        icon: "chart",  can: c => OFFICE.includes(c.role) || (c.role === "supervisor" && hasSites(c)) },
  { href: "plan.html",       label: "الاحتياج والأعداد",     icon: "list",   can: c => OFFICE.includes(c.role) },
  { href: "hr.html",         label: "اعتماد الحالات",        icon: "check",  can: c => ["admin", "hr", "viewer"].includes(c.role) },
  { href: "upload.html",     label: "رفع حضور إكسيل",       icon: "upload", can: c => c.role === "admin" },
  { href: "index.html",      label: "البوابة",               icon: "home",   can: c => !!c.role && c.role !== "employee" },
];

// شكل الأزرار: مربعات صغيرة، الأيقونة فوق والاسم تحتها (زي شاشة التطبيقات). على الموبايل 3 في السطر.
function navStyle() {
  if (document.getElementById("pnav-style")) return;
  const s = document.createElement("style");
  s.id = "pnav-style";
  s.textContent = `
    .pnav{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 12px;}
    .pnav:empty{display:none;}
    .pnav a{display:flex;flex-direction:column;align-items:center;gap:3px;width:92px;padding:7px 4px 6px;
      border:1px solid #ebe5e3;border-radius:12px;background:#fff;color:#6b625e;font-size:11px;font-weight:500;
      line-height:1.25;text-align:center;text-decoration:none;flex:0 0 auto;}
    .pnav a:hover{background:#fbf6f5;}
    .pnav a svg{width:20px;height:20px;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;
      stroke-linejoin:round;color:#c0392b;}
    .pnav a.on{background:#c0392b;border-color:#c0392b;color:#fff;cursor:default;}
    .pnav a.on svg{color:#fff;}
    @media (max-width:520px){.pnav{display:grid;grid-template-columns:repeat(3,1fr);}.pnav a{width:auto;}}
    @media print{.pnav{display:none !important;}}`;
  document.head.appendChild(s);
}

export function renderNav(el, claims) {
  if (!el) return;
  el.innerHTML = "";
  if (!claims || !claims.role) return;
  const here = (location.pathname.split("/").pop() || "index.html").toLowerCase();
  const pages = NAV_PAGES.filter(p => p.can(claims));
  if (pages.length < 2) return;   // صفحة واحدة بس (زي الحساب المشترك) = مفيش داعي لأزرار
  navStyle();
  for (const p of pages) {
    const a = document.createElement("a");
    a.href = p.href;
    a.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">' + ICON[p.icon] + "</svg>";
    a.appendChild(document.createTextNode(p.label));
    if (p.href === here) { a.className = "on"; a.setAttribute("aria-current", "page"); }
    el.appendChild(a);
  }
}

// ===== اسم اللي عمل التعديل =====
// أي حاجة بيعملها حساب أدمن بتتسجل «ادمن» بدل الإيميل، عشان الإيميل مايظهرش لحد في السجلات.
let ACTOR_ROLE = null;
onAuthStateChanged(auth, async user => {
  ACTOR_ROLE = null;
  if (!user) return;
  try { ACTOR_ROLE = (await user.getIdTokenResult()).claims.role || ""; } catch (e) { ACTOR_ROLE = ""; }
});
export const actorEmail = u => ACTOR_ROLE === "admin" ? "ادمن" : (u?.email || "");

// بترسم الأزرار لوحدها في أي صفحة فيها <nav id="pnav"> بعد الدخول، وبتشيلها بعد الخروج
onAuthStateChanged(auth, async user => {
  const el = document.getElementById("pnav");
  if (!el) return;
  if (!user) { el.innerHTML = ""; return; }
  let claims = {};
  try { claims = (await user.getIdTokenResult()).claims || {}; } catch (e) {}
  renderNav(el, claims);
});

// ===== المخطط (شيت احتياج بيبسي) =====
const pnorm = s => String(s ?? "").replace(/\s+/g, " ").trim();
const pkey = s => pnorm(s).toLowerCase();
const ckey = (loc, pos) => pnorm(loc) + "|" + pkey(pos);

// بيانات المخطط الساري لشهر: آخر شيت متسجل لحد الشهر ده + تعديلاته + جدول المطابقة.
// بيرجّع null لو مفيش شيت أو مفيش إعدادات.
export async function fetchPlanBase(month) {
  const plans = await getDocs(collection(db, "plans"));
  let pm = null, plan = null;
  plans.forEach(d => { if (d.id <= month && (!pm || d.id > pm)) { pm = d.id; plan = d.data(); } });
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
  const add = (site, job, n) => { if (!site) return; (out[site] ??= {})[job] = (out[site][job] || 0) + n; };
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
