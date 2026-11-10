// page-upload.js — سكريبت صفحة upload.html (اتنقل من جوه الصفحة لملف لوحده عشان الـ CSP تمنع أي سكريبت مكتوب جوه الـ HTML)
import { getFirestore, doc, getDoc, getDocs, addDoc, collection, query, where, writeBatch, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { db, auth, actorEmail, fetchPlanBase, planBySite, nearWorkers, sameName, ask } from './shared.js?v=20261104e';
import { detect, parseChipsy, parseEmdad, parseSharqia, emdadMonths, counts, COMPANY_LABEL, CHIPSY_PLAN, countsForPlan, chipsySections, trimOverPlan } from './xl-attendance.js?v=20261104e';

const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
function show(el, t, x) { el.className = "msg show " + t; el.textContent = x; }
function hide(el) { el.className = "msg"; }
const S = { wb: null, type: null, res: null, fileName: "", fixes: [], missing: [], banned: [], newbies: {}, bl: {} };

$("l-btn").onclick = async () => { try { await signInWithEmailAndPassword(auth, $("l-email").value.trim(), $("l-pass").value); } catch (e) { show($("l-err"), "err", "الإيميل أو الباسورد غلط"); } };
$("logout").onclick = () => signOut(auth).finally(() => location.reload()); $("d-out").onclick = () => signOut(auth).finally(() => location.reload());
onAuthStateChanged(auth, async user => {
  ["login", "denied", "app"].forEach(i => $(i).classList.add("hidden"));
  if (!user) return $("login").classList.remove("hidden");
  let role = null; try { role = (await user.getIdTokenResult()).claims.role || null; } catch (e) {}
  if (role !== "admin") return $("denied").classList.remove("hidden");   // مؤقتاً: الرفع للأدمن بس لحد ما الشكل يتظبط
  $("who").textContent = user.email;
  $("app").classList.remove("hidden");
});

$("file").onchange = async () => {
  const f = $("file").files[0]; if (!f) return;
  ["preview", "emdad-opts"].forEach(i => $(i).classList.add("hidden")); hide($("s-msg"));
  show($("f-msg"), "info", "بيقرا الملف...");
  try {
    S.wb = XLSX.read(await f.arrayBuffer(), { cellDates: true }); S.fileName = f.name;
    S.type = detect(S.wb, XLSX);
    if (!S.type) return show($("f-msg"), "err", "مش عارف نوع الملف ده. المفروض يكون شيت حضور شيبسي أو ملف الإمداد أو شيت الشرقية.");
    if (S.type === "emdad") {
      const ms = emdadMonths(S.wb);
      // الشهر الافتراضي: آخر شهر فيه بيانات
      const filled = ms.filter(m => { const r = XLSX.utils.sheet_to_json(S.wb.Sheets[m], { header: 1, defval: null }); return r.slice(2).some(x => x && x[0] != null && x[4] != null); });
      $("e-month").innerHTML = ms.map(m => `<option ${m === filled[filled.length - 1] ? "selected" : ""}>${esc(m)}</option>`).join("");
      const yc = S.wb.Sheets[S.wb.SheetNames.find(n => n.replace(/[إأ]/g, "ا") === "اعدادات")]?.B1?.v;
      $("e-year").value = Number(yc) || new Date().getFullYear();
      $("emdad-opts").classList.remove("hidden");
      show($("f-msg"), "ok", "ملف الإمداد — اختار الشهر واضغط «اقرا الشهر ده».");
      return;
    }
    run();
  } catch (e) { show($("f-msg"), "err", "الملف ماتقراش: " + e.message); }
};
$("e-go").onclick = () => run();

async function run() {
  try {
    S.res = S.type === "chipsy" ? parseChipsy(S.wb, XLSX)
      : S.type === "sharqia" ? parseSharqia(S.wb, XLSX)
      : parseEmdad(S.wb, XLSX, $("e-month").value, Number($("e-year").value));
    show($("f-msg"), "info", "بيقارن الأرقام القومية بالسجل...");
    await fixNids();
    S.trim = [];
    if (S.type === "chipsy") {
      // قسم مدخلين بيانات أبو صير من «ترتيب الكشف»، وبعدين الزيادة عن المخطط بتتشال من العدد
      const sites = [...new Set(Object.values(S.res.days).map(d => d.site))], orders = {};
      await Promise.all(sites.map(async s => { try { const o = await getDoc(doc(db, "sheet_order", s)); if (o.exists()) orders[s] = o.data(); } catch (e) {} }));
      chipsySections(S.res, orders);
      S.trim = trimOverPlan(S.res, s => CHIPSY_PLAN[s]);
    }
    const dates = Object.values(S.res.days).map(d => d.date).sort();
    if (!dates.length) { $("preview").classList.add("hidden"); return show($("f-msg"), "warn", "مفيش أيام فيها حضور في الملف ده."); }
    $("p-from").value = dates[0]; $("p-to").value = dates[dates.length - 1];
    show($("f-msg"), "ok", `${COMPANY_LABEL[S.type]} — ${S.res.workers} عامل` + (S.res.ignored ? ` (اتساب ${S.res.ignored} سطر مش تبعنا: شركات تانية أو فرع MN)` : ""));
    renderPreview();
  } catch (e) { show($("f-msg"), "err", e.message); }
}
// المصدر الوحيد للرقم القومي والكود = السجل الموحد (workers)، مش شيت العميل.
// 1) رقم قومي موجود في السجل → ياخد الكود من السجل.
// 2) رقم قومي مختلف في رقم أو اتنين عن عامل بنفس الاسم في نفس الموقع → ياخد رقم السجل (حصل في الإمداد أكتوبر 2026).
// 3) الرقم في الشيت مش رقم قومي (مثلاً GPID بيبسي للمنسقين) → يدوّر بالاسم في نفس الموقع؛ واحد بس = ياخد رقمه، غير كده الصف مايتحفظش.
async function fixNids() {
  S.fixes = []; S.missing = []; S.banned = []; S.newbies = {}; S.bl = {};
  if (S.type === "sharqia") return;   // الشرقية بالكود مش بالرقم القومي
  const sites = [...new Set(Object.values(S.res.days).map(d => d.site))], ws = {};
  sites.forEach(s => ws[s] = []);
  for (let i = 0; i < sites.length; i += 30) {
    const sn = await getDocs(query(collection(db, "workers"), where("site", "in", sites.slice(i, i + 30))));
    sn.forEach(d => { const x = d.data(); if (ws[x.site]) ws[x.site].push({ nid: String(x.nid || ""), name: x.name || "", code: x.code || d.id, status: x.status || "" }); });
  }
  // قايمة الأكواد (العمال القدام): الراجع بياخد كوده القديم، وعلامة البلاك ليست فيها بتتحسب كمان
  const old = {};
  try { const ci = await getDoc(doc(db, "codes_index", "all"));
    Object.entries(ci.data()?.codes || {}).forEach(([c, v]) => { if (v?.[0]) old[String(v[0])] = { code: c, name: v[1] || "", bl: !!v[2] }; }); } catch (er) {}
  const pick = {}, miss = {};
  for (const d of Object.values(S.res.days)) {
    const list = ws[d.site] || [];
    const byNid = new Map(list.filter(w => w.nid).map(w => [w.nid, w]));
    for (const [k, e] of Object.entries(d.entries)) {
      const n = String(e.nid || ""), raw = String(e.code || k);
      const rec = n && byNid.get(n);
      if (rec) { if (rec.code) e.code = rec.code; continue; }
      const key = d.site + "|" + (n || raw);
      if (!(key in pick)) {
        let near;
        if (n) near = nearWorkers(n, e.name, list);
        else {
          const same = list.filter(w => w.nid && sameName(e.name, w.name));
          const act = same.filter(w => w.status === "شغال");
          near = act.length ? act : same;
        }
        pick[key] = near.length === 1 ? near[0] : null;
        if (pick[key]) S.fixes.push({ site: d.site, name: e.name, from: n || raw, to: pick[key].nid, code: pick[key].code || "", pname: pick[key].name });
      }
      const w = pick[key];
      if (!w) {
        if (n) {   // رقم قومي سليم ومش في السجل: بلاك ليست = مايترفعش، غير كده عامل جديد يروح لـ HR
          if (!(n in S.bl)) {
            S.bl[n] = old[n]?.bl ? "بلاك ليست (قايمة الأكواد)" : null;
            try { const b = await getDoc(doc(db, "blacklist_info", n)); if (b.exists()) S.bl[n] = b.data().reason || "بلاك ليست";
              else if ((await getDoc(doc(db, "blacklist", n))).exists()) S.bl[n] = "بلاك ليست"; } catch (er) {}
          }
          if (S.bl[n] != null) {
            delete d.entries[k];
            if (!miss["bl|" + n]) S.banned.push(miss["bl|" + n] = { site: d.site, name: e.name, nid: n, reason: S.bl[n], old: old[n]?.code || "", days: 0, present: 0 });
            miss["bl|" + n].days++; if (e.s === "P") miss["bl|" + n].present++;
            continue;
          }
          const nw = S.newbies[n] = S.newbies[n] || { site: d.site, name: e.name, nid: n, job: e.pj || e.job, first: d.date, present: 0, old: old[n]?.code || "" };
          if (d.date < nw.first) nw.first = d.date;
          if (e.s === "P") nw.present++;
          continue;
        }
        delete d.entries[k];   // رقم مش رقم قومي ومش لاقيينه في السجل: مايترفعش
        if (!miss[key]) S.missing.push(miss[key] = { site: d.site, name: e.name, raw, days: 0 });
        miss[key].days++;
        continue;
      }
      delete d.entries[k];
      if (d.entries[w.nid]) continue;   // نفس العامل متسجل بالرقم الصح في نفس اليوم
      d.entries[w.nid] = { ...e, nid: w.nid, code: w.code || w.nid, nid_from: n || raw };
    }
  }
}
function selected() {
  const a = $("p-from").value, b = $("p-to").value;
  return Object.entries(S.res.days).filter(([, d]) => d.date >= a && d.date <= b);
}
function renderPreview() {
  const by = {};
  for (const [, d] of selected()) {
    const c = counts(d.entries), x = by[d.site] = by[d.site] || { days: 0, from: d.date, to: d.date, workers: new Set(), p: 0, a: 0, l: 0 };
    x.days++; x.from = d.date < x.from ? d.date : x.from; x.to = d.date > x.to ? d.date : x.to;
    Object.keys(d.entries).forEach(k => x.workers.add(k)); x.p += c.present; x.a += c.absent; x.l += c.leave;
  }
  const rows = Object.entries(by);
  $("p-title").textContent = `2. راجع قبل الحفظ — ${COMPANY_LABEL[S.type]} (${S.fileName})`;
  $("p-sites").innerHTML = rows.length ? rows.map(([s, x]) => `<tr><td>${esc(s)}</td><td class="num">${x.workers.size}</td><td class="num">${x.days}</td><td>${esc(x.from)}</td><td>${esc(x.to)}</td>
    <td class="num">${Math.round(x.p / x.days)}</td><td class="num">${Math.round(x.a / x.days)}</td><td class="num">${x.l}</td></tr>`).join("")
    : `<tr><td colspan="8" class="muted">مفيش أيام في الفترة دي.</td></tr>`;
  const iss = S.res.issues, fx = S.fixes || [], ms = S.missing || [];
  const bn = S.banned || [], nw = Object.values(S.newbies || {}).filter(x => x.present);
  $("p-issues").innerHTML = (bn.length ? `<div class="msg show err" style="display:block;margin-top:8px;">${bn.length} عامل في البلاك ليست — حضورهم مش هيترفع ومش هيروحوا لـ HR. بلّغ العميل يوقفهم.</div>
       <table style="margin-top:6px"><thead><tr><th>الموقع</th><th>الاسم في الشيت</th><th>الرقم القومي</th><th>كوده</th><th>السبب</th><th>أيام حضور</th></tr></thead><tbody>${bn.map(f =>
         `<tr><td>${esc(f.site)}</td><td>${esc(f.name)}</td><td dir="ltr">${esc(f.nid)}</td><td>${esc(f.old)}</td><td>${esc(f.reason)}</td><td class="num">${f.present}</td></tr>`).join("")}</tbody></table>` : "")
    + (nw.length ? `<div class="msg show warn" style="display:block;margin-top:8px;">${nw.length} عامل مش في السجل — مع الحفظ هيروحوا لـ HR في «اعتماد الحالات» يراجعوا الاسم والرقم القومي ويكمّلوا التليفون. اللي ليه كود قديم بيرجع بيه، والجديد بياخد كود جديد.</div>
       <table style="margin-top:6px"><thead><tr><th>الموقع</th><th>الاسم في الشيت</th><th>الرقم القومي</th><th>الكود</th><th>الوظيفة</th><th>أول يوم</th><th>أيام حضور</th></tr></thead><tbody>${nw.map(f =>
         `<tr><td>${esc(f.site)}</td><td>${esc(f.name)}</td><td dir="ltr">${esc(f.nid)}</td><td>${f.old ? `راجع — ${esc(f.old)}` : "جديد"}</td><td>${esc(f.job)}</td><td>${esc(f.first)}</td><td class="num">${f.present}</td></tr>`).join("")}</tbody></table>` : "")
    + (ms.length ? `<div class="msg show err" style="display:block;margin-top:8px;">${ms.length} عامل مش هيترفع حضورهم: الرقم في الشيت مش رقم قومي، ومالقيناش في السجل عامل واحد بنفس الاسم في نفس الموقع. ضيفهم أو صحّح اسمهم في السجل وارفع الشيت تاني.</div>
       <table style="margin-top:6px"><thead><tr><th>الموقع</th><th>الاسم في الشيت</th><th>الرقم في الشيت</th><th>أيام</th></tr></thead><tbody>${ms.map(f =>
         `<tr><td>${esc(f.site)}</td><td>${esc(f.name)}</td><td dir="ltr">${esc(f.raw)}</td><td class="num">${f.days}</td></tr>`).join("")}</tbody></table>` : "")
    + (fx.length ? `<div class="msg show warn" style="display:block;margin-top:8px;">اتصلح الرقم القومي لـ ${fx.length} عامل من السجل: الرقم في الشيت مش رقم قومي أو مختلف في رقم أو اتنين، فالحضور هيترفع برقم السجل. بلّغ العميل يصلّحه عنده.</div>
       <table style="margin-top:6px"><thead><tr><th>الموقع</th><th>الاسم في الشيت</th><th>الرقم في الشيت</th><th>الرقم في السجل</th><th>الكود</th></tr></thead><tbody>${fx.map(f =>
         `<tr><td>${esc(f.site)}</td><td>${esc(f.name)}</td><td dir="ltr">${esc(f.from)}</td><td dir="ltr">${esc(f.to)}</td><td>${esc(f.code)}</td></tr>`).join("")}</tbody></table>` : "")
    + (iss.length ? `<details open><summary>${iss.length} ملاحظة — الخانات دي مش هتترفع</summary><ul>${iss.slice(0, 300).map(t => `<li>${esc(t)}</li>`).join("")}</ul></details>` : "");
  $("save").disabled = !rows.length;
  $("preview").classList.remove("hidden");
  renderOver();
}
$("p-from").onchange = renderPreview; $("p-to").onchange = renderPreview;

// ===== المخطط: شيبسي ثابت، الإمداد من مخطط بيبسي (نفس حساب صفحة الاحتياج)، الشرقية مالهاش مخطط =====
// الحساب نفسه في shared.js. بيانات الشهر بتتحمّل مرة واحدة، والنتيجة متخزنة لكل يوم.
const PLAN = { cache: {}, base: undefined, month: null };
async function pepsiPlan(date) {          // {site: {job: n}} ليوم معين
  if (PLAN.cache[date]) return PLAN.cache[date];
  const month = date.slice(0, 7);
  try {
    if (PLAN.month !== month) { PLAN.base = await fetchPlanBase(month); PLAN.month = month; }
    return (PLAN.cache[date] = planBySite(PLAN.base, date));
  } catch (e) { return (PLAN.cache[date] = {}); }
}
async function overPlan(list) {
  if (S.type === "sharqia") return { rows: [], note: "الشرقية مالهاش مخطط — الأعداد زي ما هي في الشيت." };
  const rows = [];
  for (const [, d] of list) {
    const plan = S.type === "chipsy" ? CHIPSY_PLAN[d.site] || {} : (await pepsiPlan(d.date))[d.site] || {};
    const n = {};
    Object.values(d.entries).forEach(e => { if (countsForPlan(e, S.type)) n[e.pj] = (n[e.pj] || 0) + 1; });
    Object.entries(n).forEach(([job, c]) => { if (plan[job] != null && c > plan[job]) rows.push({ date: d.date, site: d.site, job, c, plan: plan[job] }); });
  }
  return { rows: rows.sort((a, b) => a.date.localeCompare(b.date) || a.site.localeCompare(b.site)),
    note: S.type === "chipsy" ? "مخطط شيبسي الثابت (HC CFI)." : "مخطط بيبسي الحالي على البوابة (الإمداد)." };
}
async function renderOver() {
  const el = $("p-over"); el.innerHTML = `<p class="muted" style="margin-top:8px;">بيقارن بالمخطط...</p>`;
  const { rows, note } = await overPlan(selected());
  const a = $("p-from").value, b = $("p-to").value, tr = (S.trim || []).filter(t => t.date >= a && t.date <= b);
  const trimHtml = tr.length ? `<div class="msg show info" style="display:block;margin-top:8px;">في ${tr.length} حضور زيادة عن المخطط — البوابة شالتهم من العدد (اليومية الأول، وبعدين البديل، وبعدين آخر حد اتعيّن). هيتسجلوا «ز» = زيادة مش محسوبة.</div>
       <table style="margin-top:6px"><thead><tr><th>اليوم</th><th>الموقع</th><th>سطر المخطط</th><th>الاسم</th><th>النوع</th><th>الحاضرين / المخطط</th></tr></thead><tbody>${tr.map(t => `<tr><td>${esc(t.date)}</td><td>${esc(t.site)}</td><td>${esc(t.job)}</td><td>${esc(t.name)}</td><td>${esc(t.type)}</td><td class="num">${t.n} / ${t.plan}</td></tr>`).join("")}</tbody></table>` : "";
  el.innerHTML = trimHtml + (rows.length
    ? `<div class="msg show warn" style="display:block">في ${rows.length} يوم/وظيفة الحاضرين فيهم أكتر من المخطط (${note}) — تنبيه بس، الحفظ مسموح.</div>
       <table style="margin-top:6px"><thead><tr><th>اليوم</th><th>الموقع</th><th>الوظيفة</th><th>الحاضرين</th><th>المخطط</th><th>الزيادة</th></tr></thead><tbody>${rows.map(r => `<tr><td>${esc(r.date)}</td><td>${esc(r.site)}</td><td>${esc(r.job)}</td><td class="num">${r.c}</td><td class="num">${r.plan}</td><td class="num" style="color:#a32d2d">+${r.c - r.plan}</td></tr>`).join("")}</tbody></table>`
    : `<p class="muted" style="margin-top:8px;">✓ مفيش يوم الحاضرين فيه زادوا عن المخطط. ${note}</p>`);
}

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
$("save").onclick = async () => {
  const list = selected(); if (!list.length) return;
  const sites = [...new Set(list.map(([, d]) => d.site))];
  if (!await ask(`حفظ ${list.length} يوم حضور (${sites.join("، ")}) كمعتمد؟\nالأيام اللي اترفعت قبل كده هتتحدث بالملف ده.`, { ok: "احفظ" })) return;
  $("save").disabled = true; show($("s-msg"), "info", "بيحفظ...");
  try {
    // أمان: منكتبش فوق يوم متسجل من الكشوف المصورة
    for (const s of sites) {
      const ds = list.filter(([, d]) => d.site === s).map(([, d]) => d.date).sort();
      const found = await siteDays(s, ds[0], ds[ds.length - 1]);
      const photo = found.filter(d => d.data().source !== "excel" && list.some(([k]) => k === d.id));
      if (photo.length) throw new Error(`فيه ${photo.length} يوم في ${s} متسجل من الكشوف المصورة — مش هكتب فوقه.`);
    }
    const u = auth.currentUser;
    for (let i = 0; i < list.length; i += 20) {   // يوم الشرقية كبير، فالدفعات صغيرة
      const b = writeBatch(db);
      list.slice(i, i + 20).forEach(([k, d]) => {
        const c = counts(d.entries);
        b.set(doc(db, "att_days", k), { site: d.site, date: d.date, entries: d.entries,
          counts: { present: c.present, absent: c.absent, leave: c.leave, total: c.total },
          source: "excel", company: S.type, file: S.fileName, status: "approved",
          uploaded_by: u.uid, uploaded_email: actorEmail(u), uploaded_at: serverTimestamp(),
          approved_by: u.uid, approved_email: actorEmail(u), approved_at: serverTimestamp() });
      });
      await b.commit();
      show($("s-msg"), "info", `اتحفظ ${Math.min(i + 20, list.length)} من ${list.length}...`);
    }
    // العمال الجداد (مش في السجل ومش بلاك ليست) → طلب إضافة لـ HR، مرة واحدة بس لكل رقم قومي
    let sent = 0, hrErr = "";
    const a = $("p-from").value, z = $("p-to").value;
    try { for (const w of Object.values(S.newbies || {})) {
      if (!w.present || w.first > z) continue;
      const ex = await getDocs(query(collection(db, "worker_events"), where("branch", "==", w.site), where("nid", "==", w.nid), where("kind", "==", "hire")));
      if (ex.docs.some(x => x.data().status !== "rejected")) continue;
      await addDoc(collection(db, "worker_events"), { kind: "hire", status: "pending", source: "excel", file: S.fileName, company: S.type,
        branch: w.site, site: w.site, name: w.name, nid: w.nid, phone: "", job: w.job, type: "اساسي", first_day: w.first < a ? a : w.first,
        by: u.uid, by_email: actorEmail(u), created_at: serverTimestamp() });
      sent++;
    } } catch (er) { hrErr = er.code === "permission-denied" ? "مش مسموح — محتاج تحديث الـ Rules (worker_events)" : er.message; }
    show($("s-msg"), hrErr ? "warn" : "ok", `اتحفظ ${list.length} يوم ✓ — تقدر تشوفهم في تقارير الحضور.` + (sent ? ` واتبعت ${sent} عامل جديد لـ HR.` : "")
      + (hrErr ? ` بس طلبات العمال الجداد لـ HR ماتبعتتش: ${hrErr}.` : ""));
  } catch (e) {
    show($("s-msg"), "err", "ماتحفظش: " + (e.code === "permission-denied" ? "مش مسموح — محتاج تحديث الـ Rules (att_days للأدمن والـ HR)." : e.message));
  }
  $("save").disabled = false;
};
