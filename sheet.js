// sheet.js — الكشف المطبوع: الترتيب والصفحات، والطباعة في نفس الصفحة، وحفظ PDF، وشاشة ترتيب الكشف.
// بيستخدمه attendance.html. الترتيب بيأثر على الكشف المطبوع بس (مالوش علاقة بالمرتبات أو الحضور المتسجل).
//
// قواعد الكشف:
//  - كشف واحد للأساسي والموسمي مع بعض. الاستثناء (مؤقت): مساعدين البيع الموسميين في كشف لوحدهم.
//  - كل وظيفة بتتطبع بعدد سطور = المطلوب في خطة الاحتياج: الأسماء، وبعدها خانات فاضية لحد المطلوب.
//    الوظيفة اللي مالهاش رقم في الخطة: أسماءها بس. الوظيفة اللي في الخطة ومفيش عليها حد: خانات فاضية بس.
//  - لو الموجود أكتر من المطلوب: يتطبع المطلوب بس. اللي بيدير الكشف بيشيل الزيادة من «ترتيب الكشف»
//    (زرار «شيل»)، واللي لسه زيادة بعد كده هو اللي في آخر الوظيفة ومش بيتطبع.
//  - الترقيم بيبدأ من 1 في كل وظيفة، والخانات الفاضية بتكمّل الترقيم. «عدد الصفحة» = الأسماء بس.
//  - الوظيفة الكبيرة (13 سطر أو أكتر) ليها صفحاتها، والصغيرة بتتجمع في صفحات مشتركة تحت شريط باسمها.
//  - فاصل صفحة يدوي بعد أي اسم. من غير فاصل: الصفحة 30 اسم. الصفحة اللي قبل فاصل يدوي تاخد لحد 35.
//  - الخانات الفاضية ماتقسمش الكشف: لو الصفحة زحمت بتصغر بالتدريج تحت آخر اسم، وآخر خانة أصغر حاجة،
//    والأسماء بحجمها العادي. «المطلوب» بيظهر على الشاشة بس، مش على الورق ولا الـ PDF.
//  - الأقسام (لو الموقع ليه أقسام، زي مصنع العامرية): كل قسم ليه صفحاته، وتحته وظايفه. الوظيفة اللي مش هتكفي
//    في باقي الصفحة بتبدأ صفحة جديدة. الأقسام اللي في «pageGroups» بتتجمع في صفحة واحدة لو العدد يسمح.
//    المطلوب لكل قسم/وظيفة من «secNeed» (بدل مطلوب الوظيفة في الخطة). كله محفوظ في sheet_order/{site}.

export const AUTO_ROWS = 30, MAX_ROWS = 35, OWN_PAGE_MIN = 13;
const BODY_MM = 180, ROW_MM = 6, MIN_MM = 2.5, BLANK_UNIT = 0.5;   // جسم الجدول (30 صف × 6 مم)، والصف العادي، وأصغر خانة فاضية عادةً
const FREE_MM = 186, SPILL_MM = 1.2;   // المساحة الحقيقية تحت الجدول تقريباً، وأقل من كده بس الخانات بتنزل صفحة جديدة
export const TYPES = [{ id: "basic", label: "الكشف", title: "" }, { id: "seasonal", label: "موسمي — مساعدين البيع", title: " — موسمي" }];
export const isSalesJob = job => /مساعد\S*\s+(ال)?بيع/.test(String(job || ""));
// الكشف اللي العامل بيتطبع فيه: الموسمي في كشف لوحده لمساعدين البيع بس
export const typeOf = w => (w.type === "موسمي" && isSalesJob(w.job) ? "seasonal" : "basic");
export const keyOf = w => String(w.code || ("N" + (w.nid || "")));

// ---------------------------------------------------------------- الأقسام
// الوظيفة جوه القسم بتتكتب «القسم|الوظيفة». order.sections = { مفتاح العامل: القسم }، order.secNeed = { "القسم|الوظيفة": العدد }
export const SEC_SEP = "|";
export const splitJob = j => { const s = String(j ?? ""), i = s.indexOf(SEC_SEP); return i < 0 ? { sec: "", job: s } : { sec: s.slice(0, i), job: s.slice(i + 1) }; };
export const isSecJob = j => String(j ?? "").includes(SEC_SEP);
export const jobLabel = j => { const x = splitJob(j); return x.sec ? `${x.sec} ▸ ${x.job}` : x.job; };
export const hasSections = order => !!(order?.sections && Object.keys(order.sections).length) || !!(order?.secNeed && Object.keys(order.secNeed).length);
const secOfWorker = (w, sm) => sm[keyOf(w)] || (w.nid ? sm["N" + w.nid] : "") || "";
// بيحوّل وظيفة كل عامل لـ «القسم|الوظيفة» وبيبدّل مطلوب الوظايف المتقسمة بمطلوب الأقسام
export function applySections(workers, order, plan) {
  plan = plan || {};
  if (!hasSections(order)) return { workers, plan };
  const sm = order.sections || {}, need = order.secNeed || {};
  const ws = workers.map(w => { const sec = secOfWorker(w, sm); return sec ? { ...w, job: sec + SEC_SEP + (w.job || "") } : w; });
  const split = new Set(Object.keys(need).map(k => splitJob(k).job));
  ws.forEach(w => { if (isSecJob(w.job)) split.add(splitJob(w.job).job); });
  const p = {};
  Object.entries(plan).forEach(([j, n]) => { if (!split.has(j)) p[j] = n; });
  Object.entries(need).forEach(([k, n]) => { p[k] = n; });
  return { workers: ws, plan: p };
}
// Firestore مابيقبلش array جوه array: المجموعة بتتحفظ نص «قسم|قسم» (وبنقبل الشكلين)
export const pageGroupsOf = order => (order?.pageGroups || []).map(g => (Array.isArray(g) ? g : String(g).split(SEC_SEP)).map(x => String(x).trim()).filter(Boolean));
export function sectionList(order) {
  const out = [...(order?.secOrder || [])];
  Object.values(order?.sections || {}).forEach(s => { if (s && !out.includes(s)) out.push(s); });
  Object.keys(order?.secNeed || {}).forEach(k => { const s = splitJob(k).sec; if (s && !out.includes(s)) out.push(s); });
  return out;
}
const secRank = order => { const l = sectionList(order); return s => (s ? (l.indexOf(s) < 0 ? 900 : l.indexOf(s)) : 999); };

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// ---------------------------------------------------------------- الترتيب
// order = مستند sheet_order/{site} (أو null): { groups: [{type, job, keys:[...]}], breaks: [...], excluded: [...] }
function savedIndex(order, type, job) {
  const g = (order?.groups || []).find(x => x.type === type && x.job === job);
  const m = new Map();
  (g?.keys || []).forEach((k, i) => m.set(k, i));
  return m;
}

