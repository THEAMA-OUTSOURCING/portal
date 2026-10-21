// قراءة شيتات الحضور الإكسيل (شيبسي / الإمداد / الشرقية) → أيام حضور بنفس شكل att_days
// كل parser بيرجّع { company, days: { "<site>__<yyyy-mm-dd>": { site, date, entries: { code: {...} } } }, issues: [...] }
// الحالة s: P حاضر، A غايب، L إجازة/مرضي/راحة/توقف (مش حاضر ومش غايب). c = الرمز زي ما هو في الشيت.

const pad = n => String(n).padStart(2, "0");
const ymd = d => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
const clean = v => String(v ?? "").replace(/ /g, " ").replace(/\s+/g, " ").trim();
const arNorm = s => clean(s).replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي");
const nidOf = v => { const s = clean(v).replace(/\.0$/, "").replace(/\D/g, ""); return s.length === 14 ? s : ""; };
// SheetJS بيرجّع التاريخ بفرق ثواني/توقيت؛ نقرّبه لأقرب يوم
const asDate = v => {
  if (!(v instanceof Date) || isNaN(v)) return null;
  const t = Math.round((v.getTime() - v.getTimezoneOffset() * 60000) / 864e5) * 864e5, u = new Date(t);
  return new Date(u.getUTCFullYear(), u.getUTCMonth(), u.getUTCDate());
};
const WEEKDAY = /^(ال)?(سبت|احد|أحد|اثنين|إثنين|ثلاثاء|اربعاء|أربعاء|خميس|جمعه|جمعة|عطله|عطلة)$/;

export const SITES = {
  chipsy: ["قطامية", "ابوصير"],
  emdad: ["العامرية امداد", "اكتوبر امداد", "مدينة نصر امداد", "طنطا امداد"],
  sharqia: ["الشرقية للدخان"],
};
// مخطط شيبسي ثابت (HC CFI) — بيتغير نادراً، ولو اتغير يتعدل هنا
export const CHIPSY_PLAN = {
  "قطامية": { "مساعد بيع / تجزئة": 28, "مساعد بيع / جملة": 10, "مدخل بيانات": 3 },
  "ابوصير": { "مساعد بيع": 25, "عامل": 2, "مدخل بيانات": 3 },
};
// وظيفة الإمداد في الشيت → اسمها في مخطط بيبسي
const EMDAD_JOB = j => /coordinator/i.test(j) ? "منسق ساحة امداد" : /driver/i.test(j) ? "سائق شحن امداد" : /helper/i.test(j) ? "مساعد امداد" : "";
export const COMPANY_LABEL = { chipsy: "شيبسي", emdad: "الإمداد", sharqia: "الشرقية" };

// الرموز: كل شركة ورموزها
const LEAVE = { "ج": "إجازة", "م": "مرضي", "ض": "مرضي", "ق": "توقف", "ط": "عطلة رسمية", "ر": "راحة", "ف": "إجازة", "و": "إجازة", "ث": "إجازة", "ص": "إصابة عمل" };
function mark(v, company) {
  const s = clean(v);
  if (!s || s === "#N/A" || s === "*" ) return null;                 // فاضي / جمعة الشرقية / لسه مااتسجلش
  const n = Number(s);
  if (!isNaN(n)) return n > 0 ? { s: "P", c: n === 1 ? "" : String(n) } : null;   // 1 حاضر، 8 = ساعات فعلية (جمعة/عطلة/راحة)
  if (company === "sharqia") {
    if (s === "ش") return { s: "P", c: "" };
    if (s === "ن") return { s: "P", c: "ن" };                         // نص يوم
  }
  if (s === "خ" || s === "غ") return { s: "A", c: "" };
  if (LEAVE[s]) return { s: "L", c: s };
  return { bad: s };
}

function rowsOf(ws, XLSX) { return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null }); }
const findHeader = (rows, test, max = 12) => rows.slice(0, max).findIndex(r => (r || []).some(v => test(clean(v))));

