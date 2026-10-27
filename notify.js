// notify.js — جرس الإشعارات: بيظهر في كل صفحات البوابة لحسابات الإدارة والمشرفين والإقليميين (مش العمال).
// shared.js بيشغّله بـ initBell(auth, db). الحماية الحقيقية في firestore.rules (notifications / notif_inbox / notif_files).
//
// - الأدمن بيبعت على طول. HR والمحاسب والإقليمي: الإشعار بيستنى اعتماد الأدمن.
// - HR/محاسب بفروع والإقليمي: لمشرفين مواقعهم بس.
// - كل مستلم ليه نسخة في notif_inbox (id = uid__id) — منها «اتقرا إمتى» و«قرأه كام واحد».
// - الإشعارات ما بتتمسحش. الجرس بيعرض آخر 14 يوم، والأقدم بزرار «عرض الأقدم».
// - توفير القراءات: أول ما الصفحة تفتح = عدّ بس (قراية واحدة)، والقايمة بتتحمل لما حد يدوس على الجرس.
import { collection, doc, getDoc, getDocs, query, where, orderBy, limit, startAfter, writeBatch,
         serverTimestamp, getCountFromServer, Timestamp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';

const DAYS_SHOWN = 14;
const PAGE = 20;
const COUNT_EVERY_MS = 10 * 60 * 1000;      // تحديث رقم الجرس كل 10 دقايق (والصفحة مفتوحة)
const MAX_FILE = 800000;                    // حد المرفق بعد التحويل (الـ Rules: أقل من 820 ألف)
const STAFF_ROLES = ["admin", "hr", "accountant", "viewer", "supervisor"];
// المواقع اللي ينفع تتختار في «مشرفين مواقع معينة» — نفس SUP_SITES في shared.js + الحساب المشترك (الشرقية)
const SHARED_SITE = "الشرقية للدخان";
let SITES = [];

const esc = v => String(v == null ? "" : v).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = t => t?.toDate ? t.toDate().toLocaleString("ar-EG", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "";

let DB, AUTH, ME = null, TIMER = null;

export function initBell(auth, db, sites) {
  DB = db; AUTH = auth; SITES = [...sites, SHARED_SITE];
  onAuthStateChanged(auth, async user => {
    teardown();
    if (!user) return;
    let c = {};
    try { c = (await user.getIdTokenResult()).claims || {}; } catch (e) { return; }
    if (!STAFF_ROLES.includes(c.role)) return;   // العمال: مفيش جرس
    const sites = Array.isArray(c.sites) && c.sites.length ? c.sites : null;
    ME = { uid: user.uid, role: c.role, sites, regional: false, regionalEmails: [] };
    // الإقليمي: config/regionals مسموح يتقري للإقليمي والأدمن بس (نفس طريقة attendance.html)
    if (c.role === "supervisor" || c.role === "admin") {
      try {
        const r = await getDoc(doc(DB, "config", "regionals"));
        if (c.role === "supervisor") ME.regional = r.exists();
        else ME.regionalEmails = emailsIn(r.exists() ? r.data() : {});
      } catch (e) {}
    }
    ME.admin = c.role === "admin";
    ME.officeAll = (c.role === "hr" || c.role === "accountant") && !sites;
    ME.canSend = ME.admin || c.role === "hr" || c.role === "accountant" || ME.regional;
    ME.label = ME.admin ? "ادمن" : c.role === "hr" ? "HR" : c.role === "accountant" ? "الحسابات" : ME.regional ? "الاقليمى" : "";
    mount();
    refreshCount();
    TIMER = setInterval(() => { if (document.visibilityState === "visible") refreshCount(); }, COUNT_EVERY_MS);
  });
  document.addEventListener("visibilitychange", () => { if (ME && document.visibilityState === "visible") refreshCount(); });
}

// أي إيميل جوه مستند config/regionals (مهما كان شكله)
function emailsIn(o) {
  const out = [];
  const walk = v => { if (typeof v === "string" && v.includes("@")) out.push(v.toLowerCase()); else if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === "object") Object.values(v).forEach(walk); };
  walk(o); return out;
}

function teardown() {
  ME = null; if (TIMER) clearInterval(TIMER); TIMER = null;
  document.getElementById("nb-btn")?.remove(); document.getElementById("nb-panel")?.remove();
}

// ===== الشكل =====
function style() {
  if (document.getElementById("nb-style")) return;
  const s = document.createElement("style"); s.id = "nb-style";
  s.textContent = `
  #nb-btn{position:fixed;bottom:16px;left:16px;z-index:9000;width:52px;height:52px;border-radius:50%;border:0;background:#fff;
    box-shadow:0 2px 10px rgba(0,0,0,.22);cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;}
  #nb-btn svg{width:24px;height:24px;stroke:#a61b12;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;}
  #nb-btn .nb-n{position:absolute;top:-3px;right:-3px;min-width:20px;height:20px;border-radius:10px;background:#a61b12;color:#fff;
    font:700 11.5px/20px system-ui,sans-serif;text-align:center;padding:0 5px;box-sizing:border-box;}
  #nb-panel{position:fixed;bottom:72px;left:12px;z-index:9001;width:400px;max-width:calc(100vw - 24px);max-height:calc(100vh - 80px);
    overflow:auto;background:#fff;border-radius:16px;box-shadow:0 8px 28px rgba(0,0,0,.22);direction:rtl;text-align:right;
    font-size:14px;color:#1d2024;}
  #nb-panel .nb-tabs{display:flex;gap:4px;padding:10px 10px 0;position:sticky;top:0;background:#fff;border-bottom:1px solid #eee;flex-wrap:wrap;}
  #nb-panel .nb-tabs button{border:0;background:none;padding:8px 10px;font:inherit;font-weight:600;color:#6b7178;cursor:pointer;border-bottom:2px solid transparent;}
  #nb-panel .nb-tabs button.on{color:#a61b12;border-bottom-color:#a61b12;}
  #nb-panel .nb-body{padding:10px 12px 14px;}
  #nb-panel .nb-item{padding:10px;border-radius:12px;margin-bottom:8px;background:#f6f7f8;}
  #nb-panel .nb-item.unread{background:#fbeceb;}
  #nb-panel .nb-t{font-weight:700;margin-bottom:3px;}
  #nb-panel .nb-b{white-space:pre-wrap;word-break:break-word;line-height:1.5;}
  #nb-panel .nb-m{font-size:12px;color:#6b7178;margin-top:5px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;}
  #nb-panel .nb-a{border:1px solid #a61b12;color:#a61b12;background:#fff;border-radius:8px;padding:3px 10px;font:inherit;font-size:12.5px;cursor:pointer;}
  #nb-panel .nb-a.fill{background:#a61b12;color:#fff;}
  #nb-panel .nb-muted{color:#6b7178;font-size:13px;padding:8px 0;}
  #nb-panel .nb-err{color:#a61b12;font-size:13px;padding:6px 0;}
  #nb-panel label{display:block;font-size:13px;font-weight:600;margin:10px 0 4px;}
  #nb-panel input[type=text],#nb-panel textarea,#nb-panel select{width:100%;box-sizing:border-box;border:1px solid #d6dade;border-radius:10px;padding:8px;font:inherit;}
  #nb-panel textarea{min-height:90px;resize:vertical;}
  #nb-panel .nb-chk{display:flex;flex-wrap:wrap;gap:6px 12px;font-weight:400;}
  #nb-panel .nb-chk label{display:flex;gap:4px;align-items:center;font-weight:400;margin:0;}
  #nb-panel .nb-reads{margin-top:6px;font-size:12.5px;}
  #nb-panel .nb-reads div{padding:2px 0;}
  #nb-view{position:fixed;inset:0;z-index:9002;background:rgba(0,0,0,.75);display:flex;align-items:center;justify-content:center;padding:16px;}
  #nb-view img{max-width:100%;max-height:100%;border-radius:8px;background:#fff;}
  @media (max-width:520px){#nb-panel{left:12px;right:12px;width:auto;}}
  @media print{#nb-btn,#nb-panel,#nb-view{display:none !important;}}`;
  document.head.appendChild(s);
}

function mount() {
  style();
  const b = document.createElement("button");
  b.id = "nb-btn"; b.type = "button"; b.setAttribute("aria-label", "الإشعارات");
  b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20a2 2 0 0 0 4 0"/></svg>';
  b.onclick = togglePanel;
  document.body.appendChild(b);
  document.addEventListener("click", e => {
    const p = document.getElementById("nb-panel");
    // composedPath: المسار وقت الضغطة نفسها (لو الزرار اتشال بعدها، لسه معروف إنه كان جوه اللوحة)
    const path = e.composedPath();
    if (p && !path.includes(p) && !path.includes(document.getElementById("nb-btn")) && !document.getElementById("nb-view")) p.remove();
  });
}

function setBadge(n) {
  const b = document.getElementById("nb-btn"); if (!b) return;
  b.querySelector(".nb-n")?.remove();
  if (n > 0) { const s = document.createElement("span"); s.className = "nb-n"; s.textContent = n > 99 ? "99+" : String(n); b.appendChild(s); }
  b.setAttribute("aria-label", n > 0 ? `الإشعارات — ${n} جديد` : "الإشعارات");
}

// الرقم على الجرس: إشعاراتي اللي لسه مااتقرتش + (للأدمن) اللي مستني اعتماده
let PENDING_N = 0;
async function refreshCount() {
  if (!ME) return;
  let n = 0;
  try { n = (await getCountFromServer(query(collection(DB, "notif_inbox"), where("uid", "==", ME.uid), where("read_at", "==", null)))).data().count; } catch (e) {}
  if (ME.admin) {
    try { PENDING_N = (await getCountFromServer(query(collection(DB, "notifications"), where("status", "==", "pending")))).data().count; } catch (e) {}
  }
  setBadge(n + PENDING_N);
}

// ===== اللوحة =====
let TAB = "inbox";
function togglePanel() {
  const old = document.getElementById("nb-panel");
  if (old) { old.remove(); return; }
  const p = document.createElement("div");
  p.id = "nb-panel"; p.setAttribute("role", "dialog"); p.setAttribute("aria-label", "الإشعارات");
  const tabs = [["inbox", "الإشعارات"]];
  if (ME.canSend) tabs.push(["send", "إرسال"], ["mine", "اللي بعته"]);
  if (ME.admin) tabs.push(["pending", "مستني اعتماد" + (PENDING_N ? ` (${PENDING_N})` : "")]);
  if (!tabs.some(t => t[0] === TAB)) TAB = "inbox";
  p.innerHTML = `<div class="nb-tabs">${tabs.map(([k, l]) => `<button type="button" data-tab="${k}" class="${k === TAB ? "on" : ""}">${esc(l)}</button>`).join("")}</div><div class="nb-body"></div>`;
  p.querySelector(".nb-tabs").onclick = e => { const t = e.target.closest("[data-tab]"); if (!t) return; TAB = t.dataset.tab; p.querySelectorAll("[data-tab]").forEach(x => x.classList.toggle("on", x === t)); showTab(); };
  document.body.appendChild(p);
  showTab();
}
const body = () => document.querySelector("#nb-panel .nb-body");
function showTab() {
  const b = body(); if (!b) return;
  b.innerHTML = '<div class="nb-muted">جاري التحميل...</div>';
  ({ inbox: tabInbox, send: tabSend, mine: tabMine, pending: tabPending })[TAB]().catch(e => { b.innerHTML = `<div class="nb-err">${esc(errText(e))}</div>`; });
}
function errText(e) {
  if (e?.code === "permission-denied") return "مش مسموح (الـ Rules). لو لسه متعملهاش Publish، اعملها الأول.";
  if (e?.code === "failed-precondition") return "محتاج Index في Firestore — افتح الـ Console من اللينك اللي في رسالة الخطأ: " + (e.message || "");
  return e?.message || String(e);
}

// ----- الإشعارات (الوارد) -----
let LAST_OLD = null;
async function tabInbox() {
  const b = body();
  const cut = Timestamp.fromDate(new Date(Date.now() - DAYS_SHOWN * 864e5));
  const snap = await getDocs(query(collection(DB, "notif_inbox"), where("uid", "==", ME.uid), where("sent_at", ">=", cut), orderBy("sent_at", "desc"), limit(50)));
  b.innerHTML = snap.empty ? `<div class="nb-muted">مفيش إشعارات في آخر ${DAYS_SHOWN} يوم.</div>` : "";
  snap.docs.forEach(d => b.appendChild(inboxItem(d)));
  LAST_OLD = null;
  const more = document.createElement("button");
  more.type = "button"; more.className = "nb-a"; more.textContent = "عرض الأقدم";
  more.onclick = async () => {
    more.disabled = true;
    try {
      const qs = [collection(DB, "notif_inbox"), where("uid", "==", ME.uid), where("sent_at", "<", cut), orderBy("sent_at", "desc")];
      if (LAST_OLD) qs.push(startAfter(LAST_OLD));
      qs.push(limit(PAGE));
      const s = await getDocs(query(...qs));
      s.docs.forEach(d => b.insertBefore(inboxItem(d), more));
      if (s.size) LAST_OLD = s.docs[s.size - 1];
      if (s.size < PAGE) { more.remove(); const m = document.createElement("div"); m.className = "nb-muted"; m.textContent = s.size || LAST_OLD ? "مفيش أقدم من كده." : "مفيش إشعارات أقدم."; b.appendChild(m); }
      else more.disabled = false;
      markRead(s.docs);
    } catch (e) { more.disabled = false; alert(errText(e)); }
  };
  b.appendChild(more);
  markRead(snap.docs);
}
function inboxItem(d) {
  const x = d.data();
  const el = document.createElement("div");
  el.className = "nb-item" + (x.read_at ? "" : " unread");
  el.innerHTML = `<div class="nb-t">${esc(x.title)}</div>${x.body ? `<div class="nb-b">${esc(x.body)}</div>` : ""}
    <div class="nb-m"><span>${esc(x.sender_label)}</span><span>${esc(fmt(x.sent_at))}</span>${x.has_file ? `<button type="button" class="nb-a" data-file="${esc(x.notif_id)}">${x.file_kind === "pdf" ? "فتح الملف" : "عرض الصورة"}</button>` : ""}</div>`;
  el.querySelector("[data-file]")?.addEventListener("click", () => openFile(x.notif_id));
  return el;
}
// اللي اتعرض = اتقرا (مرة واحدة، بوقت السيرفر)
async function markRead(docs) {
  const un = docs.filter(d => !d.data().read_at);
  if (!un.length) return;
  try {
    const bt = writeBatch(DB);
    un.forEach(d => bt.update(d.ref, { read_at: serverTimestamp() }));
    await bt.commit();
  } catch (e) {}
  refreshCount();
}
async function openFile(id) {
  try {
    const s = await getDoc(doc(DB, "notif_files", id));
    if (!s.exists()) return alert("الملف مش موجود.");
    const f = s.data();
    if (f.kind === "pdf") {
      const bin = atob(String(f.data).split(",").pop());
      const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      const url = URL.createObjectURL(new Blob([u8], { type: "application/pdf" }));
      const w = window.open(url, "_blank");
      if (!w) { const a = document.createElement("a"); a.href = url; a.download = f.name || "file.pdf"; a.click(); }
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } else {
      const v = document.createElement("div"); v.id = "nb-view";
      const img = document.createElement("img"); img.src = f.data; img.alt = f.name || "";
      v.appendChild(img); v.onclick = () => v.remove();
      document.body.appendChild(v);
    }
  } catch (e) { alert(errText(e)); }
}

// ----- إرسال -----
function targetOptions() {
  if (ME.admin) return [["all", "الكل"], ["supervisors", "كل المشرفين"], ["sites", "مشرفين مواقع معينة"], ["regionals", "الإقليميين"], ["office", "الإدارة/المكتب"], ["accounts", "حسابات بالاسم"]];
  if (ME.officeAll) return [["all", "الكل"], ["supervisors", "كل المشرفين"], ["sites", "مشرفين مواقع معينة"], ["regionals", "الإقليميين"], ["office", "الإدارة/المكتب"]];
  return [["sites", "مشرفين مواقعي"]];
}
async function tabSend() {
  const b = body();
  const mySites = ME.admin || ME.officeAll ? SITES : SITES.filter(s => ME.sites?.includes(s));
  b.innerHTML = `
    <label for="nb-title">العنوان</label><input type="text" id="nb-title" maxlength="120">
    <label for="nb-text">النص</label><textarea id="nb-text" maxlength="3000"></textarea>
    <label for="nb-target">يتبعت لـ</label><select id="nb-target">${targetOptions().map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join("")}</select>
    <div id="nb-sites-box"><label>المواقع</label><div class="nb-chk">${mySites.map(s => `<label><input type="checkbox" value="${esc(s)}"> ${esc(s)}</label>`).join("")}</div></div>
    <div id="nb-acc-box" style="display:none"><label>الحسابات</label><div class="nb-chk" id="nb-acc"></div></div>
    <label for="nb-file">مرفق (اختياري — صورة أو PDF صغير)</label><input type="file" id="nb-file" accept="image/*,application/pdf">
    <div id="nb-send-msg"></div>
    <div style="margin-top:12px;display:flex;gap:8px;align-items:center;"><button type="button" class="nb-a fill" id="nb-go">${ME.admin ? "إرسال" : "إرسال للاعتماد"}</button>
    ${ME.admin ? "" : '<span class="nb-muted">هيوصل بعد موافقة الادمن</span>'}</div>`;
  const tg = b.querySelector("#nb-target");
  const sync = async () => {
    b.querySelector("#nb-sites-box").style.display = tg.value === "sites" ? "" : "none";
    b.querySelector("#nb-acc-box").style.display = tg.value === "accounts" ? "" : "none";
    if (tg.value === "accounts" && !b.querySelector("#nb-acc").childElementCount) {
      try {
        const st = await staff();
        b.querySelector("#nb-acc").innerHTML = st.filter(a => a.uid !== ME.uid).map(a => `<label><input type="checkbox" value="${esc(a.uid)}"> ${esc(labelOf(a))}</label>`).join("");
      } catch (e) { b.querySelector("#nb-acc").innerHTML = `<div class="nb-err">${esc(errText(e))}</div>`; }
    }
  };
  tg.onchange = sync; sync();
  b.querySelector("#nb-go").onclick = () => send(b);
}

async function send(b) {
  const msg = b.querySelector("#nb-send-msg"), go = b.querySelector("#nb-go");
  const say = (t, err) => { msg.innerHTML = `<div class="${err ? "nb-err" : "nb-muted"}">${esc(t)}</div>`; };
  const title = b.querySelector("#nb-title").value.trim(), text = b.querySelector("#nb-text").value.trim();
  const target = b.querySelector("#nb-target").value;
  let tsites = target === "sites" ? [...b.querySelectorAll("#nb-sites-box input:checked")].map(i => i.value)
             : target === "accounts" ? [...b.querySelectorAll("#nb-acc input:checked")].map(i => i.value) : [];
  if (!title) return say("اكتب العنوان.", 1);
  if ((target === "sites" || target === "accounts") && !tsites.length) return say(target === "sites" ? "اختار موقع واحد على الأقل." : "اختار حساب واحد على الأقل.", 1);
  go.disabled = true; say("جاري التجهيز...");
  try {
    const fileIn = b.querySelector("#nb-file").files[0];
    const file = fileIn ? await readFile(fileIn) : null;
    const ref = doc(collection(DB, "notifications"));
    const n = { title, body: text, target, target_sites: tsites, has_file: !!file, status: ME.admin ? "sent" : "pending",
                sender_uid: ME.uid, sender_label: ME.label, created_at: serverTimestamp() };
    if (file) { n.file_kind = file.kind; n.file_name = file.name; }
    const bt = writeBatch(DB);
    let rec = [];
    if (ME.admin) {
      rec = recipients(await staff(), target, tsites, ME.uid);
      if (!rec.length) { go.disabled = false; return say("مفيش ولا حساب ينطبق عليه الاختيار ده.", 1); }
      n.recipients_n = rec.length;
    }
    bt.set(ref, n);
    if (file) bt.set(doc(DB, "notif_files", ref.id), { data: file.data, kind: file.kind, name: file.name });
    rec.forEach(a => bt.set(doc(DB, "notif_inbox", a.uid + "__" + ref.id), inboxDoc(a, ref.id, n)));
    await bt.commit();
    say(ME.admin ? `اتبعت لـ ${rec.length} حساب.` : "اتبعت للادمن يعتمده. هتلاقيه في «اللي بعته».");
    b.querySelector("#nb-title").value = ""; b.querySelector("#nb-text").value = ""; b.querySelector("#nb-file").value = "";
  } catch (e) { say(errText(e), 1); }
  go.disabled = false;
}

function inboxDoc(a, id, n) {
  const x = { uid: a.uid, recipient_label: labelOf(a), notif_id: id, title: n.title, body: n.body,
              sender_uid: n.sender_uid, sender_label: n.sender_label, has_file: n.has_file, sent_at: serverTimestamp(), read_at: null };
  if (n.has_file) { x.file_kind = n.file_kind; x.file_name = n.file_name; }
  return x;
}

// صورة: بتتصغر لحد 1280 بكسل وتتضغط JPEG. PDF: لازم يبقى صغير.
async function readFile(f) {
  const name = String(f.name || "file").slice(0, 120);
  if (f.type === "application/pdf") {
    const data = await new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = no; r.readAsDataURL(f); });
    if (data.length >= MAX_FILE) throw new Error(`الـ PDF كبير (${Math.round(f.size / 1024)} KB). الحد حوالي 580 KB — صغّره أو ابعته صورة.`);
    return { kind: "pdf", name, data };
  }
  if (!String(f.type).startsWith("image/")) throw new Error("المرفق لازم صورة أو PDF.");
  const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error("مش قادر أفتح الصورة.")); i.src = URL.createObjectURL(f); });
  for (const [side, q] of [[1280, .75], [1024, .65], [800, .55]]) {
    const k = Math.min(1, side / Math.max(img.width, img.height));
    const c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
    const data = c.toDataURL("image/jpeg", q);
    if (data.length < MAX_FILE) { URL.revokeObjectURL(img.src); return { kind: "image", name, data }; }
  }
  throw new Error("الصورة كبيرة حتى بعد الضغط.");
}

