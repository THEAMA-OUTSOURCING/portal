// page-hr.js — سكريبت صفحة hr.html (اتنقل من جوه الصفحة لملف لوحده عشان الـ CSP تمنع أي سكريبت مكتوب جوه الـ HTML)
import { getFirestore, collection, doc, getDoc, getDocs, query, where, onSnapshot, updateDoc, setDoc, serverTimestamp, writeBatch } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { db, auth, actorEmail, SUP_SITES, isBasic, ask } from './shared.js?v=20261111a';
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
function show(el, t, x) { el.className = "msg show " + t; el.textContent = x; }
const TY = { sick: "مرضي", leave: "إجازة", resign: "استقالة" };
const ST = { pending: "مستني HR تيما", client_wait: "مستني رد العميل", approved: "معتمد", rejected: "مرفوض" };
// صور المحضر المختوم لإصابة العمل (لحد 3)
const MAHDAR = ["image2", "image3", "image4"];
const SRC = { supervisor: "طلب مشرف", excel_hr: "إكسيل", sharqia_drive: "تطبيق الشرقية" };
// مرضي نوعين: مرضى عادى (بيتحسب من الـ 10 أيام في السنة) وإصابة عمل (ملهاش حد) — sick_kind = sick / injury
// المرضي اللي العميل اعتمد منه جزء أو رفضه بيتقفل «معتمد» بعدد أيام — فبنوضّح ده في الشارة
const stTxt = e => e.status === "approved" && e.type === "sick" && e.approved_days != null && +e.approved_days < +e.days
  ? (+e.approved_days === 0 ? "العميل رفض — خ" : `معتمد ${esc(e.approved_days)} من ${esc(e.days)}`) : esc(ST[e.status] || e.status);
const tyTxt = e => e.type === "sick" && e.sick_kind === "injury" ? "إصابة عمل" : (TY[e.type] || "—");
// اسم الكلاس من قيمة جاية من Firestore: حروف إنجليزي وشرطة بس (عشان مايبقاش فيه HTML)
const cls = v => String(v ?? "").replace(/[^a-z_-]/gi, "");
// الرموز الموحدة: ج إجازة، خ إجازة بدون أجر، م مرضي (العارضة القديمة بتتعرض ج)
const KINDS = { annual: "ج إجازة", casual: "ج إجازة", unpaid: "خ بدون أجر" };
// ===== العميل: الشرقية بتخلص من HR تيما، وبيبسي والإمداد وشيبسي بيستنوا رد العميل =====
const anorm = s => String(s ?? "").replace(/[أإآ]/g, "ا").replace(/\s+/g, " ").trim();
const CHIPSY_SITES = ["قطامية", "ابوصير", "المعادي"];
const GROUP_AR = { pepsi: "بيبسي والإمداد", chipsy: "شيبسي", sharqia: "الشرقية" };
function groupOf(e) {
  const t = anorm([e.company, e.loc, e.site].join(" "));
  if (e.source === "sharqia_drive" || /شرقي/.test(t)) return "sharqia";
  if (/شيبس|chipsy|cfi/i.test(t) || CHIPSY_SITES.some(s => t.includes(s))) return "chipsy";
  return "pepsi";
}
// رد العميل للمرضي بس (بيبسي والإمداد / شيبسي). الإجازة والاستقالة بيتعتمدوا من HR تيما على طول
const needsClient = e => e.type === "sick" && groupOf(e) !== "sharqia";
const placeOf = e => e.site || [e.company, e.loc].filter(Boolean).join(" — ");
let ALL = [], ALL_LOADED = false, EDIT = null, CEDIT = null, XROWS = [], CROWS = [];
// المستني واللي اتعدل بعد القرار واللي مستني العميل: بيتسمعلهم على طول (دول اللي الـ HR محتاجهم).
// المعتمد والمرفوض: بيتحمّلوا بس لما الفلتر يتغيّر لهم — بدل ما الصفحة تقرا كل الحالات من أول يوم بصورها.
const LIVE_P = new Map(), LIVE_C = new Map(), LIVE_W = new Map(), DECIDED = new Map();
let LOADED_ST = "pending";
function rebuild() {
  const m = new Map(DECIDED);
  LIVE_C.forEach((v, k) => m.set(k, v)); LIVE_W.forEach((v, k) => m.set(k, v)); LIVE_P.forEach((v, k) => m.set(k, v));
  ALL = [...m.values()];
  const oldLv = [...LIVE_W.values()].filter(e => e.type !== "sick");
  $("old-lv").classList.toggle("hidden", !oldLv.length);
  $("cl-count").textContent = oldLv.length ? `${oldLv.length} إجازة` : "";
  const nTy = ty => [...LIVE_P.values()].filter(e => e.type === ty).length || "";
  $("tn-sick").textContent = nTy("sick"); $("tn-leave").textContent = nTy("leave"); $("tn-resign").textContent = nTy("resign");
  $("tn-client").textContent = LIVE_W.size || "";
  render();
}
async function loadDecided() {
  const st = $("f-st").value;
  if (st === "pending" || st === "client_wait") { DECIDED.clear(); LOADED_ST = st; return rebuild(); }
  show($("msg"), "info", "بيحمّل...");
  try {
    const sn = await getDocs(st ? evQ(where("status", "==", st)) : evQ());
    DECIDED.clear(); sn.forEach(d => DECIDED.set(d.id, { id: d.id, ...d.data() }));
    LOADED_ST = st; $("msg").className = "msg"; rebuild();
  } catch (e) { show($("msg"), "err", "مش قادر أحمّل الحالات: " + e.message); }
}
// ===== رفع إكسيل =====
const HEAD = ["الشركة", "الموقع", "الرقم القومى", "الكود", "الاسم", "النوع (إجازة / بدون أجر / مرضى / إصابة عمل)", "من", "لحد", "ملاحظات", "سبب الحالة المرضية", "المستشفى"];
$("tpl").onclick = () => {
  const ws = XLSX.utils.aoa_to_sheet([HEAD, ["شيبسي", "قطامية", "29001010101010", "", "مثال — امسح السطر ده", "مرضى", "2026-10-20", "2026-10-22", "", "التهاب حاد بالحلق", "مستشفى الصفا"]]);
  ws["!cols"] = HEAD.map((h, i) => ({ wch: i === 4 ? 30 : i === 5 ? 40 : i === 9 ? 34 : 16 }));
  const wb = XLSX.utils.book_new(); wb.Workbook = { Views: [{ RTL: true }] }; XLSX.utils.book_append_sheet(wb, ws, "إجازات ومرضي");
  XLSX.writeFile(wb, "شكل رفع الإجازات والمرضي.xlsx");
};
const pad2 = n => String(n).padStart(2, "0");
// تاريخ اليوم بتوقيت الجهاز (القاهرة) — toISOString بيرجع تاريخ UTC فبعد 12 بالليل بيطلّع امبارح
const ymd = d => d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
function toISO(v) {
  if (v instanceof Date && !isNaN(v)) { const u = new Date(Math.round((v.getTime() - v.getTimezoneOffset() * 60000) / 864e5) * 864e5); return u.getUTCFullYear() + "-" + pad2(u.getUTCMonth() + 1) + "-" + pad2(u.getUTCDate()); }
  const t = String(v ?? "").trim(); let m;
  if ((m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) return m[1] + "-" + pad2(m[2]) + "-" + pad2(m[3]);
  if ((m = t.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/))) return m[3] + "-" + pad2(m[2]) + "-" + pad2(m[1]);   // يوم/شهر/سنة
  return "";
}
// اسم الموقع في الإكسيل ← فرع من البوابة (بعد توحيد الحروف والمسافات)
const siteKey = t => anorm(t).replace(/ى/g, "ي").replace(/ة/g, "ه");
const siteOfLoc = loc => SUP_SITES.find(s => siteKey(s) === siteKey(loc)) || "";
// النوع من الإكسيل: بدون أجر = خ، أي إجازة تانية (سنوي / عارضة / إجازة) = ج
// الإجازة والمرضي وإصابة العمل في بيبسي وشيبسي والإمداد (مواقع البوابة) للأساسي بس: العامل لازم يكون على كشف الموقع كأساسي (أو جديد على الكشف).
// الشرقية والإكسيل اللي مالوش موقع من البوابة مش بيتأثروا. لو الكشف ماتقراش (صلاحية/نت) مش بنمنع.
const ROSTERS = {};
async function basicOk(site, nid, code) {
  if (!site || !SUP_SITES.includes(site)) return true;
  if (!(site in ROSTERS)) { try { const d = await getDoc(doc(db, "rosters", site)); ROSTERS[site] = d.exists() ? d.data().workers || [] : null; } catch (e) { ROSTERS[site] = null; } }
  const ws = ROSTERS[site]; if (!ws) return true;
  const w = ws.find(x => (nid && x.nid === String(nid)) || (code && x.code === String(code)));
  return !!w && isBasic(w.type);
}
const kindOf = t => /اصاب|إصاب/.test(t) ? ["sick", "", "injury"] : /مرض/.test(t) ? ["sick", "", "sick"] : /بدون/.test(t) ? ["leave", "unpaid"] : /سنو|عارض|اجاز|إجاز/.test(t) ? ["leave", "annual"] : [null, null];
function workDays(f, t) { let n = 0; for (let d = new Date(f + "T00:00"); d <= new Date(t + "T00:00"); d.setDate(d.getDate() + 1)) if (d.getDay() !== 5) n++; return n; }
$("xf").onchange = async () => {
  XROWS = []; $("xsave").disabled = true;
  const f = $("xf").files[0]; if (!f) return;
  try {
    const wb = XLSX.read(await f.arrayBuffer(), { cellDates: true });
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: "" }).slice(1);
    const bad = [];
    rows.forEach((r, i) => {
      if (!r.some(v => String(v).trim())) return;
      const nid = String(r[2]).replace(/\D/g, ""), code = String(r[3]).trim(), [type, kind, sk] = kindOf(String(r[5])), from = toISO(r[6]), to = toISO(r[7]) || from;
      const cause = String(r[9] ?? "").trim(), hospital = String(r[10] ?? "").trim();
      const row = { source: "excel_hr", company: String(r[0]).trim(), loc: String(r[1]).trim(), nid, code, name: String(r[4]).trim(), type, kind, type_ar: sk === "injury" ? "إصابة عمل" : TY[type],
        from, to, days: String(workDays(from, to)), reason: String(r[8]).trim() };
      if (type === "sick") Object.assign(row, { sick_kind: sk, cause, hospital });
      // الموقع لو هو اسم فرع من البوابة بيتسجل site (عشان HR الفرع يشوفه). HR بفروع: فروعه بس
      const site = siteOfLoc(row.loc);
      if (site) row.site = site;
      // المرضي اللي HR بيرفعه بيعدّي على العميل على طول — فلازم السبب والمستشفى عشان شيت العميل
      const toCl = type === "sick" && needsClient(row);
      const why = (!nid && !code) ? "مفيش رقم قومي ولا كود" : (nid && nid.length !== 14) ? "الرقم القومي مش 14 رقم" : !type ? "النوع مش مفهوم" : !from ? "تاريخ «من» مش مفهوم" : to < from ? "«لحد» قبل «من»"
        : toCl && !cause ? "سبب الحالة فاضي" : toCl && !hospital ? "المستشفى فاضي"
        : SCOPED && !SCOPED.includes(site) ? `الموقع «${row.loc}» مش من فروعك (اكتب اسم الفرع زي البوابة بالظبط)` : "";
      if (why) return bad.push(`سطر ${i + 2}: ${why}`);
      row._line = i + 2;
      XROWS.push(row);
    });
    // الإجازات والمرضي لغير الأساسي في مواقع البوابة مش بتترفع
    const keep = [];
    for (const row of XROWS) {
      if ((row.type === "leave" || row.type === "sick") && !(await basicOk(row.site, row.nid, row.code))) bad.push(`سطر ${row._line}: ${row.name || row.nid} مش أساسي في ${row.site} — الإجازة والمرضي للأساسي بس`);
      else keep.push(row);
    }
    XROWS = keep; XROWS.forEach(r => delete r._line);
    show($("xmsg"), bad.length ? "err" : "ok", `${XROWS.length} سطر سليم` + (bad.length ? ` — و${bad.length} فيهم مشكلة ومش هيترفعوا:\n` + bad.slice(0, 20).join("\n") : ""));
    $("xsave").disabled = !XROWS.length;
  } catch (e) { show($("xmsg"), "err", "الملف ماتقراش: " + e.message); }
};
$("xsave").onclick = async () => {
  if (!ALL_LOADED) return show($("xmsg"), "err", "لسه بيحمّل الحالات الموجودة — استنى ثانية وجرّب تاني.");
  const u = auth.currentUser, today = ymd(new Date()); let n = 0, same = 0, upd = 0, nDirect = 0;
  $("xsave").disabled = true;
  // السطر اللي اترفع قبل كده (نفس العامل + نفس «من» + نفس النوع) مش بيتكتب فوقه، عشان قرار الـ HR ميرجعش «مستني».
  // لو اتغيّر فيه حاجة (زي «لحد»): لو لسه مستني بيتحدّث، ولو اتاخد فيه قرار بيتعلّم «اتعدل بعد القرار — راجعه».
  const byId = new Map(ALL.map(x => [x.id, x]));
  // السطور اللي مش في اللي محمّل دلوقتي (ممكن يكون تم اعتمادها قبل كده): نتأكد منها واحدة واحدة
  const idOf = r => `xl__${r.nid || r.code}__${r.from}__${r.type}${r.kind ? "_" + r.kind : ""}`;
  try {
    const miss = [...new Set(XROWS.map(idOf))].filter(id => !byId.has(id));
    (await Promise.all(miss.map(id => getDoc(doc(db, "hr_events", id))))).forEach(sn => { if (sn.exists()) byId.set(sn.id, { id: sn.id, ...sn.data() }); });
  } catch (e) { $("xsave").disabled = false; return show($("xmsg"), "err", "مش قادر أتأكد من الحالات الموجودة: " + e.message); }
  const FIELDS = ["company", "loc", "name", "to", "days", "reason", "sick_kind", "cause", "hospital"];
  try {
    for (const r of XROWS) {
      const id = idOf(r);
      const ex = byId.get(id);
      if (!ex) {
        // مرضي بيبسي والإمداد / شيبسي: معتمد من HR تيما على طول ← «مستني رد العميل». غير كده «مستني HR تيما» زي الأول
        const direct = r.type === "sick" && needsClient(r);
        const st = direct ? { status: "client_wait", hr_ok_by: u.uid, hr_ok_email: actorEmail(u), hr_ok_at: serverTimestamp(), client_group: groupOf(r) } : { status: "pending" };
        await setDoc(doc(db, "hr_events", id), { ...r, entry_date: today, ...st, by_email: actorEmail(u), uploaded_by: u.uid, created_at: serverTimestamp() });
        byId.set(id, { id, ...r, status: st.status }); n++; if (direct) nDirect++;
        continue;
      }
      const diff = {}; FIELDS.forEach(k => { if (String(ex[k] ?? "") !== String(r[k] ?? "")) diff[k] = r[k]; });
      if (!Object.keys(diff).length) { same++; continue; }
      await updateDoc(doc(db, "hr_events", id), ex.status === "pending" ? diff : { changed: true, changed_data: diff });
      upd++;
    }
    show($("xmsg"), "ok", `اترفع ${n} سطر جديد` + (nDirect ? ` — منهم ${nDirect} مرضي راحوا «مستني رد العميل» على طول، والباقي تحت «مستني HR تيما».` : ` — هتلاقيهم تحت «مستني HR تيما».`)
      + (upd ? ` و${upd} سطر اتغيّر عن المترفع قبل كده (اللي اتاخد فيه قرار متعلّم «راجعه»).` : "")
      + (same ? ` و${same} سطر زي ما هو.` : "")); $("xf").value = ""; XROWS = [];
  } catch (e) { show($("xmsg"), "err", `اترفع ${n} جديد و${upd} تعديل، ووقف عند خطأ: ` + (e.code === "permission-denied" ? "محتاج تحديث الـ Rules." : e.message)); }
};

