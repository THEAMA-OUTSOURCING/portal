// page-plan.js — سكريبت صفحة plan.html (اتنقل من جوه الصفحة لملف لوحده عشان الـ CSP تمنع أي سكريبت مكتوب جوه الـ HTML)
import { getFirestore, collection, getDocs, addDoc, doc, query, where, setDoc, getDoc, deleteDoc, updateDoc, writeBatch, serverTimestamp, onSnapshot } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { db, auth, actorEmail, ATT_SITES, SUP_SITES, JC_DOC, fetchPlanBase, planBySite, enDigits, ask, askText, tell } from './shared.js?v=20261104e';
import { bellStaff, bellLabel, sendPersonal } from './notify.js?v=20261104e';
import { CHIPSY_SITE_PLAN } from './xl-attendance.js?v=20261104e';
import { keyOf, splitJob } from './sheet.js?v=20261104e';


// ===== الإعدادات المبدئية (من مطابقة أكتوبر 2026) =====
const DEFAULT_SETTINGS = {
  locMap: {
    "Agamy DC Bev-EGY": "فرع العجمى", "Amreya DC Bev-EGY": "فرع العامرية", "Amreya Plant Bev-EGY": "مصنع العامرية",
    "Damanhor DC Bev-EGY": "دمنهور", "Kafr Eldawar DC Bev-EGY": "كفر الدوار", "Mansoura DC Bev-EGY": "المنصورة",
    "Tanta DC Bev-EGY": "فرع طنطا", "Tanta Plant Bev-EGY": "طنطا مصنع", "Nasr City Plant Bev-EGY": "مدينة نصر امداد",
    "October Plant Bev-EGY": "اكتوبر امداد"
  },
  posMap: {
    "helper": "مساعد بيع", "loading labor": "عامل تحميل ليلي", "loading driver": "سائق تحميل ليلي",
    "forklift driver": "سائق ونش", "labor": "عامل", "ld&t deployment helper": "مساعد امداد",
    "ld&t coordinator": "منسق ساحة امداد", "purchasing driver": "سائق مشتريات", "deployment driver": "سائق شحن امداد",
    "merchandiser": "مروج"
  },
  overrides: [
    { loc: "Amreya Plant Bev-EGY", pos: "ld&t deployment helper", site: "العامرية امداد" },
    { loc: "Amreya Plant Bev-EGY", pos: "ld&t coordinator", site: "العامرية امداد" },
    { loc: "Tanta Plant Bev-EGY", pos: "ld&t deployment helper", site: "طنطا امداد" },
    { loc: "Tanta Plant Bev-EGY", pos: "ld&t coordinator", site: "طنطا امداد" }
  ],
  splits: [
    { loc: "October Plant Bev-EGY", pos: "ld&t deployment helper", parts: [{ site: "اكتوبر امداد", count: 58 }, { site: "مدينة نصر امداد", count: 35 }] }
  ]
};
// "الموجود" = الأساسي بس من كشف البورتال الحالي (rosters/{موقع}) — الكشف ده أصلاً من غير اللي اتشالوا
// (استقالة / انقطاع / فصل / نقل) ومن غير اللي اتعلّم عليهم «مشي».
// الباقي (جداد بالبطاقة لسه مستنيين HR، يوميات وبدايل راحات) بيتعرض في عمود لوحده ومش بيتحسب.
const COUNTED_TYPES = ["اساسي", "أساسي"];
const EXCLUDED_JOB = /مشرف|اقليمي|إقليمي/;

