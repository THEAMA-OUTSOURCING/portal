// sheet.js — الكشف المطبوع: الترتيب والصفحات، والطباعة في نفس الصفحة، وحفظ PDF، وشاشة ترتيب الكشف.
// بيستخدمه attendance.html. الترتيب بيأثر على الكشف المطبوع بس (مالوش علاقة بالمرتبات أو الحضور المتسجل).
//
// قواعد الصفحات:
//  - أساسي وموسمي كل واحد في صفحات لوحده (زي الأول).
//  - جوه كل نوع: العمال متقسمين بالوظيفة. الوظيفة الكبيرة (13 أو أكتر) ليها صفحاتها، والصغيرة بتتجمع
//    في صفحات مشتركة تحت شريط أسود باسم الوظيفة.
//  - الترتيب اليدوي (السحب) بيبقى جوه كل وظيفة. العامل الجديد (مش في الترتيب المحفوظ) بينزل آخر وظيفته.
//  - فاصل صفحة يدوي بعد أي اسم. من غير فاصل: الصفحة 30 سطر. الصفحة اللي قبل فاصل يدوي تاخد لحد 35،
//    ولو عدّت 35 بتتقسم كل 30 وشاشة الترتيب بتنبّه.

export const AUTO_ROWS = 30, MAX_ROWS = 35, OWN_PAGE_MIN = 13;
export const TYPES = [{ id: "basic", label: "أساسي" }, { id: "seasonal", label: "موسمي" }];
export const typeOf = w => (w.type === "موسمي" ? "seasonal" : "basic");
export const keyOf = w => String(w.code || ("N" + (w.nid || "")));

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// ---------------------------------------------------------------- الترتيب
// order = مستند sheet_order/{site} (أو null): { groups: [{type, job, keys:[...]}], breaks: [...] }
function savedIndex(order, type, job) {
  const g = (order?.groups || []).find(x => x.type === type && x.job === job);
  const m = new Map();
  (g?.keys || []).forEach((k, i) => m.set(k, i));
  return m;
}

// الوظايف بالترتيب اللي هتتطبع بيه: [[job, workers]] — الكبيرة الأول (الأكبر فالأصغر) زي الأول.
export function orderedJobs(workers, type, order) {
  const groups = new Map();
  workers.forEach((w, i) => { const j = w.job || ""; if (!groups.has(j)) groups.set(j, []); groups.get(j).push([w, i]); });
  const out = [];
  for (const [job, list] of groups) {
    const idx = savedIndex(order, type, job);
    list.sort((a, b) => {
      const ia = idx.has(keyOf(a[0])) ? idx.get(keyOf(a[0])) : Infinity;
      const ib = idx.has(keyOf(b[0])) ? idx.get(keyOf(b[0])) : Infinity;
      return ia - ib || a[1] - b[1];
    });
    out.push([job, list.map(x => x[0])]);
  }
  return out.sort((a, b) => b[1].length - a[1].length);
}

// تقسيم قايمة سطور على صفحات حسب الفواصل اليدوية وقاعدة 30/35
function chunk(rows, isBreak) {
  const segs = [];
  let cur = [];
  rows.forEach(r => { cur.push(r); if (r.w && isBreak(r.w)) { segs.push({ rows: cur, manual: true }); cur = []; } });
  if (cur.length) segs.push({ rows: cur, manual: false });
  const pages = [];
  segs.forEach(s => {
    const limit = s.manual ? MAX_ROWS : AUTO_ROWS;
    if (s.rows.length <= limit) { pages.push({ rows: s.rows, over: false }); return; }
    for (let i = 0; i < s.rows.length; i += AUTO_ROWS) pages.push({ rows: s.rows.slice(i, i + AUTO_ROWS), over: s.manual });
  });
  return pages;
}