// ===== إجازات قديمة كانت «مستني رد العميل» قبل ما الإجازة تبطّل تستنى العميل: اعتماد مرة واحدة =====
$("old-lv-ok").onclick = async () => {
  const list = [...LIVE_W.values()].filter(e => e.type !== "sick");
  if (!list.length) return;
  if (!(await ask(`هتعتمد ${list.length} إجازة كانت مستنية العميل. متأكد؟`, { ok: "اعتمد" }))) return;
  const u = auth.currentUser; let n = 0; $("old-lv-ok").disabled = true;
  try {
    for (let i = 0; i < list.length; i += 400) {
      const b = writeBatch(db);
      list.slice(i, i + 400).forEach(e => b.update(doc(db, "hr_events", e.id), { status: "approved", decided_by: u.uid, decided_email: actorEmail(u), decided_at: serverTimestamp() }));
      await b.commit(); n += Math.min(400, list.length - i);
    }
    show($("msg"), "ok", `تم اعتماد ${n} إجازة.`);
  } catch (e) { show($("cl-msg"), "err", `تم اعتماد ${n} ووقف عند خطأ: ` + (e.code === "permission-denied" ? "محتاج تحديث الـ Rules (hr_events)." : e.message)); }
  $("old-lv-ok").disabled = false;
};
function clientUpd(ev, dec, from, to, note) {
  const u = auth.currentUser, moved = dec === "approved" && (from !== ev.from || to !== ev.to);
  const upd = { status: dec, decided_by: u.uid, decided_email: actorEmail(u), decided_at: serverTimestamp(),
    client: { decision: moved ? "modified" : dec, from: dec === "approved" ? from : "", to: dec === "approved" ? to : "", note: note || "", by_email: actorEmail(u) } };
  if (moved) Object.assign(upd, { from, to, days: String(workDays(from, to)),
    original: ev.original || { type: ev.type, from: ev.from || "", to: ev.to || "", entry_date: ev.entry_date || "" } });
  return upd;
}

// ===== المرضي: شيت للعميل بنفس شكله، وشيت رد بالأيام المعتمدة =====
// القاعدة عند العميل: 10 أيام مرضى في السنة، وإصابة العمل ملهاش حد. العميل بيرد بالاستثناءات بس.
const branchOf = e => e.site || e.loc || e.company || "";
const dmy = iso => iso ? iso.slice(8, 10) + "/" + iso.slice(5, 7) + "/" + iso.slice(0, 4) : "";
const skTxt = e => e.sick_kind === "injury" ? "اصابة عمل" : "مرضى";
const wKey = e => e.nid || "c:" + (e.code || e.id);
// الفترة اللي اتختارت فوق أزرار التصدير: الحالة بتدخل لو أي يوم من مدتها (من → لحد) جوه الفترة
const skPeriod = () => { let f = $("sk-from").value, t = $("sk-to").value; if (f && t && t < f) [f, t] = [t, f]; return { f, t }; };
const inSkPeriod = e => { const { f, t } = skPeriod(), a = e.from || e.entry_date || "", b = e.to || a;
  return (!t || !a || a <= t) && (!f || !b || b >= f); };
const skPeriodTxt = () => { const { f, t } = skPeriod(); return f || t ? ` (الفترة ${f ? dmy(f) : "الأول"} → ${t ? dmy(t) : "دلوقتي"})` : ""; };
const skPeriodFile = () => { const { f, t } = skPeriod(); return f || t ? ` ${f || "الأول"} الى ${t || ymd(new Date())}` : ""; };
const sickWaiting = g => [...LIVE_W.values()].filter(e => e.type === "sick" && groupOf(e) === g && inSkPeriod(e))
  .sort((a, b) => branchOf(a).localeCompare(branchOf(b)) || String(a.name).localeCompare(String(b.name)) || String(a.from).localeCompare(String(b.from)));
