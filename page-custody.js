// page-custody.js — سكريبت صفحة custody.html (اتنقل من جوه الصفحة لملف لوحده عشان الـ CSP تمنع أي سكريبت مكتوب جوه الـ HTML)
import { collection, doc, getDoc, getDocs, setDoc, addDoc, writeBatch, query, where, onSnapshot, runTransaction, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { signInWithEmailAndPassword, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { db, auth, actorEmail, SUP_SITES, ask, fetchPlanBase, planBySite, alignPlan } from './shared.js?v=20261111a';
import { CHIPSY_SITE_PLAN } from './xl-attendance.js?v=20261111a';

const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
function show(el, t, x) { el.className = "msg show " + t; el.textContent = x; }
function hide(el) { el.className = "msg"; }
const ymd = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
const ym = d => ymd(d).slice(0, 7);
const addMonths = (m, n) => { const [y, mo] = m.split("-").map(Number); return ym(new Date(y, mo - 1 + n, 1)); };
const MONTHS = ["يناير", "فبراير", "مارس", "ابريل", "مايو", "يونيو", "يوليو", "اغسطس", "سبتمبر", "اكتوبر", "نوفمبر", "ديسمبر"];
const monthAr = m => { const [y, mo] = (m || "").split("-").map(Number); return y ? MONTHS[mo - 1] + " " + y : ""; };
// البحث: أ/إ/آ = ا، ى = ي، ة = ه، والأرقام العربي = الإنجليزي
const qn = s => String(s ?? "").replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d)).replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").replace(/\s+/g, " ").trim().toLowerCase();

const SHARQIA = "الشرقية للدخان";
const ITEMS = [
  { id: "shoe",   ar: "سيفتي", pieces: 1, svg: '<path d="M3 17V8h4l1 3h3l2-2 7 4a2 2 0 0 1 1 2v2z"/><path d="M3 17h18v2H3z"/>' },
  { id: "tshirt", ar: "تيشرت", pieces: 2, svg: '<path d="M9 3 4 6l2 4 2-1v12h8V9l2 1 2-4-5-3a3 3 0 0 1-6 0z"/>' },
  { id: "vest",   ar: "فيست",  pieces: 1, svg: '<path d="M8 3h2l2 5 2-5h2l3 4v14h-6V12h-2v9H5V7z"/><path d="M5 14h14"/>' },
];
const ITEM = Object.fromEntries(ITEMS.map(i => [i.id, i]));
// الأصناف اللي بتتسلم في الموقع: الشرقية للدخان مالهاش فيست
const itemsOf = site => site === SHARQIA ? ITEMS.filter(i => i.id !== "vest") : ITEMS;
// الأصناف بالوظيفة: مساعد البيع = سيفتي + فيست واحد (من غير تيشرت) · باقي الوظايف = سيفتي + 2 تيشرت (من غير فيست)
// الشرقية للدخان برة القاعدة دي: سيفتي + تيشرت للكل
const isSalesJob = job => /مساعد\S*\s+(ال)?بيع/.test(String(job || ""));
const itemsFor = (site, job) => site === SHARQIA ? itemsOf(site) : itemsOf(site).filter(i => i.id === "shoe" || (i.id === "vest") === isSalesJob(job));
const gets = (site, w, item) => itemsFor(site, w.job).some(i => i.id === item);
// ===== الحد الأقصى للتسليم = العدد المطلوب في المخطط =====
// المخطط بنفس حساب صفحة الحضور: شيت احتياج بيبسي (والإمداد) — وشيبسي من المخطط الثابت. الوظيفة اللي مالهاش مطلوب (الشرقية، المشرفين…) مالهاش حد.
// لو الكشف أكتر من المطلوب: المشرف بيختار مين يستلم، ولما عدد اللي استلموا الصنف يوصل للمطلوب التسليم بيتقفل للباقي.
let PLAN_BASE = null;
async function planOf(site) {
  const today = ymd(new Date());
  let plan = {};
  try { if (!PLAN_BASE) PLAN_BASE = fetchPlanBase(today.slice(0, 7)); plan = planBySite(await PLAN_BASE, today)[site] || {}; } catch (e) { plan = {}; }
  if (!Object.keys(plan).length && CHIPSY_SITE_PLAN[site]) plan = { ...CHIPSY_SITE_PLAN[site] };
  return plan;
}
// المطلوب لوظيفة (بأسماء وظايف الكشف) — null = مفيش حد
const capIn = (plan, roster, job) => { const n = alignPlan(plan, roster.map(w => w.job))[job]; return n == null ? null : Number(n) || 0; };
const SIZES = { shoe: ["40", "41", "42", "43", "44", "45", "46", "47"], tshirt: ["M", "L", "XL", "XXL", "3XL", "4XL", "5XL"], vest: ["واحد"] };
const UNSIZED = "مش معروف";
const STORE = "المخزن العام";   // الأدمن بس — مش فرع، ومالوش كشف ولا دورة   // مخزون اتسجل من غير مقاس (اتشرى قبل ما نعرف المقاسات)

const S = { user: null, admin: false, canEdit: false, sites: [], site: "", cycle: null, roster: [], docs: {}, stock: [], removals: {}, plan: {},
            filter: "all", q: "", busy: new Set(), unsubs: [], store: [] };

// ===== الدخول =====
$("l-btn").onclick = async () => { try { await signInWithEmailAndPassword(auth, $("l-email").value.trim(), $("l-pass").value); } catch (e) { show($("l-err"), "err", "الإيميل أو الباسورد غلط"); } };
$("logout").onclick = () => signOut(auth).finally(() => location.reload()); $("d-out").onclick = () => signOut(auth).finally(() => location.reload());

