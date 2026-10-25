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
  { href: "attendance.html", label: "تسجيل الحضور اليومي",  icon: "camera", can: c => ["admin", "hr", "accountant"].includes(c.role) || (c.role === "supervisor" && hasSites(c)) },
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
    .pnav{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 12px;}
    .pnav:empty{display:none;}
    .pnav a{display:flex;flex-direction:column;align-items:center;gap:6px;width:96px;padding:12px 4px 10px;
      border:0;border-radius:16px;background:#fff;color:#1d2024;font-size:12.5px;font-weight:500;
      line-height:1.25;text-align:center;text-decoration:none;flex:0 0 auto;}
    .pnav a:hover{background:#fbeceb;}
    .pnav a svg{width:24px;height:24px;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;
      stroke-linejoin:round;color:#a61b12;}
    .pnav a.on{background:#a61b12;border-color:#a61b12;color:#fff;cursor:default;}
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
  if (!user) { window.sentryRole?.("none"); return; }
  try { ACTOR_ROLE = (await user.getIdTokenResult()).claims.role || ""; } catch (e) { ACTOR_ROLE = ""; }
  window.sentryRole?.(ACTOR_ROLE);
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

// ===== ساعات الحضور والانصراف (مصنع العامرية وفرع العجمى وطنطا مصنع) =====
// المشرف بيكتب الوقت بإيده من غير صبح/مسا: البوابة بتخمّن من بدايات الورديات المعروفة (جدول Code&time PCE)
// والمشرف بيصحح. الحساب بالدقيقة من غير تقريب.
export const TIME_SITES = ["مصنع العامرية", "فرع العجمى", "طنطا مصنع"];
const SHIFT_STARTS = [6, 7, 8, 9, 20, 22].map(h => h * 60);   // نهار 6/7/8/9، ليل 20/22
export const isHelperJob = job => /مساعد بيع/.test(String(job || ""));   // حضور بس: 8 ساعات ثابتة من غير إضافي
export const toMin = s => { const m = /^(\d{1,2})(?::(\d{2}))?$/.exec(String(s || "").trim()); return m && +m[1] <= 24 && +(m[2] || 0) < 60 ? (+m[1] % 24) * 60 + +(m[2] || 0) : null; };
export const hhmm = m => m == null ? "" : String(Math.floor(((m % 1440) + 1440) % 1440 / 60)).padStart(2, "0") + ":" + String(((m % 60) + 60) % 60).padStart(2, "0");
const near = t => Math.min(...SHIFT_STARTS.map(s => { const d = Math.abs(t - s) % 1440; return Math.min(d, 1440 - d); }));
// الساعة المكتوبة (1–12) ممكن تبقى صبح أو مسا
const cands = v => { const t = toMin(v); if (t == null) return [null]; const h = Math.floor(t / 60);
  return h >= 13 || h === 0 ? [t] : h === 12 ? [t, t - 720] : [t, t + 720]; };
// بيرجّع { in, out, unsure }: unsure = الصبح والمسا محتملين بنفس الدرجة (زي 8 → 8)، والمشرف لازم يأكد
// prevIn = وقت حضور نفس العامل في اليوم اللي قبله (لو متأكد): لو الصبح والمسا محتملين، بناخد الأقرب لامبارح
export function guessTimes(tin, tout, dayOnly = false, prevIn = null) {
  const best = [];
  // مساعد البيع شغله نهار بس
  for (const i of cands(tin).filter(x => !dayOnly || x == null || (x >= 300 && x < 1080))) for (const o of cands(tout)) {
    if (i == null && o == null) continue;
    let score;
    if (i == null) score = 500;                              // من غير حضور: الانصراف لوحده مش كفاية
    else if (o == null) score = near(i);
    else { const d = (o - i + 1440) % 1440; score = near(i) + (d >= 240 && d <= 960 ? 0 : 10000); }
    best.push({ in: i, out: o, score });
  }
  if (!best.length) return { in: "", out: "", unsure: false };
  best.sort((a, b) => a.score - b.score);
  let b = best[0], rival = best.find(x => x.in !== b.in && x.score - b.score < 30);
  const p = toMin(prevIn);
  if (rival && p != null && b.in != null && rival.in != null) {
    const dist = t => { const d = Math.abs(t - p) % 1440; return Math.min(d, 1440 - d); };
    if (dist(rival.in) < dist(b.in)) b = rival;
    return { in: hhmm(b.in), out: hhmm(b.out), unsure: false, prev: true };
  }
  // وكمان لو الحضور بعيد ساعة أو أكتر عن أي وردية معروفة
  return { in: hhmm(b.in), out: hhmm(b.out), unsure: !!rival || (b.in != null && b.score >= 60) };
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

// ===== الوضع الطولي على الموبايل =====
// manifest.json فيه "portrait"، بس أندرويد بيطبقه وقت التثبيت أو لما يحدّث البوابة المثبتة.
// هنا بنحاول نقفل الشاشة طولي، ولو منفعش بتظهر رسالة «لف الموبايل» لما الموبايل يبقى بالعرض.
// الكشف المطبوع وشاشة المعاينة مش متأثرين، لأن الرسالة بتظهر بس على الموبايلات (شاشة لمس وارتفاع صغير).
(() => {
  try { screen.orientation?.lock?.("portrait").catch(() => {}); } catch (e) {}
  if (document.getElementById("rot-msg")) return;
  const st = document.createElement("style");
  st.textContent = `#rot-msg{display:none;position:fixed;inset:0;z-index:5000;background:#a61b12;color:#fff;
    flex-direction:column;align-items:center;justify-content:center;gap:12px;text-align:center;direction:rtl;
    font-family:'IBM Plex Sans Arabic','Segoe UI',Tahoma,sans-serif;font-size:18px;padding:20px;}
  #rot-msg i{font-size:46px;}
  @media (orientation:landscape) and (max-height:500px) and (pointer:coarse){#rot-msg{display:flex;}body{overflow:hidden;}}
  @media print{#rot-msg{display:none !important;}}`;
  document.head.appendChild(st);
  const add = () => {
    const d = document.createElement("div");
    d.id = "rot-msg";
    d.innerHTML = `<i class="ti ti-device-mobile-rotated"></i><b>لف الموبايل</b><span style="font-size:14px;opacity:.85">البوابة بتشتغل والموبايل واقف (طولي)</span>`;
    document.body.appendChild(d);
  };
  document.body ? add() : document.addEventListener("DOMContentLoaded", add);
})();
