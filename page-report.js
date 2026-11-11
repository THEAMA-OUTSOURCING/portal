// page-report.js — سكريبت صفحة report.html (اتنقل من جوه الصفحة لملف لوحده عشان الـ CSP تمنع أي سكريبت مكتوب جوه الـ HTML)
import { getFirestore, collection, doc, getDoc, getDocs, setDoc, updateDoc, query, where, serverTimestamp, writeBatch } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { db, auth, actorEmail, ATT_SITES, XL_SITES, JC_DOC, codeMap, codeFor, TIME_SITES, calcHours, hrsTxt, isHelperJob, toMin, hhmm, guessTimes, MAX_SHIFT_MIN, fixReversed, fetchPlanBase, planBySite, alignPlan, ask } from './shared.js?v=20261111a';
import { printOrder } from './sheet.js?v=20261111a';

// مواقع الساعات: الإضافي النهاري والليلي (بالدقايق) على خانة اليوم — والوقت اللي محتاج مراجعة بيتعلّم ومايتحسبش
const TB_TIP = "الوقت محتاج مراجعة — اليوم ده مش محسوب في الإضافي";
function otInto(cell, x, site) {
  if (!cell || !x || !TIME_SITES.includes(site)) return;
  if (x.t_issue || x.min == null) cell.tbad = true;
  else { cell.otd = x.otd || 0; cell.otn = x.otn || 0; }
}
const hrsNum = m => m ? Math.round(m / 60 * 100) / 100 : null;   // ساعات بكسور عشان الإكسيل يجمعها
// خانة اليوم: 1 حاضر، غ غايب، أو الرمز زي ما هو (ج م ض ر ق ن 8 ...). p = قيمة الحضور (ن = نص يوم)
function cellOf(e, app) {
  // الشرقية (شيت المرتبات): k = رمزهم الأصلي للعرض، xd = أيام إضافي (جمعة/عطلة)، xh = ساعات إضافي نهاري
  if (e.s === "P") return { v: e.k || e.c || "1", p: e.c === "ن" ? 0.5 : 1, hrs: !!e.x, app, ...(e.xd ? { xd: +e.xd } : {}), ...(e.xh ? { otd: +e.xh * 60 } : {}) };
  if (e.s === "A") return { v: "غ", p: 0, a: true, app };
  return { v: e.c || "؟", p: 0, l: true, app };   // الإجازة بتظهر برمزنا (س/ذ ← ج)
}
const DAYN = ["الحد", "الاتنين", "التلات", "الأربع", "الخميس", "الجمعة", "السبت"];
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pad = n => String(n).padStart(2, "0");
const ymd = d => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
function show(el, t, x) { el.className = "msg show " + t; el.textContent = x; }
function hide(el) { el.className = "msg"; }
const S = { role: null, sites: [], office: false, report: null };

$("l-btn").onclick = async () => { try { await signInWithEmailAndPassword(auth, $("l-email").value.trim(), $("l-pass").value); } catch (e) { show($("l-err"), "err", "الإيميل أو الباسورد غلط"); } };
$("logout").onclick = () => signOut(auth).finally(() => location.reload()); $("d-out").onclick = () => signOut(auth).finally(() => location.reload());

onAuthStateChanged(auth, async user => {
  ["login", "denied", "app"].forEach(i => $(i).classList.add("hidden"));
  if (!user) return $("login").classList.remove("hidden");
  let c = {}; try { c = (await user.getIdTokenResult()).claims || {}; } catch (e) {}
  S.role = c.role;
  // المشاهد (viewer) بيشوف زي المكتب، بس من غير اعتماد أو تعديل
  S.view = c.role === "viewer";
  // HR أو محاسب ليه فروع: فروعه بس (والـ Rules بترفض أي حاجة برّاها)
  S.scoped = ["hr", "accountant"].includes(c.role) && Array.isArray(c.sites) && c.sites.length ? c.sites : null;
  if (S.scoped) { S.sites = S.scoped; S.office = true; }
  else if (["admin", "hr", "accountant", "viewer"].includes(c.role)) { S.sites = [...ATT_SITES, ...XL_SITES]; S.office = true; }
  else if (c.role === "supervisor" && Array.isArray(c.sites) && c.sites.length) S.sites = c.sites;
  else return $("denied").classList.remove("hidden");
  $("who").textContent = c.role === "admin" ? "ادمن" : user.email;
  document.querySelectorAll(".office-only").forEach(e => e.classList.toggle("hidden", !S.office));
  document.querySelectorAll(".admin-only").forEach(e => e.classList.toggle("hidden", c.role !== "admin"));
  S.canApprove = ["admin", "accountant"].includes(c.role);
  $("tab-approve").classList.toggle("hidden", !S.canApprove && !S.view);
  $("a-all").classList.toggle("hidden", !S.canApprove);
  $("tab-fp").classList.toggle("hidden", c.role !== "admin");   // مؤقتاً للأدمن بس
  // أزرار التنقل بين الصفحات بقت في shared.js (حسب الدور)
  if (S.view) { $("tab-approve").textContent = "حالة الاعتماد"; }
  // الشرقية بتظهر في الاختيار اتنين: الشرقية 1 (16→15) والشرقية 2 (الشهر الميلادي)
  $("a-site").innerHTML = `<option value="*">كل المواقع</option>` + S.sites.map(s => `<option>${esc(s)}</option>`).join("");
  $("r-site").innerHTML = (S.office ? `<option value="*">كل المواقع</option>` : "") + S.sites.flatMap(s => s === SHARQIA ? Object.keys(SH_G) : [s]).map(s => `<option>${esc(s)}</option>`).join("");
  const now = new Date(), m = ymd(now).slice(0, 7);
  $("r-month").value = m;   // الشهر الحالي لحد ما الشهر يخلص (27 أكتوبر = أكتوبر)
  $("h-month").value = m;
  $("a-to").value = ymd(now); $("a-from").value = ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 14));
  $("fp-from").value = ymd(new Date(now.getFullYear(), now.getMonth(), 1)); $("fp-to").value = ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
  $("app").classList.remove("hidden");
  loadHolidays();
});
document.querySelectorAll(".tab").forEach(t => t.onclick = () => {
  document.querySelectorAll(".tab").forEach(x => x.setAttribute("aria-selected", x === t));
  document.querySelectorAll("[data-panel]").forEach(p => p.classList.toggle("hidden", p.dataset.panel !== t.dataset.tab));
});
$("r-kind").onchange = () => { S.report = null; $("r-out").classList.add("hidden"); $("r-print").disabled = true; $("r-xlsx").disabled = true; };
$("r-mode").onchange = () => {
  const c = $("r-mode").value === "custom";
  $("r-month-w").classList.toggle("hidden", c); $("r-from-w").classList.toggle("hidden", !c); $("r-to-w").classList.toggle("hidden", !c);
};

// ===== تصدير البصمة =====
const FP_SITES = { pepsi: [...ATT_SITES, "العامرية امداد", "اكتوبر امداد", "مدينة نصر امداد", "طنطا امداد"], chipsy: ["قطامية", "ابوصير"] };
// قيمة اليوم زي ما السكيل بيقراها (وبيفضل يقرا الأكواد القديمة 1.1 / 2 / 202 من شيتات المشرفين زي ما هي)
function fpCell(e, offDay) {
  if (!e) return "";
  if (e.s === "P") {
    if (e.in) return e.out ? `${e.in}-${e.out}` : e.in;        // وقت فعلي (مواقع الساعات)
    const n = Number(e.c); return e.c && !isNaN(n) && n > 0 ? n : 1;   // الإمداد: ساعات مكتوبة، وإلا وردية عادية
  }
  if (e.s === "A") return offDay ? "" : "خ";
  if (e.c === "ز") return "";                                  // شيبسي: حضور زيادة عن المخطط — مش محسوب
  return e.c === "ض" ? "م" : (e.c || "");                     // ق / ج / م / ط زي ما هي
}
$("fp-go").onclick = async () => {
  const co = $("fp-co").value, from = $("fp-from").value, to = $("fp-to").value;
  if (!from || !to || from > to) return show($("fp-msg"), "err", "الفترة مش صحيحة.");
  show($("fp-msg"), "info", "بيجهّز الملف...");
  try {
    const sites = FP_SITES[co];
    const all = (await fetchDays(from, to, "*")).filter(d => sites.includes(d.site));
    const days = all.filter(d => d.status === "approved"), notApp = all.filter(d => d.status !== "approved");
    if (!days.length) return show($("fp-msg"), "warn", "مفيش أيام معتمدة في الفترة دي." + (notApp.length ? ` (فيه ${notApp.length} يوم لسه ماتمش اعتماده)` : ""));
    let jc = []; try { const d = await getDoc(doc(db, ...JC_DOC)); jc = d.exists() ? d.data().rows || [] : []; } catch (e) {}
    const cmap = codeMap(jc), secs = {};
    for (const s of sites) { try { const o = await getDoc(doc(db, "sheet_order", s)); secs[s] = o.exists() ? o.data().sections || {} : {}; } catch (e) { secs[s] = {}; } }
    const months = [...new Set([from.slice(0, 7), to.slice(0, 7)])], hol = await holidaysFor(months);
    const dates = []; for (let d = new Date(from + "T00:00:00"); ymd(d) <= to; d.setDate(d.getDate() + 1)) dates.push(ymd(d));
    const off = d => new Date(d + "T00:00:00").getDay() === 5 || !!hol[d];
    const rows = {};
    days.forEach(d => Object.entries(d.entries || {}).forEach(([k, e]) => {
      const nid = String(e.nid || "").replace(/\D/g, "");
      const rk = d.site + "|" + (nid || k), r = rows[rk] = rows[rk] || { site: d.site, key: k, name: e.name || "", nid, job: e.job || "", cells: {} };
      const v = fpCell(e, off(d.date));
      const isP = x => typeof x === "number" || /^\d{1,2}:\d{2}/.test(String(x ?? ""));
      if (!(isP(r.cells[d.date]) && !isP(v))) r.cells[d.date] = v;   // مايمسحش حضوره كبديل في نفس اليوم (ولا بـ م؟ / غ)
      // البديل اللي اتسجل قدام غايب: سطر لوحده بحضوره (وبوقته في مواقع الساعات) — زي التقرير الشهري
      if (e.s === "A" && e.rep) {
        const rn = String(e.rep.nid || "").replace(/\D/g, "");
        const rk2 = d.site + "|" + (rn || "R" + (e.rep.code || e.rep.name));
        const rr = rows[rk2] = rows[rk2] || { site: d.site, key: k, name: e.rep.name || "", nid: rn, job: e.job || "", cells: {} };
        rr.cells[d.date] = e.rep.in ? (e.rep.out ? `${e.rep.in}-${e.rep.out}` : e.rep.in) : 1;
      }
    }));
    const list = Object.values(rows).sort((a, b) => sites.indexOf(a.site) - sites.indexOf(b.site) || a.job.localeCompare(b.job) || a.name.localeCompare(b.name));
    const noCode = new Set(), noNid = [];
    list.forEach(r => { r.code = codeFor(cmap, r.site, r.job, secs[r.site]?.[r.key] || ""); if (!r.code) noCode.add(`${r.site}/${r.job}${secs[r.site]?.[r.key] ? "/" + secs[r.site][r.key] : ""}`); if (r.nid.length !== 14) noNid.push(r.name); });
    const aoa = [["م", "الموقع", "الاسم", "الرقم القومى", "الوظيفة", "CODE", ...dates.map(d => new Date(d + "T00:00:00"))]];
    list.forEach((r, i) => aoa.push([i + 1, r.site, r.name, r.nid, r.job, r.code, ...dates.map(d => r.cells[d] ?? "")]));
    const ws = XLSX.utils.aoa_to_sheet(aoa, { cellDates: true, dateNF: "dd/mm/yyyy" });
    ws["!cols"] = [{ wch: 5 }, { wch: 16 }, { wch: 32 }, { wch: 16 }, { wch: 22 }, { wch: 48 }, ...dates.map(() => ({ wch: 12 }))];
    // الرقم القومى نص عشان الإكسيل مايقلبوش لرقم بأُس
    list.forEach((r, i) => { const c = XLSX.utils.encode_cell({ r: i + 1, c: 3 }); if (ws[c]) { ws[c].t = "s"; ws[c].v = r.nid; } });
    const wb = XLSX.utils.book_new(); wb.Workbook = { Views: [{ RTL: true }] };
    XLSX.utils.book_append_sheet(wb, ws, co === "pepsi" ? "حضور بيبسي" : "حضور شيبسي");
    XLSX.writeFile(wb, `${co === "pepsi" ? "حضور بيبسي" : "حضور شيبسي"} للبصمة ${from} - ${to}.xlsx`, { cellDates: true });
    const warn = [];
    if (notApp.length) warn.push(`${notApp.length} يوم لسه ماتمش اعتماده ومش في الملف: ` + [...new Set(notApp.map(d => d.site + " " + d.date.slice(5)))].slice(0, 12).join("، "));
    if (noCode.size) warn.push(`وظايف مالهاش كود إنجليزي (خانة CODE فاضية — زودها في جدول الأكواد): ` + [...noCode].join("، "));
    if (noNid.length) warn.push(`${noNid.length} عامل من غير رقم قومى صحيح: ` + noNid.slice(0, 10).join("، "));
    show($("fp-msg"), warn.length ? "warn" : "ok", `اتصدّر ${list.length} عامل × ${dates.length} يوم.` + (warn.length ? "\n" + warn.join("\n") : ""));
    $("fp-msg").style.whiteSpace = "pre-line";
  } catch (er) { show($("fp-msg"), "err", "ماتصدّرش: " + er.message); }
};