onAuthStateChanged(auth, async user => {
  ["login", "denied", "app"].forEach(id => $(id).classList.add("hidden"));
  stopWatch();
  if (!user) { $("login").classList.remove("hidden"); return; }
  let claims = {};
  try { claims = (await user.getIdTokenResult()).claims || {}; } catch (e) {}
  const role = claims.role || "";
  const mySites = Array.isArray(claims.sites) && claims.sites.length ? claims.sites : null;
  const ALL = [...SUP_SITES, SHARQIA];
  let regional = false;
  if (role === "supervisor" && mySites) {
    for (let i = 0; i < 2 && !regional; i++) {
      try { regional = (await getDoc(doc(db, "config", "regionals"))).exists(); break; }
      catch (e) { if (e.code === "permission-denied") break; }
    }
  }
  S.user = user; S.admin = role === "admin";
  if (role === "admin" || role === "viewer") S.sites = ALL;
  else if (role === "hr" || role === "accountant") S.sites = mySites ? ALL.filter(s => mySites.includes(s)) : ALL;
  else if (role === "supervisor") S.sites = mySites ? mySites.filter(s => ALL.includes(s)) : [SHARQIA];
  else S.sites = [];
  if (!S.sites.length) { $("denied").classList.remove("hidden"); return; }
  // يعلّم: الأدمن والمشرف (مش الإقليمي). الباقي مشاهدة بس
  S.canEdit = S.admin || (role === "supervisor" && !regional);
  S.reports = ["admin", "hr", "accountant", "viewer"].includes(role) || regional;
  $("rep-card").classList.toggle("hidden", !S.reports);
  $("rep-out").innerHTML = ""; hide($("rep-msg"));
  $("who").textContent = role === "admin" ? "ادمن"
    : role === "supervisor" ? (mySites ? (regional ? "الاقليمى" : "مشرف " + mySites.join("، ")) : "مشرف " + SHARQIA) + (regional ? " — مشاهدة" : "")
    : user.email + " — مشاهدة";
  $("site").innerHTML = (S.admin ? `<option value="${STORE}">${STORE}</option>` : "") + S.sites.map(s => `<option>${esc(s)}</option>`).join("");
  $("so-site").innerHTML = S.sites.map(s => `<option>${esc(s)}</option>`).join("");
  if (S.admin) $("site").value = S.sites[0];
  $("admin-card").classList.toggle("hidden", !S.admin);
  fillSizes();
  $("app").classList.remove("hidden");
  openSite();
});
$("site").addEventListener("change", openSite);

// ===== فتح فرع =====
function stopWatch() { S.unsubs.forEach(u => { try { u(); } catch (e) {} }); S.unsubs = []; }
function openSite() {
  stopWatch();
  document.body.classList.toggle("store", $("site").value === STORE);
  if ($("site").value === STORE) return openStore();
  S.site = $("site").value; S.cycle = null; S.roster = []; S.docs = {}; S.stock = []; S.removals = {}; S.plan = {};
  const site = S.site; planOf(site).then(p => { if (S.site === site) { S.plan = p; render(); } });
  hide($("w-msg")); hide($("cy-msg"));
  $("cy-start").value = ""; S.cyAuto = "";   // الشهر المقترح للدورة يتحسب لكل فرع من جديد (مايفضلش من الفرع اللي قبله)
  render();
  const err = what => e => show($("w-msg"), "err", "مقدرتش أقرا " + what + ": " + (e.code === "permission-denied" ? "مفيش صلاحية" : e.message));
  S.unsubs.push(onSnapshot(doc(db, "custody_cycles", S.site), snap => { S.cycle = snap.exists() ? snap.data() : null; render(); }, err("الدورة")));
  S.unsubs.push(onSnapshot(doc(db, "rosters", S.site), snap => { S.roster = snap.exists() ? (snap.data().workers || []) : []; render(); }, err("كشف الفرع")));
  S.unsubs.push(onSnapshot(query(collection(db, "custody"), where("site", "==", S.site)), snap => {
    S.docs = {}; snap.forEach(d => S.docs[d.id] = d.data()); render();
  }, err("العهد")));
  S.unsubs.push(onSnapshot(query(collection(db, "custody_stock"), where("site", "==", S.site)), snap => {
    S.stock = []; snap.forEach(d => S.stock.push(d.data())); render();
  }, err("المخزون")));
  // تاريخ الشيل من الكشف (للي خرجوا) — الشرقية مالهاش، بيتكتب «مش في الكشف»
  if (S.site !== SHARQIA) S.unsubs.push(onSnapshot(query(collection(db, "sheet_removals"), where("site", "==", S.site)), snap => {
    S.removals = {}; snap.forEach(d => { const r = d.data(); S.removals[r.code] = r; }); render();
  }, () => {}));
}

// ===== الحسابات =====
const key = item => S.cycle ? S.cycle.start + "__" + item : null;
const hasItem = (nid, item) => { const k = key(item); const e = k && S.docs[nid]?.issues?.[k]; return !!(e && !e.returned_at); };
const jobOf = w => w.job || "بدون وظيفة";
const capOf = job => capIn(S.plan, S.roster, job);
const givenIn = (job, item) => S.roster.filter(w => jobOf(w) === job && hasItem(w.nid, item)).length;
// الصنف اتقفل للوظيفة: اللي استلموه وصلوا للمطلوب
const full = (job, item) => { const c = capOf(job); return c != null && givenIn(job, item) >= c; };
// العامل لسه مستني الصنف ده: بتاع وظيفته، ما استلموش، والتسليم مش مقفول
const waits = (w, item) => gets(S.site, w, item) && !hasItem(w.nid, item) && !full(jobOf(w), item);
function stockOf(item) {
  const got = S.stock.filter(s => s.item === item).reduce((a, s) => a + (Number(s.qty) || 0), 0);
  let out = 0;
  Object.values(S.docs).forEach(d => Object.entries(d.issues || {}).forEach(([k, e]) => { if (k.endsWith("__" + item) && !e.returned_at) out++; }));
  out *= ITEM[item].pieces;
  return { got, out, left: got - out };
}
const sizeTxt = w => {
  const p = []; if (w.shoe) p.push("جزمة " + w.shoe); if (w.tshirt && gets(S.site, w, "tshirt")) p.push("تيشرت " + w.tshirt);
  return p.length ? p.join(" · ") : "";
};
const validNid = nid => /^[0-9]{14}$/.test(String(nid || ""));