// الصفحات لنوع واحد (أساسي أو موسمي). كل صفحة: { jobs, part, parts, rows:[{w}|{band}], over }
export function paginate(workers, type, order) {
  const breaks = new Set(order?.breaks || []);
  const isBreak = w => breaks.has(keyOf(w));
  const jobs = orderedJobs(workers, type, order);
  const sheets = [];
  const small = [];
  jobs.forEach(([job, ws]) => {
    if (ws.length < OWN_PAGE_MIN) { small.push([job, ws]); return; }
    const pages = chunk(ws.map(w => ({ w })), isBreak);
    pages.forEach((p, i) => sheets.push({ jobs: [job], part: i + 1, parts: pages.length, rows: p.rows, over: p.over }));
  });
  let cur = null;
  const open = () => { cur = { jobs: [], part: 1, parts: 1, rows: [], over: false }; sheets.push(cur); };
  small.forEach(([job, ws]) => {
    if (!cur || (cur.rows.length && cur.rows.length + 1 + ws.length > AUTO_ROWS)) open();
    cur.jobs.push(job); cur.rows.push({ band: job });
    ws.forEach((w, i) => {
      cur.rows.push({ w });
      if (isBreak(w) && i < ws.length - 1) { open(); cur.jobs.push(job); cur.rows.push({ band: job }); }
      else if (isBreak(w)) cur = null;
    });
  });
  return sheets;
}

// ملخص للشاشة: عدد السطور في كل صفحة ومين عدّى 35
export function pageSummary(workers, type, order) {
  return paginate(workers, type, order).map(s => ({ rows: s.rows.length, over: s.over, jobs: s.jobs }));
}

// ---------------------------------------------------------------- الكشف (HTML)
export function sheetsHtml({ site, roster, order, plan, month, year }) {
  const monthName = new Date(year, month - 1, 1).toLocaleDateString("ar-EG", { month: "long", year: "numeric" });
  let html = "";
  for (const t of TYPES) {
    const ws = roster.filter(w => typeOf(w) === t.id);
    if (!ws.length) continue;
    const sheets = paginate(ws, t.id, order);
    html += sheets.map((s, p) => pageHtml(s, p, sheets.length, site, t.label, plan || {}, monthName, month, year)).join("");
  }
  return html;
}

function pageHtml(s, p, total, site, typeLabel, plan, monthName, month, year) {
  const R = Math.max(AUTO_ROWS, s.rows.length);           // صفوف الصفحة (الفاضي بيكمّل لحد 30)
  const rh = (180 / R).toFixed(2);                         // ارتفاع الصف بالملّي: 6 عند 30، و5.1 عند 35
  let rows = "", n = 0, count = 0;
  for (let r = 0; r < R; r++) {
    const it = s.rows[r];
    if (it?.band) rows += `<tr class="band"><td colspan="6">${esc(it.band)}${plan[it.band] != null ? " — المطلوب " + plan[it.band] : ""}</td></tr>`;
    else if (it) { n++; count++; rows += `<tr><td class="n">${n}</td><td class="nm">${esc(it.w.name)}</td><td class="nid">${esc(it.w.nid)}</td><td class="sig"></td><td class="sig"></td><td></td></tr>`; }
    else rows += `<tr><td class="n"></td><td></td><td></td><td class="sig"></td><td class="sig"></td><td></td></tr>`;
  }
  const jobLabel = s.jobs.length > 1 ? "الوظائف" : "الوظيفة";
  const part = s.parts > 1 ? ` (${s.part} من ${s.parts})` : "";
  const need = s.jobs.length === 1 && plan[s.jobs[0]] != null ? ` &nbsp; المطلوب للوظيفة (أساسي + موسمي): <b>${plan[s.jobs[0]]}</b>` : "";
  return `<section class="page${R > AUTO_ROWS ? " dense" : ""}" style="--rh:${rh}mm">
    <div class="head"><div><div class="title">كشف حضور ${esc(site)} — ${typeLabel}</div>
      <div class="meta">${jobLabel}: <b>${esc(s.jobs.join("، "))}</b>${part}${need}</div><div class="meta">شهر <b>${monthName}</b></div></div>
      <div class="pagebox"><small>صفحة</small><span>${p + 1} / ${total}</span></div></div>
    <div class="datebar">التاريخ: <span dir="ltr" class="fixed"><span class="slot"></span> / ${month} / ${year}</span><span style="margin-inline-start:auto">اليوم: <span class="slot" style="width:28mm"></span></span></div>
    <table><colgroup><col style="width:5%"><col style="width:34%"><col style="width:18%"><col style="width:10%"><col style="width:10%"><col style="width:23%"></colgroup>
      <thead><tr><th>م</th><th>الاسم</th><th>الرقم القومي</th><th class="sig">حضور</th><th class="sig">انصراف</th><th>ملاحظات</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="foot"><div class="counts"><div class="count-box">عدد الصفحة <b>${count}</b></div><div class="count-box">العدد الفعلي <span class="blank"></span></div></div>
      <div class="sigs"><div>توقيع المشرف<span></span></div><div>توقيع الأمن<span></span></div><div>توقيع مسئول الإدارة<span></span></div></div>
      <div class="rule">الغائب: خط أفقي واحد مستقيم يعدّي على خانتي الحضور والانصراف مع بعض. الحاضر: ساعته تُكتب في صفه، ممنوع علامات التكرار (،، أو الخط المتعرج). اسم البديل في الملاحظات.</div></div>
  </section>`;
}