// الوظايف بالترتيب المحفوظ: [[job, workers]] (كل العمال، حتى اللي اتشالوا)
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
  return out;
}

// بديل الراحات بيدخل الكشف بس لو مكانه فاضي في المطلوب (مش زيادة عنه)، وبعد عمال الكشف كلهم
export const isSub = w => !!w.sub;
// subs = بدلاء الراحات (بياناتهم كاملة) — بيتحطوا في كشف الأساسي جوه وظيفتهم
export function sheetWorkers(roster, subs) {
  return [...roster, ...(subs || []).map(w => ({ ...w, sub: true }))];
}

// تخطيط الكشف كله: { basic: [job], seasonal: [job] }
// job = { job, need, all:[w], names:[w] (اللي هيتطبعوا), extra:[w] (زيادة مش هتتطبع), excluded:[w], spare:[w] (بدلاء مالهمش مكان), blanks }
export function buildJobs(roster, order, plan, subs) {
  let workers;
  ({ workers, plan } = applySections(sheetWorkers(roster, subs), order, plan));
  const excl = new Set(order?.excluded || []);
  const left = {};                                   // المطلوب اللي لسه فاضل لكل وظيفة (الأساسي بياخد الأول، والبدلاء آخر حاجة)
  const needOf = job => (plan[job] != null && Number(plan[job]) >= 0 ? Number(plan[job]) : null);
  const out = {};
  // 1) عمال الكشف
  for (const t of TYPES) {
    out[t.id] = orderedJobs(workers.filter(w => typeOf(w) === t.id), t.id, order).map(([job, all]) => {
      const need = needOf(job);
      const active = all.filter(w => !excl.has(keyOf(w)));
      const staff = active.filter(w => !isSub(w));
      const excluded = all.filter(w => excl.has(keyOf(w)));
      const j = { job, need, all, active, excluded, spare: [], blanks: 0 };
      if (need == null) { j.chosen = new Set(staff); j.extra = []; return j; }
      if (!(job in left)) left[job] = need;
      const take = staff.slice(0, left[job]);
      left[job] -= take.length;
      j.chosen = new Set(take); j.extra = staff.slice(take.length);
      return j;
    });
  }
  // 2) بدلاء الراحات في الأماكن الفاضية بس
  for (const j of out.basic) {
    const subsHere = j.active.filter(isSub);
    if (j.need == null) { j.spare = subsHere; continue; }
    const take = subsHere.slice(0, Math.max(0, left[j.job]));
    left[j.job] -= take.length;
    take.forEach(w => j.chosen.add(w));
    j.spare = subsHere.slice(take.length);
  }
  for (const t of TYPES) out[t.id].forEach(j => { j.names = j.active.filter(w => j.chosen.has(w)); delete j.chosen; delete j.active; });
  // 3) الخانات الفاضية على كشف الأساسي (حتى لو الوظيفة كلها موسمي، أو مفيش عليها حد خالص)
  for (const job of Object.keys(plan)) {
    const need = needOf(job);
    if (need == null) continue;
    const rest = job in left ? left[job] : need;
    if (rest <= 0) continue;
    let j = out.basic.find(x => x.job === job);
    if (!j) { j = { job, need, all: [], names: [], extra: [], excluded: [], spare: [], blanks: 0 }; out.basic.push(j); }
    j.blanks = rest;
  }
  const rank = secRank(order);
  for (const t of TYPES) {
    out[t.id] = out[t.id].filter(j => j.names.length || j.blanks || j.all.some(w => !isSub(w)))
      .sort((a, b) => rank(splitJob(a.job).sec) - rank(splitJob(b.job).sec) || (b.names.length + b.blanks) - (a.names.length + a.blanks));
  }
  return out;
}

