// page-sijil.js — سكريبت صفحة sijil.html (اتنقل من جوه الصفحة لملف لوحده عشان الـ CSP تمنع أي سكريبت مكتوب جوه الـ HTML)
import { collection, doc, getDoc, getDocs, query, where, Timestamp, writeBatch, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { signInWithEmailAndPassword, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { db, auth, enDigits, actorEmail } from './shared.js?v=20261111a';
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
function show(el, t, x) { el.className = "msg show " + t; el.textContent = x; }
const fmt = n => Number(n).toLocaleString("ar-EG");
const arNorm = s => String(s ?? "").replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").replace(/\s+/g, " ").trim();
const SHARQIA = "الشرقية للدخان";

// ===== البيانات =====
// السجل كله بيتقري مرة، وبعدها التحديثات بس (updated_at) — محفوظ في المتصفح عشان القراية ماتتكررش كل مرة
const S = { all: new Map(), scoped: null, role: null };
// نسخة السجل في المتصفح (عشان مانقراش آلاف العمال من Firestore كل مرة): لكل حساب لوحده، وبتتمسح مع الخروج
// أو لما الصفحة تتفتح من غير دخول، وبتتجاهل لو أقدم من 7 أيام — عشان الأرقام القومية والتليفونات ماتفضلش على جهاز حد خرج
const CACHE_PREFIX = "sijil_v1";
const CACHE_MAX_MS = 7 * 864e5;
const cacheKey = () => CACHE_PREFIX + "_" + (auth.currentUser?.uid || "");
function purgeCache() {
  try { Object.keys(localStorage).filter(k => k.startsWith(CACHE_PREFIX)).forEach(k => localStorage.removeItem(k)); } catch (e) {}
}
const FIELDS = ["code", "portal_code", "nid", "name", "phone", "birth", "company", "group", "site", "job", "type", "status",
  "hire_date", "left_date", "left_reason", "blacklist", "todo"];
function slim(d) {
  const x = d.data(), o = { id: d.id };
  for (const k of FIELDS) if (x[k] != null && x[k] !== "") o[k] = x[k];
  o.s = { state: x.social?.state || "", no: x.social?.no || "", since: x.social?.since || "", out: x.social?.out || "" };
  o.h = { eligible: x.health?.eligible !== false, state: x.health?.state || "", crt: x.health?.crt || "", since: x.health?.since || "", deleted: x.health?.deleted || "" };
  o.u = x.updated_at?.toMillis?.() || 0;
  return o;
}
function loadCache() {
  try { const c = JSON.parse(localStorage.getItem(cacheKey()) || "null"); if (c && c.v === 1 && Date.now() - (c.at || 0) < CACHE_MAX_MS) return c; } catch (e) {}
  return null;
}
function saveCache(maxU) {
  try { localStorage.setItem(cacheKey(), JSON.stringify({ v: 1, at: Date.now(), maxU, rows: [...S.all.values()] })); } catch (e) {}   // لو المساحة مش كفاية: من غير حفظ
}
async function load(full) {
  show($("msg"), "info", "بيحمّل السجل…");
  const c = collection(db, "workers");
  try {
    if (S.scoped) {
      // HR / محاسب بفروع: فروعه بس (الـ Rules بتطلب الفلتر ده)، ومن غير حفظ في المتصفح
      const qs = [];
      for (let i = 0; i < S.scoped.length; i += 30) qs.push(query(c, where("site", "in", S.scoped.slice(i, i + 30))));
      if (S.scoped.includes(SHARQIA)) qs.push(query(c, where("company", "==", "الشرقية")));
      S.all.clear();
      for (const q of qs) (await getDocs(q)).forEach(d => S.all.set(d.id, slim(d)));
    } else {
      const cache = full ? null : loadCache();
      let maxU = 0;
      if (cache) { S.all = new Map(cache.rows.map(r => [r.id, r])); maxU = cache.maxU || 0; }
      const snap = await getDocs(maxU ? query(c, where("updated_at", ">", Timestamp.fromMillis(maxU))) : c);
      snap.forEach(d => { const r = slim(d); S.all.set(d.id, r); if (r.u > maxU) maxU = r.u; });
      saveCache(maxU);
      $("sync").textContent = (cache ? `اتحدّث ${fmt(snap.size)} من آخر مرة` : `اتحمّل ${fmt(snap.size)}`) + " — " + new Date().toLocaleTimeString("ar-EG");
    }
    $("msg").className = "msg";
  } catch (err) { show($("msg"), "err", "مش قادر أقرا السجل: " + (err.code === "permission-denied" ? "مش مسموح للحساب ده." : err.message)); }
  fillFilters(); render();
}

// ===== الحالات =====
const BASIC = r => !["يومية", "بديل راحات"].includes(r.type);
const socOk = r => r.s.state === "مؤمن";
const socNA = r => r.s.state === "مش مستحق" || !BASIC(r);
const hlOk = r => r.h.state === "مؤمن";
const hlNA = r => !r.h.eligible;
const socTxt = r => socOk(r) ? "مؤمن" : socNA(r) ? "مش مستحق" : (r.s.state === "خرج" ? "خرج" : "مش مؤمن");
const hlTxt = r => hlOk(r) ? (hlNA(r) ? "مؤمن (مش مستحق)" : "مؤمن") : hlNA(r) ? "مش مستحق" : (r.h.state === "تم الخروج" ? "اتحذف" : "مش مؤمن");
const cls = t => /^مؤمن$/.test(t) ? "st-ok" : /مش مستحق/.test(t) ? "st-na" : "st-no";
const active = r => r.status === "شغال";

// التقارير السريعة: اسم + شرط + الفلاتر اللي بتتحط
const TILES = [
  { t: "شغالين", f: r => active(r), set: { st: "شغال", soc: "", hl: "" } },
  { t: "شغال ومؤمن اجتماعي وصحي", f: r => active(r) && socOk(r) && hlOk(r), set: { st: "شغال", soc: "مؤمن", hl: "مؤمن" } },
  { t: "شغال ومؤمن اجتماعي بس", f: r => active(r) && socOk(r) && !hlOk(r), set: { st: "شغال", soc: "مؤمن", hl: "nohl" } },
  { t: "شغال ومش مؤمن اجتماعي (ومستحق)", f: r => active(r) && !socOk(r) && !socNA(r), set: { st: "شغال", soc: "no", hl: "" } },
  { t: "شغال ومش مؤمن صحي (ومستحق)", f: r => active(r) && !hlOk(r) && !hlNA(r), set: { st: "شغال", soc: "", hl: "no" } },
  { t: "شغال ومش مؤمن خالص (ومستحق)", f: r => active(r) && !socOk(r) && !socNA(r) && !hlOk(r), set: { st: "شغال", soc: "no", hl: "nohl" } },
  { t: "مؤمن صحي ومش مستحق (محتاج حذف)", f: r => active(r) && hlOk(r) && hlNA(r), set: { st: "شغال", soc: "", hl: "oknna" } },
  { t: "مشى ولسه مؤمن (محتاج حذف)", f: r => !active(r) && (socOk(r) || hlOk(r)), set: { st: "مشى", soc: "", hl: "", any: true } },
  { t: "مشى ولسه مؤمن اجتماعي", f: r => !active(r) && socOk(r), set: { st: "مشى", soc: "مؤمن", hl: "" } },
  { t: "مشى ولسه مؤمن صحي", f: r => !active(r) && hlOk(r), set: { st: "مشى", soc: "", hl: "مؤمن" } },
];
let TILE = null;   // التقرير المختار (لو مختار) — بيتلغي لو حد غيّر فلتر بإيده
function renderTiles(base) {
  $("tiles").innerHTML = TILES.map((x, i) => `<div class="tile" data-t="${i}" ${TILE === i ? 'style="border-color:#a61b12"' : ""}><b>${fmt(base.filter(x.f).length)}</b><span>${esc(x.t)}</span></div>`).join("");
}
$("tiles").onclick = e => {
  const t = e.target.closest("[data-t]"); if (!t) return;
  const i = +t.dataset.t, x = TILES[i];
  TILE = TILE === i ? null : i;
  $("f-st").value = x.set.st; $("f-soc").value = ["مؤمن", "no", "مش مستحق", ""].includes(x.set.soc) ? x.set.soc : "";
  $("f-hl").value = ["مؤمن", "no", "na", ""].includes(x.set.hl) ? x.set.hl : "";
  render();
};

function fillFilters() {
  const rows = [...S.all.values()];
  const opts = (id, vals) => { const el = $(id), v = el.value; el.innerHTML = `<option value="">الكل</option>` + [...new Set(vals.filter(Boolean))].sort((a, b) => a.localeCompare(b, "ar")).map(x => `<option>${esc(x)}</option>`).join(""); el.value = v; };
  opts("f-co", rows.map(r => r.company)); opts("f-site", rows.map(r => r.site)); opts("f-ty", rows.map(r => r.type));
}
// بدون التقرير: الفلاتر العادية
function baseRows() {
  const co = $("f-co").value, site = $("f-site").value, ty = $("f-ty").value, q = arNorm(enDigits($("q").value));
  return [...S.all.values()].filter(r => (!co || r.company === co) && (!site || r.site === site) && (!ty || r.type === ty)
    && (!q || [r.name, r.code, r.portal_code, r.nid, r.phone].some(v => arNorm(v).includes(q))));
}
function shown() {
  const base = baseRows();
  if (TILE != null) return { base, rows: base.filter(TILES[TILE].f) };
  const st = $("f-st").value, soc = $("f-soc").value, hl = $("f-hl").value;
  return { base, rows: base.filter(r => (!st || r.status === st)
    && (!soc || (soc === "مؤمن" ? socOk(r) : soc === "no" ? !socOk(r) && !socNA(r) : socNA(r) && !socOk(r)))
    && (!hl || (hl === "مؤمن" ? hlOk(r) : hl === "no" ? !hlOk(r) && !hlNA(r) : hlNA(r) && !hlOk(r)))) };
}
function render() {
  const { base, rows } = shown();
  renderTiles(base);
  rows.sort((a, b) => String(a.company).localeCompare(String(b.company), "ar") || String(a.site).localeCompare(String(b.site), "ar") || String(a.name).localeCompare(String(b.name), "ar"));
  $("count").textContent = `${fmt(rows.length)} عامل` + (TILE != null ? ` — ${TILES[TILE].t}` : "") + (rows.length > 300 ? " (بيظهر أول 300 — التصدير فيه الكل)" : "");
  $("list").innerHTML = rows.slice(0, 300).map(r => {
    const so = socTxt(r), he = hlTxt(r);
    return `<tr data-id="${esc(r.id)}"><td><b>${esc(r.code)}</b>${r.portal_code ? `<div class="muted">${esc(r.portal_code)}</div>` : ""}</td><td>${esc(r.name)}${r.blacklist ? ' <span class="st-no">بلاك ليست</span>' : ""}</td>
      <td dir="ltr" style="text-align:right">${esc(r.nid)}</td><td>${esc(r.company)}${r.group ? `<div class="muted">${esc(r.group)}</div>` : ""}</td><td>${esc(r.site)}</td><td>${esc(r.job)}</td><td>${esc(r.type)}</td>
      <td>${esc(r.status)}${r.left_date ? `<div class="muted">${esc(r.left_date)}</div>` : ""}</td><td class="${cls(so)}">${esc(so)}</td><td class="${cls(he)}">${esc(he)}</td><td style="white-space:normal;min-width:160px;">${esc(r.todo || "")}</td></tr>`;
  }).join("") || `<tr><td colspan="11" class="muted">مفيش.</td></tr>`;
}
// البحث بيدوّر في الكل (بيلغي التقرير المختار والحالة)، والشركة / الموقع / النوع بيضيّقوا التقرير
$("q").addEventListener("input", () => { if ($("q").value.trim()) { TILE = null; $("f-st").value = ""; $("f-soc").value = ""; $("f-hl").value = ""; } render(); });
["f-co", "f-site", "f-ty"].forEach(id => $(id).addEventListener("input", render));
["f-st", "f-soc", "f-hl"].forEach(id => $(id).addEventListener("change", () => { TILE = null; render(); }));
$("refresh").onclick = () => load(false);

// ===== كارت العامل (بيقرا السجل كامل بتاريخه — قراية واحدة) =====
const HK = { hire: "تعيين", leave: "خروج", change: "تغيير", insurance: "تأمين" };
const INS_H = { social: { in: "اجتماعي دخول", out: "اجتماعي خروج" }, health: { in: "صحي إضافة", out: "صحي حذف" } };
const FL = { type: "النوع", job: "الوظيفة", site: "الموقع" };
$("list").onclick = async e => {
  const tr = e.target.closest("[data-id]"); if (!tr) return;
  const r = S.all.get(tr.dataset.id);
  $("wm-box").innerHTML = `<p class="muted">بيحمّل…</p>`; $("wm").classList.remove("hidden");
  let x = {};
  try { const d = await getDoc(doc(db, "workers", r.id)); x = d.data() || {}; } catch (err) { x = {}; }
  const kv = rows => `<dl class="kv">${rows.filter(([, v]) => v !== undefined && v !== null && v !== "").map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("")}</dl>`;
  const so = socTxt(r), he = hlTxt(r);
  const hist = (x.history || []).slice().reverse().map(h => {
    const what = h.kind === "change" ? Object.entries(h.to || {}).map(([k, v]) => `${FL[k] || esc(k)}: ${esc((h.from || {})[k] || "—")} ← ${esc(v)}`).join("، ")
      : h.kind === "leave" ? esc(h.reason || "") : h.kind === "insurance" ? esc(INS_H[h.ins]?.[h.move] || "") : h.rehire ? "رجع بكوده" : "";
    return `<li><b>${HK[h.kind] || esc(h.kind)}</b> ${esc(h.on || "")}${what ? " — " + what : ""} <span class="muted">(${esc(h.by_email || "")})</span></li>`;
  }).join("");
  $("wm-box").innerHTML = `<div class="row" style="justify-content:space-between;align-items:center;"><h2 style="margin:0;">${esc(r.name)} — ${esc(r.code)}</h2><button class="btn sec small" id="wm-x">قفل</button></div>
    ${kv([["كود البوابة", esc(r.portal_code)], ["الرقم القومي", `<span dir="ltr">${esc(r.nid)}</span>`], ["التليفون", `<span dir="ltr">${esc(r.phone || "—")}</span>`], ["الميلاد", esc(r.birth || x.birth)],
      ["الشركة", esc(r.company) + (r.group ? " — " + esc(r.group) : "")], ["الموقع", esc(r.site)], ["الوظيفة", esc(r.job)], ["النوع", esc(r.type)],
      ["الحالة", esc(r.status) + (r.left_date ? " من " + esc(r.left_date) : "") + (r.left_reason ? " — " + esc(r.left_reason) : "")], ["تاريخ التعيين", esc(r.hire_date)],
      ["بلاك ليست", r.blacklist ? `<span class="st-no">${esc(x.blacklist_reason || "أيوه")}</span>` : ""]])}
    <div class="sec"><h3>التأمين الاجتماعي — <span class="${cls(so)}">${esc(so)}</span></h3>${kv([["الرقم التأميني", esc(r.s.no)], ["من", esc(r.s.since)], ["خروج", esc(r.s.out)]])}</div>
    <div class="sec"><h3>التأمين الصحي — <span class="${cls(he)}">${esc(he)}</span></h3>${kv([["CRT", esc(r.h.crt)], ["من", esc(r.h.since)], ["اتحذف", esc(r.h.deleted)]])}</div>
    ${r.todo ? `<div class="sec"><h3>المطلوب</h3><p>${esc(r.todo)}</p></div>` : ""}
    ${(x.notes || []).length ? `<div class="sec"><h3>ملاحظات</h3><p class="muted">${esc(x.notes.join("، "))}</p></div>` : ""}
    <div class="sec"><h3>التاريخ</h3>${hist ? `<ul class="hist">${hist}</ul>` : `<p class="muted">مفيش تغييرات من ساعة السجل الموحد (5/11/2026).</p>`}</div>`;
};
$("wm").onclick = e => { if (e.target.id === "wm" || e.target.id === "wm-x") $("wm").classList.add("hidden"); };

// ===== التصدير =====
$("exp").onclick = () => {
  const { rows } = shown();
  if (!rows.length) return show($("msg"), "info", "مفيش حد في القايمة.");
  const head = ["الكود", "كود البوابة", "الرقم القومي", "الاسم", "التليفون", "الشركة", "المجموعة", "الموقع", "الوظيفة", "النوع", "الحالة",
    "تاريخ التعيين", "آخر يوم شغل", "سبب الخروج", "اجتماعي", "الرقم التأميني", "اجتماعي من", "اجتماعي خروج", "صحي", "CRT", "صحي من", "صحي حذف", "المطلوب"];
  const data = [head, ...rows.map(r => [r.code, r.portal_code || "", r.nid, r.name, r.phone || "", r.company, r.group || "", r.site, r.job, r.type, r.status,
    r.hire_date || "", r.left_date || "", r.left_reason || "", socTxt(r), r.s.no, r.s.since, r.s.out, hlTxt(r), r.h.crt, r.h.since, r.h.deleted, r.todo || ""])];
  const ws = XLSX.utils.aoa_to_sheet(data);
  for (let i = 1; i < data.length; i++) for (const c of [2, 4, 15, 19]) { const a = XLSX.utils.encode_cell({ r: i, c }); if (ws[a]) { ws[a].t = "s"; ws[a].v = String(ws[a].v); ws[a].z = "@"; } }
  ws["!cols"] = [9, 9, 16, 30, 13, 10, 10, 16, 18, 10, 7, 11, 11, 18, 10, 11, 11, 11, 12, 14, 11, 11, 34].map(w => ({ wch: w }));
  ws["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: data.length - 1, c: head.length - 1 } }) };
  const wb = XLSX.utils.book_new(); wb.Workbook = { Views: [{ RTL: true }] };
  XLSX.utils.book_append_sheet(wb, ws, "السجل");
  const d = new Date(), day = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  XLSX.writeFile(wb, `السجل - ${TILE != null ? TILES[TILE].t : "القايمة"} - ${day}.xlsx`);
};

// ===================== تحديث التأمين =====================
const INS = { kind: null, rows: [] };
const INS_TXT = { social: { in: "دخول", out: "خروج", num: "الرقم التأميني" }, health: { in: "إضافة", out: "حذف", num: "CRT" } };
const branchOf = r => r.company === "الشرقية" ? SHARQIA : r.site;
const canDecide = r => S.role === "admin" || (S.role === "hr" && (!S.scoped || S.scoped.includes(branchOf(r))));
const todayISO = () => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
// تاريخ من الإكسيل: Date، أو رقم (سيريال)، أو نص يوم/شهر/سنة أو سنة-شهر-يوم ← YYYY-MM-DD
function isoOf(v) {
  if (v instanceof Date && !isNaN(v)) return v.getFullYear() + "-" + String(v.getMonth() + 1).padStart(2, "0") + "-" + String(v.getDate()).padStart(2, "0");
  if (typeof v === "number" && v > 20000 && v < 80000) { const d = new Date(Math.round((v - 25569) * 864e5)); return isoOf(new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); }
  const t = enDigits(String(v || "")).trim();
  let m = t.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/); if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = t.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/); if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return "";
}
const validDay = d => /^20\d{2}-\d{2}-\d{2}$/.test(d) && !isNaN(new Date(d + "T00:00")) && d <= todayISO().replace(/^(\d{4})/, y => String(+y + 1));
// كشف المطلوب: نفس أعمدة التيمبلت، متملي باللي «محتاج إضافة / حذف»
document.querySelectorAll("[data-need]").forEach(b => b.onclick = () => {
  const k = b.dataset.need, T = INS_TXT[k], key = k === "social" ? "اجتماعى" : "صحى";
  const rows = [...S.all.values()].filter(r => canDecide(r)).map(r => {
    const t = String(r.todo || "");
    const mv = t.includes("إضافة " + key) ? T.in : t.includes("حذف " + key) ? T.out : "";
    return mv ? [r.nid, r.portal_code || r.code, r.name, mv, "", ...(k === "social" ? ["", "", r.site] : ["", r.site])] : null;
  }).filter(Boolean).sort((a, b) => a[3].localeCompare(b[3], "ar") || String(a[a.length - 1]).localeCompare(String(b[b.length - 1]), "ar"));
  if (!rows.length) return show($("ins-msg"), "info", "مفيش حد محتاج " + T.in + " أو " + T.out + ".");
  const head = k === "social" ? ["الرقم القومي", "الكود", "الاسم", "الحركة", "التاريخ", "الرقم التأميني", "الأجر التأميني", "ملاحظات"]
    : ["الرقم القومي", "الكود", "الاسم", "الحركة", "التاريخ", "CRT", "ملاحظات"];
  const guide = k === "social" ? ["إجباري", "اختياري", "اختياري", "إجباري", "إجباري", "إجباري للدخول", "اختياري", "اختياري"]
    : ["إجباري", "اختياري", "اختياري", "إجباري", "إجباري", "إجباري للإضافة", "اختياري"];
  const data = [head, guide, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(data);
  for (let i = 2; i < data.length; i++) { const a = XLSX.utils.encode_cell({ r: i, c: 0 }); ws[a].t = "s"; ws[a].z = "@"; }
  ws["!cols"] = (k === "social" ? [17, 10, 30, 11, 13, 15, 13, 30] : [17, 10, 30, 11, 13, 16, 30]).map(w => ({ wch: w }));
  const wb = XLSX.utils.book_new(); wb.Workbook = { Views: [{ RTL: true }] };
  XLSX.utils.book_append_sheet(wb, ws, "البيانات");
  XLSX.writeFile(wb, `كشف المطلوب - ${k === "social" ? "تأمين اجتماعي" : "تأمين صحي"} - ${todayISO()}.xlsx`);
  show($("ins-msg"), "ok", `نزل ${fmt(rows.length)} عامل (العمود الأخير الموقع للمعلومة). كمّل التاريخ و${T.num} وارفعه.`);
});
// رفع الشيت ← مقارنة بالسجل
document.querySelectorAll("[data-up]").forEach(inp => inp.onchange = async () => {
  const f = inp.files[0], k = inp.dataset.up, T = INS_TXT[k]; inp.value = ""; if (!f) return;
  $("ins-prev").classList.add("hidden"); INS.rows = []; INS.kind = k;
  try {
    const wb = XLSX.read(new Uint8Array(await f.arrayBuffer()), { type: "array", cellDates: true });
    const aoa = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "", raw: true });
    const hi = aoa.slice(0, 10).findIndex(r => r.some(v => String(v).trim() === "الرقم القومي") && r.some(v => String(v).trim() === "الحركة"));
    if (hi < 0) return show($("ins-msg"), "err", "مش لاقي عمود «الرقم القومي» و«الحركة» — استخدم شيت البوابة.");
    const H = aoa[hi].map(v => String(v).trim()), at = n => H.indexOf(n);
    const iN = at("الرقم القومي"), iM = at("الحركة"), iD = at("التاريخ"), iNo = at(k === "social" ? "الرقم التأميني" : "CRT"), iW = at("الأجر التأميني"), iNote = at("ملاحظات"), iC = at("الكود");
    if (iD < 0 || iNo < 0) return show($("ins-msg"), "err", `الشيت ده مش شيت ${k === "social" ? "الاجتماعي" : "الصحي"} — ناقص عمود «التاريخ» أو «${T.num}».`);
    const byNid = new Map();
    for (const r of S.all.values()) { const n = String(r.nid || ""); if (!n) continue; const o = byNid.get(n); if (!o || (o.status !== "شغال" && r.status === "شغال")) byNid.set(n, r); }
    const out = [], seen = new Map();
    aoa.slice(hi + 1).forEach((row, j) => {
      const line = hi + j + 2, nid = enDigits(String(row[iN] ?? "")).replace(/\D/g, "");
      if (!nid && !String(row[iM] || "").trim()) return;
      if (String(row[iN]).trim() === "إجباري") return;   // سطر الإرشاد
      const mvTxt = String(row[iM] || "").trim(), move = mvTxt === T.in ? "in" : mvTxt === T.out ? "out" : "";
      const date = isoOf(row[iD]), num = enDigits(String(row[iNo] ?? "")).trim().replace(/\.0$/, "");
      const w = byNid.get(nid);
      const x = { line, nid, move, mvTxt, date, num, wage: iW >= 0 ? +enDigits(String(row[iW] || "")).replace(/[^\d.]/g, "") || null : null,
        note: iNote >= 0 ? String(row[iNote] || "").trim().slice(0, 300) : "", code: iC >= 0 ? String(row[iC] || "").trim() : "", w, err: "", warn: "", same: false };
      if (nid.length !== 14) x.err = "الرقم القومي مش 14 رقم";
      else if (!w) x.err = "مش في السجل (يمكن مشي من زمان — قايمة الأكواد)";
      else if (!move) x.err = `الحركة لازم «${T.in}» أو «${T.out}»`;
      else if (!validDay(date)) x.err = "التاريخ ناقص أو غلط";
      else if (move === "in" && !num && !(k === "social" ? w.s.no : w.h.crt)) x.err = T.num + " ناقص";
      else if (!canDecide(w)) x.err = "مش من فروعك";
      if (w && !x.err) {
        const st = k === "social" ? w.s : w.h;
        if (move === "in" && st.state === "مؤمن" && (!num || num === (k === "social" ? st.no : st.crt)) && st.since === date) x.same = true;
        if (move === "out" && ["خرج", "تم الخروج"].includes(st.state) && (k === "social" ? st.out : st.deleted) === date) x.same = true;
        if (k === "health" && move === "in" && !w.h.eligible) x.warn = "مش مستحق صحي (" + (w.type || "") + (w.group ? " — " + w.group : "") + ")";
        if (k === "social" && move === "in" && !BASIC(w)) x.warn = "نوعه " + w.type + " (مش مستحق اجتماعي)";
        if (move === "in" && w.status !== "شغال") x.warn = "مسجل «مشى» في السجل";
        if (move === "out" && w.status === "شغال") x.warn = (x.warn ? x.warn + "، " : "") + "لسه شغال في السجل";
        if (x.code && ![w.code, w.portal_code].includes(x.code)) x.warn = (x.warn ? x.warn + "، " : "") + `الكود في الشيت ${x.code} وفي السجل ${w.code}`;
        // نفس العامل أكتر من سطر: الأحدث بس
        const prev = seen.get(w.id);
        if (prev && prev.date > date) { x.err = "فيه سطر أحدث لنفس العامل"; }
        else if (prev) { prev.err = "فيه سطر أحدث لنفس العامل"; seen.set(w.id, x); }
        else seen.set(w.id, x);
      }
      out.push(x);
    });
    INS.rows = out;
    const ok = out.filter(x => !x.err && !x.same), bad = out.filter(x => x.err), same = out.filter(x => x.same), warn = ok.filter(x => x.warn);
    const nIn = ok.filter(x => x.move === "in").length, nOut = ok.length - nIn;
    $("ins-list").innerHTML = out.sort((a, b) => (a.err ? 0 : a.warn ? 1 : a.same ? 3 : 2) - (b.err ? 0 : b.warn ? 1 : b.same ? 3 : 2)).map(x => {
      const st = x.w ? (k === "social" ? socTxt(x.w) : hlTxt(x.w)) : "";
      const res = x.err ? `<span class="st-no">${esc(x.err)}</span>` : x.same ? `<span class="st-na">مفيش تغيير</span>`
        : `<span class="st-ok">${x.move === "in" ? "هيتسجل مؤمن" : k === "social" ? "هيتسجل خرج" : "هيتسجل اتحذف"}</span>${x.warn ? `<div class="warn">${esc(x.warn)}</div>` : ""}`;
      return `<tr><td>${esc(x.w?.code || x.code || "")}</td><td>${esc(x.w?.name || "")}</td><td dir="ltr" style="text-align:right">${esc(x.nid)}</td><td>${esc(x.w?.site || "")}</td>
        <td>${esc(x.mvTxt)}</td><td dir="ltr" style="text-align:right">${esc(x.date)}</td><td dir="ltr" style="text-align:right">${esc(x.num)}</td><td>${esc(st)}</td><td style="white-space:normal;min-width:170px;">${res}</td></tr>`;
    }).join("");
    $("ins-prev").classList.remove("hidden"); $("ins-save").disabled = !ok.length;
    show($("ins-msg"), bad.length ? "err" : warn.length ? "info" : "ok",
      `${fmt(out.length)} سطر: هيتحفظ ${fmt(ok.length)} (${T.in} ${fmt(nIn)}، ${T.out} ${fmt(nOut)})` + (same.length ? ` — ${fmt(same.length)} مفيش تغيير` : "")
      + (warn.length ? `\nفيه ${fmt(warn.length)} عليهم تنبيه (اتأكد منهم — هيتحفظوا).` : "") + (bad.length ? `\n${fmt(bad.length)} سطر فيهم مشكلة ومش هيتحفظوا (فوق بالأحمر).` : ""));
  } catch (err) { show($("ins-msg"), "err", "مش قادر أقرا الملف: " + err.message); }
});
$("ins-cancel").onclick = () => { INS.rows = []; $("ins-prev").classList.add("hidden"); $("ins-msg").className = "msg"; };
$("ins-save").onclick = async () => {
  const k = INS.kind, ok = INS.rows.filter(x => !x.err && !x.same); if (!ok.length) return;
  $("ins-save").disabled = true;
  const u = auth.currentUser; let n = 0;
  try {
    for (let i = 0; i < ok.length; i += 400) {
      const b = writeBatch(db);
      ok.slice(i, i + 400).forEach(x => {
        const w = x.w;
        b.set(doc(collection(db, "worker_events")), { kind: "insurance", status: "approved", source: "page", branch: branchOf(w), site: w.site, code: w.id,
          name: w.name || "", nid: x.nid, ins: k, move: x.move, date: x.date, ...(x.num ? (k === "social" ? { no: x.num } : { crt: x.num }) : {}),
          ...(x.wage ? { wage: x.wage } : {}), ...(x.note ? { note: x.note } : {}),
          by: u.uid, by_email: actorEmail(u), created_at: serverTimestamp(), decided_by: u.uid, decided_email: actorEmail(u), decided_at: serverTimestamp() });
      });
      await b.commit(); n += Math.min(400, ok.length - i);
    }
    show($("ins-msg"), "ok", `اتبعت ${fmt(n)} حركة — السجل هيتحدّث خلال ثواني، ودوس «تحديث» تحت عشان تشوفها.`);
    INS.rows = []; $("ins-prev").classList.add("hidden");
  } catch (err) { show($("ins-msg"), "err", `اتحفظ ${fmt(n)} ووقف: ` + (err.code === "permission-denied" ? "مش مسموح (الـ Rules — يمكن فيه عامل مش من فروعك)." : err.message)); }
  $("ins-save").disabled = false;
};