// نفس شكل الكشف القديم بالظبط، بس كله جوه #pv (عشان ميأثرش على باقي الصفحة)، والصف ارتفاعه متغيّر
const PRINT_CSS = `
#pv{position:fixed;inset:0;z-index:1000;background:#d9d9d9;overflow:auto;direction:rtl;}
#pv .pv-bar{position:sticky;top:0;z-index:2;display:flex;gap:8px;flex-wrap:wrap;align-items:center;justify-content:center;
  padding:10px;background:#2b2b2b;color:#fff;font-family:'IBM Plex Sans Arabic','Segoe UI',Tahoma,sans-serif;font-size:14px;}
#pv .pv-bar button{font:inherit;padding:8px 16px;border-radius:10px;border:0;cursor:pointer;background:#fff;color:#222;}
#pv .pv-bar button.main{background:#c0392b;color:#fff;}
#pv .pv-bar button:disabled{opacity:.6;cursor:wait;}
#pv .pv-msg{width:100%;text-align:center;font-size:13px;color:#ffd9d4;}
#pv .pv-msg:empty{display:none;}
#pv .pv-pages{padding:10px 0 30px;}
#pv *{box-sizing:border-box;}
#pv .page{width:210mm;height:297mm;background:#fff;margin:10px auto;padding:14mm 14mm 12mm;display:flex;flex-direction:column;overflow:hidden;
  font-family:"IBM Plex Sans Arabic","Segoe UI",Tahoma,sans-serif;color:#000;line-height:1.35;}
#pv .head{display:flex;justify-content:space-between;align-items:center;gap:4mm;}
#pv .title{font-size:15pt;font-weight:600;}#pv .meta{font-size:11pt;line-height:1.6;}
#pv .pagebox{border:2px solid #000;width:24mm;height:20mm;display:flex;flex-direction:column;align-items:center;justify-content:center;line-height:1.1;flex-shrink:0;}
#pv .pagebox small{font-size:9pt;}#pv .pagebox span{font-size:20pt;font-weight:600;direction:ltr;}
#pv .datebar{margin-top:3mm;border:2px solid #000;padding:2mm 4mm;display:flex;align-items:center;gap:4mm;font-size:12pt;}
#pv .datebar .slot{display:inline-block;width:14mm;border-bottom:1.5px solid #000;height:7mm;}#pv .fixed{font-weight:600;}
#pv table{width:100%;border-collapse:collapse;table-layout:fixed;margin-top:3mm;}
#pv th{font-size:10pt;font-weight:600;height:8mm;border:1.2px solid #000;}
#pv td{height:var(--rh,6mm);border:0.8px solid #000;font-size:10.5pt;padding:0 1mm;white-space:nowrap;overflow:hidden;}
#pv .dense td{font-size:9.5pt;}
#pv td.n,#pv td.nid{text-align:center;font-variant-numeric:tabular-nums;}#pv td.n{font-size:9pt;}#pv td.nid{font-size:9.5pt;}
#pv th.sig,#pv td.sig{border-left:2px solid #000;border-right:2px solid #000;}
#pv tr.band td{background:#000;color:#fff;font-weight:600;font-size:10pt;text-align:center;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
#pv .foot{margin-top:auto;padding-top:3mm;}#pv .counts{display:flex;gap:6mm;font-size:11pt;}
#pv .count-box{border:1.5px solid #000;padding:1.5mm 4mm;display:flex;gap:3mm;align-items:center;}
#pv .count-box .blank{display:inline-block;width:14mm;border-bottom:1px solid #000;height:5mm;}
#pv .sigs{display:grid;grid-template-columns:repeat(3,1fr);gap:6mm;margin-top:3mm;font-size:10.5pt;}
#pv .sigs div{display:flex;flex-direction:column;gap:1mm;}#pv .sigs span{display:block;height:8mm;border-bottom:1px solid #000;}
#pv .rule{margin-top:2mm;font-size:9pt;color:#444;}
@media screen and (max-width:820px){#pv .pv-pages{zoom:.45;}}
@media print{
  @page{size:A4 portrait;margin:0;}
  html,body{background:#fff !important;padding:0 !important;margin:0 !important;}
  body > *:not(#pv){display:none !important;}
  #pv{position:static;overflow:visible;background:#fff;}
  #pv .pv-bar{display:none !important;}
  #pv .pv-pages{padding:0;zoom:1;}
  #pv .page{margin:0;break-after:page;}
}`;