function sheetOut(aoa, cols, name, fname) {
  const ws = XLSX.utils.aoa_to_sheet(aoa); ws["!cols"] = cols.map(w => ({ wch: w }));
  const wb = XLSX.utils.book_new(); wb.Workbook = { Views: [{ RTL: true }] }; XLSX.utils.book_append_sheet(wb, ws, name);
  XLSX.writeFile(wb, fname);
}
const SK_HEAD = ["رقم الطلب", "المورد", "اسم المريض", "الفرع", "الوظيفة", "سبب الحالة المرضية", "تاريخ التعيين", "من", "الى", "عدد الايام", "المستشفى", "الرقم القومى", "نوع الحالة", "ملاحظات"];
async function exportSick(g) {
  const list = sickWaiting(g);
  if (!list.length) return show($("sk-msg"), "info", `مفيش مرضي مستني رد ${GROUP_AR[g]}${skPeriodTxt()}.`);
  const miss = list.filter(e => !e.cause || !e.hospital);
  const total = list.reduce((t, e) => t + (+e.days || 0), 0);
  const rows = list.map(e => [e.id, "تيما", e.name || "", branchOf(e), e.job || "", e.cause || "", dmy(e.hire_date || ""), dmy(e.from), dmy(e.to || e.from),
    +e.days || 0, e.hospital || "", String(e.nid || ""), skTxt(e), e.sick_kind === "injury" ? "اصابة عمل بمحضر مختوم" : (e.reason || "")]);
  const today = ymd(new Date());
  sheetOut([SK_HEAD, ...rows, ["", "", "", "", "", "", "", "", "الاجمالى", total]], [12, 7, 30, 14, 14, 34, 12, 11, 11, 9, 16, 17, 11, 22], "المرضى", `مرضى ${GROUP_AR[g]}${skPeriodFile() || " " + today}.xlsx`);
  const notSent = list.filter(e => !e.sent_at);
  try {
    for (let i = 0; i < notSent.length; i += 400) {
      const b = writeBatch(db);
      notSent.slice(i, i + 400).forEach(e => b.update(doc(db, "hr_events", e.id), { sent_at: serverTimestamp(), sent_email: actorEmail(auth.currentUser) }));
      await b.commit();
    }
    show($("sk-msg"), miss.length ? "err" : "ok", `اتصدّر ${list.length} حالة مرضي لـ ${GROUP_AR[g]}${skPeriodTxt()} — ${total} يوم.`
      + (miss.length ? `\nخلي بالك: ${miss.length} حالة ناقصها السبب أو المستشفى: ` + miss.slice(0, 10).map(e => e.name).join("، ") : ""));
  } catch (e) { show($("sk-msg"), "err", "الملف اتصدّر، بس ماتعلّمتش إنها اتبعتت: " + e.message); }
}
const SKR_HEAD = ["رقم الطلب", "اسم المريض", "الرقم القومى", "الفرع", "من", "الى", "نوع الحالة", "عدد الايام", "Limit", "الايام المعتمدة"];
function replySheet(g) {
  const list = sickWaiting(g);
  if (!list.length) return show($("sk-msg"), "info", `مفيش مرضي مستني رد ${GROUP_AR[g]}${skPeriodTxt()}.`);
  const total = list.reduce((t, e) => t + (+e.days || 0), 0);
  const rows = list.map(e => [e.id, e.name || "", String(e.nid || ""), branchOf(e), dmy(e.from), dmy(e.to || e.from), skTxt(e), +e.days || 0, "", +e.days || 0]);
  sheetOut([SKR_HEAD, ...rows, ["", "", "", "", "", "", "الاجمالى", total, "", total]], [12, 30, 17, 14, 11, 11, 11, 9, 8, 12], "رد العميل", `رد مرضى ${GROUP_AR[g]}${skPeriodFile() || " " + ymd(new Date())}.xlsx`);
  show($("sk-msg"), "info", `نزل شيت الرد (${list.length} حالة${skPeriodTxt()}). عدّل «الأيام المعتمدة» للحالات اللي في رد العميل بس، وارفعه.`);
}
// كام حالة في الفترة دي لكل عميل (بيتحدث مع تغيير التاريخ)
function skPeriodCount() {
  const n = g => sickWaiting(g).length, { f, t } = skPeriod();
  $("sk-period").textContent = f || t
    ? `في الفترة دي: بيبسي والإمداد ${n("pepsi")} حالة — شيبسي ${n("chipsy")} حالة`
    : "من غير فترة = كل المرضي المستني رد العميل";
}
$("sk-from").onchange = skPeriodCount; $("sk-to").onchange = skPeriodCount;
$("sk-clear").onclick = () => { $("sk-from").value = ""; $("sk-to").value = ""; skPeriodCount(); };
$("sk-exp-pepsi").onclick = () => exportSick("pepsi");
$("sk-exp-chipsy").onclick = () => exportSick("chipsy");
$("sk-rep-pepsi").onclick = () => replySheet("pepsi");
$("sk-rep-chipsy").onclick = () => replySheet("chipsy");
// الأيام المعتمدة لكل عامل = مجموع اللي مكتوب في سطوره، وبتتوزّع على فتراته من الأقدم
function spread(evs, total) {
  let left = total; const out = new Map();
  [...evs].sort((a, b) => String(a.from).localeCompare(String(b.from))).forEach(e => { const a = Math.min(left, +e.days || 0); out.set(e.id, a); left -= a; });
  return out;
}
let SKROWS = [];
const numOf = v => { const t = String(v ?? "").trim().replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d)); return t === "" ? null : /^\d+$/.test(t) ? +t : NaN; };
function skCheck() {
  const t = numOf($("sk-total").value);
  const sum = SKROWS.reduce((s, x) => s + x.a, 0);
  $("sk-save").disabled = !SKROWS.length || t == null || isNaN(t) || t !== sum;
  return { t, sum };
}
$("sk-total").oninput = () => {
  if (!SKROWS.length) return;
  const { t, sum } = skCheck();
  if (t != null && !isNaN(t)) show($("sk-msg"), t === sum ? "ok" : "err", (t === sum ? "الإجمالي مطابق ✓ — دوس «احفظ رد العميل»." : `الإجمالي مش مطابق: الشيت ${sum} وإيميل العميل ${t} — الفرق ${sum - t}.`) + "\n" + SKSUM);
};
let SKSUM = "";
$("sk-file").onchange = async () => {
  SKROWS = []; SKSUM = ""; $("sk-save").disabled = true;
  const f = $("sk-file").files[0]; if (!f) return;
  try {
    const wb = XLSX.read(await f.arrayBuffer());
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: "" });
    const H = (rows[0] || []).map(h => anorm(h));
    const col = re => H.findIndex(h => re.test(h));
    const iId = col(/رقم الطلب/), iA = col(/الايام المعتمد/), iL = col(/^limit$/i);
    if (iId < 0 || iA < 0) return show($("sk-msg"), "err", "ده مش شيت الرد اللي نزل من هنا (مش لاقي «رقم الطلب» أو «الايام المعتمدة»).");
    const bad = [], seen = new Set(), groups = new Map();
    rows.slice(1).forEach((r, i) => {
      const id = String(r[iId] || "").trim(); if (!id) return;   // سطر الإجمالي
      const line = `سطر ${i + 2}`;
      if (seen.has(id)) return bad.push(`${line}: الحالة متكررة`); seen.add(id);
      const ev = LIVE_W.get(id);
      if (!ev) return bad.push(`${line}: الحالة دي مش مستنية رد العميل: تم تسجيل ردها قبل كده، أو تم ردها لـ HR تيما`);
      if (ev.type !== "sick") return bad.push(`${line}: دي مش حالة مرضي`);
      const a = numOf(r[iA]), lim = iL >= 0 ? numOf(r[iL]) : null;
      if (Number.isNaN(a)) return bad.push(`${line}: «الأيام المعتمدة» لازم رقم صحيح`);
      if (Number.isNaN(lim)) return bad.push(`${line}: الـ Limit لازم رقم (أو فاضي)`);
      const k = wKey(ev); if (!groups.has(k)) groups.set(k, { evs: [], vals: [], lim: null });
      const gr = groups.get(k); gr.evs.push(ev); gr.vals.push(a); if (lim != null) gr.lim = lim;
    });
    for (const gr of groups.values()) {
      const name = gr.evs[0].name, max = gr.evs.reduce((t, e) => t + (+e.days || 0), 0);
      if (gr.vals.every(v => v == null)) { bad.push(`${name}: «الأيام المعتمدة» فاضية`); continue; }
      const T = gr.vals.reduce((t, v) => t + (v || 0), 0);
      if (T > max) { bad.push(`${name}: معتمد ${T} وهو طالب ${max} بس`); continue; }
      spread(gr.evs, T).forEach((a, id) => { const ev = gr.evs.find(e => e.id === id); SKROWS.push({ ev, a, lim: gr.lim }); });
    }
    if (bad.length) { SKROWS = []; return show($("sk-msg"), "err", `الشيت فيه ${bad.length} مشكلة — صلّحها وارفعه تاني (مفيش حاجة اتحفظت):\n` + bad.slice(0, 25).join("\n")); }
    const full = SKROWS.filter(x => x.a === +x.ev.days).length, zero = SKROWS.filter(x => x.a === 0).length, part = SKROWS.length - full - zero;
    const req = SKROWS.reduce((t, x) => t + (+x.ev.days || 0), 0), sum = SKROWS.reduce((t, x) => t + x.a, 0);
    SKSUM = `${SKROWS.length} حالة: ${full} معتمدة كاملة — ${part} جزئي — ${zero} مرفوضة. المطلوب ${req} يوم، والمعتمد ${sum} يوم (خ ${req - sum} يوم).`;
    const { t } = skCheck();
    show($("sk-msg"), t != null && t === sum ? "ok" : "info", SKSUM + (t == null ? "\nاكتب الإجمالي اللي في إيميل العميل عشان تقدر تحفظ." : t !== sum ? `\nالإجمالي مش مطابق: الشيت ${sum} وإيميل العميل ${t}.` : "\nالإجمالي مطابق ✓"));
  } catch (e) { show($("sk-msg"), "err", "الملف ماتقراش: " + e.message); }
};
// رد العميل على حالة مرضي: بتتقفل «معتمد» بعدد الأيام المعتمدة (حتى لو 0) عشان باقي الأيام تتسجل خ في الحضور
function sickClientUpd(ev, a, lim, note) {
  const u = auth.currentUser, d = +ev.days || 0;
  const upd = { status: "approved", approved_days: a, decided_by: u.uid, decided_email: actorEmail(u), decided_at: serverTimestamp(),
    client: { decision: a >= d ? "approved" : a === 0 ? "rejected" : "partial", approved_days: a, note: note || "", by_email: actorEmail(u) } };
  if (lim != null) upd.client_limit = lim;
  return upd;
}
$("sk-save").onclick = async () => {
  const { t, sum } = skCheck(); if (t !== sum) return;
  $("sk-save").disabled = true; let n = 0;
  try {
    for (let i = 0; i < SKROWS.length; i += 400) {
      const b = writeBatch(db);
      SKROWS.slice(i, i + 400).forEach(x => b.update(doc(db, "hr_events", x.ev.id), sickClientUpd(x.ev, x.a, x.lim, "")));
      await b.commit(); n += Math.min(400, SKROWS.length - i);
    }
    show($("sk-msg"), "ok", `اتسجل رد العميل على ${n} حالة مرضي — ${sum} يوم معتمد.`); SKROWS = []; $("sk-file").value = ""; $("sk-total").value = "";
  } catch (e) { show($("sk-msg"), "err", `اتسجل ${n} ووقف عند خطأ: ` + (e.code === "permission-denied" ? "محتاج تحديث الـ Rules (hr_events)." : e.message)); }
};