// ===== شيبسي: شيت Payroll، صف عناوين فيه "رقم البطاقة" و"الفرع"، وصف التواريخ فوقه =====
export function parseChipsy(wb, XLSX) {
  const out = { company: "chipsy", days: {}, issues: [], workers: 0, ignored: 0 };
  const name = wb.SheetNames.find(n => /payroll/i.test(n)) || wb.SheetNames[0];
  const rows = rowsOf(wb.Sheets[name], XLSX);
  const hi = findHeader(rows, v => v.includes("رقم البطاقة"));
  if (hi < 0) throw new Error("مش لاقي صف العناوين (رقم البطاقة) في شيت " + name);
  const H = rows[hi].map(clean);
  const col = t => H.findIndex(h => h.startsWith(t));
  const iN = col("رقم البطاقة"), iName = col("الاسم"), iBr = col("الفرع"), iJob = col("الوظيفة 2"), iSub = col("الوظيفة 3"), iType = col("وظيفة 1"), iCode = col("الكود");
  const dRow = rows.slice(0, hi).reverse().find(r => (r || []).filter(v => v instanceof Date).length >= 5) || [];
  // أعمدة الأيام بس: اللي عنوانها اسم يوم (تاريخ التعيين وغيره بيتساب)
  const dates = dRow.map((v, i) => WEEKDAY.test(clean(H[i]).replace(/\s/g, "")) ? asDate(v) : null);
  for (const r of rows.slice(hi + 1)) {
    const nid = nidOf(r[iN]); if (!nid || !clean(r[iName])) continue;
    const br = arNorm(r[iBr]).replace(/^ال(?=قطامي)/, "");
    const site = SITES.chipsy.find(s => arNorm(s) === br);
    if (!site) { out.issues.push(`فرع مش معروف "${clean(r[iBr])}" — ${clean(r[iName])}`); continue; }
    out.workers++;
    const job = clean(r[iJob]), sub = clean(r[iSub]);
    // سطر المخطط: قطامية مساعد البيع متقسم تجزئة/جملة، والباقي بالوظيفة
    const pj = /^مساعد بيع/.test(job) ? (site === "قطامية" ? (/جمل/.test(job + sub) ? "مساعد بيع / جملة" : "مساعد بيع / تجزئة") : "مساعد بيع") : job;
    dates.forEach((d, i) => {
      if (!d) return;
      const m = mark(r[i], "chipsy"); if (!m) return;
      if (m.bad) return out.issues.push(`رمز مش مفهوم "${m.bad}" — ${clean(r[iName])} يوم ${ymd(d)}`);
      const k = site + "__" + ymd(d);
      (out.days[k] ??= { site, date: ymd(d), entries: {} }).entries[nid] =
        { name: clean(r[iName]), nid, job, sub, pj, type: clean(r[iType]), code: clean(r[iCode]), ...m };
    });
  }
  return out;
}

// ===== الإمداد: ملف Deployment attendance — شيت لكل شهر، أيام 1..31، بتوعنا وظيفتهم فيها Theama =====
const EMDAD_LOC = { AM: "العامرية امداد", OCT: "اكتوبر امداد", NC: "مدينة نصر امداد", TNT: "طنطا امداد" };   // MN مش تبعنا
const AR_MONTHS = ["يناير", "فبراير", "مارس", "ابريل", "مايو", "يونيو", "يوليو", "اغسطس", "سبتمبر", "اكتوبر", "نوفمبر", "ديسمبر"];
export function emdadMonths(wb) { return wb.SheetNames.filter(n => AR_MONTHS.includes(arNorm(n))); }
export function parseEmdad(wb, XLSX, sheetName, year) {
  const out = { company: "emdad", days: {}, issues: [], workers: 0, ignored: 0 };
  const mi = AR_MONTHS.indexOf(arNorm(sheetName));
  if (mi < 0) throw new Error("اختار شيت الشهر");
  if (!year) {
    const st = wb.Sheets[wb.SheetNames.find(n => arNorm(n) === "اعدادات")];
    year = Number(st?.B1?.v) || new Date().getFullYear();
  }
  const rows = rowsOf(wb.Sheets[sheetName], XLSX);
  const hi = findHeader(rows, v => v === "GPID");
  if (hi < 0) throw new Error("مش لاقي صف GPID في شيت " + sheetName);
  const H = rows[hi];
  const days = H.map(v => (typeof v === "number" && v >= 1 && v <= 31) ? v : null);
  for (const r of rows.slice(hi + 1)) {
    if (!r || r[0] == null || !clean(r[1])) continue;
    const job = clean(r[2]), loc = clean(r[3]).toUpperCase();
    if (!/theama/i.test(job) || !EMDAD_LOC[loc]) { out.ignored++; continue; }  // شركات تانية أو فرع مش تبعنا
    const site = EMDAD_LOC[loc], gp = clean(r[0]).replace(/\.0$/, ""), nid = nidOf(gp);
    out.workers++;
    days.forEach((dn, i) => {
      if (!dn) return;
      const d = new Date(year, mi, dn); if (d.getMonth() !== mi) return;
      const m = mark(r[i], "emdad"); if (!m) return;
      if (m.bad) return out.issues.push(`رمز مش مفهوم "${m.bad}" — ${clean(r[1])} يوم ${ymd(d)}`);
      const k = site + "__" + ymd(d);
      // في الإمداد الرقم غير 1 = ساعات شغل فعلية في يوم الراحة (منسقين) → إضافي
      if (m.s === "P" && m.c) m.x = 1;
      (out.days[k] ??= { site, date: ymd(d), entries: {} }).entries[nid || gp] =
        { name: clean(r[1]), nid, job: job.replace(/\s*theama\s*/i, "").trim() || job, pj: EMDAD_JOB(job), code: gp, ...m };
    });
  }
  return out;
}