// ===== الرسم =====
function render() {
  // الدورة
  const cy = S.cycle;
  if (cy) {
    const now = ym(new Date());
    const n = Math.min(6, Math.max(1, (Number(now.slice(0, 4)) - Number(cy.start.slice(0, 4))) * 12 + Number(now.slice(5)) - Number(cy.start.slice(5)) + 1));
    $("cycle-chip").textContent = `دورة ${monthAr(cy.start)} ← ${monthAr(cy.end)} · الشهر ${n} من 6`;
    $("cycle-chip").className = "chip " + (now > cy.end ? "red" : "gray");
    if (now > cy.end) show($("cy-msg"), "warn", "الدورة دي خلصت. التسليم الجديد بيبدأ لما الأدمن يبدأ الدورة الجاية.");
    else hide($("cy-msg"));
  } else {
    $("cycle-chip").textContent = "مفيش دورة";
    $("cycle-chip").className = "chip amber";
    show($("cy-msg"), "warn", S.admin ? "ابدأ دورة للفرع ده من الكارت اللي تحت عشان المشرف يقدر يعلّم." : "الأدمن لسه ما بدأش دورة للفرع ده — العلامات هتشتغل أول ما يبدأها.");
  }
  if (S.admin) {
    const st = $("cy-start");
    const sug = cy ? addMonths(cy.end, 1) : ym(new Date());
    if (!st.value || st.value === S.cyAuto) { st.value = sug; S.cyAuto = sug; }   // الاقتراح بيتحدث لما بيانات الدورة توصل — إلا لو الأدمن كتب شهر بإيده
    $("cy-end").textContent = st.value ? "لحد " + monthAr(addMonths(st.value, 5)) : "";
    $("cy-go").textContent = cy ? "ابدأ الدورة الجاية" : "ابدأ دورة";
    $("st-log").innerHTML = S.stock.slice().sort((a, b) => (b.at?.seconds || 0) - (a.at?.seconds || 0)).map(s =>
      `<tr><td>${s.at?.toDate ? ymd(s.at.toDate()) : "…"}</td><td>${esc(ITEM[s.item]?.ar || s.item)}</td><td>${esc(s.size)}</td><td class="num" dir="ltr">${s.qty}</td><td>${esc(s.note || "")}</td></tr>`
    ).join("") || `<tr><td colspan="5" class="muted">لسه مفيش دفعات.</td></tr>`;
  }

  // الملخص
  const IT = itemsOf(S.site);
  const waiting = {};
  // المستنيين لكل صنف: في كل وظيفة (المطلوب أو الكشف، الأقل) ناقص اللي استلموا
  IT.forEach(i => {
    const jobs = new Map(); S.roster.filter(w => gets(S.site, w, i.id)).forEach(w => jobs.set(jobOf(w), (jobs.get(jobOf(w)) || 0) + 1));
    waiting[i.id] = [...jobs.entries()].reduce((a, [j, n]) => { const c = capOf(j); return a + Math.max(0, (c == null ? n : Math.min(n, c)) - givenIn(j, i.id)); }, 0);
  });
  $("sum").style.gridTemplateColumns = `repeat(${IT.length},minmax(0,1fr))`;
  $("sum").innerHTML = IT.map(i => {
    const s = stockOf(i.id), needP = waiting[i.id] * i.pieces, diff = s.left - needP;
    const chip = !cy ? `<span class="chip gray">—</span>`
      : diff < 0 ? `<span class="chip red">ناقص ${-diff}</span>` : diff > 0 ? `<span class="chip green">زيادة ${diff}</span>` : `<span class="chip gray">مظبوط</span>`;
    const w = i.pieces > 1 ? `${waiting[i.id]} (${needP} قطعة)` : waiting[i.id];
    return `<div><b>${i.ar}${i.pieces > 1 ? " ×" + i.pieces : ""}</b><span class="muted" style="line-height:1.5">في المخزن ${s.left}<br>مستنيين ${w}</span>${chip}</div>`;
  }).join("");

  // الفلتر
  // «ما استلمش حاجة» = مفيش ولا قطعة · «ناقصه حاجة» = فاضله قطعة واحدة على الأقل
  const noneOf = w => itemsFor(S.site, w.job).every(i => !hasItem(w.nid, i.id)) && itemsFor(S.site, w.job).some(i => waits(w, i.id)),
        someMissing = w => itemsFor(S.site, w.job).some(i => waits(w, i.id));
  $("f-all").textContent = `الكل (${S.roster.length})`;
  $("f-none").textContent = `ما استلمش حاجة (${S.roster.filter(noneOf).length})`;
  $("f-wait").textContent = `ناقصه حاجة (${S.roster.filter(someMissing).length})`;
  ["all", "none", "wait"].forEach(f => $("f-" + f).classList.toggle("on", S.filter === f));

  // العمال بالوظيفة
  const q = qn(S.q);
  const list = S.roster.filter(w => (S.filter === "all" || (S.filter === "none" ? noneOf(w) : someMissing(w)))
    && (!q || qn(w.name).includes(q) || qn(w.code).includes(q) || String(w.nid || "").includes(q)));
  const open = new Set([...document.querySelectorAll("details.job[open]")].map(d => d.dataset.job));
  const byJob = new Map();
  list.forEach(w => { const j = w.job || "بدون وظيفة"; if (!byJob.has(j)) byJob.set(j, []); byJob.get(j).push(w); });
  const allByJob = new Map();
  S.roster.forEach(w => { const j = w.job || "بدون وظيفة"; allByJob.set(j, (allByJob.get(j) || []).concat(w)); });
  const dis = !S.canEdit || !cy || ym(new Date()) > (cy?.end || "");
  $("jobs").innerHTML = !S.roster.length ? `<div class="card muted">الكشف فاضي أو لسه بيتحمل.</div>`
    : !list.length ? `<div class="card muted">مفيش نتايج.</div>`
    : [...byJob.entries()].map(([job, ws]) => {
        const all = allByJob.get(job) || ws;
        const IJ = itemsFor(S.site, job === "بدون وظيفة" ? "" : job);   // أصناف الوظيفة دي بس
        const cap = capOf(job), target = cap == null ? all.length : Math.min(all.length, cap);
        const done = IJ.every(i => all.filter(w => hasItem(w.nid, i.id)).length >= target);
        // عدد اللي استلموا كل صنف لوحده في الوظيفة (من المطلوب لو فيه مطلوب)
        const per = IJ.map(i => `${i.ar} ${all.filter(w => hasItem(w.nid, i.id)).length}`).join(" · ");
        const over = cap != null && all.length > cap;
        const shut = IJ.filter(i => full(job, i.id)).map(i => i.ar);
        const isOpen = q || open.has(job) || byJob.size === 1;
        return `<details class="job" data-job="${esc(job)}"${isOpen ? " open" : ""}>
          <summary><span class="t">${esc(job)}</span><span class="chip ${done ? "green" : "amber"}">${per} من ${target}</span></summary>
          ${over ? `<div class="msg show warn" style="margin:6px 0;">الكشف ${all.length} والمطلوب ${cap} — اختار مين يستلم. ${shut.length ? "التسليم اتقفل: " + shut.join(" و") + " (وصل للمطلوب)." : "التسليم بيتقفل لما عدد اللي استلموا يوصل " + cap + "."}</div>` : ""}
          <div class="hdr"><span>${ws.length} عامل</span>${IJ.map(i => `<span>${i.ar}${i.pieces > 1 ? " ×" + i.pieces : ""}</span>`).join("")}</div>
          ${ws.map((w, i) => ({ w, i, n: IJ.filter(it => hasItem(w.nid, it.id)).length }))
              .sort((a, b) => (b.n > 0) - (a.n > 0) || a.i - b.i)   // اللي استلم ولو قطعة واحدة الأول في وظيفته، والباقي بنفس الترتيب
              .map(({ w }) => {
            const sz = sizeTxt(w);
            const ok = validNid(w.nid);
            return `<div class="w"><div class="n"><b>${esc(w.name)}</b>
              <small class="${sz && ok ? "" : "bad"}">${ok ? (sz ? esc(sz) : "ما سجلش مقاسه") : "الرقم القومي ناقص — مينفعش يتعلّم"}${w.code ? " · " + esc(w.code) : ""}</small></div>
              ${IJ.map(i => {
                const on = hasItem(w.nid, i.id), busy = S.busy.has(w.nid + i.id), shutI = !on && full(job, i.id);
                return `<button class="it${on ? " on" : ""}" data-nid="${esc(w.nid)}" data-item="${i.id}" aria-pressed="${on}"
                  aria-label="${i.ar} — ${esc(w.name)}"${shutI ? ` title="اتسلم للمطلوب — التسليم مقفول"` : ""}${dis || !ok || busy || shutI ? " disabled" : ""}><svg viewBox="0 0 24 24" aria-hidden="true">${i.svg}</svg></button>`;
              }).join("")}</div>`;
          }).join("")}
        </details>`;
      }).join("");

  // اللي خرجوا ومعاهم عهدة الدورة دي
  const inRoster = new Set(S.roster.map(w => String(w.nid)));
  const gone = cy ? Object.values(S.docs).filter(d => !inRoster.has(String(d.nid)) && IT.some(i => hasItem(d.nid, i.id))) : [];
  $("left-card").classList.toggle("hidden", !gone.length);
  $("left").innerHTML = gone.map(d => {
    const rem = S.removals[d.code];
    const when = rem ? `اتشال ${rem.at?.toDate ? ymd(rem.at.toDate()) : ""} (${esc(rem.reason || "")})` : "مش في الكشف";
    const items = IT.filter(i => hasItem(d.nid, i.id));
    const iss = items.map(i => `${i.ar} ${esc(d.issues[key(i.id)].at || "")}`).join(" · ");
    return `<div class="w"><div class="n"><b>${esc(d.name)}</b><small>${when}<br>استلم: ${iss}</small></div>
      ${S.canEdit ? items.map(i => `<button class="btn sec small" data-ret="${esc(d.nid)}" data-item="${i.id}">رجّع ${i.ar}</button>`).join("") : ""}</div>`;
  }).join("");
}