// ===== تصحيح نوع الإجازة: ج (ليه رصيد) / خ (ملوش رصيد) =====
// بيشمل الإجازات المعتمدة واللي مستنية رد العميل، اللي أيامها داخلة في الفترة
const LK_HEAD = ["رقم الطلب", "الاسم", "الرقم القومى", "الكود", "المكان", "من", "لحد", "عدد الايام", "الحالة", "نوع الإجازة (ج / خ)"];
const kindCode = k => k === "unpaid" ? "خ" : "ج";
let LKROWS = [];
async function leavesIn(f, t) {
  const out = [];
  for (const st of ["approved", "client_wait"]) {
    const sn = await getDocs(evQ(where("status", "==", st), where("type", "==", "leave")));
    sn.forEach(d => { const e = { id: d.id, ...d.data() }; if (e.from && e.from <= t && (e.to || e.from) >= f) out.push(e); });
  }
  return out.sort((a, b) => placeOf(a).localeCompare(placeOf(b)) || String(a.name).localeCompare(String(b.name)) || String(a.from).localeCompare(String(b.from)));
}
$("lk-exp").onclick = async () => {
  const f = $("lk-from").value, t = $("lk-to").value;
  if (!f || !t || t < f) return show($("lk-msg"), "err", "حدد الفترة (من ولحد).");
  show($("lk-msg"), "info", "بيحمّل...");
  try {
    const list = await leavesIn(f, t);
    if (!list.length) return show($("lk-msg"), "info", "مفيش إجازات في الفترة دي.");
    const rows = list.map(e => [e.id, e.name || "", String(e.nid || ""), String(e.code || ""), placeOf(e), dmy(e.from), dmy(e.to || e.from), +e.days || 0,
      e.status === "approved" ? "معتمد" : "مستني العميل", kindCode(e.kind)]);
    sheetOut([LK_HEAD, ...rows], [12, 30, 17, 10, 22, 11, 11, 9, 12, 16], "الإجازات", `نوع الإجازات ${f} الى ${t}.xlsx`);
    const nU = list.filter(e => e.kind === "unpaid").length;
    show($("lk-msg"), "ok", `نزل ${list.length} إجازة (ج ${list.length - nU} — خ ${nU}). غيّر عمود «نوع الإجازة» وارفعه.`);
  } catch (e) { show($("lk-msg"), "err", "مش قادر أحمّل الإجازات: " + e.message); }
};
$("lk-file").onchange = async () => {
  LKROWS = []; $("lk-save").disabled = true;
  const file = $("lk-file").files[0]; if (!file) return;
  try {
    const wb = XLSX.read(await file.arrayBuffer());
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: "" });
    const H = (rows[0] || []).map(h => anorm(h));
    const iId = H.findIndex(h => /رقم الطلب/.test(h)), iK = H.findIndex(h => /نوع الاجاز/.test(h));
    if (iId < 0 || iK < 0) return show($("lk-msg"), "err", "ده مش شيت الإجازات اللي نزل من هنا (مش لاقي «رقم الطلب» أو «نوع الإجازة»).");
    const bad = [], ids = [];
    rows.slice(1).forEach((r, i) => {
      const id = String(r[iId] || "").trim(); if (!id) return;
      const v = String(r[iK] || "").trim();
      const kind = /^خ|بدون/.test(v) ? "unpaid" : /^ج|اجاز|إجاز|رصيد/.test(v) ? "annual" : "";
      if (!kind) return bad.push(`سطر ${i + 2}: نوع الإجازة لازم ج أو خ`);
      ids.push({ id, kind, line: i + 2 });
    });
    const snaps = await Promise.all(ids.map(x => getDoc(doc(db, "hr_events", x.id))));
    snaps.forEach((sn, i) => {
      const x = ids[i], e = sn.exists() ? sn.data() : null;
      if (!e || e.type !== "leave") return bad.push(`سطر ${x.line}: الإجازة دي مش موجودة`);
      if ((e.kind === "unpaid" ? "unpaid" : "annual") !== x.kind) LKROWS.push({ id: x.id, kind: x.kind, name: e.name });
    });
    const toU = LKROWS.filter(x => x.kind === "unpaid").length;
    show($("lk-msg"), bad.length ? "err" : "ok", (LKROWS.length ? `${LKROWS.length} إجازة اتغيّر نوعها: ${toU} ← خ، و${LKROWS.length - toU} ← ج.` : "مفيش ولا إجازة اتغيّر نوعها.")
      + (bad.length ? `\n${bad.length} سطر مش هيتسجلوا:\n` + bad.slice(0, 20).join("\n") : ""));
    $("lk-save").disabled = !LKROWS.length;
  } catch (e) { show($("lk-msg"), "err", "الملف ماتقراش: " + e.message); }
};
$("lk-save").onclick = async () => {
  $("lk-save").disabled = true; let n = 0;
  try {
    for (let i = 0; i < LKROWS.length; i += 400) {
      const b = writeBatch(db);
      LKROWS.slice(i, i + 400).forEach(x => b.update(doc(db, "hr_events", x.id), { kind: x.kind, kind_by: actorEmail(auth.currentUser) }));
      await b.commit(); n += Math.min(400, LKROWS.length - i);
    }
    show($("lk-msg"), "ok", `اتعدّل نوع ${n} إجازة.`); LKROWS = []; $("lk-file").value = "";
  } catch (e) { show($("lk-msg"), "err", `اتعدّل ${n} ووقف عند خطأ: ` + (e.code === "permission-denied" ? "محتاج تحديث الـ Rules (hr_events)." : e.message)); }
};

// ===== تصدير المرفوض: مرضي / إجازة / استقالة في شيت واحد بالسبب =====
const RJ_HEAD = ["الاسم", "الرقم القومى", "الكود", "العميل", "المكان", "الوظيفة", "النوع", "من", "لحد", "عدد الايام", "الايام المرفوضة", "الرفض من", "سبب الرفض", "تاريخ التسجيل"];
$("rj-exp").onclick = async () => {
  const f = $("rj-from").value, t = $("rj-to").value, ty = $("rj-ty").value;
  if (!f || !t || t < f) return show($("rj-msg"), "err", "حدد الفترة (من ولحد).");
  show($("rj-msg"), "info", "بيحمّل...");
  try {
    const [rj, sk] = await Promise.all([getDocs(evQ(where("status", "==", "rejected"))), getDocs(evQ(where("status", "==", "approved"), where("type", "==", "sick")))]);
    const list = [];
    rj.forEach(d => list.push({ id: d.id, ...d.data() }));
    // المرضي اللي العميل اعتمد منه أقل من أيامه (أو 0) — الباقي مرفوض
    sk.forEach(d => { const e = { id: d.id, ...d.data() }; if (e.approved_days != null && e.approved_days !== "" && +e.approved_days < +e.days) list.push(e); });
    const inP = e => e.type === "resign" ? (e.entry_date >= f && e.entry_date <= t) : (e.from && e.from <= t && (e.to || e.from) >= f);
    const rows = list.filter(e => (!ty || e.type === ty) && inP(e))
      .sort((a, b) => placeOf(a).localeCompare(placeOf(b)) || String(a.name).localeCompare(String(b.name)) || String(a.from || a.entry_date).localeCompare(String(b.from || b.entry_date)))
      .map(e => {
        const byClient = !!e.client, part = e.status === "approved";
        const rjDays = e.type === "resign" ? "" : part ? (+e.days || 0) - (+e.approved_days || 0) : (+e.days || 0);
        const why = (byClient ? e.client.note : e.note) || e.note || "";
        return [e.name || "", String(e.nid || ""), String(e.code || ""), GROUP_AR[groupOf(e)], placeOf(e), e.job || "",
          tyTxt(e) + (e.type === "leave" && e.kind ? " " + (KINDS[e.kind] || "") : ""),
          e.type === "resign" ? dmy(e.entry_date) : dmy(e.from), e.type === "resign" ? "" : dmy(e.to || e.from),
          e.type === "resign" ? "" : (+e.days || 0), rjDays,
          byClient ? (part ? "العميل (اعتمد " + e.approved_days + " من " + e.days + ")" : "العميل") : "HR تيما", why || "بدون سبب", dmy(e.entry_date)];
      });
    if (!rows.length) return show($("rj-msg"), "info", "مفيش حالات مرفوضة في الفترة دي.");
    sheetOut([RJ_HEAD, ...rows], [30, 17, 10, 14, 22, 16, 16, 11, 11, 9, 12, 22, 34, 12], "المرفوض", `المرفوض ${f} الى ${t}.xlsx`);
    const noWhy = rows.filter(r => r[12] === "بدون سبب").length;
    show($("rj-msg"), "ok", `نزل ${rows.length} حالة مرفوضة` + (noWhy ? ` — منهم ${noWhy} اترفضوا من غير سبب.` : "."));
  } catch (e) { show($("rj-msg"), "err", "مش قادر أحمّل المرفوض: " + (e.code === "permission-denied" ? "محتاج تحديث الـ Rules (hr_events)." : e.message)); }
};

let VIEW = false;   // المشاهد: عرض بس
// HR ليه فروع: حالات فروعه بس — كل قراية لازم تبقى بالفروع دي (الـ Rules بترفض غير كده).
// الحالات اللي مالهاش فرع (الشرقية والإكسيل القديم) ومرحلة العميل لـ HR اللي ليه كل الفروع.
let SCOPED = null;
function evQ(...w) { return SCOPED ? query(collection(db, "hr_events"), ...w, where("site", "in", SCOPED)) : query(collection(db, "hr_events"), ...w); }
$("l-btn").onclick = async () => { try { await signInWithEmailAndPassword(auth, $("l-email").value.trim(), $("l-pass").value); } catch (e) { show($("l-err"), "err", "الإيميل أو الباسورد غلط"); } };
$("logout").onclick = () => signOut(auth).finally(() => location.reload()); $("d-out").onclick = () => signOut(auth).finally(() => location.reload());
onAuthStateChanged(auth, async user => {
  ["login", "denied", "app"].forEach(i => $(i).classList.add("hidden"));
  if (!user) return $("login").classList.remove("hidden");
  let role = null, claims = {}; try { claims = (await user.getIdTokenResult()).claims || {}; role = claims.role || null; } catch (e) {}
  if (!["admin", "hr", "viewer"].includes(role)) return $("denied").classList.remove("hidden");
  SCOPED = role === "hr" && Array.isArray(claims.sites) && claims.sites.length ? claims.sites : null;
  $("client-card").classList.toggle("hidden", !!SCOPED);
  $("tab-client").classList.toggle("hidden", !!SCOPED);
  if (SCOPED) $("scope-note").textContent = "حسابك ليه الفروع دي بس: " + SCOPED.join("، ") + ".";
  // المشاهد (viewer): يشوف الحالات وصورها بس — من غير رفع ولا اعتماد ولا تصدير للعميل
  VIEW = role === "viewer";
  if (VIEW) { document.querySelectorAll(".no-view").forEach(el => el.classList.add("hidden")); document.querySelector("#app h1").textContent = "الحالات"; }
  $("who").textContent = role === "admin" ? "ادمن" : user.email; $("app").classList.remove("hidden");
  wqStart(role, user.uid);
  let last = "cases:sick"; try { last = localStorage.getItem(TAB_KEY) || "cases:sick"; } catch (e) {}
  showTab(last);
  const onErr = err => show($("msg"), "err", "مش قادر أقرا الحالات: " + (err.code === "permission-denied" ? "محتاج تحديث الـ Rules (hr_events)." : err.message));
  const fill = (map, snap) => { map.clear(); snap.forEach(d => map.set(d.id, { id: d.id, ...d.data() })); };
  onSnapshot(evQ(where("status", "==", "pending")), snap => { fill(LIVE_P, snap); ALL_LOADED = true; rebuild(); }, onErr);
  onSnapshot(evQ(where("changed", "==", true)), snap => { fill(LIVE_C, snap); rebuild(); }, onErr);
  onSnapshot(evQ(where("status", "==", "client_wait")), snap => { fill(LIVE_W, snap); rebuild(); }, onErr);
  try { const s = await getDoc(doc(db, "admin_tasks_status", "sharqia_sync")); const t = s.data()?.last_run?.toDate?.(); if (t) $("sync").textContent = "آخر تحديث للشرقية: " + t.toLocaleString("ar-EG"); } catch (e) {}
});
$("f-st").onchange = loadDecided; $("f-ty").onchange = render; $("f-gr").onchange = render; $("f-q").oninput = render;

// إيه اللي اتغيّر في الشيت بعد القرار: القديم ← الجديد
const CH_LABEL = { from: "من", to: "لحد", days: "الأيام", reason: "السبب", name: "الاسم", loc: "المكان", company: "الشركة", job: "الوظيفة", type: "النوع", kind: "نوع الإجازة", entry_date: "تاريخ التسجيل" };
function changedHtml(e) {
  const d = e.changed_data || {};
  const show1 = (k, v) => k === "type" ? (TY[v] || v) : k === "kind" ? (KINDS[v] || v) : v;
  const rows = Object.keys(d).filter(k => CH_LABEL[k] && String(d[k] ?? "").length < 120)
    .map(k => `<li>${CH_LABEL[k]}: <s>${esc(show1(k, e[k]) || "—")}</s> ← <b>${esc(show1(k, d[k]) || "—")}</b></li>`);
  return rows.length ? `<ul style="margin:4px 18px 0 0;padding:0;">${rows.join("")}</ul>` : "";
}
const tsTxt = t => t?.toDate ? t.toDate().toLocaleDateString("ar-EG") : "";
const CDEC = { approved: "وافق", modified: "وافق وعدّل المدة", rejected: "رفض", partial: "اعتمد جزء" };
// المرضي: HR تيما بيكتب السبب والمستشفى وهو بيوافق (لازمين لشيت العميل)، ويقدر يغيّر مرضى ↔ إصابة عمل
const sickFields = e => e.type !== "sick" ? "" : `<div class="row" style="width:100%;gap:6px;">
  <select data-sk="${esc(e.id)}" style="padding:4px 6px;font-size:12px;"><option value="sick" ${e.sick_kind !== "injury" ? "selected" : ""}>مرضى</option><option value="injury" ${e.sick_kind === "injury" ? "selected" : ""}>إصابة عمل</option></select>
  <input data-cause="${esc(e.id)}" placeholder="سبب الحالة المرضية" value="${esc(e.cause || "")}" style="flex:2;min-width:150px;">
  <input data-hosp="${esc(e.id)}" placeholder="المستشفى" value="${esc(e.hospital || "")}" style="flex:1;min-width:110px;"></div>`;