// ===== مساعدات =====
const $ = id => document.getElementById(id);
const norm = s => String(s ?? "").replace(/\s+/g, " ").trim();
const nkey = s => norm(s).toLowerCase();
const short = loc => norm(loc).replace(/\s*Bev-EGY$/i, "");
const fmt = n => Number(n || 0).toLocaleString("ar-EG");
const sign = n => (n > 0 ? "+" : n < 0 ? "−" : "") + fmt(Math.abs(n));
const cls = d => d < 0 ? "s" : d > 0 ? "o" : "k";
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const ckey = (loc, pos) => norm(loc) + "|" + nkey(pos);
function show(el, type, text) { el.className = "msg show " + type; el.textContent = text; }
function hide(el) { el.className = "msg"; el.textContent = ""; }
function monthLabel(m) { const [y, mm] = m.split("-").map(Number); return new Date(y, mm - 1, 1).toLocaleDateString("ar-EG", { month: "long", year: "numeric" }); }
function monthEnd(m) { const [y, mm] = m.split("-").map(Number); return m + "-" + String(new Date(y, mm, 0).getDate()).padStart(2, "0"); }
function thisMonth() { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"); }
function today() { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }

// ===== الحالة =====
const S = { month: thisMonth(), plans: {}, settings: null, amends: [], prevAmends: [], summary: null, summaryMonth: null };

// ===== الدخول =====
$("l-btn").addEventListener("click", async () => {
  hide($("l-err"));
  try { await signInWithEmailAndPassword(auth, $("l-email").value.trim(), $("l-pass").value); }
  catch (e) { show($("l-err"), "err", "الإيميل أو الباسورد غلط"); }
});
// Enter في الباسورد = «دخول» (فورم الدخول بيدوس الزرار لوحده)
$("logout").addEventListener("click", () => signOut(auth).finally(() => location.reload()));
$("d-out").addEventListener("click", () => signOut(auth).finally(() => location.reload()));

onAuthStateChanged(auth, async user => {
  ["login", "denied", "app"].forEach(id => $(id).classList.add("hidden"));
  if (!user) { $("login").classList.remove("hidden"); return; }
  let role = null, claims = {};
  try { claims = (await user.getIdTokenResult()).claims || {}; role = claims.role || null; } catch (e) {}
  if (!["admin", "hr", "accountant", "viewer"].includes(role)) { $("denied").classList.remove("hidden"); return; }
  S.role = role;
  // HR أو محاسب ليه فروع: بيانات العمال لفروعه بس
  S.scoped = ["hr", "accountant"].includes(role) && Array.isArray(claims.sites) && claims.sites.length ? claims.sites : null;
  W_SITES = S.scoped ? SUP_SITES.filter(s => S.scoped.includes(s)) : [...SUP_SITES, SHARQIA_SITE];   // من جديد مع كل دخول (لو حساب تاني دخل من نفس الصفحة)
  document.body.classList.toggle("view-only", role === "viewer");
  document.querySelectorAll(".admin-only").forEach(el => el.classList.toggle("hidden", role !== "admin"));
  $("who").textContent = (user.email || "") + " — " + ({ admin: "أدمن", hr: "HR", accountant: "محاسب", viewer: "مشاهد (عرض بس)" }[role]);
  $("app").classList.remove("hidden");
  await loadAll();
  if (role === "admin") { await loadAdminConfig(); initAccounts(); loadJobCodes(); }
  initWorkers();
  initCoded();
  initBlacklist();
  initCards();
});

// ===== التبويبات =====
document.querySelectorAll(".tab").forEach(t => t.addEventListener("click", () => {
  document.querySelectorAll(".tab").forEach(x => x.setAttribute("aria-selected", x === t));
  document.querySelectorAll("[data-panel]").forEach(p => p.classList.toggle("hidden", p.dataset.panel !== t.dataset.tab));
}));

// ===== التحميل =====
async function loadAll() {
  const [plansSnap, setSnap] = await Promise.all([getDocs(collection(db, "plans")), getDoc(doc(db, "plan_settings", "mapping"))]);
  S.plans = {}; plansSnap.forEach(d => S.plans[d.id] = d.data());
  S.settings = setSnap.exists() ? setSnap.data() : null;
  const months = Object.keys(S.plans).sort().reverse();
  if (!months.includes(S.month) && months.length) S.month = months.find(m => m <= thisMonth()) || months[0];   // مش شهر جاي اترفع بدري
  const sel = $("month");
  const opts = [...new Set([S.month, thisMonth(), ...months])].sort().reverse();
  sel.innerHTML = opts.map(m => `<option value="${m}">${monthLabel(m)}${S.plans[m] ? "" : " (مفيش شيت)"}</option>`).join("");
  sel.value = S.month;
  renderSettings();
  await loadMonth();
}
$("month").addEventListener("change", async e => { S.month = e.target.value; await loadMonth(); });

function prevMonthKey(m) { return Object.keys(S.plans).filter(x => x < m).sort().pop() || null; }

async function loadAmends(m) {
  if (!m) return [];
  const snap = await getDocs(query(collection(db, "plan_amendments"), where("month", "==", m)));
  const list = []; snap.forEach(d => list.push({ id: d.id, ...d.data() }));
  return list.sort((a, b) => a.effective_date.localeCompare(b.effective_date) || ((a.created_at?.seconds || 0) - (b.created_at?.seconds || 0)));
}

async function loadMonth() {
  const m = S.month, pm = prevMonthKey(m);
  const [am, pam, sumSnap] = await Promise.all([loadAmends(m), loadAmends(pm), getDoc(doc(db, "headcount_summary", m)), loadRosters()]);
  S.amends = am; S.prevAmends = pam;
  S.summary = null; S.summaryMonth = null;
  if (sumSnap.exists()) { S.summary = sumSnap.data(); S.summaryMonth = m; }
  else {
    const all = await getDocs(collection(db, "headcount_summary"));
    let best = null; all.forEach(d => { if (d.id <= m && (!best || d.id > best.id)) best = { id: d.id, data: d.data() }; });
    if (best) { S.summary = best.data; S.summaryMonth = best.id; }
  }
  const asof = $("asof");
  asof.min = m + "-01"; asof.max = monthEnd(m);
  asof.value = (today() >= asof.min && today() <= asof.max) ? today() : asof.max;
  $("a-date").min = asof.min; $("a-date").max = asof.max; $("a-date").value = asof.value;
  renderDash(); renderAmends(); renderCountsStatus();
}

// ===== الحساب =====
// العدد الساري لكل سطر في شيت العميل (بعد التعديلات) في يوم معين
function clientPlan(m, amends, day) {
  const plan = S.plans[m]; if (!plan) return null;
  const map = new Map();
  plan.rows.forEach(r => {
    const k = ckey(r.loc, r.pos);
    const e = map.get(k) || { loc: norm(r.loc), pos: norm(r.pos), base: 0 };
    e.base += Number(r.hc) || 0; map.set(k, e);
  });
  map.forEach((e, k) => {
    const hits = amends.filter(a => ckey(a.loc, a.pos) === k && a.effective_date <= day);
    e.value = hits.length ? hits[hits.length - 1].to : e.base;
    e.amended = amends.some(a => ckey(a.loc, a.pos) === k);
  });
  return map;
}

// تحويل سطور العميل لمواقع ووظايف الرواتب
function toInternal(cmap) {
  const st = S.settings || { locMap: {}, posMap: {}, overrides: [], splits: [] };
  const targets = new Map(), warnings = [], unmapped = [];
  const add = (site, job, n, base, amended) => {
    const k = site + "|" + job;
    const t = targets.get(k) || { site, job, plan: 0, base: 0, amended: false };
    t.plan += n; t.base += base; t.amended = t.amended || amended; targets.set(k, t);
  };
  cmap.forEach(e => {
    const job = st.posMap[nkey(e.pos)];
    const split = (st.splits || []).find(s => ckey(s.loc, s.pos) === ckey(e.loc, e.pos));
    if (!job) { unmapped.push(`${short(e.loc)} — ${e.pos}`); return; }
    if (split && split.parts?.length) {
      const sum = split.parts.reduce((a, p) => a + Number(p.count || 0), 0);
      if (sum !== e.value) warnings.push(`${short(e.loc)} ${e.pos}: العدد الساري ${e.value} والتوزيع الداخلي مجموعه ${sum}. الفرق اتحسب على "${split.parts[0].site}"، حدّث التوزيع من الإعدادات.`);
      split.parts.forEach((p, i) => {
        const n = Number(p.count || 0) + (i === 0 ? e.value - sum : 0);
        const b = Number(p.count || 0) + (i === 0 ? e.base - sum : 0);
        add(norm(p.site), job, n, b, e.amended);
      });
      return;
    }
    const ov = (st.overrides || []).find(o => ckey(o.loc, o.pos) === ckey(e.loc, e.pos));
    const site = ov ? norm(ov.site) : st.locMap[norm(e.loc)];
    if (!site) { unmapped.push(`${short(e.loc)} — ${e.pos}`); return; }
    add(site, job, e.value, e.base, e.amended);
  });
  return { targets, warnings, unmapped };
}

// كشوف المواقع الحالية + البدلاء — بتتقري مرة مع فتح الشهر (قراءتين لكل موقع)
async function loadRosters() {
  if (S.rosters) return;
  const sites = [...new Set(SUP_SITES)];
  const read = async (col, s) => { try { const d = await getDoc(doc(db, col, s)); return d.exists() ? (d.data().workers || []) : null; } catch (e) { return null; } };
  const order = async s => { try { const d = await getDoc(doc(db, "sheet_order", s)); return d.exists() ? d.data() : null; } catch (e) { return null; } };
  const res = await Promise.all(sites.map(async s => [s, await read("rosters", s), await read("pools", s), await order(s)]));
  S.rosters = {}; S.rosterMissing = [];
  res.forEach(([s, w, p, o]) => { if (w === null) S.rosterMissing.push(s); S.rosters[norm(s)] = { workers: w || [], pool: p || [], order: o }; });
}

// أسماء الكشف ممكن تختلف في الإملاء عن الإعدادات (العجمى/العجمي، أ/ا، ة/ه) — بنوحّد للمطابقة
const akey = s => norm(s).replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه");
function actualMap(targets) {
  const act = new Map(), siteName = {}, jobName = {};
  (targets ? [...targets.values()] : []).forEach(t => { siteName[akey(t.site)] = t.site; jobName[akey(t.job)] = t.job; });
  const put = (rsite, w, counted, sm) => {
    const site = siteName[akey(rsite)] || rsite;
    const job = jobName[akey(w.job)] || norm(w.job); if (!job || EXCLUDED_JOB.test(job)) return;
    const k = site + "|" + job;
    const e = act.get(k) || { site, job, actual: 0, cover: 0, secs: {} };
    if (counted) {
      e.actual++;
      // القسم من «ترتيب الكشف» (sheet_order/{موقع}.sections) — الأساسي بس
      const sec = norm(sm[keyOf(w)] || (w.nid ? sm["N" + w.nid] : "") || "");
      e.secs[sec] = (e.secs[sec] || 0) + 1;
    } else e.cover++;
    act.set(k, e);
  };
  Object.entries(S.rosters || {}).forEach(([site, r]) => {
    const sm = r.order?.sections || {};
    r.workers.forEach(w => put(site, w, COUNTED_TYPES.includes(norm(w.type)), sm));
    r.pool.forEach(w => put(site, w, false, sm));
  });
  return act;
}

// ===== الداشبورد =====
let F = "all", chgOnly = true, DASH = [];
function renderDash() {
  const m = S.month, warn = $("dash-warn"); hide(warn);
  if (!S.plans[m]) {
    $("dash-body").classList.add("hidden"); $("dash-empty").classList.remove("hidden");
    $("dash-empty").innerHTML = `<h2>مفيش شيت احتياج لشهر ${monthLabel(m)}</h2><p class="muted">ارفعه من تبويب "رفع شيت الاحتياج".</p>`;
    return;
  }
  $("dash-body").classList.remove("hidden"); $("dash-empty").classList.add("hidden");
  const day = $("asof").value;
  const cmap = clientPlan(m, S.amends, day);
  const { targets, warnings, unmapped } = toInternal(cmap);
  // شيبسي مالهاش شيت احتياج: المخطط الثابت (HC CFI) من xl-attendance.js
  let chipsyTotal = 0;
  Object.entries(CHIPSY_SITE_PLAN).forEach(([site, jobs]) => Object.entries(jobs).forEach(([job, n]) => {
    const k = site + "|" + job; if (targets.has(k)) return;
    targets.set(k, { site, job, plan: n, base: n, amended: false, fixed: true }); chipsyTotal += n;
  }));
  const act = actualMap(targets);
  const sites = new Set([...targets.values()].map(t => t.site));
  const keys = new Set([...targets.keys(), ...[...act.keys()].filter(k => sites.has(k.split("|")[0]))]);
  DASH = [...keys].map(k => {
    const t = targets.get(k), a = act.get(k);
    const site = (t || a).site, job = (t || a).job;
    return { site, job, plan: t?.plan || 0, base: t?.base || 0, amended: !!t?.amended, fixed: !!t?.fixed, actual: a?.actual || 0, cover: a?.cover || 0,
      secs: secRows(site, job, a?.secs || {}) };
  });
  const msgs = [];
  if (!S.settings) msgs.push("الإعدادات (المطابقة) لسه متحفظتش. افتح تبويب الإعدادات ودوس \"تحميل الإعدادات المبدئية\" ثم \"حفظ\".");
  if (S.rosterMissing?.length) msgs.push("مقدرتش أقرا كشف: " + S.rosterMissing.join("، ") + " — الموجود فيها هيبان صفر.");
  if (unmapped.length) msgs.push("سطور في شيت العميل مش متطابقة مع الرواتب: " + unmapped.join("، ") + ". ضيفها في الإعدادات.");
  msgs.push(...warnings);
  if (msgs.length) show(warn, "warn", msgs.join("\n"));
  warn.style.whiteSpace = "pre-line";
  $("src-note").textContent = "الموجود: الأساسي اللي على كشف البورتال دلوقتي، من غير اللي استقالوا أو انقطعوا أو اتفصلوا أو اتنقلوا.";

  const planned = DASH.filter(r => r.plan > 0);
  const plan = planned.reduce((a, r) => a + r.plan, 0), acts = planned.reduce((a, r) => a + r.actual, 0);
  // الوظيفة المتقسمة: الناقص والزيادة بالقسم (عشان نقص قسم ميتغطاش بزيادة قسم تاني)
  const gaps = r => r.secs ? r.secs.map(x => x.actual - x.need) : [r.actual - r.plan];
  const sh = planned.reduce((a, r) => a + gaps(r).reduce((b, d) => b + Math.max(0, -d), 0), 0);
  const ov = planned.reduce((a, r) => a + gaps(r).reduce((b, d) => b + Math.max(0, d), 0), 0);
  const pm = prevMonthKey(m);
  const prevTotal = pm ? [...clientPlan(pm, S.prevAmends, monthEnd(pm)).values()].reduce((a, e) => a + e.value, 0) : null;
  const curTotal = [...cmap.values()].reduce((a, e) => a + e.value, 0) + chipsyTotal;
  $("kpis").innerHTML = `
    <div class="kpi"><div class="v">${fmt(curTotal)}</div><div class="l">المطلوب الساري (شيت العميل${chipsyTotal ? " + مخطط شيبسي" : ""})</div></div>
    <div class="kpi"><div class="v">${fmt(acts)}</div><div class="l">الموجود في الوظايف المطلوبة</div></div>
    <div class="kpi s"><div class="v">${fmt(sh)}</div><div class="l">أماكن ناقصة</div></div>
    <div class="kpi o"><div class="v">${fmt(ov)}</div><div class="l">زيادة عن المطلوب</div></div>
    <div class="kpi"><div class="v" style="direction:ltr;text-align:right">${prevTotal === null ? "—" : sign(curTotal - prevTotal)}</div><div class="l">التغيير عن ${pm ? monthLabel(pm) : "الشهر اللي فات"}</div></div>`;

  const by = {};
  planned.forEach(r => { by[r.site] = by[r.site] || { plan: 0, actual: 0 }; by[r.site].plan += r.plan; by[r.site].actual += r.actual; });
  const list = Object.entries(by).sort((a, b) => (a[1].actual - a[1].plan) - (b[1].actual - b[1].plan));
  const max = Math.max(1, ...list.map(([, v]) => Math.max(v.plan, v.actual)));
  $("sites").innerHTML = list.map(([s, v]) => {
    const d = v.actual - v.plan, pw = v.plan / max * 100, fw = Math.min(v.actual, v.plan) / max * 100, xw = d > 0 ? d / max * 100 : 0;
    return `<div class="site" tabindex="0" role="button" data-site="${esc(s)}"><div class="nm">${esc(s)}</div>
      <div class="bar"><div class="p" style="width:${pw}%"></div><div class="f" style="width:${fw}%"></div>${xw ? `<div class="x" style="right:${pw}%;width:${xw}%"></div>` : ""}<div class="t">${fmt(v.actual)} من ${fmt(v.plan)}</div></div>
      <div class="gap c-${cls(d)}">${d === 0 ? "مطابق" : sign(d)}</div></div>`;
  }).join("");
  const sel = $("site-sel"), cur = sel.value;
  sel.innerHTML = `<option value="">كل المواقع</option>` + list.map(([s]) => `<option>${esc(s)}</option>`).join("");
  if ([...sel.options].some(o => o.value === cur)) sel.value = cur;
  renderDetail();

  const un = DASH.filter(r => r.plan === 0 && r.actual > 0);
  $("unplanned-card").classList.toggle("hidden", !un.length);
  $("unplanned").textContent = un.map(r => `${r.job} ${r.site} (${fmt(r.actual)})`).join("، ");

  // المقارنة بالشهر اللي فات
  $("prev-label").textContent = pm ? `(${monthLabel(pm)} ← ${monthLabel(m)})` : "(مفيش شهر سابق)";
  const pmap = pm ? clientPlan(pm, S.prevAmends, monthEnd(pm)) : new Map();
  const ks = new Set([...cmap.keys(), ...pmap.keys()]);
  const rows = [...ks].map(k => { const c = cmap.get(k), p = pmap.get(k); const e = c || p; return { loc: short(e.loc), pos: e.pos, prev: p?.value || 0, cur: c?.value || 0 }; })
    .filter(r => !chgOnly || r.prev !== r.cur).sort((a, b) => a.loc.localeCompare(b.loc, "ar"));
  $("months").innerHTML = rows.length ? rows.map(r => { const d = r.cur - r.prev;
    return `<tr><td>${esc(r.loc)}</td><td>${esc(r.pos)}</td><td class="n">${fmt(r.prev)}</td><td class="n">${fmt(r.cur)}</td><td class="n">${d ? `<span class="pill ${d < 0 ? "s" : "o"}">${sign(d)}</span>` : "—"}</td></tr>`; }).join("")
    : `<tr><td colspan="5" class="muted">${pm ? "مفيش تغيير." : "مفيش شهر سابق للمقارنة."}</td></tr>`;
}
// أقسام الوظيفة (لو الموقع متقسم في «ترتيب الكشف»): المطلوب من secNeed «القسم|الوظيفة»، والموجود بالقسم.
// الأساسي اللي ملوش قسم في وظيفة متقسمة بيظهر في سطر «بدون قسم» (مطلوبه صفر) عشان يتحدد قسمه.
function secRows(site, job, secs) {
  const o = S.rosters?.[norm(site)]?.order; if (!o?.secNeed) return null;
  const out = [];
  Object.entries(o.secNeed).forEach(([k, n]) => { const x = splitJob(k); if (akey(x.job) === akey(job)) out.push({ sec: norm(x.sec), need: Number(n) || 0, actual: 0 }); });
  if (!out.length) return null;
  Object.entries(secs).forEach(([sec, c]) => {
    const r = out.find(x => akey(x.sec) === akey(sec));
    if (r) r.actual += c; else { const u = out.find(x => x.sec === (sec || "بدون قسم")) || (out.push({ sec: sec || "بدون قسم", need: 0, actual: 0, none: !sec }), out[out.length - 1]); u.actual += c; }
  });
  const ord = o.secOrder || [];
  const at = s => { const i = ord.indexOf(s); return i < 0 ? 999 : i; };
  return out.sort((a, b) => (!!a.none - !!b.none) || (at(a.sec) - at(b.sec)) || a.sec.localeCompare(b.sec, "ar"));
}
function renderDetail() {
  const site = $("site-sel").value;
  const rows = DASH.filter(r => r.plan > 0 && (!site || r.site === site) && (F === "all" || cls(r.actual - r.plan) === F))
    .sort((a, b) => (a.actual - a.plan) - (b.actual - b.plan));
  $("detail").innerHTML = rows.length ? rows.map(r => { const d = r.actual - r.plan;
    const need = r.secs ? r.secs.reduce((a, x) => a + x.need, 0) : null;
    const main = `<tr${r.secs ? ` class="has-sec"` : ""}><td>${esc(r.site)}</td><td>${esc(r.job)}${r.amended ? `<span class="amd">معدّل</span>` : ""}${r.fixed ? `<span class="amd">مخطط ثابت</span>` : ""}</td>
      <td class="n">${fmt(r.plan)}${r.plan !== r.base ? `<span class="was">${fmt(r.base)}</span>` : ""}</td><td class="n">${fmt(r.actual)}</td>
      <td class="n"><span class="pill ${cls(d)}">${d === 0 ? "مطابق" : sign(d)}</span></td><td class="n">${r.cover ? fmt(r.cover) : "—"}</td></tr>`;
    if (!r.secs) return main;
    const subs = r.secs.map(x => { const sd = x.actual - x.need;
      return `<tr class="sec-row"><td></td><td>▸ ${esc(x.sec)}</td><td class="n">${x.none ? "—" : fmt(x.need)}</td><td class="n">${fmt(x.actual)}</td>
        <td class="n"><span class="pill ${cls(sd)}">${sd === 0 ? "مطابق" : sign(sd)}</span></td><td></td></tr>`; }).join("");
    const warn = need !== r.plan ? `<tr class="sec-row"><td></td><td colspan="5" class="sec-warn">مجموع الأقسام ${fmt(need)} والمطلوب ${fmt(r.plan)} — عدّل أعداد الأقسام من «ترتيب الكشف».</td></tr>` : "";
    return main + subs + warn; }).join("")
    : `<tr><td colspan="6" class="muted">مفيش وظايف بالفلتر ده.</td></tr>`;
}
$("asof").addEventListener("change", renderDash);
$("site-sel").addEventListener("change", renderDetail);
document.querySelectorAll(".chip[data-f]").forEach(b => b.addEventListener("click", () => {
  F = b.dataset.f; document.querySelectorAll(".chip[data-f]").forEach(x => x.setAttribute("aria-pressed", x === b)); renderDetail();
}));
$("chg-only").addEventListener("click", e => { chgOnly = !chgOnly; e.currentTarget.setAttribute("aria-pressed", chgOnly); e.currentTarget.textContent = chgOnly ? "التغييرات بس" : "كل السطور"; renderDash(); });
$("sites").addEventListener("click", e => { const s = e.target.closest(".site"); if (!s) return; $("site-sel").value = s.dataset.site; renderDetail(); $("detail").scrollIntoView({ behavior: "smooth", block: "center" }); });
$("sites").addEventListener("keydown", e => { if ((e.key === "Enter" || e.key === " ") && e.target.classList.contains("site")) { e.preventDefault(); e.target.click(); } });

// ===== إرسال تغييرات الاحتياج على الجرس =====
// كل حساب بيوصله إشعار بمواقعه هو بس (بأسماء المواقع والوظايف اللي على البوابة):
// المشرف موقعه، الإقليمي مواقعه، HR/المحاسب بفروع فروعهم، واللي من غير فروع (HR/محاسب/مشاهد/أدمن تاني) كل المواقع.
// الحساب المشترك (الشرقية) مالوش احتياج، فمش بيوصله. اللي مواقعه ما اتغيرتش مش بيوصله حاجة.
let CHG = null;
const BODY_MAX = 2900;   // الـ Rules: نص الإشعار لحد 3000 حرف
async function siteChanges(m) {
  const pm = prevMonthKey(m);
  if (!pm) throw new Error("مفيش شهر سابق للمقارنة.");
  const [cb, pb] = await Promise.all([fetchPlanBase(m), fetchPlanBase(pm)]);
  if (!cb || !pb) throw new Error("مش قادر أحمّل شيت الاحتياج أو إعدادات الربط.");
  const cur = planBySite(cb, m + "-01"), prev = planBySite(pb, monthEnd(pm));
  const out = {};
  new Set([...Object.keys(cur), ...Object.keys(prev)]).forEach(site => {
    const c = cur[site] || {}, p = prev[site] || {};
    const rows = [...new Set([...Object.keys(c), ...Object.keys(p)])].map(job => ({ job, prev: p[job] || 0, cur: c[job] || 0 }))
      .filter(r => r.prev !== r.cur).sort((a, b) => a.job.localeCompare(b.job, "ar"));
    if (rows.length) out[site] = rows;
  });
  return { pm, out };
}
function siteText(site, rows) {
  return site + "\n" + rows.map(r => { const d = r.cur - r.prev;
    return `• ${r.job}: كان ${r.prev}، بقى ${r.cur} (${d > 0 ? "+" + d : d})`; }).join("\n");
}
// نص الإشعار، ولو طويل يتقسم على كذا إشعار (بالموقع)
function chgMessages(m, sites, out) {
  const head = `الأعداد المطلوبة من 1 ${monthLabel(m)} — الوظايف اللي اتغيرت عن ${monthLabel(prevMonthKey(m))}:`;
  const parts = []; let cur = [];
  sites.forEach(site => {
    const t = siteText(site, out[site]);
    if (cur.length && (head + "\n\n" + [...cur, t].join("\n\n")).length > BODY_MAX) { parts.push(cur); cur = []; }
    cur.push(t);
  });
  if (cur.length) parts.push(cur);
  return parts.map((p, i) => ({ title: `تغيير الأعداد المطلوبة — ${monthLabel(m)}` + (parts.length > 1 ? ` (${i + 1}/${parts.length})` : ""),
    body: (head + "\n\n" + p.join("\n\n")).slice(0, BODY_MAX) }));
}
$("chg-send").addEventListener("click", async () => {
  const box = $("chg-box"), msg = $("chg-msg"), m = S.month;
  box.classList.remove("hidden"); $("chg-preview").innerHTML = ""; $("chg-acts").classList.add("hidden"); CHG = null;
  show(msg, "info", "بجهّز التغييرات...");
  try {
    const { out } = await siteChanges(m);
    const changed = Object.keys(out);
    if (!changed.length) return show(msg, "info", "مفيش تغيير في أي موقع على البوابة.");
    const me = auth.currentUser.uid, items = [], list = [];
    (await bellStaff()).forEach(a => {
      if (a.uid === me) return;
      const own = a.sites || [];
      let mine;
      if (a.role === "supervisor") { if (!own.length) return; mine = changed.filter(s => own.includes(s)); }
      else mine = own.length ? changed.filter(s => own.includes(s)) : changed;
      if (!mine.length) return;
      mine.sort((x, y) => x.localeCompare(y, "ar"));
      const msgs = chgMessages(m, mine, out);
      msgs.forEach(x => items.push({ uid: a.uid, ...x }));
      list.push({ label: bellLabel(a), sites: mine, msgs });
    });
    if (!items.length) return show(msg, "info", "التغييرات في مواقع مالهاش حسابات على البوابة.");
    list.sort((a, b) => a.label.localeCompare(b.label, "ar"));
    CHG = { m, items };
    show(msg, "info", `هيتبعت لـ ${list.length} حساب (${items.length} إشعار). دوس على أي حساب تشوف هيوصله إيه:`);
    $("chg-preview").innerHTML = list.map(x => `<details style="margin:4px 0;"><summary>${esc(x.label)} — ${x.sites.length} موقع</summary>
      ${x.msgs.map(t => `<div style="white-space:pre-wrap;background:#f7f7f7;border-radius:8px;padding:8px;margin-top:6px;"><b>${esc(t.title)}</b>\n${esc(t.body)}</div>`).join("")}</details>`).join("");
    $("chg-acts").classList.remove("hidden");
  } catch (e) { show(msg, "err", e.message || String(e)); }
});
$("chg-cancel").addEventListener("click", () => { CHG = null; $("chg-box").classList.add("hidden"); });
$("chg-go").addEventListener("click", async () => {
  if (!CHG) return;
  if (CHG.m !== S.month) return show($("chg-msg"), "err", "الشهر اتغير — دوس «ابعت التغييرات» تاني.");
  $("chg-go").disabled = true;
  try {
    const n = await sendPersonal(CHG.items);
    show($("chg-msg"), "ok", `اتبعت ${n} إشعار على الجرس. تقدر تتابع مين قرا من الجرس ← «اللي بعته».`);
    $("chg-preview").innerHTML = ""; $("chg-acts").classList.add("hidden"); CHG = null;
  } catch (e) { show($("chg-msg"), "err", e.message || String(e)); }
  $("chg-go").disabled = false;
});

// ===== التعديلات =====
function renderAmends() {
  const m = S.month, plan = S.plans[m];
  const cmap = plan ? clientPlan(m, S.amends, $("asof").value || monthEnd(m)) : new Map();
  $("a-key").innerHTML = [...cmap.entries()].sort((a, b) => short(a[1].loc).localeCompare(short(b[1].loc))).map(([k, e]) =>
    `<option value="${esc(k)}">${esc(short(e.loc))} — ${esc(e.pos)} (الساري: ${e.value})</option>`).join("");
  $("a-save").disabled = !plan;
  const full = plan ? clientPlan(m, [], monthEnd(m)) : new Map();
  $("a-list").innerHTML = S.amends.length ? S.amends.map(a => {
    const b = full.get(ckey(a.loc, a.pos));
    return `<tr><td>${esc(short(a.loc))}</td><td>${esc(a.pos)}</td><td class="n">${b ? fmt(b.base) : "—"}</td><td class="n"><b>${fmt(a.to)}</b></td>
      <td style="direction:ltr;text-align:right">${esc(a.effective_date)}</td><td>${esc(a.reason)}</td><td class="muted">${esc(a.created_email || "")}</td></tr>`; }).join("")
    : `<tr><td colspan="7" class="muted">مفيش تعديلات الشهر ده.</td></tr>`;
}
$("a-save").addEventListener("click", async () => {
  const msg = $("a-msg"); hide(msg);
  const k = $("a-key").value, to = parseInt($("a-to").value, 10), date = $("a-date").value, reason = $("a-reason").value.trim();
  if (!k) return show(msg, "err", "اختار الموقع والوظيفة.");
  if (!Number.isInteger(to) || to < 0) return show(msg, "err", "اكتب العدد الجديد.");
  if (!date || !date.startsWith(S.month)) return show(msg, "err", "التاريخ لازم يكون جوه الشهر المختار.");
  if (!reason) return show(msg, "err", "اكتب السبب أو المرجع، عشان يبان في السجل بعدين.");
  const e = clientPlan(S.month, S.amends, monthEnd(S.month)).get(k);
  if (!await ask(`${short(e.loc)} — ${e.pos}\nمن ${e.value} إلى ${to}، ساري من ${date}.\nالتعديل مش هيتمسح بعد الحفظ. متأكد؟`)) return;
  $("a-save").disabled = true;
  try {
    await addDoc(collection(db, "plan_amendments"), {
      month: S.month, loc: e.loc, pos: e.pos, to, effective_date: date, reason,
      created_by: auth.currentUser.uid, created_email: actorEmail(auth.currentUser), created_at: serverTimestamp()
    });
    $("a-to").value = ""; $("a-reason").value = "";
    S.amends = await loadAmends(S.month);
    renderAmends(); renderDash();
    show(msg, "ok", "اتحفظ التعديل.");
  } catch (err) { show(msg, "err", "ماتحفظش: " + err.message); }
  $("a-save").disabled = false;
});

// ===== رفع الشيت =====
let WB = null, PENDING = null;
$("u-file").addEventListener("change", async e => {
  hide($("u-msg")); $("u-preview").classList.add("hidden"); PENDING = null;
  const f = e.target.files[0]; if (!f) return;
  try {
    WB = XLSX.read(new Uint8Array(await f.arrayBuffer()), { type: "array", cellDates: true });
    $("u-sheet").innerHTML = WB.SheetNames.map(n => `<option>${esc(n)}</option>`).join("");
    $("u-opts").classList.remove("hidden");
    guessMonth();
  } catch (err) { show($("u-msg"), "err", "مش قادر أقرا الملف: " + err.message); }
});
$("u-sheet").addEventListener("change", guessMonth);
function sheetRows(name) {
  const aoa = XLSX.utils.sheet_to_json(WB.Sheets[name], { header: 1, defval: "", raw: true });
  const hi = aoa.findIndex(r => r.some(c => nkey(c) === "work location") && r.some(c => nkey(c) === "position"));
  if (hi < 0) throw new Error("مش لاقي عناوين الأعمدة (Work Location و Position و Planned HC).");
  const H = aoa[hi].map(nkey), col = n => H.findIndex(h => h === n);
  const iL = col("work location"), iP = col("position"), iH = H.findIndex(h => h.startsWith("planned hc")), iM = col("month"),
        iB = col("business category"), iPL = col("production line"), iC = col("cost category");
  if (iH < 0) throw new Error("مش لاقي عمود Planned HC.");
  const rows = []; let month = null;
  for (let i = hi + 1; i < aoa.length; i++) {
    const r = aoa[i], loc = norm(r[iL]), pos = norm(r[iP]), hc = Number(r[iH]);
    if (!loc || !pos || !Number.isFinite(hc) || nkey(loc) === "work location") continue;
    rows.push({ bc: norm(r[iB]), pl: norm(r[iPL]), loc, cc: norm(r[iC]), pos, hc });
    const mv = r[iM];
    if (!month && mv instanceof Date) month = mv.getFullYear() + "-" + String(mv.getMonth() + 1).padStart(2, "0");
  }
  return { rows, month };
}
function guessMonth() {
  try { const { month } = sheetRows($("u-sheet").value); if (month) $("u-month").value = month; } catch (e) {}
}
$("u-read").addEventListener("click", () => {
  hide($("u-msg")); hide($("u-warn"));
  try {
    const { rows } = sheetRows($("u-sheet").value);
    const m = $("u-month").value;
    if (!m) return show($("u-msg"), "err", "اختار الشهر.");
    if (!rows.length) return show($("u-msg"), "err", "الشيت مفيهوش سطور أعداد.");
    PENDING = { month: m, rows, file_name: $("u-file").files[0].name, sheet_name: $("u-sheet").value };
    renderPreview();
  } catch (err) { show($("u-msg"), "err", err.message); }
});
async function renderPreview() {
  const m = PENDING.month, pm = Object.keys(S.plans).filter(x => x < m).sort().pop() || null;
  const pam = pm ? await loadAmends(pm) : [];
  const prev = pm ? clientPlan(pm, pam, monthEnd(pm)) : new Map();
  const cur = new Map();
  PENDING.rows.forEach(r => { const k = ckey(r.loc, r.pos); const e = cur.get(k) || { loc: r.loc, pos: r.pos, value: 0 }; e.value += r.hc; cur.set(k, e); });
  const total = [...cur.values()].reduce((a, e) => a + e.value, 0);
  const ptotal = [...prev.values()].reduce((a, e) => a + e.value, 0);
  $("u-summary").innerHTML = `<b>${monthLabel(m)}</b>: ${fmt(PENDING.rows.length)} سطر، الإجمالي <b>${fmt(total)}</b>` +
    (pm ? ` — آخر رقم ساري في ${monthLabel(pm)}: ${fmt(ptotal)} (<span class="c-${cls(total - ptotal)}">${sign(total - ptotal)}</span>)` : " — مفيش شهر سابق للمقارنة") +
    (S.plans[m] ? `<br><span class="c-s">فيه شيت محفوظ لنفس الشهر، والحفظ هيستبدله. تعديلات الشهر هتفضل سارية.</span>` : "");
  const warns = [];
  pam.forEach(a => { const k = ckey(a.loc, a.pos), c = cur.get(k), lastForKey = pam.filter(x => ckey(x.loc, x.pos) === k).pop();
    if (a === lastForKey && c && c.value !== a.to) warns.push(`${short(a.loc)} ${a.pos}: اتعدّل لـ ${a.to} في ${monthLabel(pm)}، والشيت الجديد فيه ${c.value}. اتأكد أنهي الصح، ولو التعديل لسه ساري اعمله تاني في الشهر الجديد.`); });
  const st = S.settings;
  if (st) cur.forEach(e => { if (!st.posMap[nkey(e.pos)] || (!st.locMap[norm(e.loc)] && !(st.overrides || []).some(o => ckey(o.loc, o.pos) === ckey(e.loc, e.pos)) && !(st.splits || []).some(s => ckey(s.loc, s.pos) === ckey(e.loc, e.pos))))
    warns.push(`${short(e.loc)} — ${e.pos}: مش متطابق مع الرواتب، ضيفه في الإعدادات.`); });
  if (warns.length) { show($("u-warn"), "warn", warns.join("\n")); $("u-warn").style.whiteSpace = "pre-line"; }
  const ks = new Set([...cur.keys(), ...prev.keys()]);
  const rows = [...ks].map(k => { const c = cur.get(k), p = prev.get(k), e = c || p; return { loc: short(e.loc), pos: e.pos, prev: p?.value ?? 0, cur: c?.value ?? 0 }; })
    .sort((a, b) => Math.abs(b.cur - b.prev) - Math.abs(a.cur - a.prev) || a.loc.localeCompare(b.loc, "ar"));
  $("u-table").innerHTML = rows.map(r => { const d = r.cur - r.prev;
    return `<tr><td>${esc(r.loc)}</td><td>${esc(r.pos)}</td><td class="n">${pm ? fmt(r.prev) : "—"}</td><td class="n">${fmt(r.cur)}</td><td class="n">${pm && d ? `<span class="pill ${d < 0 ? "s" : "o"}">${sign(d)}</span>` : "—"}</td></tr>`; }).join("");
  $("u-save").textContent = "حفظ الشيت لشهر " + monthLabel(m);
  $("u-preview").classList.remove("hidden");
}
$("u-cancel").addEventListener("click", () => { PENDING = null; $("u-preview").classList.add("hidden"); });
$("u-save").addEventListener("click", async () => {
  if (!PENDING) return;
  if (S.plans[PENDING.month] && !await ask("فيه شيت محفوظ لنفس الشهر. تستبدله؟", { ok: "استبدله", danger: true })) return;
  $("u-save").disabled = true;
  try {
    await setDoc(doc(db, "plans", PENDING.month), {
      month: PENDING.month, rows: PENDING.rows, file_name: PENDING.file_name, sheet_name: PENDING.sheet_name,
      uploaded_by: auth.currentUser.uid, uploaded_email: actorEmail(auth.currentUser), uploaded_at: serverTimestamp()
    });
    show($("u-msg"), "ok", `اتحفظ شيت ${monthLabel(PENDING.month)}.`);
    S.month = PENDING.month; PENDING = null; $("u-preview").classList.add("hidden"); $("u-file").value = ""; $("u-opts").classList.add("hidden");
    await loadAll();
  } catch (err) { show($("u-msg"), "err", "ماتحفظش: " + err.message); }
  $("u-save").disabled = false;
});

// ===== الأعداد من الرواتب =====
function renderCountsStatus() {
  const s = S.summary;
  $("c-status").innerHTML = s
    ? `آخر ملخص${S.summaryMonth !== S.month ? ` (لشهر ${monthLabel(S.summaryMonth)})` : ""}: ${fmt(s.total)} سجل، من رواتب <b>${esc(s.period || "—")}</b>، اتحدّث ${s.computed_at?.toDate ? s.computed_at.toDate().toLocaleString("ar-EG") : ""}.`
    : "مفيش ملخص لسه.";
}
$("c-run").addEventListener("click", async () => {
  const msg = $("c-msg"); hide(msg);
  if (!await ask(`هيقرا شيت الرواتب المرفوع حالياً كله مرة واحدة ويحفظ الملخص لشهر ${monthLabel(S.month)}. نكمل؟`)) return;
  $("c-run").disabled = true; show(msg, "info", "جاري القراءة...");
  try {
    const snap = await getDocs(collection(db, "payroll"));
    const seen = new Set(), counts = new Map(), periods = {};
    snap.forEach(d => {
      const r = d.data(), data = r.data || {}, f = {};
      Object.keys(data).forEach(k => f[norm(k)] = data[k]);
      const code = norm(r.employee_code); if (!code || seen.has(code)) return; seen.add(code);
      const site = norm(f["الفرع \\ المصنع"] ?? f["الفرع \\\\ المصنع"] ?? f["موقع العمل"]);
      const job = norm(f["الوظيفة"]), type = norm(f["نوع الوظيفة"]), per = norm(f["فترة القبض"]);
      if (per) periods[per] = (periods[per] || 0) + 1;
      if (!site || !job) return;
      const k = site + "|" + job + "|" + type;
      counts.set(k, { site, job, type, n: (counts.get(k)?.n || 0) + 1 });
    });
    if (!seen.size) throw new Error("شيت الرواتب فاضي أو مش مرفوع.");
    if (!counts.size) throw new Error("مش لاقي عمود \"الفرع \\ المصنع\" أو \"الوظيفة\" في الرواتب.");
    const period = Object.entries(periods).sort((a, b) => b[1] - a[1]).map(([p]) => p).slice(0, 3).join(" / ");
    await setDoc(doc(db, "headcount_summary", S.month), { month: S.month, counts: [...counts.values()], total: seen.size, period, computed_at: serverTimestamp(), computed_by: auth.currentUser.uid });
    show(msg, "ok", `اتحدّث: ${fmt(seen.size)} موظف.`);
    await loadMonth();
  } catch (err) { show(msg, "err", "ماتحدّثش: " + err.message); }
  $("c-run").disabled = false;
});

// ===== الإعدادات =====
const ED = { loc: [], pos: [], ovr: [], split: [] };
function fromSettings(st) {
  ED.loc = Object.entries(st?.locMap || {}).map(([a, b]) => [a, b]);
  ED.pos = Object.entries(st?.posMap || {}).map(([a, b]) => [a, b]);
  ED.ovr = (st?.overrides || []).map(o => [o.loc, o.pos, o.site]);
  ED.split = (st?.splits || []).map(s => [s.loc, s.pos, s.parts.map(p => `${p.site}:${p.count}`).join("، ")]);
}
function renderSettings() {
  if (!ED._init) { fromSettings(S.settings); ED._init = true; }
  if (S.settings) hide($("s-empty")); else show($("s-empty"), "warn", "الإعدادات لسه متحفظتش. دوس \"تحميل الإعدادات المبدئية\"، راجعها، وبعدين \"حفظ الإعدادات\".");
  const cell = (t, i, j) => `<td><input type="text" data-t="${t}" data-i="${i}" data-j="${j}" value="${esc(ED[t][i][j])}"></td>`;
  const del = (t, i) => `<td><button class="btn sec small" data-del="${t}" data-i="${i}">حذف</button></td>`;
  $("s-loc").innerHTML = ED.loc.map((r, i) => `<tr>${cell("loc", i, 0)}${cell("loc", i, 1)}${del("loc", i)}</tr>`).join("");
  $("s-pos").innerHTML = ED.pos.map((r, i) => `<tr>${cell("pos", i, 0)}${cell("pos", i, 1)}${del("pos", i)}</tr>`).join("");
  $("s-ovr").innerHTML = ED.ovr.map((r, i) => `<tr>${cell("ovr", i, 0)}${cell("ovr", i, 1)}${cell("ovr", i, 2)}${del("ovr", i)}</tr>`).join("");
  $("s-split").innerHTML = ED.split.map((r, i) => `<tr>${cell("split", i, 0)}${cell("split", i, 1)}${cell("split", i, 2)}${del("split", i)}</tr>`).join("");
}
document.querySelector('[data-panel="settings"]').addEventListener("input", e => {
  const t = e.target.dataset.t; if (!t) return; ED[t][+e.target.dataset.i][+e.target.dataset.j] = e.target.value;
});
document.querySelector('[data-panel="settings"]').addEventListener("click", e => {
  const add = e.target.dataset.add, delT = e.target.dataset.del;
  if (add) { ED[add].push(add === "ovr" || add === "split" ? ["", "", ""] : ["", ""]); renderSettings(); }
  if (delT) { ED[delT].splice(+e.target.dataset.i, 1); renderSettings(); }
});
$("s-default").addEventListener("click", () => { fromSettings(DEFAULT_SETTINGS); renderSettings(); show($("s-msg"), "info", "اتحملت الإعدادات المبدئية في الجداول. راجعها ودوس حفظ."); });
$("s-save").addEventListener("click", async () => {
  const msg = $("s-msg"); hide(msg);
  try {
    const locMap = {}, posMap = {};
    ED.loc.forEach(([a, b]) => { if (norm(a) && norm(b)) locMap[norm(a)] = norm(b); });
    ED.pos.forEach(([a, b]) => { if (norm(a) && norm(b)) posMap[nkey(a)] = norm(b); });
    const overrides = ED.ovr.filter(r => norm(r[0]) && norm(r[1]) && norm(r[2])).map(([loc, pos, site]) => ({ loc: norm(loc), pos: nkey(pos), site: norm(site) }));
    const splits = ED.split.filter(r => norm(r[0]) && norm(r[1]) && norm(r[2])).map(([loc, pos, txt]) => {
      const parts = txt.split(/[،,]/).map(s => s.trim()).filter(Boolean).map(s => {
        const i = s.lastIndexOf(":"); if (i < 0) throw new Error(`التوزيع "${s}" لازم يبقى بالشكل موقع:عدد`);
        const count = parseInt(s.slice(i + 1), 10); if (!Number.isInteger(count)) throw new Error(`العدد في "${s}" مش رقم`);
        return { site: norm(s.slice(0, i)), count };
      });
      return { loc: norm(loc), pos: nkey(pos), parts };
    });
    await setDoc(doc(db, "plan_settings", "mapping"), { locMap, posMap, overrides, splits, updated_by: auth.currentUser.uid, updated_at: serverTimestamp() });
    S.settings = { locMap, posMap, overrides, splits };
    show(msg, "ok", "اتحفظت الإعدادات.");
    renderSettings(); renderDash();
  } catch (err) { show(msg, "err", "ماتحفظتش: " + err.message); }
});
// ===== الحسابات (أدمن بس — التنفيذ على السيرفر worker.py) =====
// ===== إعدادات الإدارة: من Firestore (config/admin) — الأدمن بس يقدر يقراها =====
// قايمة الحسابات المخططة وإيميل استثناء الفيش والحساب المشترك مش مكتوبة في الكود (الريبو Public).
let PLANNED = [], FICHE_EXCEPTION_EMAIL = "", SHARED_EMAIL = "";
async function loadAdminConfig() {
  try {
    const snap = await getDoc(doc(db, "config", "admin"));
    const c = snap.exists() ? snap.data() : {};
    PLANNED = c.planned || []; FICHE_EXCEPTION_EMAIL = (c.fiche_exception_email || "").toLowerCase(); SHARED_EMAIL = (c.shared_email || "").toLowerCase();
  } catch (e) { console.warn("config/admin:", e.message); }
}
const ROLE_AR = { admin: "أدمن", supervisor: "مشرف", hr: "HR", accountant: "محاسب", viewer: "مشاهد" };
let STAFF = [];

async function createTask(type, extra) {
  const u = auth.currentUser;
  if (!u) throw new Error("انتهت الجلسة — ادخل تاني");
  return await addDoc(collection(db, "admin_tasks"), {
    type, requested_by: u.uid, requested_email: actorEmail(u), status: "pending", created_at: serverTimestamp(), ...extra
  });
}
function waitTask(ref, timeoutMs) {
  return new Promise(resolve => {
    let done = false, unsub = null;
    const finish = r => { if (done) return; done = true; clearTimeout(timer); if (unsub) unsub(); resolve(r); };
    const timer = setTimeout(() => finish({ status: "timeout" }), timeoutMs);
    unsub = onSnapshot(ref, snap => { const d = snap.data(); if (d && (d.status === "done" || d.status === "error")) finish(d); },
      err => finish({ status: "error", message: "مش قادر أتابع الطلب: " + err.message }));
  });
}

function initAccounts() {
  $("ac-sites").innerHTML = SUP_SITES.map(s => `<label class="row" style="flex-direction:row;gap:4px;font-size:13px;color:#222;"><input type="checkbox" value="${esc(s)}"> ${esc(s)}</label>`).join("");
  $("ac-role").addEventListener("change", () => {
    const r = $("ac-role").value;
    $("ac-sites").style.opacity = ["supervisor", "hr", "accountant"].includes(r) ? 1 : .4;
    $("ac-payroll-box").classList.toggle("hidden", r !== "accountant");
  });
  onSnapshot(doc(db, "staff_accounts", "all"), snap => {
    const d = snap.exists() ? snap.data() : null;
    STAFF = d?.accounts || [];
    $("ac-updated").textContent = d?.updated_at?.toDate ? "آخر تحديث للقايمة: " + d.updated_at.toDate().toLocaleString("ar-EG") : "القايمة لسه ماتعملتش — هتظهر أول ما السيرفر يشتغل بالنسخة الجديدة.";
    renderAccounts();
  }, err => show($("ac-server"), "warn", "مش قادر أقرا قايمة الحسابات: " + err.message));
  onSnapshot(doc(db, "admin_tasks_status", "server"), snap => {
    const t = snap.exists() && snap.data().last_seen?.toDate ? snap.data().last_seen.toDate() : null;
    const ok = t && (Date.now() - t.getTime()) / 60000 <= 11;
    if (ok) hide($("ac-server")); else show($("ac-server"), "warn", "السيرفر واقف — الطلبات هتستنى لحد ما يشتغل.");
  });
}
// HR والمحاسب: من غير مواقع = كل الفروع (ومعاها الشرقية)
function sitesText(a) {
  const pay = a.role === "accountant" && a.payroll ? " + رفع المرتبات" : "";
  if (a.role === "supervisor") return (a.sites || []).join("، ") || "مشرف الشرقية للدخان";
  if (a.role === "hr" || a.role === "accountant") return ((a.sites || []).join("، ") || "كل الفروع") + pay;
  return "—";
}
function renderAccounts() {
  const by = Object.fromEntries(STAFF.map(a => [String(a.email).toLowerCase(), a]));
  $("ac-plan").innerHTML = PLANNED.map(p => {
    const a = by[p.email];
    const same = a && a.role === p.role && JSON.stringify([...(a.sites || [])].sort()) === JSON.stringify([...p.sites].sort());
    const st = !a ? `<span class="c-s">لسه مااتعملش</span>` : !same ? `<span class="c-s">الصلاحيات مختلفة</span>` : a.disabled ? `<span class="muted">متوقف</span>` : `<span class="c-k">جاهز</span>`;
    const btn = !a ? `<button class="btn small" data-plan="${esc(p.email)}">إنشاء</button>` : !same ? `<button class="btn sec small" data-plan="${esc(p.email)}">تظبيط الصلاحيات</button>` : "";
    return `<tr><td dir="ltr" style="text-align:right">${esc(p.email)}</td><td>${esc(p.label)}</td><td>${ROLE_AR[p.role]}</td><td>${esc(sitesText(p))}</td><td>${st}</td><td>${btn}</td></tr>`;
  }).join("");
  $("ac-list").innerHTML = STAFF.length ? STAFF.map(a => `<tr><td dir="ltr" style="text-align:right">${esc(a.email)}</td><td>${esc(a.name || "—")}</td><td>${ROLE_AR[a.role] || esc(a.role || "—")}</td><td>${esc(sitesText(a))}</td><td>${a.disabled ? "متوقف" : "شغال"}</td>
    <td class="row" style="gap:4px;">${a.role === "admin" ? "" : `<button class="btn sec small" data-edit="${esc(a.email)}">تعديل</button><button class="btn sec small" data-pass="${esc(a.email)}">باسورد جديد</button>`}</td></tr>`).join("")
    : `<tr><td colspan="6" class="muted">مفيش حسابات ظاهرة لسه.</td></tr>`;
}
function fillForm(a) {
  $("ac-email").value = a.email; $("ac-name").value = a.name || ""; $("ac-role").value = a.role in ROLE_AR && a.role !== "admin" ? a.role : "supervisor";
  $("ac-sites").querySelectorAll("input").forEach(i => i.checked = (a.sites || []).includes(i.value));
  $("ac-disabled").checked = !!a.disabled;
  $("ac-payroll").checked = !!a.payroll;
  $("ac-role").dispatchEvent(new Event("change"));
  $("ac-email").scrollIntoView({ behavior: "smooth", block: "center" });
}
document.querySelector('[data-panel="accounts"]').addEventListener("click", async e => {
  const t = e.target;
  if (t.dataset.plan) { const p = PLANNED.find(x => x.email === t.dataset.plan); fillForm({ ...p, disabled: false }); return saveAccount(); }
  if (t.dataset.edit) { const a = STAFF.find(x => x.email === t.dataset.edit); if (a) fillForm(a); return; }
  if (t.dataset.pass) {
    if (!await ask(`باسورد مؤقت جديد لـ ${t.dataset.pass}؟ الباسورد القديم هيبطل، وأي حد داخل بيه هيخرج.`, { ok: "باسورد جديد", danger: true })) return;
    return runAccountTask("account_password", { email: t.dataset.pass });
  }
});
$("ac-save").addEventListener("click", () => saveAccount());
$("ac-copy").addEventListener("click", () => navigator.clipboard?.writeText($("ac-secret-val").textContent));
async function saveAccount() {
  const email = $("ac-email").value.trim().toLowerCase(), role = $("ac-role").value;
  const sites = ["supervisor", "hr", "accountant"].includes(role) ? [...$("ac-sites").querySelectorAll("input:checked")].map(i => i.value) : [];
  const payroll = role === "accountant" && $("ac-payroll").checked;
  if (!email || !email.includes("@")) return show($("ac-msg"), "err", "اكتب الإيميل.");
  if (role === "supervisor" && !sites.length && email !== SHARED_EMAIL
      && !await ask("مشرف من غير مواقع = نفس صلاحيات مشرف الشرقية للدخان. متأكد؟", { ok: "أيوه، احفظ" })) return;
  const name = $("ac-name").value.trim().slice(0, 40);
  // الاسم بيتبعت بس لو مكتوب — لحد ما الـ Rules والسيرفر يتحدّثوا، الحفظ من غير اسم يفضل شغال
  return runAccountTask("account_save", { email, ...(name ? { name } : {}), role, sites, payroll, disabled: $("ac-disabled").checked });
}
async function runAccountTask(type, extra) {
  const msg = $("ac-msg"); $("ac-secret").classList.add("hidden");
  show(msg, "info", "جاري إرسال الطلب للسيرفر...");
  document.querySelectorAll('[data-panel="accounts"] button').forEach(b => b.disabled = true);
  try {
    const ref = await createTask(type, extra);
    const r = await waitTask(ref, 60000);
    if (r.status === "done") {
      show(msg, "ok", r.message);
      if (r.secret) { $("ac-secret-val").textContent = r.secret; $("ac-secret").classList.remove("hidden"); }
    } else if (r.status === "timeout") show(msg, "warn", "الطلب اتسجّل بس السيرفر مردّش لسه — هيتنفذ أول ما يشتغل، وارجع للصفحة دي تشوف النتيجة.");
    else show(msg, "err", r.message || "حصل خطأ، حاول تاني");
  } catch (err) { show(msg, "err", err.code === "permission-denied" ? "مش مسموح — اتأكد إن الـ Rules الجديدة اتنشرت." : "خطأ: " + err.message); }
  document.querySelectorAll('[data-panel="accounts"] button').forEach(b => b.disabled = false);
}
// القوايم المقفولة: العدد جنب العنوان (صفوف فيها بيانات بس، مش «مفيش»)
document.querySelectorAll("[data-n]").forEach(n => {
  const tb = document.getElementById(n.dataset.n); if (!tb) return;
  const upd = () => { const k = [...tb.rows].filter(r => !(r.cells.length === 1 && r.cells[0].colSpan > 1)).length; n.textContent = `(${k.toLocaleString("ar-EG")})`; };
  new MutationObserver(upd).observe(tb, { childList: true }); upd();
});
["w-q", "w-site"].forEach(id => document.getElementById(id)?.addEventListener("input", () => { document.querySelector('[data-fold="w-list"]').open = true; }));
// ===== أكواد جديدة (worker_events: إضافة اتنفذت) — الأدمن، والـ HR والمحاسب لفروعهم =====
const CD = { rows: [], unsub: null };
const cdDay = t => { const d = t?.toDate?.(); return d ? d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0") : ""; };
function initCoded() {
  const c = collection(db, "worker_events");
  const q = S.scoped ? query(c, where("status", "==", "done"), where("branch", "in", S.scoped)) : query(c, where("status", "==", "done"));
  CD.unsub?.();
  CD.unsub = onSnapshot(q, snap => {
    CD.rows = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(e => e.kind === "hire")
      .sort((a, b) => (b.applied_at?.seconds || 0) - (a.applied_at?.seconds || 0));
    renderCoded();
  }, err => show($("cd-msg"), "err", "مش قادر أقرا «أكواد جديدة»: " + (err.code === "permission-denied" ? "محتاج تحديث الـ Rules (worker_events)." : err.message)));
}
function codedShown() {
  const f = $("cd-from").value, t = $("cd-to").value, onlyNew = $("cd-new").checked;
  return CD.rows.filter(e => { const d = cdDay(e.applied_at); return (!f || d >= f) && (!t || d <= t) && (!onlyNew || !e.exported); });
}
function renderCoded() {
  const rows = codedShown(), nNew = CD.rows.filter(e => !e.exported).length;
  $("cd-n").textContent = nNew ? nNew + " ما اتصدروش" : "";
  $("cd-list").innerHTML = rows.length ? rows.slice(0, 300).map(e => `<tr><td><b>${esc(e.code)}</b>${e.rehire ? `<div class="c-s" style="font-size:12px;">رجع بكوده</div>` : ""}</td>
    <td>${esc(e.name)}</td><td style="direction:ltr;text-align:right">${esc(e.nid)}</td><td style="direction:ltr;text-align:right">${esc(e.phone || "")}</td>
    <td>${esc(e.site)}</td><td>${esc(e.job)}</td><td>${esc(typeLabel(e.type))}</td><td style="direction:ltr;text-align:right">${esc(e.first_day || "")}</td>
    <td style="direction:ltr;text-align:right">${cdDay(e.applied_at)}</td><td>${e.exported ? "✓ " + cdDay(e.exported_at) : "—"}</td></tr>`).join("")
    : `<tr><td colspan="10" class="muted">مفيش.</td></tr>`;
}
["cd-from", "cd-to", "cd-new"].forEach(id => $(id).addEventListener("change", renderCoded));
$("cd-exp").addEventListener("click", async () => {
  const rows = codedShown();
  if (!rows.length) return show($("cd-msg"), "info", "مفيش حد في القايمة يتصدّر.");
  const head = ["الكود", "الرقم القومي", "الاسم", "التليفون", "الشركة", "الموقع", "الوظيفة", "النوع", "أول يوم شغل", "كود البوابة",
    "تاريخ الاعتماد", "اعتمده", "رجع بكوده", "المؤهل", "الأجر الأساسي", "الأجر التأميني"];
  const data = [head, ...rows.map(e => [e.code, e.nid, e.name, e.phone || "", e.company || "", e.site, e.job, typeLabel(e.type), e.first_day || "",
    e.portal_code || "", cdDay(e.applied_at), e.decided_email || "", e.rehire ? "أيوه" : "", "", "", ""])];
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws["!cols"] = [10, 16, 30, 13, 10, 18, 18, 11, 12, 11, 12, 24, 9, 12, 12, 12].map(w => ({ wch: w }));
  ws["!views"] = [{ RTL: true }];
  // الأرقام القومية والتليفونات نص (عشان الإكسيل مايبوظهاش)
  for (let r = 1; r < data.length; r++) for (const c of [1, 3]) { const a = XLSX.utils.encode_cell({ r, c }); if (ws[a]) { ws[a].t = "s"; ws[a].z = "@"; } }
  const wb = XLSX.utils.book_new(); wb.Workbook = { Views: [{ RTL: true }] };
  XLSX.utils.book_append_sheet(wb, ws, "أكواد جديدة");
  XLSX.writeFile(wb, `أكواد جديدة ${today()}.xlsx`);
  // علامة «اتصدّر» (الـ Rules: للعامل اللي اتكوّد بس، وباسم اللي صدّر)
  const u = auth.currentUser, todo = rows.filter(e => !e.exported);
  let n = 0;
  try {
    for (let i = 0; i < todo.length; i += 400) {
      const b = writeBatch(db);
      todo.slice(i, i + 400).forEach(e => b.update(doc(db, "worker_events", e.id), { exported: true, exported_by: u.uid, exported_email: actorEmail(u), exported_at: serverTimestamp() }));
      await b.commit(); n += Math.min(400, todo.length - i);
    }
    show($("cd-msg"), "ok", `نزل ${rows.length} عامل` + (todo.length ? `، و${n} اتعلّموا «اتصدّر».` : "."));
  } catch (err) { show($("cd-msg"), "err", `نزل الملف، بس علامة «اتصدّر» وقفت بعد ${n}: ` + (err.code === "permission-denied" ? "مش مسموح لحسابك." : err.message)); }
});

// ===== طلبات القوة من «بيانات العمال» =====
// كل تعديل بيروح worker_events (مستني). الأدمن و HR الفرع بيعتمدوه في نفس الخطوة (نفس الـ Rules بتاعة «اعتماد الحالات»).
const canDecideSite = site => S.role === "admin" || (S.role === "hr" && (!S.scoped || S.scoped.includes(site)));
const recCode = w => w.tcode || (/^T\d+$/.test(String(w.code)) ? String(w.code) : "");
function forceEv(kind, w, extra) {
  const u = auth.currentUser;
  return { kind, status: "pending", source: "page", branch: w.site, site: w.site, name: w.name || "", ...extra,
    by: u.uid, by_email: actorEmail(u), created_at: serverTimestamp() };
}
// evs = [[ref, data]] — بيتكتبوا مع بعض، وبعدين الاعتماد (لو الحساب ده يعتمد) — بيرجّع عدد اللي اتعتمد
async function sendForce(evs) {
  const u = auth.currentUser;
  for (let i = 0; i < evs.length; i += 400) { const b = writeBatch(db); evs.slice(i, i + 400).forEach(([r, d]) => b.set(r, d)); await b.commit(); }
  const mine = evs.filter(([, d]) => canDecideSite(d.branch));
  for (let i = 0; i < mine.length; i += 400) {
    const b = writeBatch(db);
    mine.slice(i, i + 400).forEach(([r]) => b.update(r, { status: "approved", decided_by: u.uid, decided_email: actorEmail(u), decided_at: serverTimestamp() }));
    await b.commit();
  }
  return mine.length;
}
function changeEv(w, type, job, site, from, note, reason) {
  const code = recCode(w);
  if (!code) throw new Error(`${w.name}: لسه مالوش كود في السجل (عامل جديد مستني الـ HR).`);
  if (type === "مشي") return forceEv("leave", w, { code, roster_code: String(w.code), nid: String(w.nid || ""), job: w.job || "", type: w.type || "",
    left_date: from || today(), reason: reason || "أخرى", ...(note ? { note: note.slice(0, 300) } : {}) });
  const to = {};
  if (type && type !== w.type) to.type = type;
  if (job && job !== w.job) to.job = job;
  if (site && site !== w.site) to.site = site;
  return forceEv("change", w, { code, to, effective: from || today(), ...(note ? { note: note.slice(0, 300) } : {}) });
}
// رفض عامل جديد لسه بكود مؤقت: بيترفض طلب إضافته (الـ HR بس) — السيرفر بيشيله من الكشف ويبلّغ المشرف
async function rejectNew(nw, why) {
  if (!canDecideSite(nw.site)) throw new Error("الرفض للـ HR بس — من «اعتماد الحالات ← طلبات القوة».");
  const snap = await getDocs(query(collection(db, "worker_events"), where("branch", "==", nw.site), where("nid", "==", nw.nid || nw.id)));
  const ev = snap.docs.find(d => d.data().kind === "hire" && ["pending", "error"].includes(d.data().status));
  const u = auth.currentUser;
  if (!ev) throw new Error("مالقيتش طلب إضافة مستني للعامل ده.");
  await updateDoc(ev.ref, { status: "rejected", decision_note: why.slice(0, 300), decided_by: u.uid, decided_email: actorEmail(u), decided_at: serverTimestamp() });
}

// ===== بيانات العمال (الأدمن وHR والمحاسب) =====
// الشرقية للدخان: للمكتب اللي على كل الفروع بس، وتسجيل «مشي» بس (التعديلات التانية من شيت الرواتب)
const SHARQIA_SITE = "الشرقية للدخان";
const leaveOnly = site => site === SHARQIA_SITE;
let W_SITES = [...SUP_SITES, SHARQIA_SITE];
// قوايم العمال (تعديلات / جداد / اتشالوا من الكشف): اللي ليه فروع بيقرا فروعه بس (الـ Rules بتطلب كده)
const bySites = name => S.scoped ? query(collection(db, name), where("site", "in", W_SITES)) : collection(db, name);
const WS = { base: [], ovr: {}, edit: null, pending: [] };
const arNorm = s => String(s ?? "").replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").replace(/\s+/g, " ").trim();
const typeLabel = t => ({ "اساسي": "أساسي" }[t] || t || "—");
async function initWorkers() {
  $("w-site").innerHTML = `<option value="">كل المواقع</option>` + W_SITES.map(s => `<option>${esc(s)}</option>`).join("");
  $("w-site2").innerHTML = W_SITES.map(s => `<option>${esc(s)}</option>`).join("");
  $("w-from").value = today();
  const snaps = await Promise.all(W_SITES.map(s => getDoc(doc(db, "rosters_base", s)).catch(() => null)));
  WS.base = [];
  snaps.forEach((sn, i) => { if (sn?.exists()) (sn.data().workers || []).forEach(w => WS.base.push({ ...w, site: W_SITES[i] })); });
  $("w-jobs").innerHTML = [...new Set(WS.base.map(w => w.job).filter(Boolean))].sort().map(j => `<option value="${esc(j)}">`).join("");
  onSnapshot(bySites("roster_overrides"), snap => {
    WS.ovr = {}; snap.forEach(d => WS.ovr[d.id] = d.data());
    renderWorkers(); renderOverrides();
  }, err => show($("w-msg"), "err", "مش قادر أقرا التعديلات: " + err.message));
  renderWorkers();
  onSnapshot(bySites("new_workers"), snap => {
    WS.newAll = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    // اللي اتكوّد قبل السجل الموحد (رقمه القومي بقى في السجل بكود T) مش بيظهر هنا
    const inRecord = new Set(WS.base.filter(w => /^T\d+$/.test(String(w.tcode || w.code))).map(w => String(w.nid)));
    const rows = WS.newAll.filter(x => !["rejected", "cancelled"].includes(x.status) && !(x.status !== "coded" && inRecord.has(String(x.nid || x.id)))
      && !(x.status === "coded" && (x.decided_at?.seconds || 0) < Date.now() / 1000 - 30 * 86400))
      .sort((a, b) => (b.at?.seconds || 0) - (a.at?.seconds || 0));
    $("w-new").innerHTML = rows.length ? rows.map(x => `<tr><td>${esc(x.name)}</td><td style="direction:ltr;text-align:right">${esc(x.nid)}</td><td>${esc(x.site)}</td><td>${esc(x.job)}</td>
      <td>${x.role === "roster" ? "عامل في الكشف" : "بديل"}${x.no_card ? `<div class="c-s" style="font-size:12px;">من غير بطاقة</div>` : ""}</td><td style="direction:ltr;text-align:right">${esc(x.first_day || "")}</td><td>${ficheCell(x)}</td>
      <td>${x.status === "coded" ? `<b>${esc(x.code || "")}</b>` : esc(typeLabel(x.type))}<div class="c-s" style="font-size:12px;">${x.status === "coded" ? "اتكوّد" : "مستني الـ HR"}</div></td>
      <td class="row" style="gap:4px;">${x.status !== "coded" && canDecideSite(x.site) ? `<button class="btn danger small" data-nrej="${esc(x.id)}">رفض</button>` : ""}</td></tr>`).join("")
      : `<tr><td colspan="9" class="muted">مفيش.</td></tr>`;
    renderRem();
  }, () => {});
  onSnapshot(bySites("sheet_removals"), snap => {
    WS.rem = snap.docs.map(d => ({ id: d.id, ...d.data() })); renderRem();
  }, () => {});
}
// ===== جدول الأكواد الإنجليزي (الأدمن بس) =====
const JC = { rows: [] };
async function loadJobCodes() {
  try { const d = await getDoc(doc(db, ...JC_DOC)); JC.rows = d.exists() ? d.data().rows || [] : []; } catch (e) { show($("jc-msg"), "err", "مش قادر أقرا الجدول: " + e.message); }
  renderJC();
}
function renderJC() {
  $("jc-list").innerHTML = JC.rows.length ? JC.rows.map((r, i) => `<tr><td><input data-jc="${i}" data-f="ar" value="${esc(r.ar)}" style="width:100%;"></td>
    <td><input data-jc="${i}" data-f="hc" value="${esc(r.hc)}" dir="ltr" style="width:100%;"></td><td><button class="btn sec small" data-jcdel="${i}">شيل</button></td></tr>`).join("")
    : `<tr><td colspan="3" class="muted">الجدول فاضي — ارفع تابة CODE من «قوة كاملة».</td></tr>`;
}
$("jc-list")?.addEventListener("input", e => { const i = e.target.dataset.jc; if (i != null) JC.rows[+i][e.target.dataset.f] = e.target.value; });
$("jc-list")?.addEventListener("click", e => { const i = e.target.dataset.jcdel; if (i != null) { JC.rows.splice(+i, 1); renderJC(); } });
$("jc-add")?.addEventListener("click", () => { JC.rows.push({ ar: "", hc: "" }); renderJC(); });
$("jc-file")?.addEventListener("change", async e => {
  const f = e.target.files[0]; if (!f) return;
  try {
    const wb = XLSX.read(new Uint8Array(await f.arrayBuffer()), { type: "array" });
    const found = new Map();
    wb.SheetNames.forEach(n => {
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, defval: "" });
      const hi = rows.slice(0, 6).findIndex(r => r.some(v => String(v).trim() === "الكود العربي") && r.some(v => /code\s*-?\s*hc/i.test(String(v))));
      if (hi < 0) return;
      const ia = rows[hi].findIndex(v => String(v).trim() === "الكود العربي"), ih = rows[hi].findIndex(v => /code\s*-?\s*hc/i.test(String(v)));
      rows.slice(hi + 1).forEach(r => { const ar = String(r[ia] || "").trim(), hc = String(r[ih] || "").trim(); if (ar && hc && !found.has(ar)) found.set(ar, hc); });
    });
    if (!found.size) return show($("jc-msg"), "err", "مالقيتش عمودين «الكود العربي» و«CODE - HC» في الملف.");
    let added = 0, changed = 0;
    found.forEach((hc, ar) => { const r = JC.rows.find(x => x.ar.trim() === ar); if (!r) { JC.rows.push({ ar, hc }); added++; } else if (r.hc !== hc) { r.hc = hc; changed++; } });
    renderJC();
    show($("jc-msg"), "info", `${added} سطر جديد و${changed} اتحدّث من الملف. راجع ودوس «حفظ الجدول».`);
  } catch (er) { show($("jc-msg"), "err", "مش قادر أقرا الملف: " + er.message); }
  e.target.value = "";
});
$("jc-save")?.addEventListener("click", async () => {
  const rows = JC.rows.map(r => ({ ar: String(r.ar || "").trim(), hc: String(r.hc || "").trim() })).filter(r => r.ar || r.hc);
  const bad = rows.filter(r => !r.ar || !r.hc || r.ar.split("/").length < 2);
  if (bad.length) return show($("jc-msg"), "err", `فيه ${bad.length} سطر ناقص (لازم الكود العربي فيه الموقع/الوظيفة، والكود الإنجليزي).`);
  try { await setDoc(doc(db, ...JC_DOC), { rows, updated_at: serverTimestamp() }); JC.rows = rows; renderJC(); show($("jc-msg"), "ok", `اتحفظ ${rows.length} كود.`); }
  catch (er) { show($("jc-msg"), "err", "ماتحفظش: " + (er.code === "permission-denied" ? "محتاج تحديث الـ Rules (job_codes)." : er.message)); }
});