// ===== العطلات =====
async function holidaysFor(months) {
  const out = {};
  for (const m of months) { try { const s = await getDoc(doc(db, "holidays", m)); Object.assign(out, s.exists() ? s.data().days || {} : {}); } catch (e) {} }
  return out;
}
async function loadHolidays() {
  const m = $("h-month").value; if (!m) return;
  const h = await holidaysFor([m]);
  const rows = Object.entries(h).sort();
  $("h-list").innerHTML = rows.length ? rows.map(([d, n]) => `<tr><td>${DAYN[new Date(d + "T00:00").getDay()] || ""} ${esc(d)}</td><td>${esc(n)}</td><td>${S.role === "admin" ? `<button class="btn danger small" data-hdel="${esc(d)}">شيل</button>` : ""}</td></tr>`).join("") : `<tr><td colspan="3" class="muted">مفيش عطلات متسجلة للشهر ده.</td></tr>`;
}
$("h-month").onchange = loadHolidays;
$("h-add").onclick = async () => {
  const d = $("h-date").value, n = $("h-name").value.trim();
  if (!d || !n) return show($("h-msg"), "err", "اختار اليوم واكتب اسم العطلة.");
  const m = d.slice(0, 7), h = await holidaysFor([m]); h[d] = n;
  try { await setDoc(doc(db, "holidays", m), { days: h, updated_at: serverTimestamp() }); $("h-month").value = m; $("h-name").value = ""; show($("h-msg"), "ok", "اتضافت."); loadHolidays(); }
  catch (e) { show($("h-msg"), "err", "ماتضافتش: " + e.message); }
};
$("h-list").onclick = async e => {
  const d = e.target.dataset.hdel; if (!d) return;
  if (!(await ask(`تشيل عطلة يوم ${d}؟`, { ok: "شيلها", danger: true }))) return;
  const m = d.slice(0, 7), h = await holidaysFor([m]); delete h[d];
  try { await setDoc(doc(db, "holidays", m), { days: h, updated_at: serverTimestamp() }); loadHolidays(); } catch (er) { show($("h-msg"), "err", er.message); }
};

// أيام موقع في فترة بس (بدل كل أيام الموقع من البداية) — محتاج index على att_days: site + date.
// لو الـ index لسه مااتعملش، بيرجع للطريقة القديمة عشان الصفحة متقفش.
async function siteDays(site, from, to) {
  try {
    const sn = await getDocs(query(collection(db, "att_days"), where("site", "==", site), where("date", ">=", from), where("date", "<=", to)));
    return sn.docs;
  } catch (e) {
    if (e.code !== "failed-precondition") throw e;
    console.warn("att_days محتاج index (site + date):", e.message);
    const sn = await getDocs(query(collection(db, "att_days"), where("site", "==", site)));
    return sn.docs.filter(d => { const x = d.data().date || ""; return x >= from && x <= to; });
  }
}
// ===== جلب أيام الحضور =====
async function fetchDays(from, to, site) {
  let docs = [];
  if (S.office && !S.scoped && (!site || site === "*")) {
    // المكتب، كل المواقع: الفترة بس
    const sn = await getDocs(query(collection(db, "att_days"), where("date", ">=", from), where("date", "<=", to)));
    sn.forEach(d => docs.push({ id: d.id, ...d.data() }));
  } else {
    // موقع واحد (أو مواقع المشرف): الموقع في الفترة بس
    const sites = site && site !== "*" ? [site] : S.sites;
    for (const s of sites) (await siteDays(s, from, to)).forEach(d => docs.push({ id: d.id, ...d.data() }));
  }
  return docs;
}
function period() {
  const mode = $("r-mode").value;
  if (mode === "custom") return [$("r-from").value, $("r-to").value];
  const [y, m] = $("r-month").value.split("-").map(Number);
  if (mode === "cal") return [ymd(new Date(y, m - 1, 1)), ymd(new Date(y, m, 0))];
  // 21→20 (بيبسي وشيبسي)، 26→25 (الإمداد)، 16→15 (الشرقية 1): من يوم N في الشهر اللي قبله لحد يوم N-1 في الشهر المختار
  const n = Number(mode);
  return [ymd(new Date(y, m - 2, n)), ymd(new Date(y, m - 1, n - 1))];
}

// ===== الحالات المعتمدة من الـ HR (إجازة / مرضي / استقالة): الشرقية من Drive، وطلبات المشرفين، وإكسيل الـ HR =====
// والمرضي اللي مستني رد العميل (بيبسي والإمداد / شيبسي) بيظهر «م؟» — مش غياب ومش معتمد
const SHARQIA = "الشرقية للدخان";
// ===== الشرقية 1 / الشرقية 2: التقسيم من تابة «الشرقية 1» في آخر شيت مرتبات (sharqia_map/groups) =====
const SH_G = { "الشرقية 1": "16", "الشرقية 2": "cal" };   // الاسم ← فترته الافتراضية
const realSite = s => SH_G[s] ? SHARQIA : s;
async function shGroups() {
  try { const m = await getDoc(doc(db, "sharqia_map", "groups")); return m.exists() ? new Set(m.data().nids1 || []) : null; } catch (e) { return null; }
}
// سطور الشرقية بتاخد اسم مجموعتها بدل «الشرقية للدخان»، ولو اختار مجموعة بيفضل سطورها بس
async function splitSharqia(list, sel, siteOf = r => r.site, setSite = (r, v) => r.site = v) {
  if (!list.some(r => siteOf(r) === SHARQIA)) return { list };
  const g1 = await shGroups();
  if (!g1) return SH_G[sel] ? { err: "تقسيم الشرقية 1 / 2 لسه مااتسجلش — ارفع شيت المرتبات (فيه تابة «الشرقية 1») الأول." } : { list };
  list.forEach(r => { if (siteOf(r) === SHARQIA) setSite(r, g1.has(String(r.nid || "")) ? "الشرقية 1" : "الشرقية 2"); });
  return { list: SH_G[sel] ? list.filter(r => siteOf(r) === sel) : list };
}
$("r-site").addEventListener("change", () => { const m = SH_G[$("r-site").value]; if (m) $("r-mode").value = m; $("r-mode").dispatchEvent(new Event("change")); });
// حالات HR بحالة معيّنة — HR/المحاسب اللي ليه فروع بيقرا حالات فروعه بس (الـ Rules بتطلب كده)
const evQuery = st => S.scoped
  ? query(collection(db, "hr_events"), where("status", "==", st), where("site", "in", S.scoped))
  : query(collection(db, "hr_events"), where("status", "==", st));
async function applySharqiaEvents(list, from, to) {
  const rows = list; if (!rows.length) return;
  let codes = {}, evs = [];
  try { const m = await getDoc(doc(db, "sharqia_map", "codes")); codes = m.exists() ? m.data().codes || {} : {}; } catch (e) {}
  try {
    // المستني العميل الأول، والمعتمد بعده عشان يكسب لو الاتنين على نفس اليوم
    const [w, a] = await Promise.all(["client_wait", "approved"].map(st => getDocs(evQuery(st))));
    w.forEach(d => evs.push(d.data())); a.forEach(d => evs.push(d.data()));
  } catch (e) {}
  const byCode = {}, byNid = {};
  rows.forEach(r => { if (r.site === SHARQIA && !r.nid && codes[r.code]?.nid) r.nid = codes[r.code].nid; byCode[r.site + "|" + r.code] = r; if (r.nid) byNid[r.nid] = r; });
  // الرموز الموحدة: ج إجازة، خ إجازة بدون أجر، م مرضي (العارضة القديمة بتتعرض ج)
  const KIND = { annual: ["ج", "إجازة"], casual: ["ج", "إجازة"], unpaid: ["خ", "إجازة بدون أجر"] };
  const isFri = d => new Date(d + "T00:00").getDay() === 5;
  for (const e of evs) {
    const r = (e.nid && byNid[e.nid]) || (e.source === "sharqia_drive" ? byCode[SHARQIA + "|" + e.code] : null); if (!r) continue;
    if (e.type === "resign") {
      if (!e.entry_date || e.entry_date > to) continue;
      r.resigned = e.entry_date;
      for (const d of Object.keys(r.cells)) if (d >= e.entry_date && !r.cells[d].p) r.cells[d] = { v: "س", p: 0, l: true, app: true, ev: "استقالة من " + e.entry_date + (e.reason ? " — " + e.reason : "") };
      continue;
    }
    if (!e.from) continue;
    const [code, lbl] = e.type === "sick" ? ["م", e.sick_kind === "injury" ? "إصابة عمل" : "مرضي"] : (KIND[e.kind] || ["ج", "إجازة"]);
    // رد العميل للمرضي بس — إجازة قديمة كانت «مستني العميل» بتتعرض معتمدة
    const wait = e.status === "client_wait" && e.type === "sick";
    // مرضي العميل اعتمد منه جزء (أو 0): أول N يوم شغل من الحالة م، والباقي خ (الجمعة برة الحسبة)
    const nOk = e.type === "sick" && !wait && e.approved_days != null && e.approved_days !== "" ? +e.approved_days : Infinity;
    let n = 0;
    for (let d = new Date(e.from + "T00:00"); ymd(d) <= (e.to || e.from); d.setDate(d.getDate() + 1)) {
      const k = ymd(d); if (isFri(k)) continue;
      const ok = ++n <= nOk;   // العدّ من أول الحالة، حتى لو اليوم برة فترة التقرير
      if (k < from || k > to) continue;
      const c = r.cells[k];
      if (c?.p) { c.conf = lbl + (wait ? " مستني اعتماد العميل" : ok ? " معتمد" : " مش معتمد من العميل") + " والشيت بيقول حاضر"; continue; }
      r.cells[k] = wait
        ? { v: code + "؟", p: 0, w: true, app: true, ev: `في انتظار اعتماد ${e.type === "sick" ? "المرضي" : "الإجازة"} من العميل ${e.from} → ${e.to}` }
        : ok ? { v: code, p: 0, l: true, app: true, ev: lbl + ` معتمد ${e.from} → ${e.to}` + (nOk < Infinity ? ` (العميل اعتمد ${nOk} من ${e.days})` : "") }
        : { v: "خ", p: 0, l: true, app: true, ev: `${lbl} مش معتمد من العميل — العميل اعتمد ${nOk} من ${e.days} يوم (${e.from} → ${e.to})` };
    }
  }
}