// ===== التعليم =====
$("jobs").addEventListener("click", async e => {
  const b = e.target.closest("button.it");
  if (!b || b.disabled) return;
  const w = S.roster.find(x => String(x.nid) === b.dataset.nid);
  if (!w) return;
  const item = b.dataset.item, want = !hasItem(w.nid, item);
  if (want && !gets(S.site, w, item)) return;   // الصنف ده مش لوظيفته
  if (want && full(jobOf(w), item)) return show($("w-msg"), "err", `${ITEM[item].ar} اتسلم للعدد المطلوب في «${jobOf(w)}» (${capOf(jobOf(w))}) — شيل علامة حد تاني الأول لو عايز تسلّمه.`);
  if (!want && !await ask(`تشيل علامة استلام ${ITEM[item].ar} من ${w.name}؟`, { ok: "شيل العلامة", danger: true })) return;
  await mark(w, item, want);
});
// الإيكونات بتتعلّم واحدة واحدة — العامل اللي اتنقل من فرع تاني بتتنقل عهدته معاه لما تعلّم هنا
async function mark(w, item, want) {
  const k = key(item); if (!k) return;
  const ref = doc(db, "custody", String(w.nid));
  S.busy.add(w.nid + item); render();
  try {
    await runTransaction(db, async tx => {
      const snap = await tx.get(ref);
      const cur = snap.exists() ? snap.data() : {};
      const issues = { ...(cur.issues || {}) };
      if (want) { if (!issues[k] || issues[k].returned_at) { issues[k] = { at: ymd(new Date()), by: actorEmail(S.user) };
                  // المقاس وقت الاستلام — عشان المخزون بالمقاس في تقرير الاحتياجات
                  const sz = item === "vest" ? "واحد" : w[item]; if (sz) issues[k].size = String(sz); } }
      else delete issues[k];
      tx.set(ref, { nid: String(w.nid), code: String(w.code || ""), name: String(w.name || "").slice(0, 200), job: String(w.job || "").slice(0, 100),
                    site: S.site, issues, updated_by: S.user.uid, updated_at: serverTimestamp() });
    });
  } catch (err) {
    show($("w-msg"), "err", "ماتسجلش: " + (err.code === "permission-denied" ? "مفيش صلاحية" : err.message));
  } finally { S.busy.delete(w.nid + item); render(); }
}
// رجّع القطعة (للي خرج): بتفضل في السجل، بس بترجع للمخزون ومش بتتحسب عليه
$("left").addEventListener("click", async e => {
  const b = e.target.closest("button[data-ret]");
  if (!b) return;
  const d = S.docs[b.dataset.ret], item = b.dataset.item, k = key(item);
  if (!d || !k || !await ask(`${d.name} رجّع ${ITEM[item].ar}؟ القطعة هترجع للمخزون.`, { ok: "رجّع" })) return;
  b.disabled = true;
  try {
    await runTransaction(db, async tx => {
      const ref = doc(db, "custody", String(d.nid));
      const snap = await tx.get(ref);
      if (!snap.exists()) return;
      const cur = snap.data(), issues = { ...(cur.issues || {}) };
      if (!issues[k]) return;
      issues[k] = { ...issues[k], returned_at: ymd(new Date()), returned_by: actorEmail(S.user) };
      tx.set(ref, { ...cur, issues, updated_by: S.user.uid, updated_at: serverTimestamp() });
    });
  } catch (err) { b.disabled = false; show($("w-msg"), "err", "ماتسجلش: " + (err.code === "permission-denied" ? "مفيش صلاحية" : err.message)); }
});