// ===== الشرقية: الرقم الوظيفي (ثابت)، الموقع عمود، ش حاضر، غ غايب، * جمعة، ن نص يوم =====
export function parseSharqia(wb, XLSX) {
  const out = { company: "sharqia", days: {}, issues: [], workers: 0, ignored: 0 };
  const site = SITES.sharqia[0];
  const rows = rowsOf(wb.Sheets[wb.SheetNames[0]], XLSX);
  const hi = findHeader(rows, v => v === "القطاع");
  if (hi < 0) throw new Error("مش لاقي صف العناوين (القطاع)");
  const H = rows[hi].map(clean);
  const col = t => H.findIndex(h => arNorm(h).replace(/[ـ\s]/g, "").startsWith(t));
  const iCode = col("الرقم"), iName = col("الاسم"), iJob = col("الوظيفه"), iLoc = col("الموقع"), iSec = col("القطاع");
  const dRow = rows.slice(hi + 1, hi + 3).find(r => (r || []).filter(v => v instanceof Date).length >= 5) || [];
  const dates = dRow.map(asDate);
  for (const r of rows.slice(hi + 1)) {
    const code = clean(r?.[iCode]).replace(/\.0$/, "");
    if (!/^\d+$/.test(code) || !clean(r[iName])) continue;
    out.workers++;
    dates.forEach((d, i) => {
      if (!d) return;
      const m = mark(r[i], "sharqia"); if (!m) return;
      if (m.bad) return out.issues.push(`رمز مش مفهوم "${m.bad}" — ${clean(r[iName])} يوم ${ymd(d)}`);
      const k = site + "__" + ymd(d);
      (out.days[k] ??= { site, date: ymd(d), entries: {} }).entries[code] =
        { name: clean(r[iName]), nid: "", job: clean(r[iJob]), loc: clean(r[iLoc]), sector: clean(r[iSec]), code, ...m };
    });
  }
  return out;
}

// يتعرف على نوع الملف لوحده
export function detect(wb, XLSX) {
  if (emdadMonths(wb).length) return "emdad";
  const first = rowsOf(wb.Sheets[wb.SheetNames.find(n => /payroll/i.test(n)) || wb.SheetNames[0]], XLSX);
  if (findHeader(first, v => v === "القطاع") >= 0) return "sharqia";
  if (findHeader(first, v => v.includes("رقم البطاقة")) >= 0) return "chipsy";
  return null;
}

export function counts(entries) {
  const v = Object.values(entries);
  return { present: v.filter(e => e.s === "P").length, absent: v.filter(e => e.s === "A").length,
    leave: v.filter(e => e.s === "L").length, total: v.length };
}

// اللي بيتحسب في المخطط: الحاضر، ومش يومية/بديل/مشرف
export const countsForPlan = e => e.s === "P" && !/يومي|بديل|مشرف/.test(e.type || "") && !!e.pj;