// ===== تقرير الإجازات (ج) / المرضي: سطر لكل حالة معتمدة نهائي =====
const LV_TITLE = { annual: "إجازات", sick: "مرضي" };
async function leaveReport(from, to, sel, jobF, kind) {
  const site = realSite(sel);
  show($("r-msg"), "info", "بيحمّل...");
  try {
    // مين في الموقع: من حضور الفترة (عشان مواقع الإكسيل كمان) + كشوف المواقع
    const who = {}, byCode = {}, anyCode = {};
    const put = (s, code, nid, name, job) => { const w = { site: s, code: String(code || ""), nid: nid || "", name: name || "", job: job || "" }; if (w.nid) who[w.nid] = who[w.nid] || w; if (w.code) { const bk = s + "|" + w.code; byCode[bk] = byCode[bk] || w; anyCode[w.code] = anyCode[w.code] || w; } };
    let codes = {};
    try { const m = await getDoc(doc(db, "sharqia_map", "codes")); codes = m.exists() ? m.data().codes || {} : {}; } catch (e) {}
    for (const d of await fetchDays(from, to, site))
      Object.entries(d.entries || {}).forEach(([code, e]) => put(d.site, code, e.nid || (d.site === SHARQIA ? codes[code]?.nid : ""), e.name, e.job));
    for (const s of (site === "*" ? S.sites : [site])) {
      try { const r = await getDoc(doc(db, "rosters", s)); (r.exists() ? r.data().workers : []).forEach(w => put(s, w.code, w.nid, w.name, w.job)); } catch (e) {}
    }
    const evs = [];
    const sn = await getDocs(evQuery("approved"));
    sn.forEach(d => evs.push(d.data()));
    const isFri = d => new Date(d + "T00:00").getDay() === 5;
    const list = [];
    for (const e of evs) {
      const ok = kind === "sick" ? e.type === "sick" : (e.type === "leave" && e.kind !== "unpaid");
      if (!ok || !e.from) continue;
      // المرضي: الأيام اللي العميل اعتمدها بس (أول N يوم شغل)، واللي تم اعتماده 0 مش بيظهر
      const nOk = kind === "sick" && e.approved_days != null && e.approved_days !== "" ? +e.approved_days : Infinity;
      if (nOk === 0) continue;
      let eTo = e.to || e.from;
      if (nOk < Infinity) { let n = 0; for (let d = new Date(e.from + "T00:00"); ymd(d) <= eTo; d.setDate(d.getDate() + 1)) if (!isFri(ymd(d)) && ++n === nOk) { eTo = ymd(d); break; } }
      if (eTo < from || e.from > to) continue;
      const w = (e.nid && who[e.nid]) || (e.source === "sharqia_drive" ? byCode[SHARQIA + "|" + e.code] : (e.code ? anyCode[String(e.code)] : null));
      if (!w && site !== "*") continue;     // موقع معيّن: الحالات اللي عمالها في الموقع ده بس
      let inP = 0; for (let d = new Date((e.from > from ? e.from : from) + "T00:00"); ymd(d) <= (eTo < to ? eTo : to); d.setDate(d.getDate() + 1)) if (!isFri(ymd(d))) inP++;
      list.push({ site: w?.site || [e.company, e.loc].filter(Boolean).join(" — ") || "—", name: e.name || w?.name || "", nid: e.nid || w?.nid || "", code: e.code || w?.code || "",
        job: w?.job || e.job || "", from: e.from, to: eTo, inP, days: nOk < Infinity ? nOk : (+e.days || inP),
        reason: [e.sick_kind === "injury" ? "إصابة عمل" : "", e.cause || e.reason || "", nOk < Infinity ? `العميل اعتمد ${nOk} من ${e.days}` : ""].filter(Boolean).join(" — "), note: e.note || "",
        flag: e.deleted_in_sheet ? "اتمسح من الشيت" : e.changed ? "اتعدل في الشيت ولسه مستني مراجعة الـ HR" : "" });
    }
    const sp = await splitSharqia(list, sel); if (sp.err) return show($("r-msg"), "err", sp.err);
    if (sp.list !== list) { list.length = 0; list.push(...sp.list); }
    const jobs = [...new Set(list.map(r => r.job).filter(Boolean))].sort();
    $("r-job").innerHTML = `<option value="">كل الوظايف</option>` + jobs.map(j => `<option ${j === jobF ? "selected" : ""}>${esc(j)}</option>`).join("");
    let rows = jobF ? list.filter(r => r.job === jobF) : list;
    if (!rows.length) { $("r-out").classList.add("hidden"); return show($("r-msg"), "warn", `مفيش ${LV_TITLE[kind]} معتمد في الفترة دي.`); }
    rows.sort((a, b) => a.site.localeCompare(b.site) || a.name.localeCompare(b.name) || a.from.localeCompare(b.from));
    const multi = site === "*";
    let h = `<thead><tr><th>م</th>${multi ? "<th>الموقع</th>" : ""}<th>الاسم</th><th>الرقم القومي / الكود</th><th>الوظيفة</th><th>من</th><th>لحد</th><th>أيام في الفترة</th><th>أيام الحالة</th><th>السبب / ملاحظة</th></tr></thead><tbody>`;
    rows.forEach((r, i) => h += `<tr data-i="${i}"><td>${i + 1}</td>${multi ? `<td>${esc(r.site)}</td>` : ""}<td class="nm">${esc(r.name)}</td><td>${esc(r.nid || r.code)}</td><td>${esc(r.job)}</td><td>${esc(r.from)}</td><td>${esc(r.to)}</td><td><b>${esc(r.inP)}</b></td><td>${esc(r.days)}</td><td class="nm">${esc([r.reason, r.note].filter(Boolean).join(" — "))}${r.flag ? ` <b style="color:#a32d2d">(${esc(r.flag)})</b>` : ""}</td></tr>`);
    const tot = rows.reduce((a, r) => a + r.inP, 0), ppl = new Set(rows.map(r => r.nid || r.code || r.name)).size;
    h += `<tr class="foot"><td colspan="${multi ? 7 : 6}" style="text-align:right">الإجمالي</td><td><b>${tot}</b></td><td></td><td></td></tr></tbody>`;
    $("r-table").innerHTML = h;
    S.report = { kind, from, to, site: sel, list: rows, tot, ppl };
    $("print-head").innerHTML = `<b>تقرير ${LV_TITLE[kind]} — ${esc(multi ? "كل المواقع" : sel)}${jobF ? " — " + esc(jobF) : ""}</b> — من ${from} لحد ${to}`;
    $("r-sum").textContent = `${rows.length} حالة · ${ppl} عامل · ${tot} يوم في الفترة (من غير الجمعة) · الحالات المعتمدة من الـ HR بس`;
    $("r-out").classList.remove("hidden"); hide($("r-msg")); filterRows();
    $("r-print").disabled = false; $("r-xlsx").disabled = false;
  } catch (e) { show($("r-msg"), "err", "حصل خطأ: " + e.message); }
}
async function leaveXlsx(R) {
  const ExcelJS = await loadExcelJS();
  const multi = R.site === "*", title = LV_TITLE[R.kind];
  const head = ["م", ...(multi ? ["الموقع"] : []), "الاسم", "الرقم القومي / الكود", "الوظيفة", "من", "لحد", "أيام في الفترة", "أيام الحالة", "السبب / ملاحظة"];
  const wb = new ExcelJS.Workbook(); wb.creator = "بوابة تيما";
  const ws = wb.addWorksheet(title, { views: [{ rightToLeft: true, state: "frozen", ySplit: 2 }],
    pageSetup: { orientation: "landscape", paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  const thin = { style: "thin", color: { argb: "FFBFBFBF" } }, box = { top: thin, left: thin, bottom: thin, right: thin };
  ws.mergeCells(1, 1, 1, head.length);
  Object.assign(ws.getCell(1, 1), { value: `تقرير ${title} — ${multi ? "كل المواقع" : R.site} — من ${R.from} لحد ${R.to}`, font: { bold: true, size: 13 }, alignment: { horizontal: "center" } });
  const hr = ws.addRow(head);
  hr.eachCell(c => { c.font = { bold: true, color: { argb: "FFFFFFFF" } }; c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2B2B2B" } }; c.alignment = { horizontal: "center", vertical: "middle", wrapText: true }; c.border = box; });
  R.list.forEach((r, i) => {
    const row = ws.addRow([i + 1, ...(multi ? [r.site] : []), r.name, r.nid || r.code, r.job, r.from, r.to, r.inP, r.days, [r.reason, r.note, r.flag && "(" + r.flag + ")"].filter(Boolean).join(" — ")]);
    row.eachCell({ includeEmpty: true }, c => { c.border = box; c.alignment = { horizontal: "center", vertical: "middle" }; });
  });
  const fv = Array(head.length).fill(null); fv[head.length - 4] = "الإجمالي"; fv[head.length - 3] = R.tot;
  const f = ws.addRow(fv);
  f.font = { bold: true };
  const w = [5, ...(multi ? [18] : []), 28, 18, 16, 12, 12, 10, 10, 30]; w.forEach((x, i) => ws.getColumn(i + 1).width = x);
  const buf = await wb.xlsx.writeBuffer();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  a.download = `${title} ${multi ? "كل المواقع" : R.site} ${R.from} - ${R.to}.xlsx`;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

// ===== التقرير =====
$("r-go").onclick = async () => {
  const [from, to] = period();
  if (!from || !to || from > to) return show($("r-msg"), "err", "الفترة مش صحيحة.");
  const sel = $("r-site").value, site = realSite(sel), jobF = $("r-job").value, onlyApp = $("r-approved").checked;
  if (S.office && $("r-kind").value !== "att") return leaveReport(from, to, sel, jobF, $("r-kind").value);
  show($("r-msg"), "info", "بيحمّل...");
  try {
    const days = (await fetchDays(from, to, site)).filter(d => !onlyApp || d.status === "approved");
    const dates = []; for (let d = new Date(from + "T00:00"); ymd(d) <= to; d.setDate(d.getDate() + 1)) dates.push(ymd(d));
    const hol = await holidaysFor([...new Set(dates.map(d => d.slice(0, 7)))]);
    const off = d => new Date(d + "T00:00").getDay() === 5 || !!hol[d];
    // أسماء من كشوف المواقع
    const roster = {};
    for (const s of (site === "*" ? S.sites : [site])) {
      try { const r = await getDoc(doc(db, "rosters", s)); (r.exists() ? r.data().workers : []).forEach(w => roster[s + "|" + w.code] = { ...w, site: s }); } catch (e) {}
    }
    const rows = {};
    const getRow = (key, base) => rows[key] || (rows[key] = { ...base, cells: {} });
    for (const d of days) {
      Object.entries(d.entries || {}).forEach(([code, e]) => {
        const w = roster[d.site + "|" + code] || {};
        // نفس الشخص (نفس الرقم القومى في نفس الموقع) = سطر واحد، سواء اتسجل باسمه أو كبديل قدام غايب
        const nid = String(e.nid || w.nid || "").replace(/\D/g, "");
        const r = getRow(d.site + "|" + (nid.length === 14 ? "N" + nid : code), { site: d.site, code, name: e.name || w.name || code, nid: e.nid || w.nid || "", job: e.job || w.job || "", loc: e.loc || "", rep: !!e.sub });
        if (!e.sub && r.rep) Object.assign(r, { rep: false, code, name: e.name || w.name || r.name, job: e.job || w.job || r.job, loc: e.loc || r.loc || "" });   // السطر اتعمل من البديل الأول: ياخد بيانات العامل نفسه
        const c0 = cellOf(e, d.status === "approved");
        if (!(r.cells[d.date]?.p > 0 && !(c0.p > 0))) r.cells[d.date] = c0;   // مايمسحش حضوره كبديل في نفس اليوم
        if (e.s === "P") otInto(r.cells[d.date], e, d.site);
        if (e.s === "A" && e.rep) {
          const rn = String(e.rep.nid || "").replace(/\D/g, "");
          const k = d.site + "|" + (rn.length === 14 ? "N" + rn : "R" + (e.rep.code || e.rep.name));
          const rr = getRow(k, { site: d.site, code: e.rep.code || "", name: e.rep.name, nid: e.rep.nid || "", job: e.job || w.job || "", rep: true });
          rr.cells[d.date] = { v: "1", p: 1, app: d.status === "approved" };
          otInto(rr.cells[d.date], e.rep, d.site);
        }
      });
    }
    let list = Object.values(rows);
    if (S.office) await applySharqiaEvents(list, from, to);
    const sp = await splitSharqia(list, sel); if (sp.err) return show($("r-msg"), "err", sp.err); list = sp.list;
    if (!list.length) { $("r-out").classList.add("hidden"); return show($("r-msg"), "warn", "مفيش حضور متأكد في الفترة دي."); }
    const jobs = [...new Set(list.map(r => r.job))].sort();
    $("r-job").innerHTML = `<option value="">كل الوظايف</option>` + jobs.map(j => `<option ${j === jobF ? "selected" : ""}>${esc(j)}</option>`).join("");
    if (jobF) list = list.filter(r => r.job === jobF);
    list.sort((a, b) => a.site.localeCompare(b.site) || a.rep - b.rep || a.job.localeCompare(b.job) || (a.loc || "").localeCompare(b.loc || "") || a.name.localeCompare(b.name));
    // الإضافي: شغل في جمعة أو عطلة، أو ساعات مكتوبة بالرقم (زي 8 في يوم راحة منسقين الإمداد)
    list.forEach(r => { r.total = 0; r.extra = 0; r.otd = 0; r.otn = 0; r.tbad = 0; dates.forEach(d => { const c = r.cells[d]; if (c?.p) { r.total += c.p; if (c.xd) r.extra += c.xd; else if (off(d) || c.hrs) r.extra += c.p; }
      if (c?.tbad) r.tbad++; else if (c) { r.otd += c.otd || 0; r.otn += c.otn || 0; } }); });
    // مواقع الساعات: عمودين للإضافي (نهاري / ليلي) بالساعات — الأيام اللي وقتها محتاج مراجعة مش بتتحسب فيهم
    const timed = list.some(r => TIME_SITES.includes(r.site) || r.otd);   // + الشرقية لو فيها ساعات إضافي (7س)
    const otSum = k => list.reduce((a, r) => a + (r[k] || 0), 0), nBad = list.reduce((a, r) => a + r.tbad, 0);
    const hasLoc = list.some(r => r.loc);
    const late = days.filter(d => d.late).length, unapp = days.filter(d => d.status !== "approved").length;
    S.report = { kind: "att", from, to, dates, list, off, hol, site: sel, late, hasLoc, timed };
    // جدول
    const multi = site === "*";
    let h = `<thead><tr><th>م</th>${multi ? "<th>الموقع</th>" : ""}<th>الاسم</th><th>${list.some(r => !r.nid) ? "الرقم القومي / الكود" : "الرقم القومي"}</th><th>الوظيفة</th>${hasLoc ? "<th>المكان</th>" : ""}` +
      dates.map(d => `<th class="${off(d) ? "off" : ""}" title="${esc(hol[d] || "")}">${+d.slice(8)}<br>${"حنثرخجس"[new Date(d + "T00:00").getDay()]}</th>`).join("") +
      `<th>الإجمالي</th><th>إضافي</th>${timed ? "<th>إضافي نهاري</th><th>إضافي ليلي</th>" : ""}</tr></thead><tbody>`;
    list.forEach((r, i) => {
      h += `<tr data-i="${i}"><td>${i + 1}</td>${multi ? `<td>${esc(r.site)}</td>` : ""}<td class="nm">${esc(r.name)}${r.rep ? " <span class='muted'>(بديل)</span>" : ""}</td><td>${esc(r.nid || r.code)}</td><td>${esc(r.job)}</td>${hasLoc ? `<td>${esc(r.loc)}</td>` : ""}` +
        dates.map(d => { const c = r.cells[d]; return `<td class="${off(d) ? "off" : ""} ${c?.a ? "a" : ""} ${c?.l ? (isLeave(c) ? "lvg" : "lv") : ""} ${c?.conf ? "conf" : ""} ${c?.w ? "wt" : ""} ${c && !c.app ? "unapp" : ""} ${c?.tbad ? "tb" : ""}"${c?.ev || c?.conf || c?.tbad ? ` title="${esc(c.ev || c.conf || TB_TIP)}"` : ""}>${c ? esc(c.v) : ""}</td>`; }).join("") +
        `<td><b>${r.total}</b></td><td>${r.extra || ""}</td>${timed ? (TIME_SITES.includes(r.site) || r.otd ? `<td>${r.otd ? hrsTxt(r.otd) : ""}</td><td>${r.otn ? hrsTxt(r.otn) : ""}</td>` : "<td></td><td></td>") : ""}</tr>`;
    });
    const span = (multi ? 5 : 4) + (hasLoc ? 1 : 0);
    const footRow = (label, f, tail = timed ? "<td></td><td></td>" : "") => `<tr class="foot"><td colspan="${span}" style="text-align:right">${esc(label)}</td>` +
      dates.map(d => `<td class="${off(d) ? "off" : ""}">${f(d) || ""}</td>`).join("") + `<td></td><td></td>${tail}</tr>`;
    const pres = (rs, d) => rs.reduce((a, r) => a + (r.cells[d]?.p || 0), 0);
    (jobF ? [jobF] : jobs).forEach(j => h += footRow("حاضرين — " + j, d => pres(list.filter(r => r.job === j), d)));
    h += footRow("إجمالي الحاضرين", d => pres(list, d), timed ? `<td>${hrsTxt(otSum("otd"))}</td><td>${hrsTxt(otSum("otn"))}</td>` : "") + "</tbody>";
    $("r-table").innerHTML = h;
    const sTitle = multi ? "كل المواقع" : sel;
    $("print-head").innerHTML = `<b>تقرير حضور ${esc(sTitle)}${jobF ? " — " + esc(jobF) : ""}</b> — من ${from} لحد ${to}`;
    $("r-sum").textContent = `${list.length} عامل · ${days.length} يوم حضور متأكد · ${unapp} لسه ماتمش اعتماده · رفع متأخر: ${late} مرة` + (timed && nBad ? ` · ${nBad} يوم وقته محتاج مراجعة (برتقالي) ومش محسوب في الإضافي` : "") + (Object.keys(hol).length ? ` · العطلات: ${Object.entries(hol).filter(([d]) => d >= from && d <= to).map(([d, n]) => d.slice(8) + " " + n).join("، ")}` : "");
    $("r-out").classList.remove("hidden"); hide($("r-msg")); filterRows();
    $("r-print").disabled = false; $("r-xlsx").disabled = false;
  } catch (e) { show($("r-msg"), "err", "حصل خطأ: " + e.message); }
};
$("r-print").onclick = () => window.print();
// بحث سريع في الجدول المعروض (الاسم / الرقم القومي / الكود)
function filterRows() {
  const q = $("r-q").value.trim();
  document.querySelectorAll("#r-table tbody tr:not(.foot)").forEach(tr => {
    const r = S.report?.list?.[+tr.dataset.i];
    tr.style.display = !q || (r && [r.name, r.nid, r.code].some(x => String(x || "").includes(q))) ? "" : "none";
  });
}
$("r-q").oninput = filterRows;
// ===== تنزيل إكسيل منسّق زي الجدول اللي على البوابة (ExcelJS بتتحمّل بس لما تدوس الزرار) =====
let excelJsP = null;
function loadExcelJS() {
  return excelJsP || (excelJsP = new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js";
    s.integrity = "sha384-Pqp51FUN2/qzfxZxBCtF0stpc9ONI6MYZpVqmo8m20SoaQCzf+arZvACkLkirlPz"; s.crossOrigin = "anonymous";   // لو الملف على الـ CDN اتغيّر مايشتغلش
    s.onload = () => res(window.ExcelJS);
    s.onerror = () => { excelJsP = null; rej(new Error("مكتبة الإكسيل ماتحمّلتش")); };
    document.head.appendChild(s);
  }));
}
// رموز الإجازة بأجر (ج ورموز الإجازة في شيتات العملاء) بالأخضر،
// والمرضي والإجازة بدون أجر (خ) وباقي الرموز (استقالة، توقف، راحة، إصابة) بالأزرق — عشان يبان الفرق
// (ع وب اتلغوا — الحالات القديمة بتتعرض ج وخ)
const LEAVE_CODES = new Set(["ج", "ف", "و", "ث"]);
const isLeave = c => !!c?.l && LEAVE_CODES.has(c.v);
const DAY_FULL = ["الأحد", "الاتنين", "التلات", "الأربع", "الخميس", "الجمعة", "السبت"];
// بيبني الشيت من نفس بيانات الجدول المعروض (S.report)
function buildReportWorkbook(ExcelJS, R) {
  const multi = R.site === "*";
  const fixed = ["م", ...(multi ? ["الموقع"] : []), "الاسم", "الرقم القومي", "الوظيفة", ...(R.hasLoc ? ["المكان"] : []), "النوع"];
  const nF = fixed.length, nD = R.dates.length, nAll = nF + nD + 2 + (R.timed ? 2 : 0);
  const C = { dark: "FF2B2B2B", off: "FFFDE9D9", offTxt: "FFA32D2D", abs: "FFA32D2D", lv: "FF185FA5", lvg: "FF3B6D11", unapp: "FFFFFBEA", wt: "FFFFF5DE", wtTxt: "FF8A5A10", foot: "FFF3F3EF", conf: "FFE0A020", grid: "FFBFBFBF", tb: "FFFDE2C4" };
  const fill = argb => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
  const thin = { style: "thin", color: { argb: C.grid } };
  const box = { top: thin, left: thin, bottom: thin, right: thin };
  const wb = new ExcelJS.Workbook(); wb.creator = "بوابة تيما";
  const ws = wb.addWorksheet("الحضور", {
    views: [{ rightToLeft: true, state: "frozen", xSplit: nF, ySplit: 3 }],
    pageSetup: { orientation: "landscape", paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: .3, right: .3, top: .4, bottom: .4, header: .2, footer: .2 } },
  });
  ws.pageSetup.printTitlesRow = "2:3";
  // 1) العنوان
  ws.mergeCells(1, 1, 1, nAll);
  const t = ws.getCell(1, 1);
  t.value = `تقرير حضور ${multi ? "كل المواقع" : R.site} — من ${R.from} لحد ${R.to}`;
  t.font = { name: "Arial", size: 14, bold: true }; t.alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(1).height = 26;
  // 2-3) العناوين: الأعمدة الثابتة على صفين، والأيام: التاريخ فوق واسم اليوم تحت
  const head = (r, c, v, offDay) => {
    const cell = ws.getCell(r, c); cell.value = v; cell.border = box;
    cell.font = { name: "Arial", size: 10, bold: true, color: { argb: offDay ? C.offTxt : "FFFFFFFF" } };
    cell.fill = fill(offDay ? C.off : C.dark);
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  };
  fixed.forEach((h, i) => { ws.mergeCells(2, i + 1, 3, i + 1); head(2, i + 1, h); });
  R.dates.forEach((d, i) => {
    const off = R.off(d), wd = new Date(d + "T00:00").getDay();
    head(2, nF + 1 + i, +d.slice(8) + "/" + +d.slice(5, 7), off);
    head(3, nF + 1 + i, DAY_FULL[wd] + (R.hol[d] ? "\n" + R.hol[d] : ""), off);
  });
  [["الإجمالي", nF + nD + 1], ["إضافي", nF + nD + 2], ...(R.timed ? [["إضافي نهاري (ساعة)", nF + nD + 3], ["إضافي ليلي (ساعة)", nF + nD + 4]] : [])].forEach(([h, c]) => { ws.mergeCells(2, c, 3, c); head(2, c, h); });
  ws.getRow(2).height = 20; ws.getRow(3).height = Object.keys(R.hol).length ? 34 : 20;
  // 4...) العمال
  R.list.forEach((r, i) => {
    const vals = [i + 1, ...(multi ? [r.site] : []), r.name, r.nid || r.code, r.job, ...(R.hasLoc ? [r.loc] : []), r.rep ? "بديل" : "",
      ...R.dates.map(d => { const c = r.cells[d]; return !c ? null : c.v === "1" ? 1 : (isNaN(+c.v) ? c.v : +c.v); }), r.total, r.extra || null,
      ...(R.timed ? (TIME_SITES.includes(r.site) || r.otd ? [hrsNum(r.otd), hrsNum(r.otn)] : [null, null]) : [])];
    const row = ws.addRow(vals);
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      cell.border = box; cell.font = { name: "Arial", size: 10 };
      cell.alignment = { horizontal: col === nF - (R.hasLoc ? 4 : 3) || (multi && col === 2) ? "right" : "center", vertical: "middle" };
      if (col > nF && col <= nF + nD) {
        const d = R.dates[col - nF - 1], c = r.cells[d];
        if (R.off(d)) cell.fill = fill(C.off);
        if (c && !c.app) cell.fill = fill(C.unapp);
        if (c?.a) cell.font = { name: "Arial", size: 10, bold: true, color: { argb: C.abs } };
        if (c?.l) cell.font = { name: "Arial", size: 10, bold: true, color: { argb: isLeave(c) ? C.lvg : C.lv } };
        if (c?.w) { cell.fill = fill(C.wt); cell.font = { name: "Arial", size: 10, bold: true, color: { argb: C.wtTxt } }; }
        if (c?.conf) { const o = { style: "medium", color: { argb: C.conf } }; cell.border = { top: o, left: o, bottom: o, right: o }; }
        if (c?.tbad) cell.fill = fill(C.tb);
        if (c?.ev || c?.conf || c?.tbad) cell.note = c.ev || c.conf || TB_TIP;
      }
      if (col > nF + nD) cell.font = { name: "Arial", size: 10, bold: true };
    });
    // الاسم يمين
    ws.getCell(row.number, multi ? 3 : 2).alignment = { horizontal: "right", vertical: "middle" };
    if (r.rep) ws.getCell(row.number, nF).font = { name: "Arial", size: 10, italic: true, color: { argb: "FF888780" } };
  });
  // صفوف الإجماليات
  const pres = (rs, d) => rs.reduce((a, r) => a + (r.cells[d]?.p || 0), 0);
  const foot = (label, f, tail) => {
    const row = ws.addRow([...Array(nF).fill(null), ...R.dates.map(d => f(d) || null), null, null, ...(R.timed ? (tail || [null, null]) : [])]);
    ws.mergeCells(row.number, 1, row.number, nF);
    ws.getCell(row.number, 1).value = label;
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      cell.border = box; cell.fill = fill(C.foot); cell.font = { name: "Arial", size: 10, bold: true };
      cell.alignment = { horizontal: col === 1 ? "right" : "center", vertical: "middle" };
    });
  };
  [...new Set(R.list.map(r => r.job))].forEach(j => foot("حاضرين — " + j, d => pres(R.list.filter(r => r.job === j), d)));
  foot("إجمالي الحاضرين", d => pres(R.list, d), R.timed ? [hrsNum(R.list.reduce((a, r) => a + (r.otd || 0), 0)), hrsNum(R.list.reduce((a, r) => a + (r.otn || 0), 0))] : null);
  // دليل الألوان
  ws.addRow([]);
  const legend = [["غ", "غايب", C.abs], ["ج", "إجازة", C.lvg], ["خ", "إجازة بدون أجر", C.lv], ["م", "مرضي", C.lv], ["س", "استقالة", C.lv], ["م؟", "مرضي في انتظار اعتماد العميل", C.wtTxt]];
  legend.forEach(([k, v, color]) => { const row = ws.addRow([k, v]); row.getCell(1).font = { name: "Arial", bold: true, color: { argb: color } }; row.getCell(2).font = { name: "Arial", size: 9 }; });
  const l3 = ws.addRow(["", "جمعة أو عطلة رسمية"]); l3.getCell(1).fill = fill(C.off); l3.getCell(2).font = { name: "Arial", size: 9 };
  const l4 = ws.addRow(["", "يوم لسه ماتمش اعتماده من المحاسب"]); l4.getCell(1).fill = fill(C.unapp); l4.getCell(2).font = { name: "Arial", size: 9 };
  if (R.timed) { const l5 = ws.addRow(["", TB_TIP]); l5.getCell(1).fill = fill(C.tb); l5.getCell(2).font = { name: "Arial", size: 9 }; }
  // عرض الأعمدة
  fixed.forEach((h, i) => ws.getColumn(i + 1).width = h === "م" ? 5 : h === "الاسم" ? 30 : h === "الرقم القومي" ? 16 : h === "الوظيفة" ? 18 : h === "المكان" ? 14 : h === "الموقع" ? 14 : 7);
  R.dates.forEach((d, i) => ws.getColumn(nF + 1 + i).width = 7);
  ws.getColumn(nF + nD + 1).width = 9; ws.getColumn(nF + nD + 2).width = 7;
  if (R.timed) { ws.getColumn(nF + nD + 3).width = 11; ws.getColumn(nF + nD + 4).width = 11; }
  return wb;
}
$("r-xlsx").onclick = async () => {
  const R = S.report; if (!R) return;
  const btn = $("r-xlsx"); btn.disabled = true;
  if (R.kind !== "att") { try { await leaveXlsx(R); } catch (e) { show($("r-msg"), "err", "الإكسيل ماتعملش: " + e.message); } btn.disabled = false; return; }
  try {
    const ExcelJS = await loadExcelJS();
    const buf = await buildReportWorkbook(ExcelJS, R).xlsx.writeBuffer();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    a.download = `حضور ${R.site === "*" ? "كل المواقع" : R.site} ${R.from} - ${R.to}.xlsx`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  } catch (e) {
    console.error("formatted export failed:", e);
    xlsxPlain();   // لو حصلت مشكلة: الشيت العادي بدل ما الزرار ميعملش حاجة
  }
  btn.disabled = false;
};
function xlsxPlain() {   // الطريقة القديمة (من غير تنسيق) — احتياطي لو مكتبة التنسيق ماتحمّلتش
  const R = S.report; if (!R) return;
  const multi = R.site === "*";
  const head = ["م", ...(multi ? ["الموقع"] : []), "الاسم", "الرقم القومي", "الوظيفة", ...(R.hasLoc ? ["المكان"] : []), "النوع", ...R.dates.map(d => d.slice(5) + (R.off(d) ? " *" : "")), "الإجمالي", "إضافي", ...(R.timed ? ["إضافي نهاري (ساعة)", "إضافي ليلي (ساعة)"] : [])];
  const aoa = [[`تقرير حضور ${multi ? "كل المواقع" : R.site} — من ${R.from} لحد ${R.to} (* = جمعة أو عطلة)`], head];
  R.list.forEach((r, i) => aoa.push([i + 1, ...(multi ? [r.site] : []), r.name, r.nid || r.code, r.job, ...(R.hasLoc ? [r.loc] : []), r.rep ? "بديل" : "", ...R.dates.map(d => { const c = r.cells[d]; return !c ? "" : c.v === "1" ? 1 : c.v; }), r.total, r.extra,
    ...(R.timed ? (TIME_SITES.includes(r.site) ? [hrsNum(r.otd), hrsNum(r.otn)] : ["", ""]) : [])]));
  const pre = (multi ? 6 : 5) + (R.hasLoc ? 1 : 0);
  const pres = (rs, d) => rs.reduce((a, r) => a + (r.cells[d]?.p || 0), 0);
  [...new Set(R.list.map(r => r.job))].forEach(j => aoa.push(["", ...Array(pre - 2).fill(""), "حاضرين — " + j, ...R.dates.map(d => pres(R.list.filter(r => r.job === j), d)), "", ""]));
  aoa.push(["", ...Array(pre - 2).fill(""), "إجمالي الحاضرين", ...R.dates.map(d => pres(R.list, d)), "", ""]);
  const ws = XLSX.utils.aoa_to_sheet(aoa); ws["!cols"] = head.map((h, i) => ({ wch: i === (multi ? 2 : 1) ? 32 : i === (multi ? 3 : 2) ? 16 : 6 }));
  const wb = XLSX.utils.book_new(); wb.Workbook = { Views: [{ RTL: true }] };
  XLSX.utils.book_append_sheet(wb, ws, "الحضور");
  XLSX.writeFile(wb, `حضور ${multi ? "كل المواقع" : R.site} ${R.from} - ${R.to}.xlsx`);
};