// تقسيم أسماء وظيفة على صفحات حسب الفواصل اليدوية وقاعدة 30/35
function chunk(rows, isBreak) {
  const segs = [];
  let cur = [];
  rows.forEach(r => { cur.push(r); if (isBreak(r.w)) { segs.push({ rows: cur, manual: true }); cur = []; } });
  if (cur.length || !segs.length) segs.push({ rows: cur, manual: false });
  const pages = [];
  segs.forEach(s => {
    const limit = s.manual ? MAX_ROWS : AUTO_ROWS;
    if (s.rows.length <= limit) { pages.push({ rows: s.rows, over: false }); return; }
    for (let i = 0; i < s.rows.length; i += AUTO_ROWS) pages.push({ rows: s.rows.slice(i, i + AUTO_ROWS), over: s.manual });
  });
  return pages;
}

const contentRows = s => s.rows.filter(r => !r.blank).length;
const rowMm = s => BODY_MM / Math.max(AUTO_ROWS, contentRows(s));
// كام خانة فاضية تدخل في الصفحة دي (بأصغر مقاس)
const blankRoom = s => Math.max(0, Math.floor((FREE_MM - contentRows(s) * rowMm(s)) / SPILL_MM + 1e-6) - s.rows.filter(r => r.blank).length);

// الصفحات لكشف واحد. كل صفحة: { jobs, part, parts, rows:[{w,n}|{band,need}|{blank,n}], over }
export function paginate(jobs, order) {
  const breaks = new Set(order?.breaks || []);
  const isBreak = w => breaks.has(keyOf(w));
  if (!jobs.length) return [];
  if (jobs.some(j => isSecJob(j.job))) return paginateSections(jobs, order, isBreak);
  // 1) الكشف كله صغير (35 سطر أو أقل بالشرايط والخانات الفاضية) ومفيش فواصل يدوية: صفحة واحدة، وكل السطور بنفس المقاس
  const total = jobs.reduce((a, j) => a + j.names.length + j.blanks, 0) + (jobs.length > 1 ? jobs.length : 0);
  if (total <= MAX_ROWS && !jobs.some(j => j.names.some(isBreak))) {
    const rows = [];
    jobs.forEach(j => {
      if (jobs.length > 1) rows.push({ band: j.job, need: j.need });
      j.names.forEach((w, i) => rows.push({ w, n: i + 1 }));
      for (let i = 0; i < j.blanks; i++) rows.push({ blank: true, n: j.names.length + i + 1 });
    });
    return [{ jobs: jobs.map(j => j.job), need: jobs.length === 1 ? jobs[0].need : null, rows, over: false, uniform: true, part: 1, parts: 1 }];
  }
  const sheets = [];
  const small = [];
  jobs.forEach(j => {
    if (j.names.length + j.blanks < OWN_PAGE_MIN) { small.push(j); return; }
    const pages = chunk(j.names.map((w, i) => ({ w, n: i + 1 })), isBreak)
      .map(p => ({ jobs: [j.job], need: j.need, rows: p.rows, over: p.over, own: true }));
    // الخانات الفاضية بعد آخر اسم، وتصغر عشان تدخل؛ صفحة زيادة بس لو مفيش مكان حتى بأصغر مقاس
    let n = j.names.length, b = j.blanks;
    while (b > 0) {
      const last = pages[pages.length - 1];
      const room = blankRoom(last);
      const put = Math.min(b, room);
      for (let i = 0; i < put; i++) last.rows.push({ blank: true, n: ++n });
      b -= put;
      if (b > 0) pages.push({ jobs: [j.job], need: j.need, rows: [], over: false, own: true });
    }
    pages.forEach((p, i) => sheets.push({ ...p, part: i + 1, parts: pages.length }));
  });
  const unitsOf = s => s.rows.reduce((a, r) => a + (r.blank ? BLANK_UNIT : 1), 0);
  // 2) الوظايف الصغيرة: الأول في المساحة الفاضية في آخر صفحة لوظيفة كبيرة، وبعدين في صفحات مشتركة
  const placeOnOwn = j => {
    if (j.names.some(isBreak)) return false;
    const size = 1 + j.names.length + j.blanks * BLANK_UNIT;
    const host = sheets.find(s => s.own && !s.manualEnd && (s.part === s.parts) && unitsOf(s) + size + (s.jobs.length === 1 ? 1 : 0) <= AUTO_ROWS);
    if (!host) return false;
    if (host.jobs.length === 1) host.rows.unshift({ band: host.jobs[0], need: host.need });
    host.jobs.push(j.job);
    host.rows.push({ band: j.job, need: j.need });
    j.names.forEach((w, i) => host.rows.push({ w, n: i + 1 }));
    for (let i = 0; i < j.blanks; i++) host.rows.push({ blank: true, n: j.names.length + i + 1 });
    return true;
  };
  sheets.forEach(s => { const last = [...s.rows].reverse().find(r => r.w); s.manualEnd = !!(last && isBreak(last.w)); });
  let cur = null, units = 0;
  const open = () => { cur = { jobs: [], part: 1, parts: 1, rows: [], over: false }; units = 0; sheets.push(cur); };
  small.forEach(j => {
    if (placeOnOwn(j)) return;
    const size = 1 + j.names.length + j.blanks * BLANK_UNIT;
    if (!cur || (cur.rows.length && units + size > AUTO_ROWS)) open();
    cur.jobs.push(j.job); cur.rows.push({ band: j.job, need: j.need }); units += 1;
    j.names.forEach((w, i) => {
      cur.rows.push({ w, n: i + 1 }); units += 1;
      if (isBreak(w) && (i < j.names.length - 1 || j.blanks)) { open(); cur.jobs.push(j.job); cur.rows.push({ band: j.job, need: j.need }); units += 1; }
    });
    for (let i = 0; i < j.blanks; i++) { cur.rows.push({ blank: true, n: j.names.length + i + 1 }); units += BLANK_UNIT; }
    if (j.names.length && isBreak(j.names[j.names.length - 1]) && !j.blanks) cur = null;
  });
  return sheets;
}