function ensureCss() {
  if (document.getElementById("pv-style")) return;
  const s = document.createElement("style");
  s.id = "pv-style"; s.textContent = PRINT_CSS;
  document.head.appendChild(s);
}

// الاسم الطويل بيصغر لحد ما يدخل في خانته
function fitNames(root) {
  root.querySelectorAll("td.nm").forEach(td => {
    let size = td.closest(".dense") ? 9.5 : 10.5;
    td.style.fontSize = size + "pt";
    while (td.scrollWidth > td.clientWidth && size > 6.5) { size -= 0.25; td.style.fontSize = size + "pt"; }
  });
}

// ---------------------------------------------------------------- عرض الكشف + طباعة + PDF
export async function openPrintView(opts) {
  ensureCss();
  document.getElementById("pv")?.remove();
  const pv = document.createElement("div");
  pv.id = "pv";
  pv.innerHTML = `<div class="pv-bar"><b>كشف ${esc(opts.site)}</b>
      <button class="main" data-act="print">طباعة</button><button data-act="pdf">حفظ PDF</button><button data-act="close">رجوع</button>
      <div class="pv-msg"></div></div>
    <div class="pv-pages">${sheetsHtml(opts)}</div>`;
  document.body.appendChild(pv);
  const prevOverflow = document.body.style.overflow;
  document.body.style.overflow = "hidden";
  const msg = t => { pv.querySelector(".pv-msg").textContent = t || ""; };
  const close = () => { pv.remove(); document.body.style.overflow = prevOverflow; };
  try { await (document.fonts?.ready || Promise.resolve()); } catch (e) {}
  fitNames(pv);
  pv.querySelector(".pv-bar").addEventListener("click", async e => {
    const act = e.target.closest("button")?.dataset.act;
    if (act === "close") close();
    if (act === "print") { msg(""); try { window.print(); } catch (err) { msg("الطباعة مش متاحة هنا — استخدم «حفظ PDF» واطبع الملف"); } }
    if (act === "pdf") {
      const btn = e.target.closest("button"); btn.disabled = true; msg("بيجهّز الـ PDF...");
      try { await savePdf(pv, opts); msg(""); }
      catch (err) { console.error("pdf", err); msg("ماقدرتش أعمل PDF: " + (err?.message || err)); }
      btn.disabled = false;
    }
  });
  return { el: pv, close };
}