// آخر ميعاد لاعتماد المحاسب: 9 الصبح بعد يوم من أول إيميل (9 الصبح) بعد تأكيد المشرف
function apDeadline(d) {
  const c = d.reviewed_at?.toDate ? d.reviewed_at.toDate() : null; // الميعاد بيبدأ من مراجعة الإقليمي
  if (!c) return null;
  const t = new Date(c); t.setHours(9, 0, 0, 0);
  if (c >= t) t.setDate(t.getDate() + 1);
  t.setDate(t.getDate() + 1);
  return t;
}
function apState(d) {
  const dl = apDeadline(d), fmt = x => x.toLocaleString("ar-EG", { weekday: "short", day: "numeric", month: "numeric", hour: "numeric" });
  if (d.status === "approved") {
    const at = d.approved_at?.toDate ? d.approved_at.toDate() : null;
    return `<span class="pill p-ok">معتمد</span>${dl && at && at > dl ? ` <span class="pill p-late">اتأخر</span>` : ""}`;
  }
  if (d.status === "confirmed") return `<span class="pill p-wait">مستني الإقليمي</span>`;
  if (!dl) return `<span class="pill p-wait">مستني</span>`;
  return new Date() > dl ? `<span class="pill p-late">فات الميعاد</span>` : `<span class="pill p-wait">مستني — لحد ${fmt(dl)}</span>`;
}
// ===== الاعتماد =====
let A = [];
$("a-go").onclick = async () => {
  const from = $("a-from").value, to = $("a-to").value, st = $("a-st").value, site = $("a-site").value;
  show($("a-msg"), "info", "بيحمّل...");
  try {
    A = (await fetchDays(from, to, site)).filter(d => !st || d.status === st).sort((a, b) => a.date.localeCompare(b.date) || a.site.localeCompare(b.site));
    $("a-list").innerHTML = A.length ? A.map((d, i) => {
      const e = Object.values(d.entries || {}), reps = e.filter(x => x.rep).length, sup = e.filter(x => x.by === "sup").length;
      return `<tr><td>${esc(d.site)}</td><td>${DAYN[new Date(d.date + "T00:00").getDay()]} ${d.date}</td><td>${esc(d.counts?.present ?? "")}</td><td>${esc(d.counts?.absent ?? "")}</td><td>${reps}</td><td>${sup}</td>
        <td class="muted">${esc(d.confirmed_email || "")}${d.late ? ` <span class="pill p-late">متأخر</span>` : ""}${d.reviewed_email ? `<br>راجعه: ${esc(d.reviewed_email)}${d.review_late ? ` <span class="pill p-late">متأخر</span>` : ""}` : ""}</td>
        <td>${apState(d)}</td>
        <td><button class="btn sec small" data-view="${i}">تفاصيل</button> ${!S.canApprove ? "" : d.status === "approved" ? `<button class="btn danger small" data-un="${i}">إلغاء الاعتماد</button>` : (d.status === "reviewed" || S.role === "admin") ? (tIssues(d) ? `<button class="btn small" data-view="${i}">راجع الأوقات (${tIssues(d)})</button>` : `<button class="btn ok small" data-ap="${i}">اعتماد</button>`) : ""}</td></tr>`;
    }).join("") : `<tr><td colspan="9" class="muted">مفيش.</td></tr>`;
    $("a-all").disabled = !A.some(canAp);
    hide($("a-msg"));
    renderQ();
  } catch (e) { show($("a-msg"), "err", e.message); }
};
// ===== بحث عن عامل في الأيام المعروضة: حاضر ولا غايب، وساعاته، وحالة اليوم =====
// بيدوّر في العامل نفسه، وفي البديل اللي اتسجل قدام غايب (rep)
const qNorm = s => String(s ?? "").replace(/[\u064B-\u0652]/g, "").replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").replace(/\s+/g, " ").trim();
const AP_TXT = { approved: "معتمد", reviewed: "مستني اعتماد", confirmed: "مستني الإقليمي" };
function stTxt(e) {
  if (e.s === "P") return `<span class="pill p-ok">حاضر</span>${e.rep_for_name ? ` <span class="muted">بديل مكان ${esc(e.rep_for_name)}</span>` : ""}`;
  if (e.s === "A") return `<span class="pill p-late">غايب</span>${e.rep ? ` <span class="muted">بديله: ${esc(e.rep.name || "")}</span>` : ""}`;
  return `<span class="pill p-wait">${esc(e.c === "ز" ? "زيادة مش محسوبة" : e.c || "—")}</span>`;
}
const tmTxt = h => h && h.min != null ? `${h.in ? `${esc(h.in)}${h.out ? " ← " + esc(h.out) : ""}<br>` : ""}<b>${hrsTxt(h.min)}</b> <span class="muted" style="font-size:11px">ن ${hrsTxt(h.dmin || 0)} · ل ${hrsTxt(h.nmin || 0)}${h.ot ? ` · إضافي ${hrsTxt(h.ot)}` : ""}</span>` : "";
function renderQ() {
  const box = $("a-qres"), raw = $("a-q").value.trim(), q = qNorm(raw), dg = raw.replace(/\D/g, "");
  if (q.length < 2) { box.classList.add("hidden"); box.innerHTML = ""; return; }
  const hit = (name, nid, code) => (dg.length >= 4 && (String(nid || "").includes(dg) || String(code || "").replace(/\D/g, "") === dg)) || (q.length >= 2 && qNorm(name).includes(q)) || qNorm(code) === q;
  const rows = [];
  A.forEach((d, i) => Object.values(d.entries || {}).forEach(e => {
    if (hit(e.name, e.nid, e.code)) rows.push({ d, i, name: e.name, job: e.job, st: stTxt(e), tm: e.s === "P" ? tmTxt(e) : "" });
    if (e.s === "A" && e.rep && hit(e.rep.name, e.rep.nid, e.rep.code))
      rows.push({ d, i, name: e.rep.name, job: e.job, st: `<span class="pill p-ok">حاضر</span> <span class="muted">بديل مكان ${esc(e.name || "")}</span>`, tm: tmTxt(e.rep) });
  }));
  box.classList.remove("hidden");
  box.innerHTML = rows.length
    ? `<div class="muted" style="margin-bottom:4px;">${rows.length} يوم — في الفترة والموقع والحالة المختارين فوق${$("a-st").value ? " (لو عايز كل الأيام اختار الحالة «الكل»)" : ""}</div>
      <div class="tbl"><table class="list" style="width:100%"><thead><tr><th>اليوم</th><th>الموقع</th><th>الاسم</th><th>الوظيفة</th><th>الحالة</th><th>الوقت والساعات</th><th>اليوم</th><th></th></tr></thead><tbody>${rows.map(r =>
        `<tr><td>${DAYN[new Date(r.d.date + "T00:00").getDay()]} ${r.d.date}</td><td>${esc(r.d.site)}</td><td>${esc(r.name || "")}</td><td>${esc(r.job || "")}</td><td>${r.st}</td><td>${r.tm}</td><td>${AP_TXT[r.d.status] || esc(r.d.status || "")}</td><td><button class="btn sec small" data-view="${r.i}">تفاصيل</button></td></tr>`).join("")}</tbody></table></div>`
    : `<p class="muted">مفيش عامل بالاسم ده في الأيام المعروضة${$("a-st").value ? " — جرّب الحالة «الكل»" : ""}.</p>`;
}
// بحث جوه تفاصيل اليوم: بيخفي الصفوف اللي مش مطابقة (اسم العامل أو بديله، أو الرقم القومى أو الكود)
// التعديلات في الصفوف المخفية مابتضيعش — الحفظ بياخد كل الصفوف
function filterDay() {
  const raw = $("a-dq").value.trim(), q = qNorm(raw), dg = raw.replace(/\D/g, "");
  const trs = [...$("a-dlist").querySelectorAll("tr[data-q]")];
  let n = 0;
  trs.forEach(tr => { const ok = !q || tr.dataset.q.includes(dg.length >= 4 ? dg : q); tr.style.display = ok ? "" : "none"; if (ok) n++; });
  $("a-dq-n").textContent = q ? (n ? `${n} من ${trs.length}` : "مفيش") : "";
}
$("a-dq").oninput = filterDay;
let qT = null;
$("a-q").oninput = () => { clearTimeout(qT); qT = setTimeout(renderQ, 200); };
$("a-qres").onclick = e => { const v = e.target.dataset.view; if (v !== undefined) $("a-list").onclick({ target: e.target }); };
const canEd = d => S.canApprove && (d.status === "reviewed" || (S.role === "admin" && d.status === "confirmed"));
// مواقع الحضور والانصراف: الوقت اللي البوابة مش متأكدة منه لازم المحاسب يراجعه قبل الاعتماد
// وبديل الراحات قدام الغايب: ساعته مقترحة من البوابة (أو مفيش ساعة في الأيام القديمة) لحد ما المحاسب يأكدها
const repBad = e => e.s === "A" && e.rep && (e.rep.t_issue || e.rep.min == null);
const tIssues = d => TIME_SITES.includes(d.site) ? Object.values(d.entries || {}).filter(e => (e.s === "P" && (e.t_issue || e.min == null)) || repBad(e)).length : 0;
const canAp = d => canEd(d) && !tIssues(d);
async function setStatus(d, approve) {
  const u = auth.currentUser;
  await updateDoc(doc(db, "att_days", d.id), approve
    ? { status: "approved", approved_by: u.uid, approved_email: actorEmail(u), approved_at: serverTimestamp() }
    : { status: d.reviewed_by ? "reviewed" : "confirmed" });
}
$("a-list").onclick = async e => {
  const t = e.target;
  if (t.dataset.view) {
    const d = A[+t.dataset.view];
    $("a-dtitle").textContent = `${d.site} — ${d.date}`;
    A.cur = d;
    // اليوم المعتمد: الأدمن بس يعدّل فيه على طول، والمحاسب يلغي الاعتماد الأول (نفس اللي الـ Rules بتسمح بيه)
    const canEdit = canEd(d) || (d.status === "approved" && S.role === "admin");
    $("a-edit-bar").classList.toggle("hidden", !canEdit);
    // ليه مقفول: معتمد (يلغي الاعتماد الأول)، أو لسه مستني مراجعة الإقليمي
    const why = canEdit || !S.canApprove ? "" : d.status === "approved"
      ? "اليوم ده معتمد. لو محتاج تعدّل فيه: دوس «إلغاء الاعتماد» في الجدول، وبعدين افتح التفاصيل تاني وعدّل واعتمد."
      : d.status === "confirmed" ? "اليوم ده لسه مستني مراجعة الإقليمي. هتقدر تعدّل الحالات والساعات وتعتمد بعد ما الإقليمي يراجعه." : "";
    $("a-locked").innerHTML = why ? `<b style="color:#a32d2d">${why}</b>` : "";
    $("a-locked").classList.toggle("hidden", !why);
    const dis = canEdit ? "" : " disabled";
    const ai = { P: "حاضر", A: "غايب", U: "مش واضح", "": "مالوش صف" };
    // «نهار ولا ليل؟»: لو العامل كان متأكد امبارح، بنقترح نفس ورديته (المحاسب لسه بيأكد بالحفظ)
    A.prev = {};
    if (TIME_SITES.includes(d.site) && Object.values(d.entries || {}).some(e => e.t_issue)) {
      const pd = new Date(d.date + "T00:00:00"); pd.setDate(pd.getDate() - 1);
      try { const p = await getDoc(doc(db, "att_days", d.site + "__" + ymd(pd)));
        Object.entries(p.exists() ? p.data().entries || {} : {}).forEach(([k, e]) => { if (e.s === "P" && e.in && e.min != null && !e.t_issue) A.prev[k] = e.in; }); } catch (er) {}
    }
    // نفس ترتيب الكشف الورقي: من «ord» المتسجل مع اليوم، ولو يوم قديم من غير ord بنحسبه من ترتيب الكشف الحالي
    const pm = Object.values(d.entries || {}).every(x => x.ord != null) ? null : await paperOrder(d);
    const ordOf = (k, x) => x.ord ?? pm?.get(k) ?? (x.code && pm?.get(x.code)) ?? (x.nid && pm?.get("N" + x.nid)) ?? 1e6;
    const rowsSorted = Object.entries(d.entries || {}).sort(([ka, a], [kb, b]) => ordOf(ka, a) - ordOf(kb, b) || String(a.name || "").localeCompare(String(b.name || ""), "ar")).map(([, x]) => x);
    dayPhotos(d);
    const timedDay = TIME_SITES.includes(d.site);
    // إضافة بديل لغايب (المحاسب والأدمن): قايمة بدلاء الموقع + المطلوب لكل وظيفة في اليوم ده
    A.pool = []; A.plan = {};
    if (canEdit) {
      try { const pl = await getDoc(doc(db, "pools", d.site)); A.pool = pl.exists() ? pl.data().workers || [] : []; } catch (er) {}
      try { A.plan = planBySite(await fetchPlanBase(d.date.slice(0, 7)), d.date)[d.site] || {}; } catch (er) {}
      if (A.cur !== d) return;
    }
    $("a-dhead").innerHTML = `<th>الاسم</th><th>الوظيفة</th><th>الحالة</th>${timedDay ? "<th>الساعات</th>" : ""}<th>قراءة الصورة</th><th>البديل</th><th>ملاحظة</th>`;
    $("a-dlist").innerHTML = rowsSorted.map(x =>
      `<tr data-q="${esc(qNorm([x.name, x.nid, x.code, x.rep?.name, x.rep?.nid, x.rep?.code].filter(Boolean).join(" ")))}"><td>${esc(x.name || "")}</td><td>${esc(x.job || "")}</td><td>${x.s === "P" || x.s === "A" ? `<select data-ecode="${esc(Object.keys(d.entries).find(k => d.entries[k] === x))}"${dis}><option value="P" ${x.s === "P" ? "selected" : ""}>حاضر</option><option value="A" ${x.s === "A" ? "selected" : ""}>غايب</option></select>${TIME_SITES.includes(d.site) ? tmCell(x, dis, Object.keys(d.entries).find(k => d.entries[k] === x)) : ""}` : esc(x.c || "")}</td>${timedDay ? `<td class="a-hrs">${hrsCell(x)}</td>` : ""}<td>${ai[x.ai ?? ""] || ""}${x.by === "sup" ? " <span class='pill p-wait'>المشرف غيّرها</span>" : ""}</td><td>${esc(x.rep?.name || "")}${x.rep && TIME_SITES.includes(d.site) ? repTm(x, dis) : ""}${!x.rep && !x.sub && canEdit && (x.s === "P" || x.s === "A") ? addRepCell(d, x, Object.keys(d.entries).find(k => d.entries[k] === x)) : ""}</td><td>${esc(x.note || "")}</td></tr>`).join("");
    $("a-dq").value = ""; filterDay();
    $("a-detail").classList.remove("hidden"); $("a-detail").scrollIntoView({ behavior: "smooth" });
    return;
  }
  const i = t.dataset.ap ?? t.dataset.un; if (i === undefined || !S.canApprove) return;
  if (t.dataset.un && !await ask("تلغي الاعتماد؟ الإقليمي هيقدر يعدّل اليوم تاني.", { ok: "الغي الاعتماد", danger: true })) return;
  try { await setStatus(A[+i], !!t.dataset.ap); $("a-detail").classList.add("hidden"); $("a-go").click(); } catch (er) { show($("a-msg"), "err", "مااتحفظش: " + er.message); }
};
// ترتيب الكشف الورقي لأيام اتأكدت قبل ما الترتيب يتسجل مع اليوم: من ترتيب الكشف الحالي للموقع (كشف العمال + الترتيب + الخطة)
const ORD_CACHE = {};
async function paperOrder(d) {
  const key = d.site + "__" + d.date.slice(0, 7);
  if (ORD_CACHE[key]) return ORD_CACHE[key];
  try {
    const [r, o, pl, base] = await Promise.all([getDoc(doc(db, "rosters", d.site)), getDoc(doc(db, "sheet_order", d.site)),
      getDoc(doc(db, "pools", d.site)), fetchPlanBase(d.date.slice(0, 7)).catch(() => null)]);
    const subs = (pl.exists() ? pl.data().workers || [] : []).filter(p => /راحات/.test(p.type || "") && String(p.name || "").trim() && /^\d{14}$/.test(String(p.nid || "")) && String(p.job || "").trim());
    return ORD_CACHE[key] = printOrder({ roster: r.exists() ? r.data().workers || [] : [], subs, order: o.exists() ? o.data() : null, plan: alignPlan(planBySite(base, d.date)[d.site] || {}, (r.exists() ? r.data().workers || [] : []).map(w => w.job)) });
  } catch (e) { return null; }   // من غير ترتيب: بالاسم
}
// صور اليوم: الأحدث الأول وعليها «آخر صورة». الصورة بتفضل على البوابة 14 يوم، وبعد كده على السيرفر بس
async function dayPhotos(d) {
  const box = $("a-photos"); box.innerHTML = `<span class="muted">بيحمّل الصور...</span>`;
  try {
    const sn = await getDocs(query(collection(db, "att_pages"), where("site", "==", d.site), where("date", "==", d.date)));
    if (A.cur !== d) return;
    const ps = []; sn.forEach(x => ps.push({ id: x.id, ...x.data() }));
    // الصورة المستخدمة = اللي مفيش صورة أحدث لنفس الصفحة (السيرفر بيعلّم القديمة superseded_by). المستخدمة الأول، والأحدث فالأحدث
    const ids = new Set(ps.map(p => p.id)), old = p => !!(p.superseded_by && ids.has(p.superseded_by));
    ps.sort((a, b) => old(a) - old(b) || (b.created_at?.seconds || 0) - (a.created_at?.seconds || 0));
    const tm = p => p.created_at?.toDate ? p.created_at.toDate().toLocaleString("ar-EG", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "";
    box.innerHTML = ps.length ? ps.map((p, i) => `<div style="flex:0 0 auto;width:130px;font-size:12px;text-align:center;">
        ${p.image ? `<img src="data:image/jpeg;base64,${esc(p.image)}" data-lb="${esc(p.id)}" alt="صورة ${ps.length - i}" title="دوس تكبّر" style="width:130px;height:170px;object-fit:cover;border:${!old(p) && p.status === "done" ? "3px solid #1a7f37" : "1px solid #ccc"};${old(p) ? "opacity:.55;" : ""};border-radius:8px;cursor:zoom-in;">`
          : `<div class="muted" style="width:130px;height:170px;border:1px dashed #ccc;border-radius:8px;display:flex;align-items:center;justify-content:center;padding:6px;">الصورة على السيرفر بس (أقدم من 14 يوم)</div>`}
        <div>${old(p) ? `<span class="pill p-wait">اتصورت تاني</span><br>` : p.status === "done" ? `<span class="pill p-ok">المستخدمة</span><br>` : ""}${esc(tm(p))}<br><span class="muted">${esc(p.uploaded_email || "")}</span>${p.status === "error" ? `<br><b style="color:#a32d2d">القراية فشلت</b>` : ""}</div></div>`).join("")
      : `<span class="muted">مفيش صور لليوم ده.</span>`;
    A.photos = Object.fromEntries(ps.filter(p => p.image).map(p => [p.id, p.image]));
  } catch (e) { box.innerHTML = `<span class="muted">الصور ماتحمّلتش: ${esc(e.message)}</span>`; }
}
$("a-photos").addEventListener("click", e => {
  const id = e.target.dataset?.lb; if (!id || !A.photos?.[id]) return;
  $("a-lb-img").src = "data:image/jpeg;base64," + A.photos[id]; $("a-lb").classList.remove("hidden");
});
$("a-lb").addEventListener("click", e => { if (e.target.id === "a-lb" || e.target.id === "a-lb-x") $("a-lb").classList.add("hidden"); });
// مواقع الحضور والانصراف: الوقتين والساعات تحت الحالة، والمحاسب يقدر يصححهم قبل الاعتماد
function tmCell(x, dis, key) {
  if (x.t_issue === "نهار ولا ليل؟" && A.prev?.[key]) { const g = guessTimes(x.tin, x.tout, isHelperJob(x.job), A.prev[key]); if (g.prev) x = { ...x, in: g.in, out: g.out, t_issue: "زي وردية امبارح، اتأكد" }; }
  const h = x.min != null ? `${hrsTxt(x.min)} س · نهاري ${hrsTxt(x.dmin)} · ليلي ${hrsTxt(x.nmin)}${x.ot ? " · إضافي " + hrsTxt(x.ot) : ""}` : "";
  const bad = x.t_issue || x.min == null;
  return `<div class="a-tm" style="margin-top:4px;display:${x.s === "P" ? "flex" : "none"};gap:4px;flex-wrap:wrap;align-items:center;font-size:12px;padding:4px;border-radius:8px;${bad ? "background:#fff6e5;" : ""}">
    <input type="time" data-ein value="${esc(x.in || "")}"${dis} style="width:auto;padding:3px 4px;">
    ${isHelperJob(x.job) ? "" : `<input type="time" data-eout value="${esc(x.out || "")}"${dis} style="width:auto;padding:3px 4px;">`}
    <button type="button" class="btn sec small" data-eflip${dis} title="يقلب الوقتين 12 ساعة">نهار ⇄ ليل</button>
    <span class="muted" style="flex-basis:100%;">${x.mission ? "<b>مأمورية</b> (الوردية العادية) · " : ""}مكتوب في الورقة: ${esc(x.tin || "—")} → ${esc(x.tout || "—")}${h ? " · " + h : ""}${bad ? ` · <b style="color:#a32d2d">${esc(x.t_issue || "محتاج وقت")}</b>` : ""}</span></div>`;
}
// عمود «الساعات»: الحاضر ساعاته، والغايب ساعات بديله. بيتحدّث وانت بتعدّل الوقت
function hrsCell(x, live) {
  const h = live !== undefined ? live : x.s === "P" ? (x.min != null ? x : null) : x.s === "A" && x.rep ? (x.rep.min != null ? x.rep : null) : undefined;
  if (h === undefined) return "";
  if (!h) return `<b style="color:#a32d2d">—</b>`;
  const who = (live !== undefined ? live.rep : x.s === "A") ? `<br><span class="muted">البديل</span>` : "";
  return `<b style="font-size:15px">${hrsTxt(h.min)}</b><br><span class="muted" style="font-size:11px;white-space:nowrap">ن ${hrsTxt(h.dmin)} · ل ${hrsTxt(h.nmin)}</span>${h.ot ? `<br><span class="pill p-wait">إضافي ${hrsTxt(h.ot)}</span>` : ""}${who}`;
}
function refreshHrs(tr) {
  const cell = tr.querySelector(".a-hrs"), sel = tr.querySelector("[data-ecode]"); if (!cell || !sel) return;
  const x = A.cur?.entries?.[sel.dataset.ecode]; if (!x) return;
  if (sel.value === "P") { const h = calcHours(tr.querySelector("[data-ein]")?.value || "", tr.querySelector("[data-eout]")?.value || "", x.job); cell.innerHTML = hrsCell(x, h); }
  else if (x.rep) { const h = calcHours(tr.querySelector("[data-rin]")?.value || "", tr.querySelector("[data-rout]")?.value || "", x.job); cell.innerHTML = hrsCell(x, h ? { ...h, rep: true } : null); }
  else cell.innerHTML = "";
}
$("a-dlist").addEventListener("input", e => { if (e.target.matches("input[type=time]")) refreshHrs(e.target.closest("tr")); });
// ساعة بديل الراحات (تحت اسمه): بتظهر بس والعامل الأصلي غايب
function repTm(x, dis) {
  const r = x.rep, helper = isHelperJob(x.job), bad = r.t_issue || r.min == null;
  const h = r.min != null ? `${hrsTxt(r.min)} س · نهاري ${hrsTxt(r.dmin)} · ليلي ${hrsTxt(r.nmin)}${r.ot ? " · إضافي " + hrsTxt(r.ot) : ""}` : "";
  return `<div class="a-tm a-rtm" style="margin-top:4px;display:${x.s === "A" ? "flex" : "none"};gap:4px;flex-wrap:wrap;align-items:center;font-size:12px;padding:4px;border-radius:8px;${bad ? "background:#fff6e5;" : ""}">
    <input type="time" data-rin value="${esc(r.in || "")}"${dis} style="width:auto;padding:3px 4px;">
    ${helper ? "" : `<input type="time" data-rout value="${esc(r.out || "")}"${dis} style="width:auto;padding:3px 4px;">`}
    <button type="button" class="btn sec small" data-eflip${dis} title="يقلب الوقتين 12 ساعة">نهار ⇄ ليل</button>
    <span class="muted" style="flex-basis:100%;">${r.t_src ? `مقترحة من: ${esc(r.t_src)}` : "مفيش ساعة متسجلة"}${h ? " · " + h : ""}${bad ? ` · <b style="color:#a32d2d">${esc(r.t_issue || "اكتب ساعة البديل")}</b>` : ""}</span></div>`;
}
// ===== إضافة بديل لغايب من الاعتماد =====
// لو العامل غايب والقراءة ماشافتش بديله (مثلاً مكتوب بخط مش واضح)، المحاسب يختار البديل من قايمة بدلاء الموقع.
// الحفظ بيرفض لو الحاضرين + البدلاء في الوظيفة هيعدّوا المطلوب في خطة الاحتياج.
function poolTaken(d) {
  const t = new Set();
  Object.entries(d.entries || {}).forEach(([k, e]) => {
    if (e.sub && (e.s === "P" || e.s === "L")) t.add(String(e.nid || e.code || k.slice(1)));
    if (e.rep && e.s === "A") t.add(String(e.rep.nid || e.rep.code || ""));
  });
  return t;
}
function addRepCell(d, x, key) {
  const taken = poolTaken(d);
  const opts = (A.pool || []).filter(p => String(p.name || "").trim() && !taken.has(String(p.nid || p.code || "")))
    .sort((a, b) => (b.job === x.job) - (a.job === x.job) || String(a.name).localeCompare(String(b.name), "ar"));
  if (!opts.length) return `<div class="a-nrep muted" style="display:${x.s === "A" ? "block" : "none"};font-size:12px;">مفيش بدلاء متاحين في الموقع</div>`;
  const helper = isHelperJob(x.job), timed = TIME_SITES.includes(d.site);
  return `<div class="a-nrep" style="display:${x.s === "A" ? "block" : "none"};font-size:12px;">
    <select data-addrep="${esc(key)}" style="max-width:220px;"><option value="">+ إضافة بديل</option>${opts.map(p => `<option value="${esc(p.nid || p.code)}">${esc(p.name)}${p.job && p.job !== x.job ? " — " + esc(p.job) : ""}</option>`).join("")}</select>
    ${timed ? `<div class="a-tm a-rtm a-nrtm" style="margin-top:4px;display:none;gap:4px;flex-wrap:wrap;align-items:center;padding:4px;border-radius:8px;background:#fff6e5;">
      <input type="time" data-rin style="width:auto;padding:3px 4px;">${helper ? "" : `<input type="time" data-rout style="width:auto;padding:3px 4px;">`}
      <button type="button" class="btn sec small" data-eflip title="يقلب الوقتين 12 ساعة">نهار ⇄ ليل</button>
      <span class="muted" style="flex-basis:100%;">اكتب ساعة البديل</span></div>` : ""}</div>`;
}
$("a-dlist").addEventListener("change", e => {
  const s = e.target.closest("[data-addrep]"); if (!s) return;
  const t = s.closest(".a-nrep").querySelector(".a-nrtm"); if (t) t.style.display = s.value ? "flex" : "none";
});
$("a-dlist").addEventListener("click", e => {
  const b = e.target.closest("[data-eflip]"); if (!b) return;
  b.closest(".a-tm").querySelectorAll("input[type=time]").forEach(i => { const m = toMin(i.value); if (m != null) i.value = hhmm(m + 720); });
  refreshHrs(b.closest("tr"));
});
$("a-dlist").addEventListener("change", e => {
  if (!e.target.matches("[data-ecode]")) return;
  const tm = e.target.closest("td").querySelector(".a-tm"); if (tm) tm.style.display = e.target.value === "P" ? "flex" : "none";
  const rt = e.target.closest("tr").querySelector(".a-rtm:not(.a-nrtm)"); if (rt) rt.style.display = e.target.value === "A" ? "flex" : "none";
  const nr = e.target.closest("tr").querySelector(".a-nrep"); if (nr) nr.style.display = e.target.value === "A" ? "block" : "none";
  refreshHrs(e.target.closest("tr"));
});
$("a-esave").onclick = async () => {
  const d = A.cur; if (!d) return;
  const entries = JSON.parse(JSON.stringify(d.entries || {})); let n = 0;
  const timed = TIME_SITES.includes(d.site), bad = [], over = [], flipped = []; let fixed = 0;
  // أقصى وردية 12 ساعة: لو الحضور والانصراف معكوسين بيتعدلوا لوحدهم، ولو أكتر من 12 ساعة برضه ماينفعش يتحفظ
  const cap = (tin, tout, job, who) => {
    if (isHelperJob(job)) return [tin, tout];
    const f = fixReversed(tin, tout); if (f) { flipped.push(`${who} (${tin}→${tout} بقت ${f.in}→${f.out})`); return [f.in, f.out]; }
    const h = calcHours(tin, tout, job); if (h && h.min > MAX_SHIFT_MIN) over.push(`${who} (${tin}→${tout})`);
    return [tin, tout];
  };
  // البدلاء الجداد اللي المحاسب اختارهم (لغايب بس)
  const added = [], usedNew = new Set();
  for (const s of document.querySelectorAll("#a-dlist [data-addrep]")) {
    if (!s.value) continue;
    const e = entries[s.dataset.addrep], st = s.closest("tr").querySelector("[data-ecode]")?.value;
    if (!e || st !== "A" || e.rep) continue;
    if (usedNew.has(s.value)) return show($("a-msg"), "err", "نفس البديل مختار لأكتر من عامل غايب.");
    usedNew.add(s.value);
    const p = (A.pool || []).find(q => String(q.nid || q.code) === s.value); if (!p) continue;
    e.rep = { nid: p.nid || "", name: p.name, code: p.code || "", by: "acc" };
    e.by = "acc"; n++; added.push(e);
  }
  document.querySelectorAll("#a-dlist [data-ecode]").forEach(sel => {
    const e = entries[sel.dataset.ecode]; if (!e) return;
    if (e.s !== sel.value) { e.s = sel.value; e.by = "acc"; n++; }
    if (!timed) return;
    const TF = ["in", "out", "min", "dmin", "nmin", "ot", "otd", "otn"];
    // بديل الراحات قدام الغايب
    if (e.s === "A" && e.rep) {
      const row = sel.closest("tr");
      const [rin, rout] = cap(row.querySelector("[data-rin]")?.value ?? e.rep.in ?? "", row.querySelector("[data-rout]")?.value ?? e.rep.out ?? "", e.job, e.rep.name + " (بديل)");
      const rh = calcHours(rin, rout, e.job);
      if (!rh) bad.push(e.rep.name + " (بديل)");
      else {
        if (rin !== (e.rep.in || "") || (!isHelperJob(e.job) && rout !== (e.rep.out || ""))) { e.by = "acc"; n++; }
        if (e.rep.t_issue) { fixed++; delete e.rep.t_issue; }
        Object.assign(e.rep, { in: rin, out: isHelperJob(e.job) ? "" : rout, min: rh.min, dmin: rh.dmin, nmin: rh.nmin, ot: rh.ot, otd: rh.otd, otn: rh.otn });
      }
    }
    if (e.s !== "P") { TF.concat(["t_issue"]).forEach(f => delete e[f]); return; }
    const cell = sel.closest("td");
    const [tin, tout] = cap(cell.querySelector("[data-ein]")?.value ?? e.in ?? "", cell.querySelector("[data-eout]")?.value ?? e.out ?? "", e.job, e.name);
    const h = calcHours(tin, tout, e.job);
    if (!h) { bad.push(e.name); return; }
    if (tin !== (e.in || "") || (!isHelperJob(e.job) && tout !== (e.out || ""))) { e.by = "acc"; n++; }
    if (e.t_issue) { fixed++; delete e.t_issue; }
    Object.assign(e, { in: tin, out: isHelperJob(e.job) ? "" : tout, min: h.min, dmin: h.dmin, nmin: h.nmin, ot: h.ot, otd: h.otd, otn: h.otn });
  });
  if (bad.length) return show($("a-msg"), "err", "اكتب وقت الحضور والانصراف لـ: " + bad.join("، "));
  if (over.length) return show($("a-msg"), "err", "أقصى وردية 12 ساعة — صحّح الوقت لـ: " + over.join("، "));
  if (flipped.length && !await ask("الحضور والانصراف كانوا معكوسين واتعدلوا:\n" + flipped.join("\n") + "\n\nتكمّل؟")) return;
  // العدد في الوظايف اللي اتضافلها بديل: الحاضرين (ومعاهم بدلاء الراحات والتوقف/الأجازة الرسمية) + الغايبين اللي ليهم بديل ≤ المطلوب
  if (added.length) {
    const per = {};
    Object.values(entries).forEach(e => {
      if (e.s === "P" || (e.s === "L" && (e.c === "ق" || e.c === "ط")) || (e.s === "A" && e.rep)) per[e.job] = (per[e.job] || 0) + 1;
    });
    const PA = alignPlan(A.plan, Object.keys(per));   // توحيد إملاء الوظيفة (ى/ي، أ/ا، ة/ه)
    const over = [...new Set(added.map(e => e.job))].filter(j => PA[j] != null && per[j] > PA[j]);
    if (over.length) return show($("a-msg"), "err", "مينفعش تضيف البديل: العدد هيعدّي المطلوب — " + over.map(j => `${j}: ${per[j]} والمطلوب ${PA[j]}`).join("، "));
    const noPlan = [...new Set(added.map(e => e.job))].filter(j => PA[j] == null);
    if (noPlan.length && !await ask(`مفيش عدد مطلوب متسجل لـ: ${noPlan.join("، ")}. تضيف البديل برضه؟`)) return;
  }
  if (fixed && !await ask(`فيه ${fixed} وقت كان متعلّم للمراجعة (الأصفر). اتأكدت منهم؟`)) return;
  if (!n && d.status === "approved") return show($("a-msg"), "info", "مفيش تغيير.");
  if (!await ask(`${n ? `تعديل ${n} عامل و` : ""}اعتماد ${d.site} يوم ${d.date}؟`, { ok: "اعتمد" })) return;
  const v = Object.values(entries), u = auth.currentUser;
  try {
    await updateDoc(doc(db, "att_days", d.id), { entries, counts: { ...(d.counts || {}), present: v.filter(e => e.s === "P").length, absent: v.filter(e => e.s === "A").length },
      status: "approved", approved_by: u.uid, approved_email: actorEmail(u), approved_at: serverTimestamp(), edited_by: u.email || "", edited_n: n });
    show($("a-msg"), "ok", "تم التعديل والاعتماد."); $("a-detail").classList.add("hidden"); $("a-go").click();
  } catch (er) { show($("a-msg"), "err", "ماتحفظش: " + (er.code === "permission-denied" ? "محتاج تحديث الـ Rules." : er.message)); }
};
$("a-all").onclick = async () => {
  const pend = A.filter(canAp);
  if (!await ask(`اعتماد ${pend.length} يوم؟`, { ok: "اعتمد" })) return;
  try { for (const d of pend) await setStatus(d, true); show($("a-msg"), "ok", `تم اعتماد ${pend.length} يوم.`); $("a-go").click(); }
  catch (er) { show($("a-msg"), "err", er.message); }
};