const kindSel = e => e.type !== "leave" ? "" : `<select data-kind="${esc(e.id)}" style="padding:4px 6px;font-size:12px;"><option value="annual" ${e.kind !== "unpaid" ? "selected" : ""}>ج — إجازة (ليه رصيد)</option><option value="unpaid" ${e.kind === "unpaid" ? "selected" : ""}>خ — بدون أجر (ملوش رصيد)</option></select>`;
function render() {
  const st = $("f-st").value, ty = $("f-ty").value, gr = $("f-gr").value, q = $("f-q").value.trim();
  // اللي اتعدل في الشيت بعد القرار بيظهر مع «مستني HR تيما» وفوق خالص، عشان محدش يفوّته
  const needs = e => e.status === "pending" || !!e.changed;
  const list = ALL.filter(e => (!st || e.status === st || (st === "pending" && e.changed)) && (!ty || e.type === ty) && (!gr || groupOf(e) === gr)
      && (!q || [e.name, e.code, e.nid, placeOf(e)].some(x => String(x || "").includes(q))))
    .sort((a, b) => (b.changed ? 1 : 0) - (a.changed ? 1 : 0) || (needs(a) ? 0 : 1) - (needs(b) ? 0 : 1) || String(b.entry_date).localeCompare(String(a.entry_date)));
  $("list").innerHTML = list.length ? list.map(e => {
    const toClient = needsClient(e);
    return `
    <div class="ev">
      <div class="ph" ${e.image ? `data-zoom="${esc(e.id)}"` : ""}>${e.image ? `<img src="${esc(e.image)}" alt="">` : `<span class="muted">${e.image_path ? "الصورة اتنقلت لسيرفر الشركة" : e.type === "leave" ? "الإجازة مالهاش صورة" : e.image_missing ? "الصورة مش لاقيها على Drive" : "مفيش صورة"}</span>`}</div>
      ${e.image2 ? `<div style="display:flex;border-top:1px solid #e5e5e5;">${MAHDAR.filter(f => e[f]).map((f, i) => `<div class="ph" style="height:120px;flex:1;${i ? "border-right:1px solid #e5e5e5;" : ""}" data-zoom2="${esc(e.id)}" data-f="${f}" title="المحضر المختوم ${i + 1}"><img src="${esc(e[f])}" alt="المحضر"></div>`).join("")}</div>` : e.sick_kind === "injury" && e.source === "supervisor" ? `<div class="warn" style="margin:6px 12px 0;">مفيش صورة المحضر</div>` : ""}
      <div class="bd">
        <div class="row" style="justify-content:space-between;align-items:center;"><span class="nm">${esc(e.name)}</span><span><span class="pill t-${cls(e.type)}">${tyTxt(e)}${e.kind ? " " + (KINDS[e.kind] || "") : ""}</span> <span class="pill s-${cls(e.status)}">${stTxt(e)}</span></span></div>
        <div style="margin-top:4px;"><span class="pill g">${GROUP_AR[groupOf(e)]}</span> <span class="muted">${SRC[e.source] || ""}</span></div>
        <dl>
          <dt>الكود</dt><dd>${esc(e.code)}${e.nid ? ` — <span dir="ltr">${esc(e.nid)}</span>` : ""}</dd>
          <dt>المكان</dt><dd>${esc([placeOf(e), e.job].filter(Boolean).join(" — "))}</dd>
          ${e.type === "resign" ? `<dt>السبب</dt><dd>${esc(e.reason)}</dd><dt>من تاريخ</dt><dd>${esc(e.entry_date)} (يوم التسجيل)</dd>`
            : `<dt>من</dt><dd>${esc(e.from)} لحد ${esc(e.to)} — ${esc(e.days)} يوم${e.approved_days != null && +e.approved_days < +e.days ? ` — <b>العميل اعتمد ${esc(e.approved_days)}</b>` : ""}</dd>`}
          ${isInj(e) ? injuryHtml(e) : ""}
          ${e.type === "sick" && (e.cause || e.hospital) ? `<dt>السبب</dt><dd>${esc(e.cause || "—")}</dd><dt>المستشفى</dt><dd>${esc(e.hospital || "—")}</dd>` : ""}
          <dt>اتسجل</dt><dd>${esc(e.entry_date)} — ${esc(e.by_email)}</dd>
          ${e.original && (e.edited || e.client) ? `<dt>الأصل</dt><dd>${esc(TY[e.original.type] || "")} ${esc(e.original.from || e.original.entry_date)}${e.original.to ? " → " + esc(e.original.to) : ""}</dd>` : ""}
          ${e.hr_ok_email ? `<dt>HR تيما</dt><dd>وافق — ${esc(e.hr_ok_email)} ${esc(tsTxt(e.hr_ok_at))}</dd>` : ""}
          ${e.status === "client_wait" ? `<dt>العميل</dt><dd>${e.sent_at ? `اتبعتت ${esc(tsTxt(e.sent_at))} — مستني الرد` : "لسه مااتصدّرتش في ملف للعميل"}</dd>` : ""}
          ${e.client ? `<dt>العميل</dt><dd>${CDEC[e.client.decision] || ""}${e.client.decision === "modified" ? ` (${esc(e.client.from)} → ${esc(e.client.to)})` : ""}${e.client.note ? ` — ${esc(e.client.note)}` : ""}</dd>` : ""}
          ${e.decided_email && !e.client ? `<dt>القرار</dt><dd>${esc(e.decided_email)}${e.note ? ` — ${esc(e.note)}` : ""}</dd>` : e.note ? `<dt>ملاحظة</dt><dd>${esc(e.note)}</dd>` : ""}
        </dl>
        ${e.changed ? `<div class="warn">السطر اتعدل في الشيت بعد القرار — راجعه${changedHtml(e)}<div style="margin-top:4px;">«اعتماد» أو «رفض» بيتطبق على البيانات الجديدة دي.</div></div>` : ""}
        ${e.deleted_in_sheet ? `<div class="warn">السطر اتمسح من الشيت</div>` : ""}
      </div>
      ${EDIT === e.id ? `<div class="ft edit" style="flex-direction:column;align-items:stretch;background:#fffdf5">
        <label class="f">النوع<select data-et><option value="sick" ${e.type === "sick" ? "selected" : ""}>مرضي</option><option value="leave" ${e.type === "leave" ? "selected" : ""}>إجازة</option><option value="resign" ${e.type === "resign" ? "selected" : ""}>استقالة</option></select></label>
        <label class="f">نوع الإجازة (لو إجازة)<select data-ek><option value="annual" ${e.kind !== "unpaid" ? "selected" : ""}>ج — إجازة (ليه رصيد)</option><option value="unpaid" ${e.kind === "unpaid" ? "selected" : ""}>خ — بدون أجر (ملوش رصيد)</option></select></label>
        <div class="row"><label class="f">من (أو تاريخ الاستقالة)<input type="date" data-ef value="${esc(e.type === "resign" ? e.entry_date : (e.from || (isInj(e) && prevInjury(e) ? dayAfter(prevInjury(e).to || prevInjury(e).from) : "")))}"></label>
        <label class="f">لحد<input type="date" data-eto value="${esc(e.to || "")}"></label></div>
        <div data-esick${e.type === "sick" ? "" : ' class="hidden"'}><span class="muted" style="font-size:12px;">لو مرضي:</span>${sickFields({ ...e, type: "sick" })}</div>
        <input placeholder="سبب التعديل" data-note="${esc(e.id)}">
        <div class="row"><button class="btn ok small" data-esave="${esc(e.id)}">احفظ و${toClient ? "ابعت للعميل" : "اعتمد"}</button><button class="btn sec small" data-ecancel="1">إلغاء</button></div></div>` : ""}
      ${CEDIT === e.id ? `<div class="ft edit" style="flex-direction:column;align-items:stretch;background:#f4f8fd">
        <b style="font-size:13px;">العميل وافق بمدة تانية</b>
        <div class="row"><label class="f">من<input type="date" data-cf value="${esc(e.from)}"></label><label class="f">لحد<input type="date" data-cto value="${esc(e.to)}"></label></div>
        <input placeholder="ملاحظة العميل (اختياري)" data-cnote="${esc(e.id)}">
        <div class="row"><button class="btn ok small" data-csave="${esc(e.id)}">سجّل</button><button class="btn sec small" data-ccancel="1">إلغاء</button></div></div>` : ""}
      ${VIEW || EDIT === e.id || CEDIT === e.id ? "" : `<div class="ft">${e.status === "pending" || e.changed
        ? `${kindSel(e)}${sickFields(e)}<input placeholder="ملاحظة (إجبارية لو هترفض)" data-note="${esc(e.id)}" style="flex:1;min-width:120px;"><button class="btn ok small" data-ap="${esc(e.id)}">${toClient && e.type !== "resign" ? "موافقة ← للعميل" : "اعتماد"}</button><button class="btn sec small" data-ed="${esc(e.id)}">تعديل</button><button class="btn danger small" data-rj="${esc(e.id)}">رفض</button>`
        : e.status === "client_wait" && e.type === "sick"
        ? `<input placeholder="ملاحظة العميل (اختياري)" data-note="${esc(e.id)}" style="flex:1;min-width:110px;"><label class="f" style="flex-direction:row;align-items:center;gap:4px;">الأيام المعتمدة<input type="number" min="0" max="${esc(e.days)}" value="${esc(e.days)}" data-sa="${esc(e.id)}" style="width:64px;padding:4px 6px;"></label><button class="btn ok small" data-sok="${esc(e.id)}">سجّل رد العميل</button><button class="btn danger small" data-back="${esc(e.id)}">رجّعها لتيما</button>`
        : e.status === "client_wait"
        ? `<input placeholder="ملاحظة العميل (إجبارية لو رفض)" data-note="${esc(e.id)}" style="flex:1;min-width:120px;"><button class="btn ok small" data-cok="${esc(e.id)}">العميل وافق</button><button class="btn sec small" data-ced="${esc(e.id)}">وافق بمدة تانية</button><button class="btn danger small" data-crj="${esc(e.id)}">العميل رفض</button><button class="btn danger small" data-back="${esc(e.id)}">رجّعها لتيما</button>`
        : `<button class="btn danger small" data-back="${esc(e.id)}">رجّعها مستنية</button>`}</div>`}
    </div>`; }).join("") : `<div class="card muted">مفيش حالات.</div>`;
}
// بيانات المرضي من الكارت: النوع والسبب والمستشفى — السبب والمستشفى لازمين لو الحالة رايحة للعميل
function readSick(id, ev, root = document) {
  const sk = root.querySelector(`[data-sk="${id}"]`)?.value || ev.sick_kind || "sick";
  const cause = (root.querySelector(`[data-cause="${id}"]`)?.value ?? ev.cause ?? "").trim();
  const hospital = (root.querySelector(`[data-hosp="${id}"]`)?.value ?? ev.hospital ?? "").trim();
  if (needsClient(ev) && (!cause || !hospital)) return { err: `اكتب سبب الحالة والمستشفى لـ ${ev.name} قبل الموافقة (لازمين لشيت العميل).` };
  return { v: { sick_kind: sk, type_ar: sk === "injury" ? "إصابة عمل" : TY.sick, cause, hospital } };
}
const errTxt = er => er.code === "permission-denied" ? "محتاج تحديث الـ Rules (hr_events)." : er.message;
async function save(id, upd, okMsg) {
  try { await updateDoc(doc(db, "hr_events", id), upd); EDIT = null; CEDIT = null; if (LOADED_ST !== "pending" && LOADED_ST !== "client_wait") await loadDecided(); else render(); show($("msg"), "ok", okMsg || "اتحفظ."); }
  catch (er) { show($("msg"), "err", "ماتحفظش: " + errTxt(er)); }
}
// موافقة HR تيما: الشرقية (والاستقالات) بتتعتمد على طول، والباقي بيروح «مستني رد العميل»
// ===== إصابة العمل الممتدة =====
// الإصابة بتفضل مستمرة لحد ما العامل يرجع الشغل، والتجديد = امتداد لنفس الإصابة (من غير محضر جديد).
// الامتداد: extends = رقم الإصابة اللي قبله (طلب المشرف)، أو — لو مش متحدد (الشرقية/الإكسيل) — آخر إصابة لنفس العامل قبلها.
// بعد «لحد» من غير تجديد = غياب لحد ما ييجي طلب جديد (مفيش حاجة بتتحسب تلقائي هنا).
const isInj = e => e.type === "sick" && e.sick_kind === "injury";
const sameW = (a, b) => (a.nid && a.nid === b.nid) || (a.code && String(a.code) === String(b.code));
const dayAfter = d => { if (!d) return ""; const x = new Date(d + "T00:00"); x.setDate(x.getDate() + 1); return ymd(x); };
function prevInjury(e) {
  if (!isInj(e)) return null;
  if (e.extends) return ALL.find(x => x.id === e.extends) || null;
  const start = e.from || e.entry_date || "9999";
  return ALL.filter(x => x.id !== e.id && isInj(x) && x.status !== "rejected" && sameW(x, e) && (x.to || x.from) && (x.to || x.from) < start)
    .sort((a, b) => String(b.to || b.from).localeCompare(String(a.to || a.from)))[0] || null;
}
// السلسلة كلها من أول إصابة لحد دي: [الأولى ... e]
function injuryChain(e) {
  const out = [e], seen = new Set([e.id]); let p = prevInjury(e);
  while (p && !seen.has(p.id)) { out.unshift(p); seen.add(p.id); p = prevInjury(p); }
  return out;
}
function injuryHtml(e) {
  const ch = injuryChain(e); if (ch.length < 2) return "";
  const first = ch[0], prev = ch[ch.length - 2], tot = ch.reduce((a, x) => a + (+x.days || 0), 0);
  return `<dt>امتداد إصابة</dt><dd>تجديد رقم ${ch.length - 1} — آخر إصابة قبلها ${esc(prev.from || "؟")} لحد ${esc(prev.to || "؟")}، والإصابة بدأت ${esc(first.from || first.entry_date || "؟")} — مجموع ${tot} يوم${e.from ? "" : ` <b style="color:#a32d2d">— التاريخ فاضي: «من» المقترح ${esc(dayAfter(prev.to || prev.from))}</b>`}</dd>`;
}
function hrOk(ev, extra) {
  const u = auth.currentUser, toClient = needsClient({ ...ev, ...extra });
  const upd = { ...extra, status: toClient ? "client_wait" : "approved", changed: false,
    hr_ok_by: u.uid, hr_ok_email: actorEmail(u), hr_ok_at: serverTimestamp(), client_group: groupOf(ev) };
  if (!toClient) Object.assign(upd, { decided_by: u.uid, decided_email: actorEmail(u), decided_at: serverTimestamp() });
  return [upd, toClient ? "اتوافق عليها واتنقلت لـ «مستني رد العميل»." : "تم الاعتماد."];
}
// صندوق التعديل: لما النوع يتغير لمرضي تظهر خانات السبب والمستشفى (ولو اتغير لحاجة تانية تستخبى)
$("list").onchange = e => {
  if (!e.target.matches("[data-et]")) return;
  e.target.closest(".ft")?.querySelector("[data-esick]")?.classList.toggle("hidden", e.target.value !== "sick");
};
$("list").onclick = async e => {
  const z = e.target.closest("[data-zoom]");
  if (z) { $("zoom-img").src = ALL.find(x => x.id === z.dataset.zoom).image; return $("zoom").classList.remove("hidden"); }
  const z2 = e.target.closest("[data-zoom2]");
  if (z2) { $("zoom-img").src = ALL.find(x => x.id === z2.dataset.zoom2)[z2.dataset.f || "image2"]; return $("zoom").classList.remove("hidden"); }
  if (VIEW) return;   // المشاهد: تكبير الصورة بس
  const ds = e.target.dataset;
  if (ds.ed) { EDIT = ds.ed; CEDIT = null; return render(); }
  if (ds.ced) { CEDIT = ds.ced; EDIT = null; return render(); }
  if (ds.ecancel || ds.ccancel) { EDIT = null; CEDIT = null; return render(); }
  if (ds.esave) {
    const id = ds.esave, box = e.target.closest(".ft"), ev = ALL.find(x => x.id === id);
    const type = box.querySelector("[data-et]").value, f = box.querySelector("[data-ef]").value, t = box.querySelector("[data-eto]").value;
    const note = box.querySelector("[data-note]").value.trim();
    if (!f || (type !== "resign" && (!t || t < f))) return show($("msg"), "err", "التواريخ مش مظبوطة.");
    if ((type === "leave" || type === "sick") && !(await basicOk(ev.site, ev.nid, ev.code)))
      return show($("msg"), "err", `الإجازة والمرضي للأساسي بس في بيبسي وشيبسي والإمداد — ${ev.name} مش أساسي في ${ev.site}.`);
    const extra = { type, type_ar: TY[type], edited: true, note: note || "اتعدل من الـ HR",
      original: ev.original || { type: ev.type, from: ev.from || "", to: ev.to || "", entry_date: ev.entry_date || "" } };
    if (type === "resign") Object.assign(extra, { entry_date: f, from: "", to: "", days: "", kind: "" });
    else Object.assign(extra, { from: f, to: t, days: String(workDays(f, t)), kind: type === "leave" ? box.querySelector("[data-ek]").value : "" });
    if (ev.changed && ev.changed_data) Object.keys(ev.changed_data).forEach(k => { if (!(k in extra)) extra[k] = ev.changed_data[k]; });
    if (type === "sick") {   // حقول المرضي من صندوق التعديل (هو أول واحد في الصفحة)
      const sf = readSick(id, { ...ev, ...extra }, box); if (sf.err) return show($("msg"), "err", sf.err);
      Object.assign(extra, sf.v);
    } else Object.assign(extra, { sick_kind: null, cause: null, hospital: null });
    const [upd, msg] = hrOk(ev, extra);
    return save(id, upd, "اتعدل — " + msg);
  }
  if (ds.csave) {
    const id = ds.csave, box = e.target.closest(".ft"), ev = ALL.find(x => x.id === id);
    const f = box.querySelector("[data-cf]").value, t = box.querySelector("[data-cto]").value, note = box.querySelector("[data-cnote]").value.trim();
    if (!f || !t || t < f) return show($("msg"), "err", "التواريخ مش مظبوطة.");
    return save(id, clientUpd(ev, "approved", f, t, note), "اتسجل إن العميل وافق بالمدة الجديدة.");
  }
  const id = ds.ap || ds.rj || ds.back || ds.cok || ds.crj || ds.sok; if (!id) return;
  const u = auth.currentUser, note = document.querySelector(`[data-note="${id}"]`)?.value.trim() || "";
  const ev = ALL.find(x => x.id === id);
  if (ds.sok) {
    const a = numOf(document.querySelector(`[data-sa="${id}"]`)?.value);
    if (a == null || Number.isNaN(a) || a > +ev.days) return show($("msg"), "err", `الأيام المعتمدة لازم من 0 لحد ${ev.days}.`);
    if (a < +ev.days && !(await ask(`العميل اعتمد ${a} يوم بس من ${ev.days} لـ ${ev.name}؟ ${a === 0 ? "كل الأيام" : "الباقي"} هتبقى خ.`, { ok: "سجّل", danger: true }))) return;
    return save(id, sickClientUpd(ev, a, null, note), a >= +ev.days ? "اتسجل إن العميل اعتمدها كاملة." : a === 0 ? "اتسجل إن العميل رفضها — أيامها هتبقى خ." : `اتسجل إن العميل اعتمد ${a} من ${ev.days} — الباقي خ.`);
  }
  if (ds.back) {
    const st = ev.status === "client_wait" ? "مستنية رد العميل" : ev.status === "approved" ? "معتمدة" : ev.status === "rejected" ? "مرفوضة" : "متسجلة";
    if (!(await ask(`${ev.name} — ${tyTxt(ev)} ${ev.from ? `من ${ev.from} لحد ${ev.to}` : ""}\nالحالة دي ${st} دلوقتي.\n\nترجّعها «مستنية HR تيما»؟ ${ev.status === "approved" || ev.client ? "الاعتماد ورد العميل هيتشالوا، ولازم تتعتمد من الأول." : ev.status === "client_wait" ? "موافقة HR تيما هتتشال، ولازم توافق عليها تاني." : ev.status === "rejected" ? "الرفض هيتشال." : "القرار اللي عليها هيتشال."}`, { ok: "رجّعها", danger: true }))) return;
    return save(id, { status: "pending", decided_by: null, decided_email: null, decided_at: null, hr_ok_by: null, hr_ok_email: null, hr_ok_at: null, client: null, approved_days: null, client_limit: null }, "رجعت «مستني HR تيما».");
  }
  if (ds.cok) return save(id, clientUpd(ev, "approved", ev.from, ev.to, note), "اتسجل إن العميل وافق.");
  if (ds.crj) { if (!note) return show($("msg"), "err", `اكتب سبب رفض العميل لـ ${ev.name} في خانة الملاحظة الأول.`); if (!(await ask(`تسجل إن العميل رفض ${ev.name}؟`, { ok: "العميل رفض", danger: true }))) return; return save(id, clientUpd(ev, "rejected", "", "", note), "اتسجل إن العميل رفض."); }
  if (ds.rj) {
    if (!note) return show($("msg"), "err", `اكتب سبب الرفض لـ ${ev.name} في خانة الملاحظة الأول — السبب إجباري.`);
    if (!(await ask(`ترفض ${ev.name} — ${tyTxt(ev)}؟\nالسبب: ${note}`, { ok: "ارفض", danger: true }))) return;
    const upd = { status: "rejected", note, decided_by: u.uid, decided_email: actorEmail(u), decided_at: serverTimestamp(), changed: false };
    if (ev.changed && ev.changed_data) Object.assign(upd, ev.changed_data);   // القرار على آخر نسخة في الشيت
    return save(id, upd, "اترفضت.");
  }
  // من غير تاريخ (مثلاً تجديد إصابة من الشرقية مكتوبش فيه «من» و«لحد») مينفعش يتعتمد — يتعدّل الأول
  if (["sick", "leave"].includes(ev.type) && !(ev.changed && ev.changed_data) && (!ev.from || !ev.to))
    return show($("msg"), "err", `${ev.name}: «من» و«لحد» فاضيين — دوس «تعديل» واكتبهم الأول${isInj(ev) && prevInjury(ev) ? ` (المقترح للامتداد: من ${dayAfter(prevInjury(ev).to || prevInjury(ev).from)})` : ""}.`);
  // موافقة HR تيما — الإجازة لازم يتحدد نوعها: ج (ليه رصيد) أو خ (ملوش رصيد)
  const extra = { note };
  if (ev.changed && ev.changed_data) Object.assign(extra, ev.changed_data);
  if (["leave", "sick"].includes(extra.type || ev.type) && !(await basicOk(ev.site, ev.nid, ev.code)))
    return show($("msg"), "err", `الإجازة والمرضي للأساسي بس في بيبسي وشيبسي والإمداد — ${ev.name} مش أساسي في ${ev.site}. ارفضها واكتب السبب.`);
  if ((extra.type || ev.type) === "sick") {
    const sf = readSick(id, { ...ev, ...extra }); if (sf.err) return show($("msg"), "err", sf.err);
    Object.assign(extra, sf.v);
  }
  if ((extra.type || ev.type) === "leave") {
    // لحد ما يبقى فيه رصيد إجازات: الافتراضي ج، والـ HR بيصحح اللي ملوش رصيد بعدين من «تصحيح نوع الإجازة»
    const k = document.querySelector(`[data-kind="${id}"]`)?.value || "annual";
    extra.kind = k;
  }
  const [upd, msg] = hrOk(ev, extra);
  return save(id, upd, msg);
};
$("zoom").onclick = () => $("zoom").classList.add("hidden");