// ===== البلاك ليست =====
// ===== رفع الكارنيهات الطبية (الأدمن + HR كل الفروع) =====
// الكارنيه = medical_cards/{كود العامل} بنفس شكل الرفع القديم (+ الرقم القومي). كل رفعة بتتسجل في card_uploads،
// والسيرفر (auto_notify.py) بيبعت منها إشعار لمشرف كل عامل ويعلّم عليها notified.
const MC_POLICY = "5122500013", MC_MAX = 760000;   // حد الـ base64 (المستند لازم أقل من 1MB)
const MC = { map: null, files: [], rows: [] };
const mcNorm = s => String(s ?? "").replace(/\s+/g, " ").trim();
function initCards() {
  const can = S.role === "admin" || (S.role === "hr" && !S.scoped);
  $("mc-card").classList.toggle("hidden", !can);
  if (!can || $("mc-card").dataset.on) return;
  $("mc-card").dataset.on = "1";
  $("mc-map").addEventListener("change", mcReadMap);
  $("mc-pdf").addEventListener("change", e => { MC.files = [...e.target.files]; mcPreview(); });
  $("mc-over").addEventListener("change", mcDraw);
  $("mc-cancel").addEventListener("click", mcReset);
  $("mc-go").addEventListener("click", mcUpload);
}
function mcReset() {
  Object.assign(MC, { map: null, files: [], rows: [] }); $("mc-map").value = ""; $("mc-pdf").value = "";
  $("mc-prev").classList.add("hidden"); hide($("mc-msg"));
}
// ملف الربط: أول صف فيه عمود كود + عمود رقم الشهادة (mapping.xlsx أو addition request)
async function mcReadMap(e) {
  const f = e.target.files[0]; MC.map = null; if (!f) return;
  try {
    const wb = XLSX.read(new Uint8Array(await f.arrayBuffer()), { type: "array" });
    const map = new Map();
    wb.SheetNames.forEach(n => {
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, defval: "", raw: false });
      const hi = rows.slice(0, 8).findIndex(r => r.some(v => /كود/.test(v)) && r.some(v => /الشهادة|الرقم الوظيفي|cert/i.test(v)));
      if (hi < 0) return;
      const H = rows[hi].map(mcNorm), at = re => H.findIndex(h => re.test(h));
      // في شيت الإضافة الرقم القومي عنوانه في الصف اللي فوق
      const up = (rows[hi - 1] || []).map(mcNorm);
      const iCert = at(/الشهادة|الرقم الوظيفي|cert/i), iCode = at(/كود/), iName = at(/الاسم/);
      let iNid = at(/national id|الرقم القوم|البطاقة/i); if (iNid < 0) iNid = up.findIndex(h => /national id|الرقم القوم/i.test(h));
      rows.slice(hi + 1).forEach(r => {
        const cert = enDigits(mcNorm(r[iCert])).replace(/\.0$/, ""), code = enDigits(mcNorm(r[iCode])).toUpperCase().replace(/\.0$/, "");
        if (!/^\d+$/.test(cert) || !/^(T\d+|\d+)$/.test(code)) return;
        const nid = iNid >= 0 ? enDigits(mcNorm(r[iNid])).replace(/\D/g, "") : "";
        map.set(cert, { code, name: iName >= 0 ? mcNorm(r[iName]) : "", nid: nid.length === 14 ? nid : "" });
      });
    });
    if (!map.size) return show($("mc-msg"), "err", "مش لاقي في الملف ده أعمدة الكود ورقم الشهادة.");
    MC.map = map; mcPreview();
  } catch (err) { show($("mc-msg"), "err", "مش قادر أقرا الملف: " + err.message); }
}
async function mcPreview() {
  if (!MC.map) return show($("mc-msg"), "info", MC.files.length ? "اختار ملف الربط كمان." : "اختار ملف الربط والكارنيهات.");
  if (!MC.files.length) return show($("mc-msg"), "info", `ملف الربط فيه ${MC.map.size} عامل. اختار الكارنيهات (PDF).`);
  show($("mc-msg"), "info", "بشوف مين ليه كارنيه قبل كده...");
  const seen = new Set();
  MC.rows = await Promise.all(MC.files.map(async f => {
    const m = f.name.match(/_(\d+)_\d+\.pdf$/i) || f.name.match(/(\d+)/);
    const cert = m ? m[1] : "", w = MC.map.get(cert);
    const r = { f, cert, code: w?.code || "", name: w?.name || "", nid: w?.nid || "", st: "ok" };
    if (!w) r.st = "nomap";
    else if (seen.has(w.code)) r.st = "dup";
    else {
      seen.add(w.code);
      try { const d = await getDoc(doc(db, "medical_cards", w.code)); if (d.exists()) { r.st = "old"; r.oldCert = d.data().certificate || ""; } }
      catch (e) { r.st = "err"; r.err = e.code === "permission-denied" ? "مش مسموح (الـ Rules)" : e.message; }
    }
    return r;
  }));
  MC.rows.sort((a, b) => ["nomap", "dup", "err", "old", "ok"].indexOf(a.st) - ["nomap", "dup", "err", "old", "ok"].indexOf(b.st));
  mcDraw();
}
function mcDraw() {
  const over = $("mc-over").checked;
  const txt = r => r.st === "nomap" ? `<span class="mc-err">رقم الشهادة مش في ملف الربط</span>`
    : r.st === "dup" ? `<span class="mc-err">نفس العامل في ملف تاني</span>`
    : r.st === "err" ? `<span class="mc-err">${esc(r.err)}</span>`
    : r.st === "old" ? `<span class="mc-warn">عنده كارنيه قبل كده${r.oldCert ? ` (شهادة ${esc(r.oldCert)})` : ""} — ${over ? "هيتستبدل" : "هيتساب"}</span>`
    : `<span class="mc-ok">جديد</span>`;
  $("mc-list").innerHTML = MC.rows.map(r => `<tr><td dir="ltr" style="text-align:right">${esc(r.f.name)}</td><td>${esc(r.cert)}</td><td>${esc(r.code)}</td><td>${esc(r.name)}</td><td>${txt(r)}</td></tr>`).join("");
  const go = MC.rows.filter(r => r.st === "ok" || (r.st === "old" && over)).length;
  const bad = MC.rows.filter(r => ["nomap", "dup", "err"].includes(r.st)).length;
  show($("mc-msg"), bad ? "warn" : "info", `${MC.rows.length} ملف: هيترفع ${go}` + (bad ? ` — ${bad} مش هيترفعوا (الأحمر)` : ""));
  $("mc-go").disabled = !go; $("mc-prev").classList.remove("hidden");
}
async function mcUpload() {
  const over = $("mc-over").checked, list = MC.rows.filter(r => r.st === "ok" || (r.st === "old" && over));
  if (!list.length) return;
  $("mc-go").disabled = true;
  const u = auth.currentUser, done = [], fail = [];
  for (const r of list) {
    show($("mc-msg"), "info", `بيترفع ${done.length + fail.length + 1} من ${list.length}...`);
    try {
      const buf = new Uint8Array(await r.f.arrayBuffer());
      let bin = ""; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
      if (!bin.startsWith("%PDF")) throw new Error("الملف مش PDF");
      const data = btoa(bin); if (data.length > MC_MAX) throw new Error(`الملف كبير (${Math.round(buf.length / 1024)} KB)`);
      await setDoc(doc(db, "medical_cards", r.code), { certificate: r.cert, contentType: "application/pdf", data, employeeCode: r.code,
        fileName: r.code + ".pdf", name: r.name, nationalId: r.nid, policy: MC_POLICY, sizeKB: Math.round(buf.length / 1024),
        sourceFile: r.f.name, uploaded_by: u.uid, updatedAt: serverTimestamp() });
      done.push({ code: r.code, name: r.name });
    } catch (e) { fail.push(`${r.f.name}: ${e.code === "permission-denied" ? "مش مسموح (الـ Rules)" : e.message}`); if (e.code === "permission-denied") break; }
  }
  // سجل الرفعة — السيرفر بيبعت منه إشعارات المشرفين
  if (done.length) {
    try { await addDoc(collection(db, "card_uploads"), { items: done, by_uid: u.uid, by_label: S.role === "admin" ? "ادمن" : "HR", at: serverTimestamp(), notified: false }); }
    catch (e) { fail.push("الكارنيهات اترفعت بس إشعار المشرفين ماتسجلش: " + (e.code === "permission-denied" ? "محتاج تحديث الـ Rules (card_uploads)" : e.message)); }
  }
  show($("mc-msg"), fail.length ? "warn" : "ok", `اترفع ${done.length} من ${list.length}.` + (done.length ? " إشعارات المشرفين هتتبعت من السيرفر خلال دقايق." : "") + (fail.length ? "\n" + fail.join("\n") : ""));
  $("mc-prev").classList.add("hidden"); $("mc-pdf").value = ""; MC.files = []; $("mc-go").disabled = false;
}
function initBlacklist() {
  // الإضافة والشيل للأدمن وHR اللي ليه كل الفروع بس (زي الـ Rules)، والباقي بيشوف القايمة بس
  const canBL = S.role === "admin" || (S.role === "hr" && !S.scoped);
  $("bl-form").classList.toggle("hidden", !canBL);
  onSnapshot(collection(db, "blacklist_info"), snap => {
    const rows = snap.docs.map(d => d.data()).sort((a, b) => (b.at?.seconds || 0) - (a.at?.seconds || 0));
    $("bl-list").innerHTML = rows.length ? rows.map(x => `<tr><td>${esc(x.name)}</td><td style="direction:ltr;text-align:right">${esc(x.nid)}</td><td>${esc(x.reason)}${x.note ? `<div class="muted">${esc(x.note)}</div>` : ""}</td><td class="muted">${esc(x.by_email || "")}</td><td>${canBL ? `<button class="btn danger small" data-blrm="${esc(x.nid)}">شيل</button>` : ""}</td></tr>`).join("")
      : `<tr><td colspan="5" class="muted">مفيش.</td></tr>`;
  }, () => {});
  $("bl-add").onclick = async () => {
    const nid = enDigits($("bl-nid").value).replace(/\D/g, ""), name = $("bl-name").value.trim(), u = auth.currentUser;
    if (nid.length !== 14) return show($("bl-msg"), "err", "الرقم القومي لازم 14 رقم.");
    if (!await ask(`إضافة ${name || nid} للبلاك ليست؟`, { ok: "ضيفه", danger: true })) return;
    try {
      // الاتنين مع بعض: يا يتحفظوا الاتنين يا ولا واحد (عشان ميبقاش فيه عامل ممنوع ومش ظاهر في القايمة)
      const b = writeBatch(db);
      b.set(doc(db, "blacklist", nid), { on: true });
      b.set(doc(db, "blacklist_info", nid), { nid, name, reason: $("bl-reason").value, note: $("bl-note").value.trim(), by: u.uid, by_email: actorEmail(u), at: serverTimestamp() });
      await b.commit();
      ["bl-nid", "bl-name", "bl-note"].forEach(i => $(i).value = ""); show($("bl-msg"), "ok", "اتضاف.");
    } catch (e) { show($("bl-msg"), "err", "ماتضافش: " + (e.code === "permission-denied" ? "محتاج تحديث الـ Rules." : e.message)); }
  };
  $("bl-list").onclick = async e => {
    const nid = e.target.dataset.blrm; if (!nid || !await ask("تشيله من البلاك ليست؟", { ok: "شيله" })) return;
    try { const b = writeBatch(db); b.delete(doc(db, "blacklist", nid)); b.delete(doc(db, "blacklist_info", nid)); await b.commit(); } catch (er) { show($("bl-msg"), "err", er.message); }
  };
}
function renderRem() {
    const rows = WS.rem || [];
    $("w-rem").innerHTML = rows.length ? rows.map(x => `<tr><td>${esc(x.name)}</td><td>${esc(x.code)}</td><td>${esc(x.site)}</td><td>${esc(x.reason)}${x.note ? `<div class="muted">${esc(x.note)}</div>` : ""}</td>
      <td class="muted">${esc(x.by_email || "")}</td><td>${WS.ovr[x.code]?.type === "مشي" ? `<span class="c-k">متسجل مشي</span>`
        : newOf(x)?.status === "rejected" ? `<span class="c-k">اترفض واتشال</span>`
        : `<button class="btn sec small" data-left="${esc(x.code)}" data-rsite="${esc(x.site)}" data-rname="${esc(x.name)}">${!WS.base.some(w => w.code === x.code) && newOf(x) ? "ارفضه (اتضاف بالغلط)" : "سجّل إنه مشي"}</button>`}</td></tr>`).join("")
      : `<tr><td colspan="6" class="muted">مفيش.</td></tr>`;
}
function ficheDue(first) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(first || "")) return null;
  const d = new Date(first + "T00:00:00"); let n = 5;
  while (n > 0) { d.setDate(d.getDate() + 1); if (d.getDay() !== 5) n--; }
  return d;
}
function ficheCell(x) {
  if (x.fiche) return `<span class="c-k">اترفع</span>`;
  const due = ficheDue(x.first_day), late = due && ymdOf(new Date()) > ymdOf(due);   // يوم المهلة نفسه لسه مسموح (زي صفحة الحضور)
  const can = (auth.currentUser?.email || "").toLowerCase() === FICHE_EXCEPTION_EMAIL;
  let h = due ? `<span class="${late ? "c-s" : "muted"}">${late ? "المهلة خلصت" : "لحد"} ${due.toLocaleDateString("ar-EG", { day: "numeric", month: "short" })}</span>` : "";
  if (x.fiche_exception) h += ` <span class="amd">استثناء</span>`;
  if (can) h += ` <button class="btn sec small" data-fex="${esc(x.id)}" data-on="${x.fiche_exception ? 0 : 1}">${x.fiche_exception ? "إلغاء الاستثناء" : "استثناء"}</button>`;
  return h;
}
// تصدير العمال الجداد اللي اتضافوا من المواقع (نفس اللي في الجدول: من غير المرفوضين)
$("w-new-xl")?.addEventListener("click", () => {
  const rows = (WS.newAll || []).filter(x => x.status !== "rejected").sort((a, b) => (b.at?.seconds || 0) - (a.at?.seconds || 0));
  if (!rows.length) return ($("w-new-xl-msg").textContent = "مفيش عمال جداد.");
  const d2 = t => t?.toDate ? ymdOf(t.toDate()) : "";
  const fiche = x => {
    if (x.fiche) return "اترفع";
    const due = ficheDue(x.first_day);
    return (due ? (ymdOf(new Date()) > ymdOf(due) ? "المهلة خلصت " : "لحد ") + ymdOf(due) : "") + (x.fiche_exception ? " (استثناء)" : "");
  };
  const aoa = [["الاسم", "الرقم القومى", "الموقع", "الوظيفة", "النوع", "اتضاف كـ", "البطاقة", "أول يوم", "اتضاف يوم", "الفيش"],
    ...rows.map(x => [x.name || "", String(x.nid || ""), x.site || "", x.job || "", x.type ? typeLabel(x.type) : (x.role === "roster" ? "جديد (مستني)" : "بديل جديد"),
      x.role === "roster" ? "عامل في الكشف" : "بديل", x.no_card ? "من غير بطاقة" : "بالبطاقة", x.first_day || "", d2(x.at), fiche(x)])];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [28, 16, 16, 18, 14, 14, 13, 12, 12, 22].map(w => ({ wch: w }));
  ws["!views"] = [{ RTL: true }];
  const wb = XLSX.utils.book_new(); wb.Workbook = { Views: [{ RTL: true }] };
  XLSX.utils.book_append_sheet(wb, ws, "عمال جداد");
  XLSX.writeFile(wb, `عمال جداد ${ymdOf(new Date())}.xlsx`);
  $("w-new-xl-msg").textContent = `${rows.length} عامل.`;
});
const ymdOf = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
$("w-new")?.addEventListener("click", async e => {
  if (e.target.dataset.fex) {
    const on = e.target.dataset.on === "1";
    if (on && !await ask("تسمح للعامل ده يتسجل حضوره من غير فيش؟")) return;
    try { await updateDoc(doc(db, "new_workers", e.target.dataset.fex), { fiche_exception: on, fiche_exception_at: serverTimestamp() }); }
    catch (err) { tell("ماتحفظش: " + err.message); }
    return;
  }
  const id = e.target.dataset.nrej; if (!id) return;
  try {
    // السبب إجباري — السيرفر بيبعته للمشرف في إشعار الرفض
    const why = (await askText("ترفض العامل ده؟ هيتشال من الكشف وقايمة البدلاء.\nاكتب السبب (بيوصل للمشرف):", { ok: "ارفضه", danger: true, required: true }) || "").trim();
    if (!why) return;
    await rejectNew(WS.newAll.find(x => x.id === id), why);
    tell("اترفض — هيتشال من الكشف خلال ثواني، والمشرف هيوصله السبب.");
  } catch (err) { tell("ماتحفظش: " + err.message); }
});
// عامل اتضاف من المشرف (new_workers) ومش في الرواتب: نلاقيه بالكود/الرقم القومي أو بالاسم والموقع
function newOf(r) {
  const all = WS.newAll || [], c = String(r.code || "");
  return all.find(n => n.id === c || n.nid === c || (n.nid && c.endsWith(n.nid)))
    || all.find(n => n.site === r.site && arNorm(n.name) === arNorm(r.name));
}
$("w-rem")?.addEventListener("click", async e => {
  const code = e.target.dataset.left; if (!code) return;
  const w = WS.base.find(x => x.code === code);
  if (!w) {
    const nw = newOf({ code, site: e.target.dataset.rsite, name: e.target.dataset.rname });
    if (!nw) return tell("العامل ده مش في بيانات الرواتب ولا في العمال الجداد.");
    const why = (await askText(`${nw.name} عامل جديد لسه مستني الـ HR.\nترفضه؟ هيتشال من الكشف وقايمة البدلاء. اكتب السبب:`, { ok: "ارفضه", danger: true, required: true }) || "").trim();
    if (!why) return;
    try { await rejectNew(nw, why); tell("اترفض."); } catch (err) { tell("ماتسجلش: " + err.message); }
    return;
  }
  if (!await ask(`تسجل ${w.name} إنه مشي؟ (طلب خروج — السبب: اتشال من الكشف)`, { ok: "مشي", danger: true })) return;
  try {
    const n = await sendForce([[doc(collection(db, "worker_events")), changeEv(w, "مشي", w.job, w.site, today(), "اتشال من الكشف", "أخرى")]]);
    tell(n ? "اتسجل — السجل هيتحدّث خلال ثواني." : "طلب الخروج راح للـ HR يعتمده.");
  } catch (err) { tell("ماتسجلش: " + err.message); }
});
function current(w) { const o = WS.ovr[w.code]; return o ? { ...w, site: o.site || w.site, job: o.job || w.job, type: o.type || w.type, edited: true } : w; }
function renderWorkers() {
  const q = arNorm($("w-q").value), site = $("w-site").value;
  let list = WS.base.map(current);
  if (site) list = list.filter(w => w.site === site);
  if (q) list = list.filter(w => arNorm(w.name).includes(q) || String(w.code).toLowerCase().includes(q.toLowerCase()) || String(w.nid).includes(q));
  $("w-count").textContent = `${fmt(list.length)} عامل` + (list.length > 100 ? " — بيظهر أول 100، ضيّق البحث" : "");
  $("w-list").innerHTML = list.slice(0, 100).map(w => `<tr><td>${esc(w.name)}</td><td>${esc(w.code)}</td><td>${esc(w.site)}</td>
    <td>${esc(typeLabel(w.type))}${w.edited ? ` <span class="amd">معدّل</span>` : ""}</td><td>${esc(w.job)}</td>
    <td><button class="btn sec small" data-w="${esc(w.code)}">تعديل</button></td></tr>`).join("") || `<tr><td colspan="6" class="muted">مفيش نتايج.</td></tr>`;
}
function renderOverrides() {
  const byCode = Object.fromEntries(WS.base.map(w => [w.code, w]));
  const rows = Object.entries(WS.ovr).sort((a, b) => (b[1].at?.seconds || 0) - (a[1].at?.seconds || 0));
  $("w-ovr").innerHTML = rows.length ? rows.map(([code, o]) => {
    const b = byCode[code] || {};
    const ch = [];
    if (o.type === "مشي") ch.push("مشي");
    else {
      if (o.type && o.type !== b.type) ch.push(`${typeLabel(b.type)} ← ${typeLabel(o.type)}`);
      if (o.job && o.job !== b.job) ch.push(`الوظيفة: ${o.job}`);
      if (o.site && o.site !== b.site) ch.push(`${b.site || "—"} ← ${o.site}`);
    }
    return `<tr><td>${esc(o.name || b.name || "")}</td><td>${esc(code)}</td><td>${esc(ch.join("، ") || "بدون فرق عن الرواتب")}${o.note ? `<div class="muted">${esc(o.note)}</div>` : ""}</td>
      <td style="direction:ltr;text-align:right">${esc(o.from || "")}</td><td class="muted">${esc(o.by_email || "")}</td>
      <td class="muted" style="font-size:12px;">مستني الـ HR</td></tr>`;
  }).join("") : `<tr><td colspan="6" class="muted">مفيش تعديلات.</td></tr>`;
}
// تصدير القايمة اللي ظاهرة (بالبحث والموقع المختارين) — كل العمال مش أول 100 بس
function workersList() {
  const q = arNorm($("w-q").value), site = $("w-site").value;
  let list = WS.base.map(current);
  if (site) list = list.filter(w => w.site === site);
  if (q) list = list.filter(w => arNorm(w.name).includes(q) || String(w.code).toLowerCase().includes(q.toLowerCase()) || String(w.nid).includes(q));
  return list;
}
$("w-export")?.addEventListener("click", () => {
  const site = $("w-site").value;
  const list = workersList().sort((a, b) => a.site.localeCompare(b.site, "ar") || String(a.job).localeCompare(String(b.job), "ar") || String(a.name).localeCompare(String(b.name), "ar"));
  if (!list.length) return tell("مفيش عمال في القايمة دي.");
  const head = ["الاسم", "الكود", "الرقم القومي", "الموقع", "الوظيفة", "النوع", "معدّل يدوي"];
  // كل الخانات نص — عشان الرقم القومي مايتحولش لرقم علمي في الإكسيل
  const aoa = [head, ...list.map(w => [String(w.name || ""), String(w.code || ""), String(w.nid || ""), String(w.site || ""), String(w.job || ""), typeLabel(w.type), w.edited ? "أيوه" : ""])];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{ wch: 34 }, { wch: 10 }, { wch: 16 }, { wch: 16 }, { wch: 18 }, { wch: 10 }, { wch: 10 }];
  const wb = XLSX.utils.book_new();
  wb.Workbook = { Views: [{ RTL: true }] };
  XLSX.utils.book_append_sheet(wb, ws, "العمال");
  XLSX.writeFile(wb, `بيانات العمال ${site || "كل المواقع"} ${today()}.xlsx`);
});
$("w-q")?.addEventListener("input", renderWorkers);
$("w-site")?.addEventListener("change", renderWorkers);
$("w-list")?.addEventListener("click", e => {
  const code = e.target.dataset.w; if (!code) return;
  const w = current(WS.base.find(x => x.code === code));
  WS.edit = WS.base.find(x => x.code === code);
  $("w-title").textContent = `${w.name} — ${w.code}`;
  $("w-type").value = ["اساسي", "بديل راحات", "يومية", "مشي"].includes(w.type) ? w.type : "يومية";
  $("w-job").value = w.job || ""; $("w-site2").value = w.site; $("w-note").value = WS.ovr[code]?.note || "";
  $("w-from").value = today();
  $("w-reason-wrap").classList.toggle("hidden", $("w-type").value !== "مشي");
  hide($("w-msg")); $("w-form").classList.remove("hidden"); $("w-form").scrollIntoView({ behavior: "smooth", block: "center" });
});
$("w-cancel")?.addEventListener("click", () => $("w-form").classList.add("hidden"));
$("w-type")?.addEventListener("change", () => $("w-reason-wrap").classList.toggle("hidden", $("w-type").value !== "مشي"));
function ovrDoc(w, type, job, site, from, note) {
  const u = auth.currentUser;
  return { code: w.code, name: w.name || "", nid: w.nid || "", site: type === "مشي" ? (w.site || "") : site, job: job || w.job || "", type,
    from: from || today(), note: note || "", by: u.uid, by_email: actorEmail(u), at: serverTimestamp() };
}
$("w-save")?.addEventListener("click", async () => {
  const w = WS.edit; if (!w) return;
  const type = $("w-type").value, job = $("w-job").value.trim(), site = $("w-site2").value;
  if (!job && type !== "مشي") return show($("w-msg"), "err", "اكتب الوظيفة.");
  if (type !== "مشي" && (leaveOnly(w.site) || leaveOnly(site))) return show($("w-msg"), "err", "الشرقية للدخان: تقدر تسجّل «مشي» بس — النوع والوظيفة بيتعدلوا من شيت الرواتب.");
  if (type === w.type && job === w.job && site === w.site) return show($("w-msg"), "info", "مفيش تغيير.");
  if (!$("w-from").value) return show($("w-msg"), "err", "اختار التاريخ.");
  $("w-save").disabled = true;
  try {
    const n = await sendForce([[doc(collection(db, "worker_events")), changeEv(w, type, job, site, $("w-from").value, $("w-note").value.trim(), $("w-reason").value)]]);
    show($("w-msg"), "ok", n ? "اتعتمد — السجل والكشف هيتحدّثوا خلال ثواني." : "اتبعت للـ HR يعتمده (في «اعتماد الحالات ← طلبات القوة»).");
    setTimeout(() => $("w-form").classList.add("hidden"), 1500);
  } catch (err) { show($("w-msg"), "err", "ماتحفظش: " + (err.code === "permission-denied" ? "مش مسموح للحساب ده." : err.message)); }
  $("w-save").disabled = false;
});
$("w-ovr")?.addEventListener("click", async e => {
  const code = e.target.dataset.undo; if (!code) return;
  if (!await ask("تلغي التعديل ده؟ العامل هيرجع زي ما هو في شيت الرواتب.", { ok: "الغي التعديل", danger: true })) return;
  try { await deleteDoc(doc(db, "roster_overrides", code)); } catch (err) { tell("مااتلغاش: " + err.message); }
});
// رفع من إكسيل
function nidCheck(nid) {
  if (!/^[23]\d{13}$/.test(nid)) return "الرقم القومي لازم 14 رقم ويبدأ بـ 2 أو 3";
  const y = (nid[0] === "2" ? 1900 : 2000) + +nid.slice(1, 3), m = +nid.slice(3, 5), d = +nid.slice(5, 7);
  const b = new Date(y, m - 1, d);
  if (b.getFullYear() !== y || b.getMonth() !== m - 1 || b.getDate() !== d) return "تاريخ الميلاد في الرقم القومي غلط";
  const t = new Date(); let age = t.getFullYear() - y - ((t.getMonth() + 1 < m || (t.getMonth() + 1 === m && t.getDate() < d)) ? 1 : 0);
  if (age < 18) return `تحت السن القانوني (${age} سنة)`;
  return "";
}
const TYPE_IN = { "اساسي": "اساسي", "أساسي": "اساسي", "سنوي": "اساسي", "موسمي": "يومية", "يوميه": "يومية", "يومية": "يومية", "بديل راحات": "بديل راحات", "بديل راحه": "بديل راحات", "مشي": "مشي", "حذف": "مشي" };
$("w-file")?.addEventListener("change", async e => {
  hide($("w-up-msg")); $("w-preview").classList.add("hidden"); WS.pending = []; WS.pendingNew = [];
  const f = e.target.files[0]; if (!f) return;
  try {
    const wb = XLSX.read(new Uint8Array(await f.arrayBuffer()), { type: "array", cellDates: true });
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "", raw: false });
    const col = (r, ...names) => { for (const n of names) { const k = Object.keys(r).find(k => norm(k) === n); if (k !== undefined && norm(r[k])) return norm(r[k]); } return ""; };
    const byCode = Object.fromEntries(WS.base.map(w => [String(w.code).toUpperCase(), w]));
    const problems = []; let same = 0;
    rows.forEach((r, i) => {
      let code = col(r, "الكود", "كود الموظف", "code").toUpperCase();
      // من غير كود: لو الرقم القومي موجود في الرواتب نجيب كوده ونعامله كتعديل
      const nidIn = code ? "" : enDigits(col(r, "الرقم القومي", "الرقم القومى")).replace(/\D/g, "");
      const known = nidIn ? WS.base.find(w => String(w.nid) === nidIn) : null;
      if (known) code = String(known.code).toUpperCase();
      if (!code) {
        const nid = nidIn, name = col(r, "الاسم").replace(/\s+/g, " ");
        if (!nid && !name) return;
        const bad = nidCheck(nid); if (bad) { problems.push(`سطر ${i + 2}: ${name || nid} — ${bad}`); return; }
        if (name.split(" ").length < 4) { problems.push(`سطر ${i + 2}: الاسم لازم رباعي`); return; }
        let phone = enDigits(col(r, "التليفون", "الموبايل", "رقم التليفون")).replace(/\D/g, ""); if (phone.length === 10 && phone[0] === "1") phone = "0" + phone;
        if (!/^01[0125][0-9]{8}$/.test(phone)) { problems.push(`سطر ${i + 2}: ${name} — التليفون ناقص أو غلط`); return; }
        const tIn = col(r, "النوع", "نوع الوظيفة"), nt = TYPE_IN[arNorm(tIn)] || TYPE_IN[tIn], site = col(r, "الموقع"), job = col(r, "الوظيفة");
        if (!["اساسي", "يومية"].includes(nt)) { problems.push(`سطر ${i + 2}: النوع لازم أساسي أو يومية`); return; }
        if (!W_SITES.includes(site) || leaveOnly(site)) { problems.push(`سطر ${i + 2}: الموقع "${site}" مش من مواقع الحضور`); return; }
        if (!job) { problems.push(`سطر ${i + 2}: الوظيفة ناقصة`); return; }
        WS.pendingNew.push({ nid, name, site, job, type: nt, phone });
        return;
      }
      const w = byCode[code]; if (!w) { problems.push(`سطر ${i + 2}: الكود ${code} مش في مواقع الحضور`); return; }
      const cur = current(w);
      const tRaw = col(r, "النوع", "نوع الوظيفة"); const type = tRaw ? TYPE_IN[arNorm(tRaw).replace("ا", "ا")] || TYPE_IN[tRaw] : cur.type;
      if (tRaw && !type) { problems.push(`سطر ${i + 2}: النوع "${tRaw}" مش معروف`); return; }
      const job = col(r, "الوظيفة") || cur.job, site = col(r, "الموقع") || cur.site;
      if (type !== "مشي" && !W_SITES.includes(site)) { problems.push(`سطر ${i + 2}: الموقع "${site}" مش من مواقع الحضور`); return; }
      if (type !== "مشي" && (leaveOnly(site) || leaveOnly(cur.site))) { problems.push(`سطر ${i + 2}: الشرقية للدخان — مسموح «مشي» بس`); return; }
      if (type === cur.type && job === cur.job && site === cur.site) { same++; return; }
      WS.pending.push({ w, cur, type, job, site, from: col(r, "ساري من") || today(), note: col(r, "ملاحظة") });
    });
    // عمال على نفس المواقع في البوابة ومش في الشيت (مش بيتغيروا، للمعلومة بس)
    const seen = new Set(rows.map(r => col(r, "الكود", "كود الموظف", "code").toUpperCase()).filter(Boolean));
    rows.forEach(r => { const n = enDigits(col(r, "الرقم القومي", "الرقم القومى")).replace(/\D/g, ""); const k = n && WS.base.find(w => String(w.nid) === n); if (k) seen.add(String(k.code).toUpperCase()); });
    const fileSites = new Set(rows.map(r => col(r, "الموقع")).filter(s => W_SITES.includes(s)));
    const missing = WS.base.filter(w => { const c = current(w); return fileSites.has(c.site) && c.type !== "مشي" && !seen.has(String(w.code).toUpperCase()); });
    const missNote = !missing.length ? "" : `\nتنبيه: ${fmt(missing.length)} عامل على ${[...fileSites].join(" / ")} في البوابة مش موجودين في الشيت ومش هيتغيروا — لو مشيوا اكتبهم بالنوع "مشي": ` + missing.slice(0, 10).map(w => `${w.code} ${w.name}`).join("، ") + (missing.length > 10 ? " …" : "");
    $("w-prev-list").innerHTML = WS.pendingNew.map(n => `<tr><td>جديد</td><td>${esc(n.name)}<div class="muted" style="direction:ltr;text-align:right">${esc(n.nid)}</div></td>
      <td>—</td><td><b>${esc(typeLabel(n.type))}</b> · ${esc(n.job)} · ${esc(n.site)}</td><td>من غير بطاقة</td></tr>`).join("") + WS.pending.map(p => `<tr><td>${esc(p.w.code)}</td><td>${esc(p.w.name)}</td>
      <td>${esc(typeLabel(p.cur.type))} · ${esc(p.cur.job)} · ${esc(p.cur.site)}</td><td><b>${esc(typeLabel(p.type))}</b>${p.type !== "مشي" ? ` · ${esc(p.job)} · ${esc(p.site)}` : ""}</td><td>${esc(p.note)}</td></tr>`).join("");
    show($("w-up-msg"), problems.length ? "warn" : "info", `${fmt(WS.pending.length)} تعديل و${fmt(WS.pendingNew.length)} عامل جديد جاهزين للحفظ.` + (same ? `\n${fmt(same)} عامل بياناتهم مطابقة للبوابة ومش محتاجين تعديل.` : "") + missNote + (problems.length ? `\n${problems.length} سطر فيهم مشكلة ومش هيتحفظوا:\n` + problems.slice(0, 15).join("\n") : ""));
    $("w-up-msg").style.whiteSpace = "pre-line";
    if (WS.pending.length || WS.pendingNew.length) $("w-preview").classList.remove("hidden");
  } catch (err) { show($("w-up-msg"), "err", "مش قادر أقرا الملف: " + err.message); }
});
$("w-discard")?.addEventListener("click", () => { WS.pending = []; $("w-preview").classList.add("hidden"); $("w-file").value = ""; hide($("w-up-msg")); });
$("w-apply")?.addEventListener("click", async () => {
  if (!WS.pending.length && !WS.pendingNew.length) return;
  $("w-apply").disabled = true;
  try {
    const u = auth.currentUser;
    // الجداد: عامل مؤقت (new_workers من غير بطاقة) + طلب إضافة للـ HR
    for (const n of WS.pendingNew) {
      const b = writeBatch(db), evRef = doc(collection(db, "worker_events"));
      b.set(doc(db, "new_workers", n.nid), { nid: n.nid, name: n.name, site: n.site, job: n.job, type: n.type, role: n.type === "اساسي" ? "roster" : "replacement",
        no_card: true, first_day: today(), event_id: evRef.id, added_by: u.uid, added_email: actorEmail(u), at: serverTimestamp() });
      b.set(evRef, forceEv("hire", { site: n.site, name: n.name }, { nid: n.nid, phone: n.phone, job: n.job, type: n.type, first_day: today() }));
      await b.commit();
    }
    const evs = WS.pending.map(p => [doc(collection(db, "worker_events")), changeEv(p.cur, p.type, p.job, p.site, p.from, p.note, "أخرى")]);
    const nOk = await sendForce(evs);
    show($("w-up-msg"), "ok", `اتبعت ${fmt(WS.pending.length)} تعديل و${fmt(WS.pendingNew.length)} عامل جديد للـ HR` + (nOk ? ` — منهم ${fmt(nOk)} تعديل اتعتمد على طول.` : ".")
      + " الجداد بيظهروا في «اعتماد الحالات ← طلبات القوة».");
    WS.pending = []; WS.pendingNew = []; $("w-preview").classList.add("hidden"); $("w-file").value = "";
  } catch (err) { show($("w-up-msg"), "err", "ماتحفظش: " + err.message); }
  $("w-apply").disabled = false;
});