// ===== الحسابات (الأدمن بس) =====
let STAFF_CACHE = null;
async function staff() {
  if (STAFF_CACHE) return STAFF_CACHE;
  const s = await getDoc(doc(DB, "staff_accounts", "all"));
  const all = (s.exists() ? s.data().accounts : []) || [];
  if (all.length && !all.some(a => a.uid)) throw new Error("قايمة الحسابات لسه مافيهاش uid — حدّث worker.py على السيرفر (سطر uid) واستنى المزامنة.");
  STAFF_CACHE = all.filter(a => a.uid && !a.disabled && STAFF_ROLES.includes(a.role))
    .map(a => ({ ...a, regional: a.role === "supervisor" && ME.regionalEmails.includes(String(a.email).toLowerCase()) }));
  return STAFF_CACHE;
}
// الاسم اللي بيظهر في «مين قرا» — من غير إيميلات
function labelOf(a) {
  const s = (a.sites || []).join("، ");
  if (a.role === "admin") return "ادمن";
  if (a.role === "viewer") return "مشاهد";
  if (a.role === "hr") return "HR" + (s ? ` (${s})` : "");
  if (a.role === "accountant") return "محاسب" + (s ? ` (${s})` : "");
  if (a.regional) return "الاقليمى" + (s ? ` (${s})` : "");
  return "مشرف " + (s || "الشرقية");
}
function recipients(st, target, tsites, senderUid) {
  const sup = a => a.role === "supervisor";
  const onSite = a => sup(a) && ((a.sites || []).some(s => tsites.includes(s)) || (!(a.sites || []).length && tsites.includes(SHARED_SITE)));
  const pick = {
    all: () => true,
    supervisors: a => sup(a) && !a.regional,
    sites: onSite,
    regionals: a => a.regional,
    office: a => ["admin", "hr", "accountant", "viewer"].includes(a.role),
    accounts: a => tsites.includes(a.uid),
  }[target] || (() => false);
  return st.filter(a => a.uid !== senderUid && pick(a));
}