// ===================== التابات =====================
const TAB_KEY = "hr_tab";
// الحالات متقسمة 3 تابات بالنوع (مرضي وإصابة عمل / إجازات / استقالات) — نفس القايمة بفلتر النوع
function showTab(key) {
  let t = document.querySelector(`.tab[data-key="${key}"]`);
  if (!t || t.classList.contains("hidden")) t = document.querySelector('.tab[data-key="cases:sick"]');
  document.querySelectorAll(".tab").forEach(x => x.setAttribute("aria-selected", x === t));
  document.querySelectorAll("[data-panel]").forEach(p => p.classList.toggle("hidden", p.dataset.panel !== t.dataset.tab));
  if (t.dataset.ty) { $("f-ty").value = t.dataset.ty; render(); }
  try { localStorage.setItem(TAB_KEY, t.dataset.key); } catch (e) {}
}
document.querySelectorAll(".tab").forEach(t => { t.dataset.key = t.dataset.tab + (t.dataset.ty ? ":" + t.dataset.ty : ""); t.addEventListener("click", () => showTab(t.dataset.key)); });

// ===================== طلبات القوة (worker_events) =====================
// الـ HR بيعتمد أو يرفض — السيرفر (record_events.py) هو اللي بيكتب في السجل ويطلّع الكود.
const WQ = { open: new Map(), hist: [], view: "open", role: null, uid: "", sel: null };
const WQ_KIND = { hire: "إضافة", leave: "خروج", change: "تغيير" };
const WQ_ST = { pending: "مستني HR", error: "فيه خطأ", approved: "بيتنفذ…", done: "اتنفذ", rejected: "مرفوض", returned: "مرتجع للمشرف" };
// «رجّع للمشرف يستكمل» (إضافة بس): العامل مايدخلش الكشف ولا يتسجله حضور لحد ما المشرف يستكمل والـ HR يعتمد
const WQ_RET = { fiche: "الفيش ناقص", card: "صورة البطاقة مش واضحة أو ناقصة", phone: "التليفون غلط", nid: "الاسم أو الرقم القومي غلط", other: "أخرى" };
// الرفض نهائي: للحالات اللي مش هتتقبل خالص
const WQ_REJ = ["موجود فعلاً / مكرر", "بلاك ليست", "مش مطابق للشروط", "العميل رفض", "البيانات غلط", "أخرى"];
const WQ_TYPES = ["اساسي", "يومية", "بديل راحات"];
const WQ_FIELD = { type: "النوع", job: "الوظيفة", site: "الموقع" };
const WQ_REASONS = ["استقالة", "انقطاع", "نقل لموقع تاني", "فصل", "أخرى"];
function wqQ(...w) {
  const c = collection(db, "worker_events");
  return SCOPED ? query(c, ...w, where("branch", "in", SCOPED)) : query(c, ...w);
}
function wqStart(role, uid) {
  WQ.role = role; WQ.uid = uid;
  const onErr = err => show($("wq-msg"), "err", "مش قادر أقرا طلبات القوة: " + (err.code === "permission-denied" ? "محتاج تحديث الـ Rules (worker_events)." : err.message));
  for (const st of ["pending", "error", "approved", "returned"]) {
    onSnapshot(wqQ(where("status", "==", st)), snap => {
      for (const [id, e] of WQ.open) if (e.status === st) WQ.open.delete(id);
      snap.forEach(d => { const e = d.data(); if (e.kind !== "insurance") WQ.open.set(d.id, { id: d.id, ...e }); });   // حركات التأمين: من صفحة السجل
      wqRender();
    }, onErr);
  }
}
async function wqLoadHist() {
  if (WQ.view === "open" || WQ.view === "returned") return wqRender();   // المرتجع جاي مع المستني (live)
  show($("wq-msg"), "info", "بيحمّل…");
  try {
    const snap = await getDocs(wqQ(where("status", "==", WQ.view)));
    WQ.hist = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(e => e.kind !== "insurance")
      .sort((a, b) => (b.applied_at?.seconds || b.decided_at?.seconds || 0) - (a.applied_at?.seconds || a.decided_at?.seconds || 0)).slice(0, 200);
    $("wq-msg").className = "msg";
  } catch (err) { show($("wq-msg"), "err", err.message); }
  wqRender();
}
const wqDate = t => t?.toDate ? t.toDate().toLocaleDateString("ar-EG") : "";
const wqInp = (k, v, attrs = "") => `<input data-wf="${k}" value="${esc(v ?? "")}" ${attrs}>`;
// لو القيمة فاضية (عامل جديد اتضاف من غير نوع) أول اختيار «— اختار —» عشان الـ HR يختار بنفسه
const wqSel = (k, v, opts) => `<select data-wf="${k}">${opts.includes(v) ? "" : `<option value="" selected>— اختار —</option>`}${opts.map(o => `<option ${o === v ? "selected" : ""}>${esc(o)}</option>`).join("")}</select>`;
function wqFields(e, edit) {
  const ro = (l, v) => `<span class="muted">${l}</span><span>${esc(v || "—")}</span>`;
  const ed = (l, html) => `<span class="muted">${l}</span>${html}`;
  const out = [];
  if (e.kind === "hire") {
    out.push(edit ? ed("الاسم", wqInp("name", e.name)) : ro("الاسم", e.name));
    out.push(edit ? ed("الرقم القومي", wqInp("nid", e.nid, 'dir="ltr" maxlength="14" inputmode="numeric"')) : ro("الرقم القومي", e.nid));
    out.push(edit ? ed("التليفون", wqInp("phone", e.phone, 'dir="ltr" maxlength="11" inputmode="numeric"')) : ro("التليفون", e.phone));
    out.push(edit ? ed("الوظيفة", wqInp("job", e.job)) : ro("الوظيفة", e.job));
    out.push(edit ? ed("النوع", wqSel("type", e.type, WQ_TYPES)) : ro("النوع", e.type));
    out.push(edit ? ed("أول يوم", wqInp("first_day", e.first_day, 'type="date"')) : ro("أول يوم", e.first_day));
    if (e.branch === "الشرقية للدخان") out.push(edit ? ed("القطاع / المكان", wqInp("site", e.site)) : ro("القطاع / المكان", e.site));
    if (e.portal_code) out.push(ro("كود البوابة", e.portal_code));
    if (e.status === "done") out.push(ro("الكود", e.code + (e.rehire ? " (رجع بكوده)" : "")));
  } else if (e.kind === "leave") {
    out.push(ro("الكود", e.code), ro("الرقم القومي", e.nid), ro("الوظيفة", e.job));
    out.push(edit ? ed("السبب", wqSel("reason", e.reason, WQ_REASONS.includes(e.reason) ? WQ_REASONS : [e.reason, ...WQ_REASONS])) : ro("السبب", e.reason));
    out.push(edit ? ed("آخر يوم", wqInp("left_date", e.left_date, 'type="date"')) : ro("آخر يوم", e.left_date));
  } else {
    out.push(ro("الكود", e.code));
    for (const [k, v] of Object.entries(e.to || {})) {
      const was = (e.from || {})[k] ?? "";
      out.push(edit && k !== "site" ? ed(WQ_FIELD[k] || k, k === "type" ? wqSel("to." + k, v, WQ_TYPES) : wqInp("to." + k, v))
        : ro(WQ_FIELD[k] || k, (was ? was + " ← " : "") + v));
    }
    out.push(edit ? ed("من تاريخ", wqInp("effective", e.effective, 'type="date"')) : ro("من تاريخ", e.effective));
  }
  return `<div class="wq-f">${out.join("")}</div>`;
}
function wqCard(e) {
  const edit = !VIEW && (e.status === "pending" || e.status === "error");
  const retEdit = !VIEW && e.status === "returned";   // المشرف ماستكملش: الـ HR يقدر يرفضه نهائي
  const img = e.kind === "hire" ? `<div class="ph" style="height:170px;" ${e.card_img ? `data-wqzoom="${esc(e.id)}"` : ""}>${e.card_img
    ? `<img src="${esc(e.card_img)}" alt="البطاقة">` : `<span class="muted">${e.check_id ? "صورة البطاقة اتحفظت على سيرفر الشركة" : "من غير بطاقة"}</span>`}</div>` : "";
  const notes = [e.note && `ملاحظة: ${e.note}`, e.status === "error" && e.error && `السيرفر: ${e.error}`,
    e.status === "rejected" && e.decision_note && `سبب الرفض: ${e.decision_note}`,
    e.status === "returned" && `تم رده للمشرف: ${e.decision_note || WQ_RET[e.return_reason] || ""}`,
    e.completed_at && e.status !== "returned" && `المشرف استكمل (${wqDate(e.completed_at)}) — كان ناقص: ${WQ_RET[e.return_reason] || e.return_reason || ""}${e.completion_note ? "\nرد المشرف: " + e.completion_note : ""}`].filter(Boolean);
  const src = e.source === "page" ? "" : e.source === "sharqia_attendance_2026_10" ? " — من حضور الشرقية 2 أكتوبر" : e.source === "excel" ? ` — من إكسيل ${e.company === "chipsy" ? "شيبسي" : e.company === "sharqia" ? "الشرقية" : "الإمداد"} (اكتب التليفون)` : " — من التعديلات القديمة";
  return `<div class="ev" data-wq="${esc(e.id)}">${img}
    <div class="bd">
      <div class="row" style="justify-content:space-between;align-items:center;"><span class="nm">${esc(e.name || e.code || "")}</span>
        <span><span class="pill t-${cls(e.kind)}">${WQ_KIND[e.kind] || esc(e.kind)}</span> <span class="pill s-${cls(e.status)}">${WQ_ST[e.status] || esc(e.status)}</span></span></div>
      <div class="muted" style="font-size:12px;">${esc(e.site || e.branch || "")}${e.branch && e.branch !== e.site ? " — " + esc(e.branch) : ""} — ${esc(e.by_email || "")} ${wqDate(e.created_at)}${src}</div>
      ${wqFields(e, edit)}
      ${notes.map(n => `<div class="warn" style="white-space:pre-line;">${esc(n)}</div>`).join("")}
    </div>
    ${edit ? `<div class="ft" style="flex-wrap:wrap;">
      <button class="btn ok small" data-wqok="${esc(e.id)}">اعتماد</button>
      <button class="btn sec small" data-wqsave="${esc(e.id)}">حفظ التعديل</button>
      <select data-wqr style="padding:4px 6px;font-size:12px;border:1px solid #ddd;border-radius:8px;">
        <option value="">— السبب (إجباري للرفض أو الإرجاع) —</option>
        ${e.kind === "hire" ? `<optgroup label="رجّع للمشرف يستكمل">${Object.entries(WQ_RET).map(([k, t]) => `<option value="ret:${k}">${esc(t)}</option>`).join("")}</optgroup>` : ""}
        <optgroup label="رفض نهائي">${WQ_REJ.map(t => `<option value="rej:${esc(t)}">${esc(t)}</option>`).join("")}</optgroup>
      </select>
      <input data-wqwhy placeholder="ملاحظة للمشرف (إجباري لو «أخرى»)" style="flex:1;min-width:140px;padding:4px 6px;font-size:12px;">
      ${e.kind === "hire" ? `<button class="btn sec small" data-wqret="${esc(e.id)}">رجّع للمشرف يستكمل</button>` : ""}
      <button class="btn small" data-wqno="${esc(e.id)}">رفض</button></div>` : retEdit ? `<div class="ft" style="flex-wrap:wrap;">
      <span class="muted" style="font-size:12px;">مستني المشرف يستكمل. لو مش هيستكمل:</span>
      <select data-wqr style="padding:4px 6px;font-size:12px;border:1px solid #ddd;border-radius:8px;"><option value="">— سبب الرفض —</option>
        ${WQ_REJ.map(t => `<option value="rej:${esc(t)}">${esc(t)}</option>`).join("")}</select>
      <input data-wqwhy placeholder="ملاحظة للمشرف" style="flex:1;min-width:140px;padding:4px 6px;font-size:12px;">
      <button class="btn small" data-wqno="${esc(e.id)}">رفض نهائي</button></div>` : ""}
  </div>`;
}
function wqRow(e) {
  const src = e.source === "page" ? "" : e.source === "sharqia_attendance_2026_10" ? " — من حضور الشرقية 2 أكتوبر" : e.source === "excel" ? ` — من إكسيل ${e.company === "chipsy" ? "شيبسي" : e.company === "sharqia" ? "الشرقية" : "الإمداد"} (اكتب التليفون)` : " — من التعديلات القديمة";
  return `<button type="button" class="wq-row ${WQ.sel === e.id ? "on" : ""}" data-wqopen="${esc(e.id)}">
    <div class="row" style="justify-content:space-between;align-items:center;gap:6px;"><span class="nm">${esc(e.name || e.code || "")}</span>
      <span><span class="pill t-${cls(e.kind)}">${WQ_KIND[e.kind] || esc(e.kind)}</span> <span class="pill s-${cls(e.status)}">${WQ_ST[e.status] || esc(e.status)}</span></span></div>
    <div class="muted">${esc(e.site || e.branch || "")}${e.branch && e.branch !== e.site ? " — " + esc(e.branch) : ""} — ${wqDate(e.created_at)}${src}</div></button>`;
}
function wqRender() {
  const all = [...WQ.open.values()];
  const list = WQ.view === "open" ? all.filter(e => e.status !== "returned") : WQ.view === "returned" ? all.filter(e => e.status === "returned") : WQ.hist;
  const k = $("wq-kind").value, q = $("wq-q").value.trim();
  const rows = list.filter(e => (!k || e.kind === k)
    && (!q || [e.name, e.code, e.nid, e.site, e.branch, e.portal_code].some(v => String(v || "").includes(q))))
    .sort((a, b) => (a.status === "error" ? 0 : 1) - (b.status === "error" ? 0 : 1) || (a.created_at?.seconds || 0) - (b.created_at?.seconds || 0));
  const nOpen = all.filter(e => e.status !== "approved" && e.status !== "returned").length;
  $("wq-count").textContent = nOpen ? nOpen + " مستني" : "";
  $("tn-force").textContent = nOpen || "";
  // قايمة أسامى تحت بعض — دوس على الاسم يفتح الكارت تحته.
  // اللي اتكتب في الكارت المفتوح بيفضل لو القايمة اتحدّثت (طلب تاني اتغير)
  const keep = {};
  document.querySelectorAll("#wq-list .wq-open [data-wf], #wq-list .wq-open [data-wqwhy], #wq-list .wq-open [data-wqr]").forEach(el => keep[el.dataset.wf || ("wqr" in el.dataset ? "_r" : "_why")] = el.value);
  $("wq-list").innerHTML = rows.length ? rows.slice(0, 300).map(e => wqRow(e) + (WQ.sel === e.id ? `<div class="wq-open">${wqCard(e)}</div>` : "")).join("")
    : `<p class="muted">${WQ.view === "open" ? "مفيش طلبات مستنية." : WQ.view === "returned" ? "مفيش طلبات مرتجعة للمشرفين." : "مفيش."}</p>`;
  document.querySelectorAll("#wq-list .wq-open [data-wf], #wq-list .wq-open [data-wqwhy], #wq-list .wq-open [data-wqr]").forEach(el => { const k = el.dataset.wf || ("wqr" in el.dataset ? "_r" : "_why"); if (k in keep) el.value = keep[k]; });
}
// البيانات اللي الـ HR عدّلها في الكارت (اللي اتغير بس)
function wqEdits(card, e) {
  const upd = {};
  card.querySelectorAll("[data-wf]").forEach(el => {
    const k = el.dataset.wf, v = el.value.replace(/\s+/g, " ").trim();
    if (k.startsWith("to.")) { const f = k.slice(3); if (v && v !== (e.to || {})[f]) upd.to = { ...(upd.to || e.to || {}), [f]: v }; }
    else if (v !== String(e[k] ?? "")) upd[k] = v;
  });
  return upd;
}
function wqCheck(e, upd) {
  const x = { ...e, ...upd };
  if (x.kind === "hire") {
    if (String(x.name || "").split(" ").length < 4) return "الاسم لازم يكون رباعي على الأقل.";
    if (!/^[23][0-9]{13}$/.test(x.nid || "")) return "الرقم القومي لازم 14 رقم.";
    if (!/^01[0125][0-9]{8}$/.test(x.phone || "")) return "التليفون لازم 11 رقم ويبدأ بـ 01.";
    if (!x.job) return "اكتب الوظيفة.";
    if (!WQ_TYPES.includes(x.type)) return "اختار النوع (أساسي / يومية / بديل راحات).";
  }
  return "";
}
$("wq-st").onchange = () => { WQ.view = $("wq-st").value; wqLoadHist(); };
$("wq-kind").onchange = wqRender; $("wq-q").oninput = wqRender;
$("wq-list").onclick = async ev => {
  const o = ev.target.closest("[data-wqopen]");
  if (o) { WQ.sel = WQ.sel === o.dataset.wqopen ? null : o.dataset.wqopen; return wqRender(); }
  const z = ev.target.closest("[data-wqzoom]");
  if (z) { $("zoom-img").src = (WQ.open.get(z.dataset.wqzoom) || WQ.hist.find(x => x.id === z.dataset.wqzoom))?.card_img || ""; return $("zoom").classList.remove("hidden"); }
  if (VIEW) return;
  const ds = ev.target.dataset, id = ds.wqok || ds.wqsave || ds.wqno || ds.wqret; if (!id) return;
  const e = WQ.open.get(id); if (!e) return;
  const card = ev.target.closest("[data-wq]"), upd = wqEdits(card, e), u = auth.currentUser;
  const meta = { decided_by: u.uid, decided_email: actorEmail(u), decided_at: serverTimestamp() };
  if (Object.keys(upd).length) upd.hr_edited = true;
  let data;
  if (ds.wqno || ds.wqret) {
    const r = card.querySelector("[data-wqr]").value, note = card.querySelector("[data-wqwhy]").value.trim();
    const isRet = !!ds.wqret;
    if (!r || r.startsWith(isRet ? "rej:" : "ret:")) return show($("wq-msg"), "err", isRet
      ? "اختار الناقص من «رجّع للمشرف يستكمل» في قايمة السبب." : "اختار سبب الرفض من «رفض نهائي» في قايمة السبب.");
    const key = r.slice(4), label = isRet ? WQ_RET[key] : key;
    if ((key === "other" || key === "أخرى") && !note) return show($("wq-msg"), "err", "اكتب الملاحظة — بتوصل للمشرف.");
    const why = (label + (note ? " — " + note : "")).slice(0, 300);
    if (isRet) {
      if (!await ask(`ترجّع طلب إضافة ${e.name} للمشرف يستكمل؟\nالناقص: ${why}\n\nالعامل مش هيدخل الكشف ولا هيتسجله حضور لحد ما المشرف يستكمل وتعتمده.`, { ok: "رجّع للمشرف" })) return;
      data = { ...upd, status: "returned", return_reason: key, decision_note: why, ...meta };
    } else {
      if (!await ask(`ترفض طلب ${WQ_KIND[e.kind]} — ${e.name || e.code}؟\nالسبب: ${why}\n\nالرفض نهائي.`, { ok: "ارفض", danger: true })) return;
      data = { ...upd, status: "rejected", decision_note: why, ...meta };
    }
  } else {
    const bad = wqCheck(e, upd); if (bad) return show($("wq-msg"), "err", bad);
    if (ds.wqsave) { if (!Object.keys(upd).length) return show($("wq-msg"), "info", "مفيش تعديل."); data = { ...upd, status: "pending" }; }
    else data = { ...upd, status: "approved", ...meta };
  }
  ev.target.disabled = true;
  try {
    await updateDoc(doc(db, "worker_events", id), data);
    if (!ds.wqsave) { WQ.sel = null; wqRender(); }
    show($("wq-msg"), "ok", ds.wqno ? "اترفض — المشرف هيشوف السبب." : ds.wqret ? "تم رده للمشرف — هيوصله إشعار بالناقص، والطلب هيرجعلك «مستني» أول ما يستكمل."
      : ds.wqsave ? "اتحفظ التعديل."
      : e.kind === "hire" ? "تم الاعتماد — الكود هيطلع خلال ثواني (هيظهر في «اتنفذ» وفي «بيانات العمال ← أكواد جديدة»)." : "تم الاعتماد — هيتسجل في السجل خلال ثواني.");
  } catch (err) { ev.target.disabled = false; show($("wq-msg"), "err", "ماتحفظش: " + (err.code === "permission-denied" ? "مش مسموح (يمكن الطلب مش من فروعك، أو اتعدل من حد تاني)." : err.message)); }
};