// ===== الدخول =====
$("l-btn").onclick = async () => { try { await signInWithEmailAndPassword(auth, $("l-email").value.trim(), $("l-pass").value); } catch (e) { show($("l-err"), "err", "الإيميل أو الباسورد غلط"); } };
const out = () => { purgeCache(); signOut(auth).finally(() => location.reload()); };
$("logout").onclick = out; $("d-out").onclick = out;
onAuthStateChanged(auth, async user => {
  ["login", "denied", "app"].forEach(i => $(i).classList.add("hidden"));
  if (!user) { purgeCache(); return $("login").classList.remove("hidden"); }
  let claims = {}; try { claims = (await user.getIdTokenResult()).claims || {}; } catch (e) {}
  S.role = claims.role || null;
  // مؤقتاً: لمحمود بس (لحد ما يتراجع ويتفتح للإدارة والـ HR والمحاسبين)
  if (!(S.role === "admin" && claims.email === "myehia200@gmail.com")) { purgeCache(); return $("denied").classList.remove("hidden"); }
  S.scoped = ["hr", "accountant"].includes(S.role) && Array.isArray(claims.sites) && claims.sites.length ? claims.sites : null;
  if (S.scoped) $("scope-note").textContent = "حسابك ليه الفروع دي بس: " + S.scoped.join("، ") + ".";
  $("who").textContent = S.role === "admin" ? "ادمن" : user.email; $("app").classList.remove("hidden");
  $("ins-card").classList.toggle("hidden", !["admin", "hr"].includes(S.role));
  load(false);
});