// ----- اللي بعته -----
async function tabMine() {
  const b = body();
  const qy = ME.admin
    ? query(collection(DB, "notifications"), orderBy("created_at", "desc"), limit(PAGE))
    : query(collection(DB, "notifications"), where("sender_uid", "==", ME.uid), orderBy("created_at", "desc"), limit(PAGE));
  const snap = await getDocs(qy);
  b.innerHTML = snap.empty ? '<div class="nb-muted">لسه مابعتش إشعارات.</div>' : (ME.admin ? '<div class="nb-muted">آخر الإشعارات اللي اتبعتت (من الكل).</div>' : "");
  snap.docs.forEach(d => {
    const x = d.data();
    const st = x.status === "sent" ? `اتبعت${x.recipients_n != null ? ` لـ ${x.recipients_n}` : ""}` : x.status === "pending" ? "مستني اعتماد الادمن" : "اترفض";
    const el = document.createElement("div"); el.className = "nb-item";
    el.innerHTML = `<div class="nb-t">${esc(x.title)}</div>${x.body ? `<div class="nb-b">${esc(x.body)}</div>` : ""}
      <div class="nb-m"><span>${esc(x.sender_label)}</span><span>${esc(fmt(x.created_at))}</span><b>${esc(st)}</b>
      ${x.status === "sent" ? '<button type="button" class="nb-a" data-reads>مين قرا</button>' : ""}
      ${x.has_file ? `<button type="button" class="nb-a" data-file>${x.file_kind === "pdf" ? "الملف" : "الصورة"}</button>` : ""}</div>
      ${x.status === "rejected" && x.reject_reason ? `<div class="nb-err">سبب الرفض: ${esc(x.reject_reason)}</div>` : ""}<div class="nb-reads"></div>`;
    el.querySelector("[data-file]")?.addEventListener("click", () => openFile(d.id));
    el.querySelector("[data-reads]")?.addEventListener("click", e => showReads(d.id, x, el.querySelector(".nb-reads"), e.target));
    b.appendChild(el);
  });
}
async function showReads(id, x, box, btn) {
  btn.disabled = true; box.innerHTML = '<div class="nb-muted">جاري التحميل...</div>';
  try {
    const qs = [collection(DB, "notif_inbox"), where("notif_id", "==", id)];
    if (!ME.admin) qs.push(where("sender_uid", "==", ME.uid));   // لازم عشان الـ Rules (الراسل يشوف نسخ إشعاراته بس)
    const s = await getDocs(query(...qs));
    const rows = s.docs.map(d => d.data()).sort((a, b) => (!!b.read_at) - (!!a.read_at));
    const r = rows.filter(a => a.read_at).length;
    box.innerHTML = `<div><b>قرأه ${r} من ${rows.length}</b></div>` + rows.map(a => `<div>${a.read_at ? "✓" : "—"} ${esc(a.recipient_label || "")} ${a.read_at ? `<span class="nb-muted">${esc(fmt(a.read_at))}</span>` : '<span class="nb-muted">لسه</span>'}</div>`).join("");
  } catch (e) { box.innerHTML = `<div class="nb-err">${esc(errText(e))}</div>`; }
  btn.disabled = false;
}