// المكتبات بتتحمّل بس لما حد يدوس «حفظ PDF» — بإصدار ثابت وبصمة (integrity): لو الملف اتغير، المتصفح يرفضه
const LIBS = {
  html2canvas: { src: "https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js",
                 sri: "sha384-ZZ1pncU3bQe8y31yfZdMFdSpttDoPmOZg2wguVK9almUodir1PghgT0eY7Mrty8H", ready: () => window.html2canvas },
  jspdf:       { src: "https://cdn.jsdelivr.net/npm/jspdf@4.2.1/dist/jspdf.umd.min.js",
                 sri: "sha384-qovJwSBbRDPP5cEjCp8S0UP66wrvnjaa60XMOGzTNanrThcrGfXfnZkvgY8N1KT3", ready: () => window.jspdf?.jsPDF },
  sortable:    { src: "https://cdn.jsdelivr.net/npm/sortablejs@1.15.7/Sortable.min.js",
                 sri: "sha384-DgmC6Xe2bSN2WjTDXzWYbUbxyhNP+NNkGDR/g78pCXV7E7rcVTGxVg0uIVCUUcBc", ready: () => window.Sortable },
};
export function loadLib(name) {
  const L = LIBS[name];
  if (L.ready()) return Promise.resolve(L.ready());
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = L.src; s.integrity = L.sri; s.crossOrigin = "anonymous"; s.referrerPolicy = "no-referrer";
    s.onload = () => (L.ready() ? resolve(L.ready()) : reject(new Error("المكتبة ماشتغلتش")));
    s.onerror = () => reject(new Error("مش قادر أحمّل المكتبة — اتأكد من النت"));
    document.head.appendChild(s);
  });
}

async function savePdf(pv, opts) {
  const [h2c, JsPDF] = await Promise.all([loadLib("html2canvas"), loadLib("jspdf")]);
  const pages = [...pv.querySelectorAll(".page")];
  const holder = pv.querySelector(".pv-pages");
  const prevZoom = holder.style.zoom;
  holder.style.zoom = "1";                                   // الصورة بالمقاس الحقيقي حتى على الموبايل
  try {
    const pdf = new JsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
    for (let i = 0; i < pages.length; i++) {
      const canvas = await h2c(pages[i], { scale: 2, backgroundColor: "#ffffff", useCORS: true, logging: false });
      if (i) pdf.addPage("a4", "portrait");
      pdf.addImage(canvas.toDataURL("image/jpeg", 0.9), "JPEG", 0, 0, 210, 297, undefined, "FAST");
    }
    const ym = `${opts.year}-${String(opts.month).padStart(2, "0")}`;
    pdf.save(`كشف حضور ${opts.site} ${ym}.pdf`);
  } finally { holder.style.zoom = prevZoom; }
}