// الكشف بالأقسام: كل قسم صفحاته، والوظيفة اللي مش هتكفي في باقي الصفحة تبدأ صفحة جديدة (من غير «تكملة»).
// الأقسام اللي في نفس المجموعة (order.pageGroups) بتتجمع في صفحة لو كلها تدخل في 30 سطر. كل السطور بنفس المقاس.
function paginateSections(jobs, order, isBreak) {
  const secs = [];
  jobs.forEach(j => { const sec = splitJob(j.job).sec; let s = secs.find(x => x.sec === sec); if (!s) secs.push(s = { sec, jobs: [] }); s.jobs.push(j); });
  const items = j => [...j.names.map((w, i) => ({ w, n: i + 1 })), ...Array.from({ length: j.blanks }, (_, i) => ({ blank: true, n: j.names.length + i + 1 }))];
  const units = s => s.jobs.reduce((a, j) => a + j.names.length + j.blanks + (s.jobs.length > 1 ? 1 : 0), 0);
  const pages = [];
  const page = secList => { const p = { secs: secList, jobs: [], rows: [], over: false, uniform: true }; pages.push(p); return p; };
  const addJob = (p, j) => { if (!p.jobs.includes(j.job)) p.jobs.push(j.job); };
  const own = s => {
    const band = s.jobs.length > 1;
    let p = page([s.sec]);
    s.jobs.forEach(j => {
      const its = items(j);
      if (p.rows.length && p.rows.length + (band ? 1 : 0) + its.length > AUTO_ROWS) p = page([s.sec]);
      const start = () => { addJob(p, j); if (band) p.rows.push({ band: j.job, need: j.need, job: true }); };
      start();
      its.forEach((it, i) => {
        if (p.rows.length >= AUTO_ROWS) { p = page([s.sec]); start(); }
        p.rows.push(it);
        if (it.w && isBreak(it.w) && i < its.length - 1) { p = page([s.sec]); start(); }
      });
    });
  };
  const groups = pageGroupsOf(order);
  const done = new Set();
  secs.forEach(s => {
    if (done.has(s.sec)) return;
    const g = groups.find(x => x.includes(s.sec));
    const members = g ? secs.filter(x => g.includes(x.sec) && !done.has(x.sec)) : [s];
    const fits = members.length > 1 && members.reduce((a, m) => a + 1 + units(m), 0) <= AUTO_ROWS
      && !members.some(m => m.jobs.some(j => j.names.slice(0, -1).some(isBreak)));
    if (!fits) { own(s); done.add(s.sec); return; }
    const p = page(members.map(m => m.sec));
    members.forEach(m => {
      done.add(m.sec);
      p.rows.push({ band: m.sec || "بدون قسم", sec: true });
      m.jobs.forEach(j => { addJob(p, j); if (m.jobs.length > 1) p.rows.push({ band: j.job, need: j.need, job: true }); p.rows.push(...items(j)); });
    });
  });
  // رقم الصفحة جوه القسم (1 من 2)
  pages.forEach(p => { const same = pages.filter(x => x.secs.length === 1 && p.secs.length === 1 && x.secs[0] === p.secs[0]); p.parts = same.length || 1; p.part = same.indexOf(p) + 1 || 1;
    p.need = p.jobs.length === 1 ? (jobs.find(j => j.job === p.jobs[0])?.need ?? null) : null; });
  return pages;
}

// ملخص للشاشة: عدد الأسماء في كل صفحة ومين عدّى 35
export function pageSummary(jobs, order) {
  return paginate(jobs, order).map(s => ({ rows: s.rows.filter(r => r.w).length, over: s.over || contentRows(s) > MAX_ROWS + 2, jobs: s.jobs }));
}

// ارتفاعات الخانات الفاضية: عادي لو فيه مكان، وإلا بتصغر بالتدريج وآخر واحدة بأصغر مقاس
export function blankHeights(count, room) {
  if (!count) return [];
  room = room * 0.995;
  if (count * ROW_MM <= room) return Array(count).fill(ROW_MM);
  if (count === 1) return [Math.max(Math.min(ROW_MM, room), 0.5)];
  let h0 = Math.min(ROW_MM, 2 * room / count - MIN_MM), h1;
  if (h0 < MIN_MM) {                                  // زحمة جداً: نفس الفكرة بس بأصغر من العادي
    const end = Math.max(0.5, room / count * 0.6), start = 2 * room / count - end;
    return Array.from({ length: count }, (_, i) => start + (end - start) * i / (count - 1));
  }
  h1 = 2 * room / count - h0;                         // = أصغر مقاس، إلا لو البداية اتحدّت بالصف العادي
  return Array.from({ length: count }, (_, i) => h0 + (h1 - h0) * i / (count - 1));
}