// ----- مستني اعتماد (الأدمن) -----
async function tabPending() {
  const b = body();
  const snap = await getDocs(query(collection(DB, "notifications"), where("status", "==", "pending"), limit(50)));
  const docs = snap.docs.sort((a, c) => (c.data().created_at?.toMillis?.() || 0) - (a.data().created_at?.toMillis?.() || 0));
  b.innerHTML = docs.length ? "" : '<div class="nb-muted">مفيش حاجة مستنية اعتماد.</div>';
  const tName = Object.fromEntries(targetOptions());
  docs.forEach(d => {
    const x = d.data();
    const el = document.createElement("div"); el.className = "nb-item";
    el.innerHTML = `<div class="nb-t">${esc(x.title)}</div>${x.body ? `<div class="nb-b">${esc(x.body)}</div>` : ""}
      <div class="nb-m"><span>من: ${esc(x.sender_label)}</span><span>${esc(fmt(x.created_at))}</span>
      <span>لـ: ${esc(tName[x.target] || x.target)}${x.target === "sites" ? " — " + esc((x.target_sites || []).join("، ")) : ""}</span>
      ${x.has_file ? `<button type="button" class="nb-a" data-file>${x.file_kind === "pdf" ? "الملف" : "الصورة"}</button>` : ""}</div>
      <div class="nb-m"><button type="button" class="nb-a fill" data-ok>اعتماد وإرسال</button><button type="button" class="nb-a" data-no>رفض</button></div><div class="nb-msg"></div>`;
    el.querySelector("[data-file]")?.addEventListener("click", () => openFile(d.id));
    el.querySelector("[data-ok]").onclick = () => decide(d, x, true, el);
    el.querySelector("[data-no]").onclick = () => decide(d, x, false, el);
    b.appendChild(el);
  });
}
async function decide(d, x, ok, el) {
  const m = el.querySelector(".nb-msg");
  el.querySelectorAll("button").forEach(btn => btn.disabled = true);
  try {
    const bt = writeBatch(DB);
    if (ok) {
      const rec = recipients(await staff(), x.target, x.target_sites || [], x.sender_uid);
      if (!rec.length) throw new Error("مفيش ولا حساب ينطبق عليه الاختيار ده.");
      bt.update(d.ref, { status: "sent", decided_at: serverTimestamp(), recipients_n: rec.length });
      rec.forEach(a => bt.set(doc(DB, "notif_inbox", a.uid + "__" + d.id), inboxDoc(a, d.id, x)));
      await bt.commit();
      m.innerHTML = `<div class="nb-muted">اتبعت لـ ${rec.length} حساب.</div>`;
    } else {
      const why = (prompt("سبب الرفض (إجباري):") || "").trim();
      if (!why) { el.querySelectorAll("button").forEach(btn => btn.disabled = false); return; }
      bt.update(d.ref, { status: "rejected", decided_at: serverTimestamp(), reject_reason: why.slice(0, 500) });
      await bt.commit();
      m.innerHTML = '<div class="nb-muted">اترفض، والراسل هيشوف السبب.</div>';
    }
    el.querySelectorAll("[data-ok],[data-no]").forEach(btn => btn.remove());
    refreshCount();
  } catch (e) {
    m.innerHTML = `<div class="nb-err">${esc(errText(e))}</div>`;
    el.querySelectorAll("button").forEach(btn => btn.disabled = false);
  }
}