// ---------------------------------------------------------------- شاشة ترتيب الكشف
const ORDER_CSS = `
#so{position:fixed;inset:0;z-index:900;background:#f5f5f0;overflow:auto;direction:rtl;}
#so .so-in{max-width:760px;margin:0 auto;padding:12px;}
#so .so-top{position:sticky;top:0;z-index:2;background:#f5f5f0;padding:8px 0 10px;border-bottom:1px solid #e5e5e5;margin-bottom:10px;}
#so h2{font-size:17px;margin:0 0 2px;}
#so .so-tabs{display:flex;gap:6px;margin-top:8px;}
#so .so-tabs button{padding:6px 14px;border-radius:999px;border:1px solid #ddd;background:#fff;cursor:pointer;font:inherit;font-size:13px;}
#so .so-tabs button.on{background:#2b2b2b;color:#fff;border-color:#2b2b2b;}
#so .so-acts{display:flex;gap:8px;margin-top:8px;}
#so .so-sum{font-size:12px;color:#666;margin-top:6px;}
#so .so-sum .bad{color:#a32d2d;font-weight:600;}
#so .so-job{margin-bottom:12px;}
#so .so-band{font-size:13px;font-weight:600;color:#fff;background:#2b2b2b;border-radius:8px;padding:4px 10px;margin-bottom:4px;}
#so ul{list-style:none;margin:0;padding:0;background:#fff;border:1px solid #e5e5e5;border-radius:10px;overflow:hidden;}
#so li{display:flex;align-items:center;gap:6px;padding:6px 8px;border-bottom:1px solid #f0efe9;background:#fff;font-size:14px;}
#so li:last-child{border-bottom:0;}
#so li.brk{border-bottom:2px dashed #c0392b;}
#so li .h{cursor:grab;color:#aaa;font-size:18px;padding:0 4px;touch-action:none;user-select:none;}
#so li .i{width:24px;text-align:center;color:#999;font-size:12px;font-variant-numeric:tabular-nums;}
#so li .nm{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
#so li .nm small{color:#999;font-size:11px;margin-inline-start:6px;}
#so li .new{font-size:11px;background:#eef4fb;color:#185fa5;border-radius:999px;padding:0 7px;}
#so li button{border:1px solid #e5e5e5;background:#fafafa;border-radius:7px;cursor:pointer;font-size:12px;padding:3px 7px;color:#555;}
#so li button.cut.on{background:#c0392b;border-color:#c0392b;color:#fff;}
#so .sortable-ghost{opacity:.35;}
#so .pg-mark{font-size:11px;color:#c0392b;text-align:center;padding:2px 0;}
`;