// ---------------------------------------------------------------- الكشف (HTML)
export function sheetsHtml({ site, roster, subs, order, plan, month, year }) {
  const monthName = new Date(year, month - 1, 1).toLocaleDateString("ar-EG", { month: "long", year: "numeric" });
  const layout = buildJobs(roster, order, plan, subs);
  let html = "";
  for (const t of TYPES) {
    if (!layout[t.id].length) continue;
    const sheets = paginate(layout[t.id], order);
    html += sheets.map((s, p) => pageHtml(s, p, sheets.length, site, t.title, monthName, month, year)).join("");
  }
  return html;
}

const needTxt = n => (n != null ? `<span class="scr"> — المطلوب ${n}</span>` : "");

function pageHtml(s, p, total, site, typeTitle, monthName, month, year) {
  const content = contentRows(s);
  const nBlank = s.rows.length - content;
  // صفحة واحدة للكشف كله: كل السطور (أسماء وخانات) بنفس المقاس. غير كده: الخانات بتصغر لو مفيش مكان
  const rh = s.uniform ? BODY_MM / Math.max(AUTO_ROWS, s.rows.length) : rowMm(s);
  const hs = s.uniform ? Array(nBlank).fill(rh) : blankHeights(nBlank, BODY_MM - content * rh);
  // سطور فاضية من غير رقم لحد 30 سطر (زي الأول) — بس لو الصفحة مش زحمة
  const fill = Math.max(0, AUTO_ROWS - s.rows.length);
  let rows = "", count = 0, bi = 0;
  for (const it of s.rows) {
    if (it.band) rows += `<tr class="band${it.job && s.secs ? " job" : ""}"><td colspan="6">${esc(it.sec ? "قسم " + it.band : splitJob(it.band).job)}${needTxt(it.need)}</td></tr>`;
    else if (it.w) { count++; rows += `<tr><td class="n">${it.n}</td><td class="nm">${esc(it.w.name)}</td><td class="nid">${esc(it.w.nid)}</td><td class="sig"></td><td class="sig"></td><td></td></tr>`; }
    else {
      const h = hs[bi++];
      const fs = Math.max(3.5, Math.min(9, h * 2.1)).toFixed(1);
      rows += `<tr class="bl" style="--rh:${h.toFixed(2)}mm;--fs:${fs}pt"><td class="n">${it.n}</td><td></td><td></td><td class="sig"></td><td class="sig"></td><td></td></tr>`;
    }
  }
  for (let i = 0; i < fill; i++) rows += `<tr class="fill"><td class="n"></td><td></td><td></td><td class="sig"></td><td class="sig"></td><td></td></tr>`;
  const jobs = [...new Set(s.jobs.map(j => splitJob(j).job))];
  const jl = jobs.length > 1 ? "الوظائف" : "الوظيفة";
  const part = s.parts > 1 && (s.secs ? s.secs.length === 1 : s.jobs.length === 1) ? ` (${s.part} من ${s.parts})` : "";
  const need = s.jobs.length === 1 && s.need != null ? `<span class="scr"> &nbsp; المطلوب للوظيفة: <b>${s.need}</b></span>` : "";
  const secLine = s.secs ? `${s.secs.length > 1 ? "الأقسام" : "القسم"}: <b>${esc(s.secs.map(x => x || "بدون قسم").join("، "))}</b> &nbsp;·&nbsp; ` : "";
  return `<section class="page${(s.uniform ? s.rows.length : content) > AUTO_ROWS ? " dense" : ""}${s.uniform ? " uni" : ""}" style="--rh:${rh.toFixed(2)}mm">
    <div class="head"><div><div class="title">كشف حضور ${esc(site)}${typeTitle}</div>
      <div class="meta">${secLine}${jl}: <b>${esc(jobs.join("، "))}</b>${part}${need}</div><div class="meta">شهر <b>${monthName}</b></div></div>
      <div class="pagebox"><small>صفحة</small><span>${p + 1} / ${total}</span></div></div>
    <div class="datebar">التاريخ: <span dir="ltr" class="fixed"><span class="slot"></span> / ${month} / ${year}</span><span style="margin-inline-start:auto">اليوم: <span class="slot" style="width:28mm"></span></span></div>
    <table><colgroup><col style="width:5%"><col style="width:34%"><col style="width:18%"><col style="width:10%"><col style="width:10%"><col style="width:23%"></colgroup>
      <thead><tr><th>م</th><th>الاسم</th><th>الرقم القومي</th><th class="sig">حضور</th><th class="sig">انصراف</th><th>ملاحظات</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="foot"><div class="counts"><div class="count-box">العدد الفعلي <span class="blank"></span></div></div>
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
#pv tr.bl td{height:var(--rh);line-height:1;padding-top:0;padding-bottom:0;font-size:var(--fs,9pt);}
#pv .scr{color:#c0392b;}
#pv td.n,#pv td.nid{text-align:center;font-variant-numeric:tabular-nums;}#pv td.n{font-size:9pt;}#pv td.nid{font-size:9.5pt;}
#pv th.sig,#pv td.sig{border-left:2px solid #000;border-right:2px solid #000;}
#pv tr.band td{background:#000;color:#fff;font-weight:600;font-size:10pt;text-align:center;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
#pv tr.band.job td{background:#e3e3e3;color:#000;}
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
  #pv .scr{display:none !important;}
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

// الخانات الفاضية بتاخد المساحة الفاضية الحقيقية تحت الجدول (بتتقاس بعد الرسم)
function fitBlanks(root) {
  root.querySelectorAll(".page:not(.uni)").forEach(page => {
    const bl = [...page.querySelectorAll("tr.bl")];
    if (!bl.length) return;
    const mm = page.getBoundingClientRect().width / 210;           // px لكل ملّي (حتى لو الصفحة متصغّرة على الموبايل)
    const table = page.querySelector("table"), foot = page.querySelector(".foot");
    const gap = () => (foot.getBoundingClientRect().top - table.getBoundingClientRect().bottom) / mm;
    const set = room => blankHeights(bl.length, room).forEach((h, i) => {
      bl[i].style.setProperty("--rh", h.toFixed(2) + "mm");
      bl[i].style.setProperty("--fs", Math.max(3.5, Math.min(9, h * 2.1)).toFixed(1) + "pt");
    });
    let room = bl.reduce((a, tr) => a + tr.getBoundingClientRect().height / mm, 0) + gap() - 1;
    // الحد الأقصى: الصف العادي — مفيش داعي تكبر عن الأسماء
    room = Math.min(room, bl.length * ROW_MM + 0.01);
    for (let k = 0; k < 4; k++) {                                   // البوردر بيزوّد شوية — بنظبط لحد ما تدخل
      set(room);
      const g = gap();
      if (g >= 0) break;
      room += g - 0.3;
    }
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
  fitBlanks(pv);
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
      const canvas = await h2c(pages[i], { scale: 2, backgroundColor: "#ffffff", useCORS: true, logging: false,
                                           ignoreElements: el => el.classList?.contains("scr") });   // «المطلوب» مش على الورق
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
#so li.off .nm{color:#aaa;text-decoration:line-through;}
#so li .tag{font-size:11px;background:#fcebeb;color:#a32d2d;border-radius:999px;padding:0 7px;white-space:nowrap;}
#so li button.rm{color:#a32d2d;}#so li button.rm.on{color:#185fa5;}
#so .sortable-ghost{opacity:.35;}
#so .pg-mark{font-size:11px;color:#c0392b;text-align:center;padding:2px 0;}
#so li input.pos{width:42px;text-align:center;font:inherit;font-size:13px;padding:2px;border:1px solid #ccc;border-radius:7px;font-variant-numeric:tabular-nums;}
#so li input.pos:focus{outline:2px solid #185fa5;border-color:#185fa5;}
#so li button.tb{color:#185fa5;border-color:#c9dbef;background:#f2f7fc;}
#so li select.sec{font:inherit;font-size:12px;padding:2px;border:1px solid #ddd;border-radius:7px;max-width:110px;}
#so li.flash{background:#fff3c4;}
#so .paste{background:#fff;border:1px solid #e5e5e5;border-radius:10px;padding:8px;margin-top:8px;}
#so .paste textarea{width:100%;min-height:90px;font:12px monospace;direction:ltr;}
@media (max-width:560px){#so li button.mv,#so li .nm small{display:none;}}
`;

// opts: { site, roster, subs, order, plan, canEdit, canAdmin (الأقسام ولصق ترتيب جاهز), onSave(doc) → Promise, lastChange: "نص" }
export async function openOrderEditor(opts) {
  if (!document.getElementById("so-style")) {
    const s = document.createElement("style"); s.id = "so-style"; s.textContent = ORDER_CSS; document.head.appendChild(s);
  }
  document.getElementById("so")?.remove();
  // الحالة: لكل كشف ← لكل وظيفة ← مفاتيح العمال بالترتيب، والفواصل، واللي اتشالوا من الكشف
  const known = new Set();
  (opts.order?.groups || []).forEach(g => g.keys.forEach(k => known.add(k)));
  const base = sheetWorkers(opts.roster, opts.subs);
  const byKey = new Map(base.map(w => [keyOf(w), w]));
  const O = opts.order || {};
  const sectioned = hasSections(O);
  const state = { breaks: new Set(O.breaks || []), excluded: new Set((O.excluded || []).filter(k => byKey.has(k))), lists: {},
                  sections: { ...(O.sections || {}) } };
  const everyone = applySections(base, { sections: state.sections, secNeed: O.secNeed }, {}).workers;
  const types = TYPES.filter(t => everyone.some(w => typeOf(w) === t.id));
  const rank = secRank(O);
  types.forEach(t => {
    state.lists[t.id] = orderedJobs(everyone.filter(w => typeOf(w) === t.id), t.id, O)
      .map(([job, ws]) => ({ job, keys: ws.map(keyOf) }))
      .sort((a, b) => rank(splitJob(a.job).sec) - rank(splitJob(b.job).sec));
  });
  const secNames = sectionList(O);
  let tab = types[0]?.id;
  let dirty = !!opts.startDirty;
  let flash = null, pasteOpen = false;

  const so = document.createElement("div");
  so.id = "so";
  document.body.appendChild(so);
  const prevOverflow = document.body.style.overflow;
  document.body.style.overflow = "hidden";
  const close = () => { so.remove(); document.body.style.overflow = prevOverflow; };

  const asOrder = () => ({
    groups: Object.entries(state.lists).flatMap(([type, jobs]) => jobs.map(j => ({ type, job: j.job, keys: j.keys.slice() }))),
    breaks: [...state.breaks].filter(k => byKey.has(k)),
    excluded: [...state.excluded].filter(k => byKey.has(k)),
    ...(sectioned ? { sections: { ...state.sections }, secNeed: O.secNeed || {}, secOrder: O.secOrder || [], pageGroups: pageGroupsOf(O).map(g => g.join(SEC_SEP)) } : {}),
  });
  // نقل اسم لمكان معيّن جوه وظيفته (pos من 1)
  const moveTo = (list, k, pos) => {
    const i = list.indexOf(k); pos = Math.max(1, Math.min(list.length, pos)) - 1;
    if (i < 0 || i === pos) return false;
    list.splice(i, 1); list.splice(pos, 0, k); flash = k; dirty = true; return true;
  };
  // تغيير قسم عامل: بيروح آخر نفس الوظيفة في القسم الجديد
  const changeSection = (k, sec) => {
    const w = byKey.get(k); if (!w) return;
    const type = typeOf(w);
    const lists = state.lists[type];
    lists.forEach(j => { const i = j.keys.indexOf(k); if (i >= 0) j.keys.splice(i, 1); });
    if (sec) state.sections[k] = sec; else delete state.sections[k];
    const job = sec ? sec + SEC_SEP + (w.job || "") : (w.job || "");
    let target = lists.find(j => j.job === job);
    if (!target) { lists.push(target = { job, keys: [] }); lists.sort((a, b) => rank(splitJob(a.job).sec) - rank(splitJob(b.job).sec)); }
    target.keys.push(k);
    for (let i = lists.length - 1; i >= 0; i--) if (!lists[i].keys.length) lists.splice(i, 1);
    flash = k; dirty = true;
  };

  function summaryHtml(layout) {
    const o = asOrder();
    return types.map(t => {
      const pages = pageSummary(layout[t.id], o);
      const bad = pages.filter(p => p.over).length;
      return `${t.label}: ${pages.length} صفحة (${pages.map(p => p.rows).join("، ")} اسم)` +
        (bad ? ` <span class="bad">⚠ فيه صفحة أكتر من ${MAX_ROWS} اسم — حط فاصل قبل كده</span>` : "");
    }).join(" &nbsp;·&nbsp; ");
  }

  function render() {
    if (!tab) { so.innerHTML = `<div class="so-in"><p>كشف الموقع فاضي.</p><button class="btn sec" data-act="close">رجوع</button></div>`; return; }
    const layout = buildJobs(opts.roster, asOrder(), opts.plan, opts.subs);
    const info = new Map(layout[tab].map(j => [j.job, j]));
    const overJobs = Object.values(layout).flat().filter(j => j.extra.length);
    const jobs = state.lists[tab];
    so.innerHTML = `<div class="so-in">
      <div class="so-top">
        <h2>ترتيب كشف ${esc(opts.site)}</h2>
        <div class="muted">اكتب رقم المكان في الخانة اللي جنب الاسم (مثلاً 1) ودوس Enter، أو ⤒ لأول الوظيفة و⤓ لآخرها. السحب و▲▼ شغالين برده. ✂ = فاصل صفحة بعد الاسم ده. «شيل» = الاسم مايتطبعش في الكشف. ${esc(opts.lastChange || "")}</div>
        <div class="so-tabs">${types.map(t => `<button data-tab="${t.id}" class="${t.id === tab ? "on" : ""}">${t.label}</button>`).join("")}</div>
        <div class="so-sum">${summaryHtml(layout)}</div>
        ${overJobs.length ? `<div class="so-sum"><span class="bad">⚠ زيادة عن المطلوب: ${overJobs.map(j => `${esc(j.job)} (${j.extra.length})`).join("، ")} — دوس «شيل» على اللي مش في الكشف، وإلا اللي في آخر الوظيفة مش هيتطبع</span></div>` : ""}
        <div class="so-acts">
          ${opts.canEdit ? `<button class="btn" data-act="save">حفظ الترتيب</button>` : ""}
          <button class="btn sec" data-act="close">${dirty ? "إلغاء" : "رجوع"}</button>
          ${opts.canEdit && opts.canAdmin ? `<button class="btn sec" data-act="paste">لصق ترتيب جاهز</button>` : ""}
        </div>
        ${pasteOpen ? `<div class="paste"><div class="muted">الصق هنا كود الترتيب اللي بيجهزه Claude (بيغيّر الترتيب على الشاشة بس — راجعه وبعدين دوس «حفظ الترتيب»).</div>
          <textarea id="so-paste" spellcheck="false"></textarea><div class="so-acts"><button class="btn" data-act="apply">تطبيق</button><button class="btn sec" data-act="paste">إلغاء</button></div></div>` : ""}
        <div class="msg" id="so-msg"></div>
      </div>
      ${jobs.map((j, ji) => {
        const L = info.get(j.job) || { names: [], extra: [], spare: [], need: null, blanks: 0 };
        const printed = new Set(L.names.map(keyOf)), extra = new Set(L.extra.map(keyOf)), spare = new Set(L.spare.map(keyOf));
        const subsIn = L.names.filter(isSub).length;
        const needLine = L.need != null ? ` — المطلوب ${L.need}، هيتطبع ${L.names.length} اسم${subsIn ? ` (منهم ${subsIn} بديل راحات)` : ""}${L.blanks ? ` + ${L.blanks} خانة فاضية` : ""}` : "";
        let n = 0;
        return `<div class="so-job"><div class="so-band">${esc(jobLabel(j.job) || "بدون وظيفة")} (${j.keys.length})${needLine}</div>
        <ul data-job="${ji}">${j.keys.map((k, i) => {
          const w = byKey.get(k);
          const isNew = opts.order && !known.has(k);
          const out = state.excluded.has(k), over = extra.has(k);
          const sub = isSub(w), noRoom = spare.has(k);
          const canCut = L.extra.length > 0 || out || sub;
          return `<li data-k="${esc(k)}" class="${state.breaks.has(k) ? "brk" : ""}${out || over || noRoom ? " off" : ""}${k === flash ? " flash" : ""}">
            <span class="h" title="اسحب">☰</span>${opts.canEdit ? `<input class="pos" type="number" inputmode="numeric" min="1" max="${j.keys.length}" value="${i + 1}" aria-label="المكان" title="${printed.has(k) ? "رقمه في الكشف " + (++n) : "مش هيتطبع"}">` : `<span class="i">${printed.has(k) ? ++n : "—"}</span>`}
            <span class="nm"><bdi>${esc(w.name)}</bdi><small dir="ltr">…${esc(String(w.nid || "").slice(-4))}</small></span>
            ${sub ? '<span class="new">بديل راحات</span>' : isNew ? '<span class="new">جديد</span>' : ""}${out ? '<span class="tag">متشال</span>' : over ? '<span class="tag">زيادة — مش هيتطبع</span>' : noRoom ? '<span class="tag">مفيش مكان في المطلوب</span>' : ""}
            ${opts.canEdit ? `${sectioned && opts.canAdmin ? `<select class="sec" data-sec="1" title="القسم"><option value="">بدون قسم</option>${secNames.map(x => `<option ${state.sections[k] === x ? "selected" : ""}>${esc(x)}</option>`).join("")}</select>` : ""}
            ${canCut ? `<button class="rm${out ? " on" : ""}" data-rm="1">${out ? "رجّع" : "شيل"}</button>` : ""}
            <button class="tb" data-to="top" title="أول الوظيفة">⤒</button><button class="tb" data-to="end" title="آخر الوظيفة">⤓</button>
            <button class="mv" data-mv="-1" aria-label="لفوق">▲</button><button class="mv" data-mv="1" aria-label="لتحت">▼</button>
            <button class="cut ${state.breaks.has(k) ? "on" : ""}" data-cut="1" title="فاصل صفحة بعده">✂</button>` : ""}
          </li>`;
        }).join("")}</ul></div>`;
      }).join("")}
    </div>`;
    if (flash) {
      const el = [...so.querySelectorAll("li[data-k]")].find(li => li.dataset.k === flash);
      if (el) { el.scrollIntoView({ block: "center" }); setTimeout(() => el.classList.remove("flash"), 900); }
      flash = null;
    }
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
    if (b.dataset.act === "paste") { pasteOpen = !pasteOpen; render(); return; }
    if (b.dataset.act === "apply") {
      const m = so.querySelector("#so-msg");
      let d;
      try { d = JSON.parse(so.querySelector("#so-paste").value); } catch (err) { m.className = "msg show err"; m.textContent = "الكود مش سليم — انسخه تاني كامل"; return; }
      if (d.site && d.site !== opts.site) { m.className = "msg show err"; m.textContent = `الكود ده لـ «${d.site}» مش «${opts.site}»`; return; }
      const cur = asOrder(), merged = { ...cur };
      ["groups", "breaks", "excluded", "sections", "secNeed", "secOrder", "pageGroups"].forEach(f => { if (d[f] != null) merged[f] = d[f]; });
      close();
      return openOrderEditor({ ...opts, order: { ...O, ...merged }, startDirty: true });
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
    if (b.dataset.to) { if (moveTo(list, k, b.dataset.to === "top" ? 1 : list.length)) render(); return; }
    if (b.dataset.mv) {
      const i = list.indexOf(k), j = i + Number(b.dataset.mv);
      if (j < 0 || j >= list.length) return;
      [list[i], list[j]] = [list[j], list[i]]; dirty = true; render();
    }
    if (b.dataset.cut) { state.breaks.has(k) ? state.breaks.delete(k) : state.breaks.add(k); dirty = true; render(); }
    if (b.dataset.rm) { state.excluded.has(k) ? state.excluded.delete(k) : state.excluded.add(k); dirty = true; render(); }
  });

  const posCommit = inp => {
    const li = inp.closest("li"), k = li.dataset.k;
    const list = state.lists[tab][Number(li.parentElement.dataset.job)].keys;
    const v = parseInt(inp.value, 10);
    if (v && moveTo(list, k, v)) render(); else inp.value = list.indexOf(k) + 1;
  };
  so.addEventListener("change", e => {
    if (e.target.matches("input.pos")) posCommit(e.target);
    if (e.target.matches("select.sec")) { changeSection(e.target.closest("li").dataset.k, e.target.value); render(); }
  });
  so.addEventListener("keydown", e => { if (e.key === "Enter" && e.target.matches("input.pos")) { e.preventDefault(); posCommit(e.target); } });

  if (opts.canEdit) { try { await loadLib("sortable"); } catch (e) { /* ▲▼ لسه شغالين */ } }
  render();
  return { el: so, close };
}