// ===== البحث والفلتر =====
let qt = null;
$("q").addEventListener("input", () => { clearTimeout(qt); qt = setTimeout(() => { S.q = $("q").value; render(); }, 150); });
$("f-all").onclick = () => { S.filter = "all"; render(); };
$("f-wait").onclick = () => { S.filter = "wait"; render(); };
$("f-none").onclick = () => { S.filter = "none"; render(); };

// ===== الأدمن: الدورة والمخزون =====
function fillSizes() {
  [["st-item", "st-size"], ["sb-item", "sb-size"], ["so-item", "so-size"]].forEach(([a, b]) => {
    const it = $(a).value;
    $(b).innerHTML = SIZES[it].concat(it === "vest" ? [] : [UNSIZED]).map(s => `<option>${s}</option>`).join("");
  });
}
document.querySelectorAll("#st-item, .itsel").forEach(el => el.addEventListener("change", fillSizes));
$("cy-start").addEventListener("change", render);
$("cy-go").onclick = async () => {
  const start = $("cy-start").value;
  if (!/^20\d{2}-\d{2}$/.test(start)) return show($("st-msg"), "err", "اختار شهر البداية.");
  const end = addMonths(start, 5);
  if (S.cycle && start <= S.cycle.end) return show($("st-msg"), "err", `الدورة الحالية لسه لحد ${monthAr(S.cycle.end)} — الجديدة لازم تبدأ بعدها.`);
  if (!await ask(`تبدأ دورة ${S.site}: ${monthAr(start)} ← ${monthAr(end)}؟\nكل العمال هيبقوا «ما استلموش» في الدورة الجديدة.`, { ok: "ابدأ الدورة" })) return;
  try {
    await setDoc(doc(db, "custody_cycles", S.site), { site: S.site, start, end, started_by: S.user.uid, started_at: serverTimestamp() });
    show($("st-msg"), "ok", "الدورة اتبدأت.");
    $("cy-start").value = "";
  } catch (err) { show($("st-msg"), "err", "ماتسجلتش: " + (err.code === "permission-denied" ? "مفيش صلاحية" : err.message)); }
};
$("st-add").onclick = async () => {
  const item = $("st-item").value, size = $("st-size").value, qty = Number($("st-qty").value), note = $("st-note").value.trim();
  if (!Number.isInteger(qty) || qty === 0 || Math.abs(qty) > 5000) return show($("st-msg"), "err", "اكتب العدد (رقم صحيح، والسالب للتصحيح).");
  if (!await ask(`${qty > 0 ? "تضيف" : "تخصم"} ${Math.abs(qty)} ${ITEM[item].ar} مقاس ${size} ${qty > 0 ? "لـ" : "من"} مخزون ${S.site}؟`, { ok: qty > 0 ? "ضيف" : "اخصم" })) return;
  $("st-add").disabled = true;
  try {
    const d = { site: S.site, item, size, qty, by: S.user.uid, at: serverTimestamp() };
    if (note) d.note = note.slice(0, 200);
    await addDoc(collection(db, "custody_stock"), d);
    show($("st-msg"), "ok", "اتسجلت."); $("st-qty").value = ""; $("st-note").value = "";
  } catch (err) { show($("st-msg"), "err", "ماتسجلتش: " + (err.code === "permission-denied" ? "مفيش صلاحية" : err.message)); }
  finally { $("st-add").disabled = false; }
};