// opts: { site, roster, order, canEdit, onSave(doc) → Promise, lastChange: "نص" }
export async function openOrderEditor(opts) {
  if (!document.getElementById("so-style")) {
    const s = document.createElement("style"); s.id = "so-style"; s.textContent = ORDER_CSS; document.head.appendChild(s);
  }
  document.getElementById("so")?.remove();
  // الحالة: لكل نوع ← لكل وظيفة ← مفاتيح العمال بالترتيب، والفواصل
  const known = new Set();
  (opts.order?.groups || []).forEach(g => g.keys.forEach(k => known.add(k)));
  const state = { breaks: new Set(opts.order?.breaks || []), lists: {} };
  const byKey = new Map(opts.roster.map(w => [keyOf(w), w]));
  const types = TYPES.filter(t => opts.roster.some(w => typeOf(w) === t.id));
  types.forEach(t => {
    state.lists[t.id] = orderedJobs(opts.roster.filter(w => typeOf(w) === t.id), t.id, opts.order)
      .map(([job, ws]) => ({ job, keys: ws.map(keyOf) }));
  });
  let tab = types[0]?.id;
  let dirty = false;

  const so = document.createElement("div");
  so.id = "so";
  document.body.appendChild(so);
  const prevOverflow = document.body.style.overflow;
  document.body.style.overflow = "hidden";
  const close = () => { so.remove(); document.body.style.overflow = prevOverflow; };

  const asOrder = () => ({
    groups: Object.entries(state.lists).flatMap(([type, jobs]) => jobs.map(j => ({ type, job: j.job, keys: j.keys.slice() }))),
    breaks: [...state.breaks].filter(k => byKey.has(k)),
  });
  const workersOf = type => state.lists[type].flatMap(j => j.keys.map(k => byKey.get(k)));

  function summaryHtml() {
    return types.map(t => {
      const pages = pageSummary(workersOf(t.id), t.id, asOrder());
      const bad = pages.filter(p => p.over || p.rows > MAX_ROWS).length;
      return `${t.label}: ${pages.length} صفحة (${pages.map(p => p.rows).join("، ")} سطر)` +
        (bad ? ` <span class="bad">⚠ فيه صفحة أكتر من ${MAX_ROWS} سطر — حط فاصل قبل كده</span>` : "");
    }).join(" &nbsp;·&nbsp; ");
  }

  function render() {
    if (!tab) { so.innerHTML = `<div class="so-in"><p>كشف الموقع فاضي.</p><button class="btn sec" data-act="close">رجوع</button></div>`; return; }
    const jobs = state.lists[tab];
    so.innerHTML = `<div class="so-in">
      <div class="so-top">
        <h2>ترتيب كشف ${esc(opts.site)}</h2>
        <div class="muted">اسحب الاسم لفوق أو لتحت (أو ▲▼) جوه وظيفته. ✂ = فاصل صفحة بعد الاسم ده. ${esc(opts.lastChange || "")}</div>
        <div class="so-tabs">${types.map(t => `<button data-tab="${t.id}" class="${t.id === tab ? "on" : ""}">${t.label}</button>`).join("")}</div>
        <div class="so-sum">${summaryHtml()}</div>
        <div class="so-acts">
          ${opts.canEdit ? `<button class="btn" data-act="save">حفظ الترتيب</button>` : ""}
          <button class="btn sec" data-act="close">${dirty ? "إلغاء" : "رجوع"}</button>
        </div>
        <div class="msg" id="so-msg"></div>
      </div>
      ${jobs.map((j, ji) => `<div class="so-job"><div class="so-band">${esc(j.job || "بدون وظيفة")} (${j.keys.length})</div>
        <ul data-job="${ji}">${j.keys.map((k, i) => {
          const w = byKey.get(k);
          const isNew = opts.order && !known.has(k);
          return `<li data-k="${esc(k)}" class="${state.breaks.has(k) ? "brk" : ""}">
            <span class="h" title="اسحب">☰</span><span class="i">${i + 1}</span>
            <span class="nm"><bdi>${esc(w.name)}</bdi><small dir="ltr">…${esc(String(w.nid || "").slice(-4))}</small></span>
            ${isNew ? '<span class="new">جديد</span>' : ""}
            ${opts.canEdit ? `<button data-mv="-1" aria-label="لفوق">▲</button><button data-mv="1" aria-label="لتحت">▼</button>
            <button class="cut ${state.breaks.has(k) ? "on" : ""}" data-cut="1" title="فاصل صفحة بعده">✂</button>` : ""}
          </li>`;
        }).join("")}</ul></div>`).join("")}
    </div>`;
    if (opts.canEdit && window.Sortable) {
      so.querySelectorAll("ul[data-job]").forEach(ul => {
        window.Sortable.create(ul, {
          handle: ".h", animation: 120, ghostClass: "sortable-ghost",
          onEnd: () => {
            state.lists[tab][Number(ul.dataset.job)].keys = [...ul.querySelectorAll("li")].map(li => li.dataset.k);
            dirty = true; render();
          },
        });
      });
    }
  }

  so.addEventListener("click", async e => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.tab) { tab = b.dataset.tab; render(); return; }
    if (b.dataset.act === "close") {
      if (dirty && !confirm("فيه تعديلات مااتحفظتش — تخرج من غير حفظ؟")) return;
      close(); return;
    }
    if (b.dataset.act === "save") {
      b.disabled = true;
      const m = so.querySelector("#so-msg");
      try {
        await opts.onSave(asOrder());
        dirty = false; m.className = "msg show ok"; m.textContent = "اتحفظ ✓ — كل طباعة بعد كده هتطلع بالترتيب ده";
      } catch (err) {
        m.className = "msg show err";
        m.textContent = "ماتحفظش: " + (err?.code === "permission-denied" ? "مش مسموح للحساب ده" : (err?.message || err));
      }
      b.disabled = false; return;
    }
    const li = b.closest("li"); if (!li) return;
    const k = li.dataset.k;
    const list = state.lists[tab][Number(li.parentElement.dataset.job)].keys;
    if (b.dataset.mv) {
      const i = list.indexOf(k), j = i + Number(b.dataset.mv);
      if (j < 0 || j >= list.length) return;
      [list[i], list[j]] = [list[j], list[i]]; dirty = true; render();
    }
    if (b.dataset.cut) { state.breaks.has(k) ? state.breaks.delete(k) : state.breaks.add(k); dirty = true; render(); }
  });

  if (opts.canEdit) { try { await loadLib("sortable"); } catch (e) { /* ▲▼ لسه شغالين */ } }
  render();
  return { el: so, close };
}