// ===== التقارير =====
// بيتقروا مرة لما تدوس الزرار (مش متابعة لحظية) عشان القراءات
const repSites = () => $("rep-scope").value === "all" ? S.sites : [S.site];
const monthsLeft = (fromYm, endYm) => Math.max(0, (Number(endYm.slice(0, 4)) - Number(fromYm.slice(0, 4))) * 12 + Number(endYm.slice(5)) - Number(fromYm.slice(5)));
async function loadSite(site, withExits) {
  const [cy, ro, cu, st] = await Promise.all([
    getDoc(doc(db, "custody_cycles", site)), getDoc(doc(db, "rosters", site)),
    getDocs(query(collection(db, "custody"), where("site", "==", site))),
    getDocs(query(collection(db, "custody_stock"), where("site", "==", site)))]);
  const out = { site, cycle: cy.exists() ? cy.data() : null, roster: ro.exists() ? (ro.data().workers || []) : [], docs: [], stock: [], removals: {}, gone: {}, plan: await planOf(site) };
  cu.forEach(d => out.docs.push(d.data())); st.forEach(d => out.stock.push(d.data()));
  if (withExits) {
    // تاريخ الخروج: الشيل من الكشف (من غير «نقل»)، أو «مشي» من الإدارة
    try { (await getDocs(query(collection(db, "sheet_removals"), where("site", "==", site)))).forEach(d => { const r = d.data(); out.removals[r.code] = r; }); } catch (e) {}
    try { (await getDocs(query(collection(db, "roster_overrides"), where("site", "==", site)))).forEach(d => { const r = d.data(); if (r.type === "مشي") out.gone[r.code] = r; }); } catch (e) {}
  }
  return out;
}
const repErr = e => show($("rep-msg"), "err", "مقدرتش أجيب التقرير: " + (e.code === "permission-denied" ? "مفيش صلاحية" : e.message));
function repTable(head, rows, file, sheet) {
  S.repRows = { head, rows, file, sheet };
  return `<div class="row" style="justify-content:flex-end;margin-bottom:6px;"><button class="btn sec small" id="rep-xl">تنزيل Excel</button></div>
    <div style="overflow-x:auto;"><table><thead><tr>${head.map(h => `<th>${esc(h)}</th>`).join("")}</tr></thead>
    <tbody>${rows.map(r => `<tr>${r.map(c => `<td${typeof c === "number" ? ' class="num"' : ""}>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}
$("rep-out").addEventListener("click", e => {
  if (e.target.id !== "rep-xl" || !S.repRows) return;
  const { head, rows, file, sheet } = S.repRows;
  const ws = XLSX.utils.aoa_to_sheet([head, ...rows]);
  ws["!cols"] = head.map((h, i) => ({ wch: Math.max(10, ...rows.map(r => String(r[i] ?? "").length + 2)) }));
  ws["!views"] = [{ RTL: true }];
  const wb = XLSX.utils.book_new(); wb.Workbook = { Views: [{ RTL: true }] };
  XLSX.utils.book_append_sheet(wb, ws, sheet);
  XLSX.writeFile(wb, file + " " + ymd(new Date()) + ".xlsx");
});

// 1) احتياجات الدورة الجاية: كل اللي في الكشف دلوقتي هياخد جديد، ناقص اللي في المخزن من نفس المقاس
$("rep-needs").onclick = async () => {
  hide($("rep-msg")); $("rep-out").innerHTML = `<p class="muted">بيتحمل…</p>`;
  try {
    const data = await Promise.all(repSites().map(s => loadSite(s, false)));
    const rows = [], tot = {};
    data.forEach(d => {
      itemsOf(d.site).forEach(i => {
        const need = {}, have = {};
        // كل وظيفة: لحد العدد المطلوب بس — واللي استلموا في الدورة الحالية الأول (هما اللي اتختاروا)
        const got = new Set(d.cycle ? d.docs.filter(c => { const e = c.issues?.[d.cycle.start + "__" + i.id]; return e && !e.returned_at; }).map(c => String(c.nid)) : []);
        const byJob = new Map(); d.roster.filter(w => gets(d.site, w, i.id)).forEach(w => { const j = w.job || "بدون وظيفة"; byJob.set(j, (byJob.get(j) || []).concat(w)); });
        const pick = [...byJob.entries()].flatMap(([j, ws]) => { const c = capIn(d.plan, d.roster, j);
          const s = ws.slice().sort((a, b) => got.has(String(b.nid)) - got.has(String(a.nid))); return c == null ? s : s.slice(0, c); });
        pick.forEach(w => { const sz = i.id === "vest" ? "واحد" : (w[i.id] || "من غير مقاس"); need[sz] = (need[sz] || 0) + i.pieces; });
        d.stock.filter(x => x.item === i.id).forEach(x => have[x.size] = (have[x.size] || 0) + (Number(x.qty) || 0));
        d.docs.forEach(c => Object.entries(c.issues || {}).forEach(([k, e]) => {
          if (k.endsWith("__" + i.id) && !e.returned_at) { const sz = i.id === "vest" ? "واحد" : (e.size || "من غير مقاس"); have[sz] = (have[sz] || 0) - i.pieces; }
        }));
        // المخزون اللي مقاسه «مش معروف»: اللي اتسلم بمقاسات مالهاش مخزون بيتخصم منه الأول، والباقي بيظهر في سطر لوحده
        let pool = have[UNSIZED] || 0; delete have[UNSIZED];
        Object.keys(have).forEach(sz => { if (have[sz] < 0 && pool > 0) { const t = Math.min(pool, -have[sz]); pool -= t; have[sz] += t; } });
        const sizes = [...new Set([...Object.keys(need), ...Object.keys(have)])]
          .sort((a, b) => (SIZES[i.id].indexOf(a) + 1 || 99) - (SIZES[i.id].indexOf(b) + 1 || 99));
        if (pool > 0) sizes.push(UNSIZED);
        sizes.forEach(sz => {
          const unk = sz === UNSIZED;
          const n = unk ? 0 : need[sz] || 0, h = unk ? pool : Math.max(0, have[sz] || 0), buy = unk ? 0 : Math.max(0, n - h);
          if (!n && !h) return;
          rows.push([d.site, i.ar + (i.pieces > 1 ? " (قطعة)" : ""), sz, n, h, buy]);
          const t = (tot[i.ar + "|" + sz] = tot[i.ar + "|" + sz] || [i.ar + (i.pieces > 1 ? " (قطعة)" : ""), sz, 0, 0, 0]);
          t[2] += n; t[3] += h; t[4] += buy;
        });
      });
    });
    if (!rows.length) { $("rep-out").innerHTML = `<p class="muted">مفيش عمال في الكشوف دي.</p>`; return; }
    const cyTxt = data.length === 1 && data[0].cycle ? ` — الدورة الجاية تبدأ ${monthAr(addMonths(data[0].cycle.end, 1))}` : "";
    let html = `<p class="muted" style="margin-bottom:6px;">المطلوب = عمال الكشف دلوقتي، ولحد العدد المطلوب في المخطط لكل وظيفة (التيشرت قطعتين للعامل). في المخزن = الباقي من نفس المقاس. «من غير مقاس» = العامل ما سجلش مقاسه في «مطلوب وهام». «مش معروف» = مخزون اتسجل من غير مقاس — راجعه قبل الشراء لأنه ممكن يغطي جزء من «هنشتري»${cyTxt}.</p>`;
    if (data.length > 1) {
      // الأدمن: رصيد المخزن العام بيتطرح من «هنشتري» في الإجمالي
      let sto = null;
      if (S.admin) { try { sto = storeBalance(await loadStore()); } catch (e) { sto = null; } }
      if (sto) Object.entries(sto).forEach(([k, n]) => {
        const [it, sz] = k.split("|"); if (n <= 0) return;
        const lab = ITEM[it].ar + (ITEM[it].pieces > 1 ? " (قطعة)" : "");
        const t = (tot[ITEM[it].ar + "|" + sz] = tot[ITEM[it].ar + "|" + sz] || [lab, sz, 0, 0, 0]);
        t[5] = n; t[4] = Math.max(0, t[4] - n);   // اللي ناقص في الفروع (فرع زيادة مابيغطيش فرع ناقص) − المخزن العام
      });
      html += `<h2 style="margin-top:6px;">الإجمالي</h2>` + `<div style="overflow-x:auto;"><table><thead><tr><th>الصنف</th><th>المقاس</th><th>المطلوب</th><th>في الفروع</th>${sto ? "<th>في المخزن العام</th>" : ""}<th>هنشتري</th></tr></thead><tbody>${
        Object.values(tot).map(t => `<tr><td>${esc(t[0])}</td><td>${esc(t[1])}</td><td class="num">${t[2]}</td><td class="num">${t[3]}</td>${sto ? `<td class="num">${t[5] || 0}</td>` : ""}<td class="num"><b>${t[4]}</b></td></tr>`).join("")}</tbody></table></div><h2 style="margin-top:12px;">بالفرع</h2>`;
    }
    $("rep-out").innerHTML = html + repTable(["الفرع", "الصنف", "المقاس", "المطلوب", "في المخزن", "هنشتري"], rows, "احتياجات العهد", "الاحتياجات");
  } catch (e) { $("rep-out").innerHTML = ""; repErr(e); }
};

// 2) خرجوا قبل نهاية الدورة ومعاهم عهدة ما رجعتش — للمحاسب (من غير مبالغ لحد دلوقتي)
$("rep-left").onclick = async () => {
  hide($("rep-msg")); $("rep-out").innerHTML = `<p class="muted">بيتحمل…</p>`;
  try {
    const data = await Promise.all(repSites().map(s => loadSite(s, true)));
    const rows = [];
    data.forEach(d => {
      if (!d.cycle) return;
      const inRoster = new Set(d.roster.map(w => String(w.nid)));
      d.docs.filter(c => !inRoster.has(String(c.nid))).forEach(c => {
        const items = ITEMS.filter(i => { const e = c.issues?.[d.cycle.start + "__" + i.id]; return e && !e.returned_at; });
        if (!items.length) return;
        const rem = d.removals[c.code], ov = d.gone[c.code];
        if (rem && rem.reason === "نقل لموقع تاني") return;   // اتنقل = العهدة معاه، مش خروج
        const exitDate = rem?.at?.toDate ? ymd(rem.at.toDate()) : (ov?.from || "");
        const why = rem ? (rem.reason || "اتشال من الكشف") : ov ? "مشي (الإدارة)" : "مش في الكشف";
        const left = monthsLeft((exitDate || ymd(new Date())).slice(0, 7), d.cycle.end);
        rows.push([c.name, c.code, c.nid, c.job, d.site,
          items.map(i => i.ar).join(" + "), items.map(i => c.issues[d.cycle.start + "__" + i.id].at).join(" / "),
          exitDate || "—", why, left]);
      });
    });
    if (!rows.length) { $("rep-out").innerHTML = `<p class="muted">مفيش حد خرج ومعاه عهدة من الدورة الحالية.</p>`; return; }
    rows.sort((a, b) => String(a[4]).localeCompare(String(b[4]), "ar") || String(a[0]).localeCompare(String(b[0]), "ar"));
    $("rep-out").innerHTML = `<p class="muted" style="margin-bottom:6px;">«باقي» = الشهور من الخروج لحد نهاية دورة الفرع. اللي رجّع القطعة مش ظاهر هنا.</p>`
      + repTable(["الاسم", "الكود", "الرقم القومى", "الوظيفة", "الفرع", "استلم", "تاريخ الاستلام", "تاريخ الخروج", "السبب", "باقى (شهور)"], rows, "خصم عهدة", "خرجوا قبل الدورة");
  } catch (e) { $("rep-out").innerHTML = ""; repErr(e); }
};

// ===== المخزن العام (الأدمن بس) =====
// custody_store: { type: "buy" (شراء/رصيد بداية/تصحيح بالسالب) | "out" (صرف لفرع), item, size, qty, to_site?, note?, by, at }
// الصرف = مستندين بنفس الـ id في batch واحد: custody_store (out) + custody_stock للفرع — الـ Rules بتتأكد إنهم متطابقين
const loadStore = async () => { const out = []; (await getDocs(collection(db, "custody_store"))).forEach(d => out.push(d.data())); return out; };
function storeBalance(list) {
  const b = {};
  list.forEach(m => { const k = m.item + "|" + m.size; b[k] = (b[k] || 0) + (m.type === "out" ? -1 : 1) * (Number(m.qty) || 0); });
  return b;
}
function openStore() {
  S.site = STORE; $("where-out").innerHTML = ""; hide($("so-msg"));
  S.unsubs.push(onSnapshot(collection(db, "custody_store"), snap => {
    S.store = []; snap.forEach(d => S.store.push(d.data())); renderStore();
  }, e => show($("so-msg"), "err", "مقدرتش أقرا المخزن العام: " + (e.code === "permission-denied" ? "مفيش صلاحية — حدّث الـ Rules" : e.message))));
  renderStore();
}
function renderStore() {
  const bal = storeBalance(S.store);
  const keys = Object.keys(bal).filter(k => bal[k] !== 0).sort((a, b) => {
    const [ia, sa] = a.split("|"), [ib, sb] = b.split("|");
    return ITEMS.findIndex(i => i.id === ia) - ITEMS.findIndex(i => i.id === ib) || (SIZES[ia].indexOf(sa) + 1 || 99) - (SIZES[ib].indexOf(sb) + 1 || 99);
  });
  $("sto-bal").innerHTML = keys.map(k => { const [it, sz] = k.split("|");
    return `<tr><td>${ITEM[it].ar}</td><td>${esc(sz)}</td><td class="num"${bal[k] < 0 ? ' style="color:#a61b12"' : ""}><b>${bal[k]}</b></td></tr>`; }).join("")
    || `<tr><td colspan="3" class="muted">المخزن فاضي — سجّل الرصيد اللي عندك دلوقتي من «شراء / رصيد بداية».</td></tr>`;
  $("sto-log").innerHTML = S.store.slice().sort((a, b) => (b.at?.seconds || 0) - (a.at?.seconds || 0)).map(m =>
    `<tr><td>${m.at?.toDate ? ymd(m.at.toDate()) : "…"}</td><td>${m.type === "out" ? "صرف لـ " + esc(m.to_site) : "شراء"}</td><td>${ITEM[m.item]?.ar || esc(m.item)}</td><td>${esc(m.size)}</td><td class="num" dir="ltr">${m.type === "out" ? -m.qty : m.qty}</td><td>${esc(m.note || "")}</td></tr>`
  ).join("") || `<tr><td colspan="6" class="muted">لسه مفيش حركات.</td></tr>`;
}
const fbErr = e => e.code === "permission-denied" ? "مفيش صلاحية" : e.message;
$("sb-add").onclick = async () => {
  const item = $("sb-item").value, size = $("sb-size").value, qty = Number($("sb-qty").value), note = $("sb-note").value.trim();
  if (!Number.isInteger(qty) || qty === 0 || Math.abs(qty) > 5000) return show($("so-msg"), "err", "اكتب العدد (رقم صحيح، والسالب للتصحيح).");
  if (!await ask(`${qty > 0 ? "تضيف" : "تخصم"} ${Math.abs(qty)} ${ITEM[item].ar} مقاس ${size} ${qty > 0 ? "للمخزن العام" : "من المخزن العام"}؟`, { ok: qty > 0 ? "ضيف" : "اخصم" })) return;
  $("sb-add").disabled = true;
  try {
    const d = { type: "buy", item, size, qty, by: S.user.uid, at: serverTimestamp() };
    if (note) d.note = note.slice(0, 200);
    await addDoc(collection(db, "custody_store"), d);
    show($("so-msg"), "ok", "اتسجلت في المخزن العام."); $("sb-qty").value = ""; $("sb-note").value = "";
  } catch (e) { show($("so-msg"), "err", "ماتسجلتش: " + fbErr(e)); }
  finally { $("sb-add").disabled = false; }
};
$("so-add").onclick = async () => {
  const site = $("so-site").value, item = $("so-item").value, size = $("so-size").value, qty = Number($("so-qty").value);
  if (!Number.isInteger(qty) || qty <= 0 || qty > 5000) return show($("so-msg"), "err", "اكتب العدد (رقم صحيح أكبر من صفر).");
  const have = storeBalance(S.store)[item + "|" + size] || 0;
  if (qty > have) return show($("so-msg"), "err", `الرصيد في المخزن العام من ${ITEM[item].ar} مقاس ${size} = ${have} بس.`);
  if (!await ask(`تصرف ${qty} ${ITEM[item].ar} مقاس ${size} من المخزن العام لـ ${site}؟`, { ok: "اصرف" })) return;
  $("so-add").disabled = true;
  try {
    const id = doc(collection(db, "custody_store")).id, b = writeBatch(db);
    b.set(doc(db, "custody_store", id), { type: "out", item, size, qty, to_site: site, by: S.user.uid, at: serverTimestamp() });
    b.set(doc(db, "custody_stock", id), { site, item, size, qty, note: "صرف من المخزن العام", by: S.user.uid, at: serverTimestamp() });
    await b.commit();
    show($("so-msg"), "ok", `اتصرف لـ ${site}.`); $("so-qty").value = "";
  } catch (e) { show($("so-msg"), "err", "مااتصرفش: " + fbErr(e)); }
  finally { $("so-add").disabled = false; }
};
// فين المخزون: المخزن العام + كل فرع (المستلم ناقص الموزع على العمال) — بيتقري لما تدوس «اعرض»
$("where-go").onclick = async () => {
  $("where-out").innerHTML = `<p class="muted">بيتحمل…</p>`;
  try {
    const data = await Promise.all(S.sites.map(s => loadSite(s, false)));
    const sto = storeBalance(S.store);
    const sum = id => Object.entries(sto).filter(([k]) => k.startsWith(id + "|")).reduce((a, [, n]) => a + n, 0);
    const rows = [[STORE, ...ITEMS.map(i => sum(i.id))]];
    data.forEach(d => rows.push([d.site, ...ITEMS.map(i => {
      const got = d.stock.filter(x => x.item === i.id).reduce((a, x) => a + (Number(x.qty) || 0), 0);
      let out = 0; d.docs.forEach(c => Object.entries(c.issues || {}).forEach(([k, e]) => { if (k.endsWith("__" + i.id) && !e.returned_at) out++; }));
      return got - out * i.pieces;
    })]));
    const tot = ["الإجمالي", ...ITEMS.map((i, j) => rows.reduce((a, r) => a + r[j + 1], 0))];
    $("where-out").innerHTML = repTable(["المكان", ...ITEMS.map(i => i.ar + (i.pieces > 1 ? " (قطعة)" : ""))], [...rows, tot], "مخزون العهد", "فين المخزون");
  } catch (e) { $("where-out").innerHTML = ""; show($("so-msg"), "err", "مقدرتش أجيب الفروع: " + fbErr(e)); }
};
$("where-out").addEventListener("click", e => {
  if (e.target.id !== "rep-xl" || !S.repRows) return;
  const { head, rows, file, sheet } = S.repRows;
  const ws = XLSX.utils.aoa_to_sheet([head, ...rows]); ws["!views"] = [{ RTL: true }];
  const wb = XLSX.utils.book_new(); wb.Workbook = { Views: [{ RTL: true }] };
  XLSX.utils.book_append_sheet(wb, ws, sheet); XLSX.writeFile(wb, file + " " + ymd(new Date()) + ".xlsx");
});
