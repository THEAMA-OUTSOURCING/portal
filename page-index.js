// page-index.js — سكريبت صفحة index.html (اتنقل من جوه الصفحة لملف لوحده عشان الـ CSP تمنع أي سكريبت مكتوب جوه الـ HTML)
import { getFirestore, collection, getDocs, addDoc, deleteDoc, doc, query, where, setDoc, getDoc, onSnapshot, serverTimestamp, writeBatch, Timestamp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut, updatePassword } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { db, auth, actorEmail, ask, tell, askText, SUP_SITES } from './shared.js?v=20261104e';


let loggedUser = null;
let reqMandatory = false;
const EMP_EMAIL_DOMAIN = 'emp.theama-egy.com'; // حسابات الموظفين: <كود>@emp.theama-egy.com

// ===== قوائم المقاسات (فورم البيانات المطلوبة) =====
// أي تسجيل مش عليه form_v = REQ_FORM_VERSION بيتعامل كأنه مش موجود،
// فالموظف بيتجبر يدخّل بياناته من القوائم من جديد.
const REQ_FORM_VERSION = 2;
const TSHIRT_SIZES = ['M','L','XL','XXL','3XL','4XL','5XL'];
const SHOE_SIZES = ['40','41','42','43','44','45','46','47'];

function fillSelect(id, values){
  const sel = document.getElementById(id);
  sel.innerHTML = '';
  const ph = document.createElement('option');
  ph.value = ''; ph.textContent = 'اختار المقاس'; ph.disabled = true; ph.selected = true;
  sel.appendChild(ph);
  values.forEach(v=>{
    const o = document.createElement('option');
    o.value = v; o.textContent = v;
    sel.appendChild(o);
  });
}
fillSelect('req-tshirt', TSHIRT_SIZES);
fillSelect('req-shoe', SHOE_SIZES);

function isValidRequest(d){
  return !!d && d.form_v === REQ_FORM_VERSION
    && TSHIRT_SIZES.includes(d.tshirt)
    && SHOE_SIZES.includes(d.shoe)
    && /^0\d{10}$/.test(d.phone || '');
}
const eyeState = {};

// ===== مساعدات =====
function showScreen(id){
  ['login-screen','set-pass-screen','salary-screen','admin-screen','change-pass-screen','card-screen','request-screen'].forEach(s=>{
    document.getElementById(s).style.display = s===id ? 'block' : 'none';
  });
  if(id==='change-pass-screen'){
    document.getElementById('chgpass-success').style.display='none';
    document.getElementById('chgpass-error').style.display='none';
    document.getElementById('chg-pass1').value='';
    document.getElementById('chg-pass2').value='';
  }
}
window.showScreen = showScreen;

function toggleField(inputId, iconId){
  eyeState[iconId] = !eyeState[iconId];
  document.getElementById(inputId).type = eyeState[iconId] ? 'text' : 'password';
  document.getElementById(iconId).className = eyeState[iconId] ? 'ti ti-eye-off' : 'ti ti-eye';
}
window.toggleField = toggleField;

function fmt(val){
  const n = parseFloat(val)||0;
  return n.toLocaleString('ar-EG',{minimumFractionDigits:2,maximumFractionDigits:2});
}

function row2(label, val, color){
  return '<div class="row2"><span class="lbl">'+label+'</span><span style="font-weight:500;color:'+(color||'#222')+';">'+val+'</span></div>';
}

// ===== كلمة مرور ضعيفة =====
// بترجع سبب الرفض، أو '' لو كويسة: كلها نفس الرقم/الحرف، أرقام متتالية (123456 / 654321)، كلمات مشهورة، أو كود الموظف نفسه
function weakPass(p, code){
  const t = String(p||'').replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).trim().toLowerCase();
  if(/^(.)\1+$/.test(t)) return 'كلمة المرور كلها نفس الرقم — اختار حاجة أصعب';
  const seq = '01234567890', rseq = '09876543210';
  if(/^\d+$/.test(t) && (seq.includes(t) || rseq.includes(t))) return 'أرقام ورا بعض سهل تتخمّن — اختار حاجة أصعب';
  if(['password','qwerty','qwertyuiop','asdfgh','theama','tiema','123123','112233','111222','121212','abc123','iloveyou'].some(w => t === w || t === w + '1' || t === w + '123')) return 'كلمة المرور دي مشهورة وسهل تتخمّن — اختار حاجة تانية';
  if(code && t === String(code).toLowerCase()) return 'متستخدمش كود الموظف ككلمة مرور';
  return '';
}

// ===== رسائل أخطاء كلمة المرور =====
function passErrorMsg(e){
  const c = (e && e.code) || '';
  if(c==='auth/requires-recent-login') return 'اخرج وادخل تاني، وبعدين غيّر كلمة المرور';
  if(c==='auth/weak-password') return 'كلمة المرور ضعيفة — لازم 6 أحرف على الأقل';
  if(c==='auth/network-request-failed') return 'خطأ في الاتصال، حاول تاني';
  return 'خطأ في الحفظ، حاول تاني';
}

// ===== الأدمن (تسجيل دخول حقيقي على Firebase Auth) =====
async function checkAdminPass(){
  const email = document.getElementById('admin-email').value.trim();
  const p = document.getElementById('admin-pass').value;
  const errEl = document.getElementById('admin-error');
  errEl.style.display='none';
  if(!email || !p){document.getElementById('admin-error-msg').textContent='ادخل الإيميل والباسورد';errEl.style.display='block';return;}
  if(ADMIN_BUSY) return;   // Enter مرتين بسرعة مايبدأش دخولين
  ADMIN_BUSY = true;
  try{
    await signInWithEmailAndPassword(auth, email, p);
    // إظهار لوحة الرفع بيتم تلقائياً من onAuthStateChanged
  }catch(e){
    document.getElementById('admin-error-msg').textContent='الإيميل أو الباسورد غلط';
    errEl.style.display='block';
  }finally{ ADMIN_BUSY = false; }
}
let ADMIN_BUSY = false;
window.checkAdminPass = checkAdminPass;

// خروج الإدارة
async function adminLogout(){
  try{ await signOut(auth); }catch(e){}
  location.reload();   // تحميل من جديد = مفيش مرتبات أو بيانات فاضلة في الصفحة بعد الخروج (لو الجهاز بيتشارك)
}
window.adminLogout = adminLogout;

// يتابع حالة تسجيل الدخول: الإدارة تفضل داخلة بعد تحديث الصفحة،
// أما الموظف فبيخرج مع أي تحديث ويدخل من الأول
let authInitDone = false;
onAuthStateChanged(auth, async (user)=>{
  const loginBox = document.getElementById('admin-login-box');
  const uploadBox = document.getElementById('admin-upload-box');
  if(!loginBox || !uploadBox) return;
  let role = null;
  let userSites = null, canPayroll = false;
  if(user){
    try{
      const tok = await user.getIdTokenResult();
      role = tok.claims.role || null;
      // رفع المرتبات: الأدمن، أو محاسب معاه صلاحية «رفع المرتبات»
      canPayroll = role === 'admin' || (role === 'accountant' && tok.claims.payroll === true);
      userSites = Array.isArray(tok.claims.sites) ? tok.claims.sites : null;
    }catch(e){ console.error('role read error:', e); }
  }
  const firstRun = !authInitDone;
  authInitDone = true;

  if(user && role === 'employee'){
    // حساب موظف متسجّل من زيارة قديمة (بعد refresh) — نخرّجه
    if(firstRun && !loggedUser) await signOut(auth);
    stopServerStatus();
    loginBox.style.display='block';
    uploadBox.style.display='none';
    return;
  }
  if(user){
    // إدارة أو مشرف
    const isAdmin = (role === 'admin');
    const isStaffRole = (role === 'admin' || role === 'supervisor');
    const isOfficeRole = (role === 'admin' || role === 'hr' || role === 'accountant');
    // المشاهد (viewer): بيشوف بس — المرتبات والكارنيهات والتقارير والمخطط، ومن غير أي رفع أو تعديل
    const isViewer = (role === 'viewer');
    document.querySelectorAll('.admin-only').forEach(el=>{
      el.style.display = isAdmin ? '' : 'none';
    });
    document.querySelectorAll('.payroll-only').forEach(el=>{
      el.style.display = canPayroll ? '' : 'none';
    });
    if(canPayroll) showPayVis();
    document.querySelectorAll('.staff-only').forEach(el=>{
      el.style.display = isStaffRole ? '' : 'none';
    });
    document.querySelectorAll('.office-only').forEach(el=>{
      el.style.display = (isOfficeRole || isViewer) ? '' : 'none';
    });
    // الكارنيه: الأدمن والمشرفين والمشاهد والـ HR (قراية بس)
    document.querySelectorAll('.card-look').forEach(el=>{
      el.style.display = (isStaffRole || isViewer || role === 'hr') ? '' : 'none';
    });
    // المرتبات: الأدمن والمشاهد واللي بيرفع المرتبات (المحاسبين التانيين المرتبات مقفولة عليهم — زي الـ Rules)
    document.querySelectorAll('.salary-look').forEach(el=>{
      el.style.display = (isViewer || canPayroll) ? '' : 'none';
    });
    const isAttRole = (role === 'admin' || (role === 'supervisor' && userSites && userSites.length));
    document.querySelectorAll('.rep-only').forEach(el=>{
      el.style.display = (isAttRole || isOfficeRole || isViewer) ? '' : 'none';
    });
    document.querySelectorAll('.att-only').forEach(el=>{
      el.style.display = isAttRole ? '' : 'none';
    });
    loginBox.style.display='none';
    uploadBox.style.display='block';
    watchServerStatus();
    if(canPayroll || isAdmin) loadXlsx().catch(()=>{});   // تجهيز مكتبة الإكسيل في الخلفية (رفع المرتبات / تصدير البيانات)
  } else {
    stopServerStatus();
    loginBox.style.display='block';
    uploadBox.style.display='none';
    const ap = document.getElementById('admin-pass');
    if(ap) ap.value='';
    const ae = document.getElementById('admin-email');
    if(ae) ae.value='';
  }
});

// ===== أعمدة شيت الرواتب (مشتركة بين شاشة العامل ومراجعة الرفع) =====
// المستحقات والخصومات بتتجمع من الخانات دي. أي عمود فيه أرقام ومش في القوايم دي
// مش بيظهر للعامل — والمراجعة قبل الرفع بتنبّه عليه.
const SAL_PLUS=['الراتب الاساسي','الراتب المتغير','قيمة الاضافي','قيمة ساعات جمع وعطلات','قيمة ساعات نهاري','قيمة ساعات ليلي','عمولة','بدل انتقال','بدل طبيعة عمل','مأموريات','بدل طريق','وجبات','عيدية','مستحقات اخري 1','مستحقات اخري 2','قيمة الحافز','قيمة التطبيق'];
const SAL_MINUS=['قيمة الغياب','قيمة جزاءات البصمه','قيمة جزاءات','التاخيرات','قيمة المرضي','خصومات اخري','كسب عمل','عمولة البريد','ضريبة'];
const SAL_DAYS=[['ايام الحضور','حضور'],['ايام حضور جمع','جُمَع'],['عطلة رسمية','عطلات'],['ايام الاضافي','إضافي'],['ساعات اضافي','إضافي س'],['ساعات نهاري','نهاري س'],['ساعات ليلي','ليلي س'],['اجمالي ايام الغياب','غياب'],['ايام الغياب غ','غياب غ'],['ايام الغياب خ','غياب خ'],['جزاءات البصمه','جزاء بصمة'],['جزاءات','جزاءات'],['الاجازه','إجازة'],['ايام التوقف','توقف'],['ايام المرضي','مرضي'],['عدد التطبيق','تطبيق']];
// أعمدة معروفة بس مش مستحق ولا خصم (بيانات، نسب، إجماليات، أعمدة مراجعة)
const SAL_INFO=['كود الموظف','الاسم','الرقم القومى','الرقم القومي','البطاقة','الوظيفة','نوع الوظيفة','الفرع \\ المصنع','فترة القبض','طريقة القبض','القطاع','موقف القبض','نوع القبض','نسبة الحافز','اجمالي الراتب','صحت المبلغ'];
const SAL_TOL = 1;   // أي فرق أقل من جنيه واحد مقبول
const salKey = k => String(k).replace(/\s+/g,' ').trim();
const salGet = (r,name) => { const n=salKey(name); const k=Object.keys(r).find(k=>salKey(k)===n); return k?r[k]:''; };
const salNum = v => { const n=parseFloat(String(v==null?'':v).replace(/,/g,'')); return isNaN(n)?0:n; };
const salNet = r => { const k=Object.keys(r).find(k=>salKey(k).startsWith('صافي')); return k?salNum(r[k]):0; };
function salTotals(r){
  const P=SAL_PLUS.reduce((a,c)=>a+salNum(salGet(r,c)),0);
  const M=SAL_MINUS.reduce((a,c)=>a+salNum(salGet(r,c)),0);
  return {P, M, net: salNet(r)};
}
// تجميع طرق القبض في المراجعة: ميزا = NBK (نفس البنك)، والبريد مع إيقاف الراتب
function salPayGroup(v){
  const t = String(v==null?'':v).replace(/\s+/g,' ').trim();
  const u = t.toUpperCase().replace(/[إأآ]/g,'ا');
  if(!t) return 'غير محدد';
  if(u.includes('NBK') || u.includes('MEZA') || u.includes('ميزا')) return 'NBK / ميزا';
  if(u.includes('بريد') || u.includes('ايقاف')) return 'بريد / ايقاف راتب';
  if(u.includes('DOPAY')) return 'DOPAY';
  return t;
}
const SAL_KNOWN = new Set([...SAL_PLUS, ...SAL_MINUS, ...SAL_DAYS.map(d=>d[0]), ...SAL_INFO].map(salKey));
const salIsKnown = k => { const n=salKey(k); return !n || n.startsWith('__EMPTY') || n==='_tab' || n.startsWith('صافي') || SAL_KNOWN.has(n); };

// نسخ رقم من المراجعة: الرقم الصافي (11922254.85) عشان يتلزق في الإكسيل كرقم
async function copyNumber(el){
  const v = el.dataset.v;
  let ok = false;
  try { await navigator.clipboard.writeText(v); ok = true; }
  catch(e){
    // متصفحات قديمة أو من غير صلاحية الحافظة
    const ta = document.createElement('textarea'); ta.value = v; ta.setAttribute('readonly','');
    ta.style.position='fixed'; ta.style.opacity='0'; document.body.appendChild(ta); ta.select();
    try { ok = document.execCommand('copy'); } catch(_){} ta.remove();
  }
  document.querySelectorAll('.pv-toast').forEach(t=>t.remove());
  document.querySelectorAll('.pv-hl').forEach(x=>x.classList.remove('pv-hl'));
  el.classList.add('pv-hl');
  const t = document.createElement('span'); t.className='pv-toast';
  t.textContent = ok ? 'اتنسخ ✓ ' + v : 'مقدرتش أنسخ — علّم الرقم وانسخه';
  el.insertAdjacentElement('afterend', t);
  setTimeout(()=>{ t.remove(); el.classList.remove('pv-hl'); }, 2500);
}

// ===== مكتبة الإكسيل =====
// 930 ك — بتتحمّل بس لما حساب إدارة يدخل (أو أول ما يحتاجها)، عشان العامل مايحمّلهاش على باقته من غير لازمة.
// نفس الملف ونفس البصمة (integrity): لو الملف اتغيّر المتصفح مايشغّلوش.
let xlsxReady = null;
function loadXlsx(){
  if(window.XLSX) return Promise.resolve(window.XLSX);
  if(!xlsxReady) xlsxReady = new Promise((ok,fail)=>{
    const sc = document.createElement('script');
    sc.src = 'vendor/xlsx-0.20.3.full.min.js';
    sc.integrity = 'sha384-EnyY0/GSHQGSxSgMwaIPzSESbqoOLSexfnSMN2AP+39Ckmn92stwABZynq1JyzdT';
    sc.onload = ()=> window.XLSX ? ok(window.XLSX) : fail(new Error('مكتبة الإكسيل مااشتغلتش'));
    sc.onerror = ()=>{ xlsxReady = null; fail(new Error('مكتبة الإكسيل مااتحمّلتش — اتأكد من النت وجرّب تاني')); };
    document.head.appendChild(sc);
  });
  return xlsxReady;
}

// ===== قراءة الشيت ومراجعته (كل تابة = شركة) =====
let payParsed = null;   // نتيجة المراجعة الأخيرة، الرفع بيستخدمها
function resetPayReview(clearFile){
  payParsed = null;
  document.getElementById('pay-review').style.display='none';
  document.getElementById('pay-review').innerHTML='';
  document.getElementById('upload-btn').style.display='none';
  document.getElementById('review-cancel').style.display='none';
  document.getElementById('review-btn').style.display='block';
  if(clearFile===true) document.getElementById('admin-excel').value='';
}
window.resetPayReview = resetPayReview;

async function parsePayroll(file){
  const XLSX = await loadXlsx();
  const wb = XLSX.read(new Uint8Array(await file.arrayBuffer()),{type:'array'});
  const tabs = [], skipped = [], recs = [], codeTabs = new Map();
  wb.SheetNames.forEach(name=>{
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[name],{defval:''});
    const hasCode = rows.length && Object.keys(rows[0]).some(k=>salKey(k)==='كود الموظف');
    if(!hasCode){ skipped.push(name); return; }
    const t = {name, count:0, P:0, M:0, net:0, methods:{}, diffs:[], unknown:new Map()};
    rows.forEach(r=>{
      const code = String(salGet(r,'كود الموظف')).trim();
      if(!code) return;
      const nid = String(salGet(r,'الرقم القومى')||salGet(r,'الرقم القومي')||salGet(r,'البطاقة')).trim();
      const s = salTotals(r);
      t.count++; t.P+=s.P; t.M+=s.M; t.net+=s.net;
      const m = salPayGroup(salGet(r,'طريقة القبض'));
      t.methods[m] = (t.methods[m]||0) + s.net;
      const d = s.P - s.M - s.net;
      if(Math.abs(d) >= SAL_TOL) t.diffs.push({code, name:String(salGet(r,'الاسم')).trim(), calc:s.P-s.M, net:s.net, d});
      Object.keys(r).forEach(k=>{ if(!salIsKnown(k) && salNum(r[k])!==0) t.unknown.set(salKey(k),(t.unknown.get(salKey(k))||0)+1); });
      if(!codeTabs.has(code)) codeTabs.set(code,[]);
      codeTabs.get(code).push(name);
      recs.push({code, nid, data:{...r, _tab:name}});
    });
    if(t.count) tabs.push(t); else skipped.push(name);
  });
  const dups = [...codeTabs.entries()].filter(([,v])=>v.length>1).map(([code,v])=>({code, tabs:v}));
  return {tabs, skipped, recs, dups};
}

async function reviewSheet(){
  const file = document.getElementById('admin-excel').files[0];
  const errEl = document.getElementById('upload-error');
  document.getElementById('upload-success').style.display='none'; errEl.style.display='none';
  if(!file){document.getElementById('upload-error-msg').textContent='اختار ملف إكسيل الأول';errEl.style.display='block';return;}
  const btn = document.getElementById('review-btn');
  btn.innerHTML='<span class="spinner"></span> جاري المراجعة...'; btn.disabled=true;
  try{
    const p = await parsePayroll(file);
    if(!p.recs.length) throw new Error('مفيش ولا سطر فيه «كود الموظف» في أي تابة');
    payParsed = p;
    const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    // الأرقام إنجليزي (عشان تتنسخ وتتطرح في الإكسيل)، ودوسة على أي مبلغ بتنسخه رقم صافي من غير فواصل
    const money=v=>'<span class="pv-n" dir="ltr" data-v="'+(Number(v)||0).toFixed(2)+'" title="دوس للنسخ">'
      +(Number(v)||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})+'<i class="pv-cp">⧉</i></span>';
    const cnt=v=>Number(v).toLocaleString('en-US');
    const td='padding:6px 8px;border-bottom:1px solid #eee;text-align:right;', th=td+'background:#f5f5f0;font-weight:500;';
    let h='<style>.pv-n{cursor:pointer;border-radius:5px;padding:1px 3px;margin:0 -3px;font-variant-numeric:tabular-nums;white-space:nowrap;}'
      +'.pv-n:hover,.pv-n.pv-hl{background:#eef6f0;}.pv-cp{font-style:normal;font-size:10px;color:#767676;margin-inline-start:3px;}'
      +'.pv-toast{display:block;font-size:11px;color:#1e7a4a;font-weight:500;}</style>';
    h+='<div style="border:1px solid #e5e5e5;border-radius:10px;padding:12px;margin-bottom:12px;font-size:13px;">';
    h+='<div class="info-box" style="margin-bottom:8px;">علّم على الشركات اللي هترفعها دلوقتي. كشوف الشركات التانية ومدة ظهورها مش هيتغيّروا.</div>';
    h+='<p style="font-weight:500;margin-bottom:8px;">مراجعة الشيت — '+cnt(p.tabs.length)+' تابة، '+cnt(p.recs.length)+' كشف <span style="font-size:11px;color:#6b6b6b;font-weight:400;">· دوس على أي رقم ينسخه</span></p>';
    // كل تابة كارت لوحده: الاسم والعدد، وتحتهم المستحقات / الخصومات / الصافي
    const cell=(l,v,st)=>'<div style="flex:1;min-width:0;"><span style="display:block;font-size:11px;color:#6b6b6b;">'+l+'</span><b style="font-size:13px;'+(st||'')+'">'+v+'</b></div>';
    p.tabs.forEach(t=>{
      h+='<div style="border-top:1px solid #eee;padding:8px 0;">';
      h+='<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px;"><label style="display:flex;align-items:center;gap:6px;cursor:pointer;"><input type="checkbox" class="pv-pick" value="'+esc(t.name)+'" style="width:18px;height:18px;accent-color:#c0392b;"><b style="font-size:14px;">'+esc(t.name)+(t.diffs.length?' <span style="color:#a32d2d;">⚠</span>':'')+'</b></label><span style="font-size:12px;color:#6b6b6b;">'+cnt(t.count)+' كشف</span></div>';
      h+='<div style="display:flex;gap:8px;">'+cell('المستحقات',money(t.P))+cell('الخصومات',money(t.M),'color:#a32d2d;')+cell('الصافي',money(t.net),'color:#1e7a4a;')+'</div>';
      const ms=Object.entries(t.methods);
      if(ms.length>1){
        h+='<div style="margin-top:6px;background:#fafaf7;border-radius:6px;padding:4px 8px;">';
        ms.sort((x,y)=>y[1]-x[1]).forEach(([m,v])=>{ h+='<div style="display:flex;justify-content:space-between;font-size:12px;color:#666;padding:2px 0;"><span dir="auto">'+esc(m)+'</span><b style="font-weight:500;">'+money(v)+'</b></div>'; });
        h+='</div>';
      }
      h+='</div>';
    });

    const diffs = p.tabs.flatMap(t=>t.diffs.map(d=>({...d, tab:t.name})));
    if(diffs.length){
      h+='<div class="error-box" style="display:block;margin-top:10px;"><b>'+cnt(diffs.length)+' كشف الجمع فيه مش مساوي الصافي</b> (المستحقات − الخصومات ≠ صافي المرتب):';
      h+='<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:12px;margin-top:6px;"><tr>'+['التابة','الكود','الاسم','الجمع','الصافي','الفرق'].map(x=>'<th style="text-align:right;padding:3px 4px;">'+x+'</th>').join('')+'</tr>';
      diffs.forEach(d=>{ h+='<tr><td style="padding:3px 4px;">'+esc(d.tab)+'</td><td style="padding:3px 4px;">'+esc(d.code)+'</td><td style="padding:3px 4px;">'+esc(d.name)+'</td><td style="padding:3px 4px;">'+money(d.calc)+'</td><td style="padding:3px 4px;">'+money(d.net)+'</td><td style="padding:3px 4px;font-weight:600;">'+money(d.d)+'</td></tr>'; });
      h+='</table></div></div>';
    } else {
      h+='<div class="success-box" style="display:block;margin-top:10px;">كل الكشوف الجمع فيها مساوي الصافي (فرق أقل من جنيه).</div>';
    }

    const unk = new Map();
    p.tabs.forEach(t=>t.unknown.forEach((n,k)=>unk.set(k,(unk.get(k)||0)+n)));
    if(unk.size){
      h+='<div class="error-box" style="display:block;margin-top:10px;"><b>أعمدة جديدة مش هتظهر للعامل</b> ومش داخلة في الجمع: '
        +[...unk.entries()].map(([k,n])=>'«'+esc(k)+'» ('+cnt(n)+' صف)').join('، ')+'</div>';
    }
    if(p.dups.length){
      h+='<div class="info-box" style="margin-top:10px;margin-bottom:0;"><b>أكواد متكررة</b> — هتظهر للعامل كذا كشف: '
        +p.dups.map(d=>esc(d.code)+' ('+d.tabs.map(esc).join('، ')+')').join(' · ')+'</div>';
    }
    if(p.skipped.length){
      h+='<p style="font-size:12px;color:#6b6b6b;margin-top:8px;">تابات اتسابت (مفيهاش «كود الموظف»): '+p.skipped.map(esc).join('، ')+'</p>';
    }
    h+='</div>';
    const box = document.getElementById('pay-review');
    box.innerHTML = h; box.style.display='block';
    box.onclick = e => { const n = e.target.closest('.pv-n'); if(n) copyNumber(n); };
    btn.style.display='none';
    const up = document.getElementById('upload-btn');
    up.style.display='block';
    const pickLbl = () => {
      const k = [...box.querySelectorAll('.pv-pick:checked')].map(x=>x.value);
      const warnT = new Set([...diffs.map(d=>d.tab), ...p.tabs.filter(t=>t.unknown.size).map(t=>t.name)]);
      up.disabled = !k.length;
      up.textContent = !k.length ? 'علّم على شركة واحدة على الأقل' : (k.some(x=>warnT.has(x)) ? 'رفع رغم التنبيهات — ' : 'رفع ')+k.join('، ');
    };
    box.onchange = pickLbl; pickLbl();
    document.getElementById('review-cancel').style.display='block';
  }catch(e){
    document.getElementById('upload-error-msg').textContent='خطأ: '+e.message;
    errEl.style.display='block';
  }
  btn.innerHTML='مراجعة الشيت قبل الرفع'; btn.disabled=false;
}
window.reviewSheet = reviewSheet;

// ===== مدة ظهور المرتب للعمال =====
// payroll_meta/current = { upload_id, days, visible_until }. بعد الميعاد العامل بيدخل عادي (البطاقة الطبية وبياناته وكلمة المرور)
// بس مكان المرتب بتظهر رسالة يكلم المشرف أو الـ HR. الأدمن والمحاسب والمشاهد بيشوفوا المرتب عادي في «عرض مرتب موظف».
const VIS_DOC = ()=>doc(db,'payroll_meta','current');
function payDays(){ const n = parseInt(document.getElementById('pay-days').value,10); return n>=1 && n<=60 ? n : 5; }
async function loadPayVis(){ try{ const s = await getDoc(VIS_DOC()); return s.exists() ? s.data() : null; }catch(e){ return null; } }
// مفيش ميعاد متسجّل (رفعة قبل الميزة دي) → المرتب ظاهر
function payHidden(meta){ const t = meta?.visible_until?.toDate?.(); return !!t && Date.now() > t.getTime(); }
// مدة الظهور لكل شركة (تابة): meta.tabs[اسم التابة] = { upload_id, days, visible_until }. التابة اللي مالهاش ميعاد بتاخد الميعاد العام القديم
const tabKey = n => String(n||'').replace(/[أإآ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه').replace(/\s+/g,' ').trim();
function tabVis(meta, tab){ return meta?.tabs?.[tabKey(tab)] || meta; }
function tabHidden(meta, tab){ return payHidden(tabVis(meta, tab)); }
// كشوف العامل: أحدث رفعة لكل شركة (تابة) — لأن كل شركة بتترفع في ميعادها
function latestPerTab(docs){
  const tabbed = docs.filter(d=>d.data().data?._tab);
  const use = tabbed.length ? tabbed : docs;   // كشوف قديمة من غير اسم تابة: بتتعرض بس لو مفيش غيرها
  const best = {};
  use.forEach(d=>{ const k = tabKey(d.data().data?._tab), u = d.data().upload_id || ''; if(!(k in best) || u > best[k]) best[k] = u; });
  return use.filter(d=>(d.data().upload_id || '') === best[tabKey(d.data().data?._tab)]).sort((a,b)=>a.id.localeCompare(b.id));
}
const visFmt = d => d.toLocaleString('ar-EG',{weekday:'long',day:'numeric',month:'long',hour:'numeric',minute:'2-digit'});
async function showPayVis(){
  const box = document.getElementById('pay-vis'); if(!box) return;
  const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const meta = await loadPayVis();
  const tabs = Object.entries(meta?.tabs || {}).filter(([,v])=>v?.visible_until?.toDate);
  if(!tabs.length && meta?.visible_until?.toDate) tabs.push(['', meta]);   // رفعة قديمة بميعاد واحد للكل
  if(!tabs.length){ box.style.display='none'; return; }
  box.innerHTML = '<b style="display:block;margin-bottom:4px;">مدة ظهور المرتب للعمال</b>' + tabs.sort((x,y)=>x[0].localeCompare(y[0])).map(([k,v])=>{
    const t = v.visible_until.toDate();
    const txt = (v.name || k || 'كل الشركات')+': '+(payHidden(v) ? 'مستخبي من '+visFmt(t) : 'ظاهر لحد '+visFmt(t));
    return '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;padding:3px 0;border-top:1px solid #e6edf3;"><span>'+esc(txt)+'</span>'
      +'<button class="btn-secondary" style="width:auto;min-height:34px;margin:0;padding:4px 12px;" data-ext="'+esc(k)+'">تمديد</button></div>';
  }).join('');
  box.onclick = e => { const b = e.target.closest('[data-ext]'); if(b) extendPayVis(b.dataset.ext); };
  box.style.display='block';
}
async function extendPayVis(key){
  const meta = await loadPayVis();
  const cur0 = key ? meta?.tabs?.[key] : meta;
  const v = await askText('تمديد ظهور مرتب «'+(cur0?.name || key || 'كل الشركات')+'» للعمال كام يوم؟\n(من آخر الميعاد لو لسه ماخلصش، أو من دلوقتي لو خلص)', { value: '2', input: 'number', ok: 'مدّد' });
  if(v===null) return;
  const n = parseInt(v,10);
  if(!(n>=1 && n<=60)){ tell('اكتب عدد أيام من 1 لـ 60'); return; }
  const cur = cur0?.visible_until?.toDate?.()?.getTime() || 0;
  const until = Timestamp.fromDate(new Date(Math.max(Date.now(), cur) + n*864e5));
  try{
    await setDoc(VIS_DOC(), key ? { tabs: { [key]: { visible_until: until, extended_at: serverTimestamp() } } } : { visible_until: until, extended_at: serverTimestamp() }, { merge: true });
  }catch(e){
    tell('التمديد ماتسجلش: '+(e.code==='permission-denied'?'محتاج تحديث الـ Rules (payroll_meta)':e.message)); return;
  }
  showPayVis();
}
window.extendPayVis = extendPayVis;

// ===== رفع الشيت (بعد المراجعة) =====
async function uploadSheet(){
  const successEl = document.getElementById('upload-success');
  const errEl = document.getElementById('upload-error');
  const btn = document.getElementById('upload-btn');
  successEl.style.display='none'; errEl.style.display='none';
  if(!payParsed){ resetPayReview(); return; }
  const picked = [...document.querySelectorAll('#pay-review .pv-pick:checked')].map(x=>x.value);
  if(!picked.length){ tell('علّم على الشركات اللي هترفعها الأول'); return; }
  const pickedK = new Set(picked.map(tabKey)), allPicked = picked.length === payParsed.tabs.length;
  const pTabs = payParsed.tabs.filter(t=>pickedK.has(tabKey(t.name)));
  const warn = pTabs.some(t=>t.diffs.length||t.unknown.size);
  if(warn && !await ask('فيه تنبيهات في المراجعة. متأكد إنك عايز ترفع الشيت كده؟', { ok: "ارفع برضه" })) return;
  const btnLabel = btn.textContent;
  btn.innerHTML='<span class="spinner"></span> جاري الرفع...'; btn.disabled=true;
  document.getElementById('review-cancel').style.display='none';
  let ok = false;
  try{
    // الترتيب الآمن: الجديد يترفع كله الأول، وبعدين بس القديم يتمسح.
    // لو النت فصل في النص، الكشوف القديمة بتفضل زي ما هي والموظف ميلاقيش «مفيش كشف».
    // كل رفعة ليها upload_id، وصفحة الموظف بتعرض أحدث رفعة بس لو لقت القديم والجديد مع بعض.
    const uploadId = new Date().toISOString().replace(/\D/g,'').slice(0,14);
    const recs = payParsed.recs.filter(x=>pickedK.has(tabKey(x.data._tab))).map((x,i)=>({ id: x.code+'_'+uploadId+'_'+String(i+1).padStart(5,'0'),
      data: { employee_code: x.code, national_id: x.nid, upload_id: uploadId, data: x.data } }));

    const old = await getDocs(collection(db,'payroll'));   // الـ IDs القديمة عشان نمسحها في الآخر
    const BATCH = 400;                                      // حد Firestore للدفعة 500 عملية
    const written = [];
    try{
      for(let i=0; i<recs.length; i+=BATCH){
        const b = writeBatch(db);
        const part = recs.slice(i,i+BATCH);
        part.forEach(x=>b.set(doc(db,'payroll',x.id), x.data));
        await b.commit();
        written.push(...part.map(x=>x.id));
        btn.innerHTML='<span class="spinner"></span> جاري الرفع... '+written.length+'/'+recs.length;
      }
    }catch(e){
      // الرفع وقف في النص: نشيل اللي اترفع من الجديد، والقديم لسه سليم
      for(let i=0; i<written.length; i+=BATCH){
        const b = writeBatch(db); written.slice(i,i+BATCH).forEach(id=>b.delete(doc(db,'payroll',id)));
        try{ await b.commit(); }catch(_){}
      }
      throw new Error('الرفع ماكملش، والكشوف القديمة زي ما هي — جرّب تاني ('+e.message+')');
    }

    // الجديد اترفع كامل → نمسح القديم
    const newIds = new Set(recs.map(x=>x.id));
    // القديم اللي بيتمسح: كشوف الشركات المتعلّم عليها بس. الكشوف القديمة اللي مالهاش اسم تابة بتتمسح لو رفعت كل الشركات
    const oldIds = old.docs.filter(d=>{ const t = d.data().data?._tab; return t ? pickedK.has(tabKey(t)) : allPicked; }).map(d=>d.id).filter(id=>!newIds.has(id));
    let leftover = 0;
    for(let i=0; i<oldIds.length; i+=BATCH){
      const b = writeBatch(db); oldIds.slice(i,i+BATCH).forEach(id=>b.delete(doc(db,'payroll',id)));
      try{ await b.commit(); }catch(_){ leftover += Math.min(BATCH, oldIds.length-i); }
      btn.innerHTML='<span class="spinner"></span> بيمسح القديم... '+Math.min(i+BATCH,oldIds.length)+'/'+oldIds.length;
    }
    const count = recs.length;
    // مدة ظهور المرتب للعمال: من وقت الرفع، بالعدد اللي اتختار
    const days = payDays();
    let visMsg = ' ('+picked.join('، ')+') — ظاهر للعمال '+days+' يوم';
    try{
      const until = Timestamp.fromDate(new Date(Date.now()+days*864e5)), tabs = {};
      pTabs.forEach(t=>tabs[tabKey(t.name)] = { name: t.name, upload_id: uploadId, days, visible_until: until, set_at: serverTimestamp() });
      await setDoc(VIS_DOC(), { upload_id: uploadId, tabs }, { merge: true });
    }catch(e){
      visMsg = ' — بس مدة الظهور ماتسجلتش ('+(e.code==='permission-denied'?'محتاج تحديث الـ Rules: payroll_meta':e.message)+')، فالمرتب هيفضل ظاهر لحد ما تمدّد';
    }
    // تقسيم الشرقية للتقارير: اللي في تابة «الشرقية 1» = الشرقية 1، وأي حد تاني في الشرقية = الشرقية 2
    // بيتسجل بس لو الشيت فيه تابة الشرقية 1 (عشان رفعة من غيرها ماتمسحش التقسيم القديم)
    const shTabs = pTabs.map(t=>t.name).filter(n=>/شرق/.test(n));
    const sh1 = shTabs.filter(n=>/[1١]/.test(n));
    if(sh1.length){
      const nids1 = [...new Set(payParsed.recs.filter(x=>sh1.includes(x.data._tab)).map(x=>String(x.nid||'').replace(/\D/g,'')).filter(n=>n.length===14))];
      try{ await setDoc(doc(db,'sharqia_map','groups'), { nids1, tabs1: sh1, upload_id: uploadId, set_at: serverTimestamp() }); visMsg += ' — تقسيم الشرقية: '+nids1.length+' في الشرقية 1'; }
      catch(e){ visMsg += ' — بس تقسيم الشرقية 1 / 2 ماتسجلش ('+(e.code==='permission-denied'?'محتاج تحديث الـ Rules: sharqia_map':e.message)+')'; }
    }
    showPayVis();
    document.getElementById('upload-success-msg').textContent='تم رفع '+count+' موظف بنجاح ✓' + visMsg
      + (leftover ? ' — بس '+leftover+' كشف قديم مااتمسحش (مش هيظهروا للموظفين). ارفع الشيت تاني وقت ما النت يبقى أحسن عشان يتمسحوا.' : '');
    successEl.style.display='block';
    ok = true;
    runSync(); // إنشاء حسابات الموظفين الجداد تلقائياً
  }catch(e){
    document.getElementById('upload-error-msg').textContent='خطأ: '+e.message;
    errEl.style.display='block';
  }
  btn.disabled=false;
  if(ok){ resetPayReview(true); }
  else { btn.textContent = btnLabel; document.getElementById('review-cancel').style.display='block'; }
}
window.uploadSheet = uploadSheet;

// ===== مسح البيانات =====
async function confirmClear(){
  // مسح كل الكشوف مالوش رجوع، والعمال كلهم مش هيشوفوا مرتب — لازم تكتب الكلمة بنفسك (مش دوسة بالغلط)
  const typed = await askText('هتمسح كشوف المرتبات كلها لكل الشركات، ومالهاش رجوع.\nللتأكيد اكتب: امسح الكل', { ok: "امسح الكل", danger: true, required: true });
  if(typed === null) return;
  if(typed.replace(/\s+/g,' ').trim() !== 'امسح الكل'){ tell('مااتمسحش حاجة — الكلمة مش مطابقة.'); return; }
  try{
    const snap = await getDocs(collection(db,'payroll'));
    for(let i=0; i<snap.docs.length; i+=400){
      const b = writeBatch(db); snap.docs.slice(i,i+400).forEach(d=>b.delete(d.ref)); await b.commit();
    }
  }catch(e){ tell('المسح ماكملش: '+(e.code==='permission-denied'?'مش مسموح لحسابك':e.message)+'\nممكن يكون اتمسح جزء — دوس مسح تاني.'); return; }
  showPayVis().catch(()=>{});   // مدة ظهور المرتب تتحدث بعد المسح
  tell('تم مسح كل البيانات');
}
window.confirmClear = confirmClear;


// ===== طلبات برنامج السيرفر (worker.py) =====
// لوحة الإدارة بتسجّل الطلب في admin_tasks، والبرنامج على سيرفر الشركة بينفّذه
async function createTask(type, code){
  const u = auth.currentUser;
  if(!u) throw new Error('انتهت الجلسة — ادخل تاني');
  return await addDoc(collection(db,'admin_tasks'), {
    type, code: code || '',
    requested_by: u.uid, requested_email: actorEmail(u),
    status: 'pending', created_at: serverTimestamp()
  });
}

function waitTask(ref, onWorking, timeoutMs){
  return new Promise(resolve=>{
    let finished = false, unsub = null;
    const finish = (r)=>{ if(finished) return; finished = true; clearTimeout(timer); if(unsub) unsub(); resolve(r); };
    const timer = setTimeout(()=>finish({status:'timeout'}), timeoutMs);
    unsub = onSnapshot(ref, snap=>{
      const d = snap.data();
      if(!d) return;
      if(d.status==='working' && onWorking) onWorking(d);
      if(d.status==='done' || d.status==='error') finish(d);
    }, err=>finish({status:'error', message:'مش قادر أتابع الطلب: '+err.message}));
  });
}

// كود الموظف زي ما المشرف بيكتبه: أرقام عربي ← إنجليزي، من غير مسافات، حروف كبيرة
function staffCode(v){
  return String(v||'').replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/\s+/g,'').toUpperCase();
}
// الأكواد اللي نجربها بالترتيب: الكود زي ما اتكتب الأول (عمال الشرقية أكوادهم أرقام بس)،
// ولو أرقام بس ومنفعش، نجرب بـ T قدامه (باقي العمال T + مسلسل والمشرف ممكن ينسى الـ T)
function staffCodes(v){
  const c = staffCode(v);
  return /^\d{1,8}$/.test(c) ? [c, 'T' + c] : (c ? [c] : []);
}

// ===== إعادة تعيين باسورد موظف =====
async function resetEmployeePass(){
  const codes = staffCodes(document.getElementById('reset-code').value), code = codes[0];
  const successEl = document.getElementById('reset-success');
  const errEl = document.getElementById('reset-error');
  const btn = document.getElementById('reset-btn');
  const fail = (m)=>{ document.getElementById('reset-error-msg').textContent = m; errEl.style.display='block'; };
  successEl.style.display='none'; errEl.style.display='none';
  if(!code){ fail('من فضلك ادخل كود الموظف'); return; }
  btn.innerHTML='<span class="spinner" style="border-color:rgba(186,117,23,0.3);border-top-color:#ba7517;"></span> جاري...'; btn.disabled=true;
  try{
    // الـ Rules بترفض الطلب لو الكود مش تبع المشرف — نجرب الكود التاني (بـ T) قبل ما نقول مرفوض
    let ref = null, denied = null;
    for(const c of codes){
      try{ ref = await createTask('reset', c); break; }
      catch(e){ if(e && e.code==='permission-denied'){ denied = e; continue; } throw e; }
    }
    if(!ref) throw denied;
    const r = await waitTask(ref, null, 30000);
    if(r.status==='done'){
      document.getElementById('reset-success-msg').textContent = r.message;
      successEl.style.display='block';
      document.getElementById('reset-code').value='';
    } else if(r.status==='timeout'){
      fail('الطلب اتسجّل بس السيرفر مردّش لسه — هيتنفذ أول ما السيرفر يشتغل');
    } else {
      fail(r.message || 'حصل خطأ، حاول تاني');
    }
  }catch(e){ fail(e && e.code==='permission-denied' ? 'الموظف ده مش ضمن العمال المسموحلك بيهم' : 'خطأ: '+e.message); }
  btn.innerHTML='<i class="ti ti-refresh" style="font-size:15px;vertical-align:-2px;margin-left:4px;"></i>إعادة تعيين الباسورد'; btn.disabled=false;
}
window.resetEmployeePass = resetEmployeePass;

// ===== إنشاء حسابات الموظفين الجداد =====
async function runSync(){
  const el = document.getElementById('sync-status');
  const btn = document.getElementById('sync-btn');
  const show = (cls, m)=>{ el.className = cls; el.textContent = m; el.style.display='block'; };
  btn.disabled = true;
  show('info-box', 'جاري تسجيل طلب إنشاء الحسابات...');
  try{
    const ref = await createTask('sync');
    show('info-box', 'مستني السيرفر...');
    const r = await waitTask(ref, ()=>show('info-box','السيرفر بيعمل حسابات الموظفين الجداد...'), 180000);
    if(r.status==='done') show('success-box', r.message);
    else if(r.status==='timeout') show('error-box', 'الطلب اتسجّل بس السيرفر مردّش — الحسابات هتتعمل أول ما يشتغل');
    else show('error-box', r.message || 'حصل خطأ، حاول تاني');
  }catch(e){ show('error-box', 'خطأ: '+e.message); }
  btn.disabled = false;
}
window.runSync = runSync;

// ===== حالة السيرفر =====
let serverStatusUnsub = null, serverStatusTimer = null, lastServerData = null;
function renderServerStatus(){
  const el = document.getElementById('server-status');
  const t = lastServerData && lastServerData.last_seen && lastServerData.last_seen.toDate ? lastServerData.last_seen.toDate() : null;
  const ageMin = t ? (Date.now() - t.getTime())/60000 : Infinity;
  if(ageMin <= 11){
    el.className = 'success-box'; el.style.display = 'block';
    el.textContent = 'السيرفر شغال ✓';
  } else {
    el.className = 'error-box'; el.style.display = 'block';
    el.textContent = 'السيرفر واقف' + (t ? ' — آخر ظهور: ' + t.toLocaleString('ar-EG') : '') + ' — طلبات الريسيت والحسابات هتستنى لحد ما يشتغل';
  }
}
function watchServerStatus(){
  if(serverStatusUnsub) return;
  serverStatusUnsub = onSnapshot(doc(db,'admin_tasks_status','server'), snap=>{
    lastServerData = snap.exists() ? snap.data() : null;
    renderServerStatus();
  }, err=>{
    const el = document.getElementById('server-status');
    el.className = 'info-box'; el.textContent = 'مش قادر أقرا حالة السيرفر';
    console.error('server status error:', err);
  });
  serverStatusTimer = setInterval(renderServerStatus, 60000);
}
function stopServerStatus(){
  if(serverStatusUnsub){ serverStatusUnsub(); serverStatusUnsub = null; }
  if(serverStatusTimer){ clearInterval(serverStatusTimer); serverStatusTimer = null; }
}

// ===== دخول الموظف (Firebase Auth) =====
// كشف راتب العامل: أحدث رفعة لكل شركة، وبترتيبها في الشيت. الشركة اللي مدة ظهورها خلصت كشفها مش بيظهر.
// بيرجّع null لو مفيش كشف.
async function loadMyPayroll(myCode){
  const snap = await getDocs(query(collection(db,'payroll'), where('employee_code','==',myCode)));
  if(snap.empty) return null;
  const docs = latestPerTab(snap.docs);
  const meta = await loadPayVis();
  const shown = docs.filter(d=>!tabHidden(meta, d.data().data?._tab));
  return { rows: (shown.length ? shown : docs).map(d=>d.data().data), nationalId: docs[0].data().national_id, payHidden: !shown.length };
}

async function doLogin(){
  // الكود بأرقام عربي أو حروف small بيتحول (نفس اللي بيحصل في بحث المشرف)
  const code = staffCode(document.getElementById('emp-code').value);
  const pass = document.getElementById('emp-pass').value.trim();
  const errEl = document.getElementById('login-error');
  const msgEl = document.getElementById('login-error-msg');
  const btn = document.getElementById('login-btn');
  if(btn.disabled) return;   // Enter مرتين بسرعة مايبدأش دخولين في نفس الوقت
  const fail = (m)=>{ msgEl.textContent = m; errEl.style.display='block'; };
  const resetBtn = ()=>{ btn.innerHTML='دخول <i class="ti ti-arrow-left" style="font-size:16px;vertical-align:-2px;margin-right:4px;"></i>'; btn.disabled=false; };
  errEl.style.display='none';
  if(!code||!pass){ fail('من فضلك ادخل الكود وكلمة المرور'); return; }
  btn.innerHTML='<span class="spinner"></span> جاري التحقق...'; btn.disabled=true;
  try{
    // 1) التحقق من الكود والباسورد على Firebase نفسه
    // لو كلمة المرور فيها أرقام عربي (الرقم القومي من كيبورد عربي) ومنفعتش زي ما هي، نجرّبها بأرقام إنجليزي
    const passEn = pass.replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
    let usedPass = pass;
    try{
      try{ await signInWithEmailAndPassword(auth, code+'@'+EMP_EMAIL_DOMAIN, pass); }
      catch(e1){
        const c1 = e1.code || '';
        if(passEn === pass || c1==='auth/too-many-requests' || c1==='auth/network-request-failed') throw e1;
        await signInWithEmailAndPassword(auth, code+'@'+EMP_EMAIL_DOMAIN, passEn); usedPass = passEn;
      }
    }catch(e){
      const c = e.code || '';
      if(c==='auth/too-many-requests') fail('محاولات غلط كتير — استنى شوية وجرّب تاني');
      else if(c==='auth/network-request-failed') fail('خطأ في الاتصال، حاول تاني');
      else fail('كود الموظف أو كلمة المرور غلط');
      resetBtn(); return;
    }
    // الكود الحقيقي = uid الحساب (مش اللي اتكتب)، عشان لو اتكتب بحروف small الدخول بينجح والـ Rules بتقارن بالـ uid
    const myCode = auth.currentUser.uid;
    // 2) باسورد مؤقت (بعد ريسيت أو حساب جديد): السيرفر حاطط على الحساب علامة pw_temp، والـ Rules قافلة المرتب
    //    والكارنيه لحد ما يغيّره — فبيروح على شاشة تغيير الباسورد على طول من غير ما يقرا حاجة
    let claims = {};
    try{ claims = (await auth.currentUser.getIdTokenResult()).claims || {}; }catch(e){}
    if(claims.pw_temp != null){
      loggedUser = {code: myCode, rows: [], nationalId: null, pwTemp: true, loginPass: usedPass};
      showScreen('set-pass-screen');
      resetBtn(); return;
    }
    // 3) كشف الراتب بتاعه بس
    const mine = await loadMyPayroll(myCode);
    if(!mine){
      await signOut(auth);
      fail('مفيش كشف راتب متسجّل على الكود ده حالياً');
      resetBtn(); return;
    }
    loggedUser = {code: myCode, ...mine};
    const nationalId = mine.nationalId;

    // 4) لو داخل بالرقم القومي (حساب قديم من غير العلامة) — لازم يغيّره
    if(usedPass === nationalId){
      showScreen('set-pass-screen');
    } else {
      await proceedAfterAuth();
    }
  }catch(e){
    console.error('login error:', e);
    fail('خطأ في الاتصال، حاول تاني');
  }
  resetBtn();
}
window.doLogin = doLogin;

// ===== إنشاء باسورد جديد (بعد الدخول بالرقم القومي) =====
async function doSetPass(){
  const p1 = document.getElementById('new-pass1').value.trim();
  const p2 = document.getElementById('new-pass2').value.trim();
  const errEl = document.getElementById('setpass-error');
  const msgEl = document.getElementById('setpass-error-msg');
  const fail = (m)=>{ msgEl.textContent = m; errEl.style.display='block'; };
  errEl.style.display='none';
  if(!p1||!p2){ fail('من فضلك ادخل كلمة المرور وكررها'); return; }
  if(p1.length<6){ fail('كلمة المرور لازم تكون 6 أحرف على الأقل'); return; }
  if(p1!==p2){ fail('كلمة المرور مش متطابقة'); return; }
  if(loggedUser && (p1===loggedUser.nationalId || p1===loggedUser.loginPass)){ fail('متستخدمش الرقم القومي — اختار كلمة مرور تانية'); return; }
  { const w = weakPass(p1, loggedUser?.code); if(w){ fail(w); return; } }
  if(!auth.currentUser){ fail('انتهت الجلسة — اخرج وادخل تاني'); return; }
  const btn = document.getElementById('setpass-btn');
  if(btn.disabled) return;
  const resetSetBtn = ()=>{ btn.innerHTML='حفظ كلمة المرور <i class="ti ti-check" style="font-size:16px;vertical-align:-2px;margin-right:4px;"></i>'; btn.disabled=false; };
  btn.innerHTML='<span class="spinner"></span> جاري الحفظ...'; btn.disabled=true;
  try{
    await updatePassword(auth.currentUser, p1);
    document.getElementById('new-pass1').value='';
    document.getElementById('new-pass2').value='';
    if(loggedUser?.pwTemp){
      // السيرفر بيتأكد إن الرقم القومي بطّل يفتح الحساب ويشيل العلامة، وبعدها المرتب يتفتح
      btn.innerHTML='<span class="spinner"></span> بنفتح حسابك...';
      const r = await waitTask(await createTask('pw_changed', loggedUser.code), null, 90000);
      if(r.status!=='done'){
        await signOut(auth); loggedUser = null; showScreen('login-screen');
        const le = document.getElementById('login-error');
        document.getElementById('login-error-msg').textContent = r.status==='error' && r.message
          ? r.message : 'كلمة المرور الجديدة اتحفظت ✓ — الحساب بيتفتح، ادخل تاني بعد دقايق بكلمة المرور الجديدة.';
        le.style.display='block';
        resetSetBtn(); return;
      }
      await auth.currentUser.getIdToken(true);   // التوكن الجديد من غير العلامة
      const mine = await loadMyPayroll(loggedUser.code);
      if(!mine){ await signOut(auth); loggedUser = null; showScreen('login-screen'); resetSetBtn(); return; }
      loggedUser = {code: loggedUser.code, ...mine};
    }
    await proceedAfterAuth();
  }catch(e){
    console.error('set password error:', e);
    fail(passErrorMsg(e));
  }
  btn.innerHTML='حفظ كلمة المرور <i class="ti ti-check" style="font-size:16px;vertical-align:-2px;margin-right:4px;"></i>'; btn.disabled=false;
}
window.doSetPass = doSetPass;

// ===== تغيير الباسورد =====
async function doChangePass(){
  const p1 = document.getElementById('chg-pass1').value.trim();
  const p2 = document.getElementById('chg-pass2').value.trim();
  const errEl = document.getElementById('chgpass-error');
  const msgEl = document.getElementById('chgpass-error-msg');
  const fail = (m)=>{ msgEl.textContent = m; errEl.style.display='block'; };
  errEl.style.display='none';
  document.getElementById('chgpass-success').style.display='none';
  if(!p1||!p2){ fail('من فضلك ادخل كلمة المرور وكررها'); return; }
  if(p1.length<6){ fail('كلمة المرور لازم تكون 6 أحرف على الأقل'); return; }
  if(p1!==p2){ fail('كلمة المرور مش متطابقة'); return; }
  if(loggedUser && p1===loggedUser.nationalId){ fail('متستخدمش الرقم القومي — اختار كلمة مرور تانية'); return; }
  { const w = weakPass(p1, loggedUser?.code); if(w){ fail(w); return; } }
  if(!auth.currentUser){ fail('انتهت الجلسة — اخرج وادخل تاني'); return; }
  const btn = document.getElementById('chgpass-btn');
  btn.innerHTML='<span class="spinner"></span> جاري الحفظ...'; btn.disabled=true;
  try{
    await updatePassword(auth.currentUser, p1);
    document.getElementById('chgpass-success').style.display='block';
    document.getElementById('chg-pass1').value='';
    document.getElementById('chg-pass2').value='';
  }catch(e){
    console.error('change password error:', e);
    fail(passErrorMsg(e));
  }
  btn.innerHTML='حفظ'; btn.disabled=false;
}
window.doChangePass = doChangePass;

// ===== عرض الراتب (ديناميكي) =====
function renderSalary(src, viewOnly){
  src = src || loggedUser;
  // الملاحظة اللي تحت ممكن تكون اتخبت لعامل قبله على نفس الموبايل (مرتبه خلص وقت عرضه) — ترجع تظهر
  if(!viewOnly) document.getElementById('sv-note').style.display = '';
  // أعمدة الشيت مشتركة مع مراجعة الرفع (SAL_PLUS / SAL_MINUS / SAL_DAYS)
  const PLUS=SAL_PLUS, MINUS=SAL_MINUS, DAYS=SAL_DAYS;
  const BAD=['غياب','جزاء','توقف'];
  const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const get=salGet;
  const num=salNum;
  // نسبة الحافز في الشيت كسر (0.6) → ٦٠٪ ؛ لو مكتوبة رقم أكبر من 1 (60) بتتعرض زي ما هي
  const pct=v=>{const n=num(v); if(!n) return ''; const p=n<=1?n*100:n; return (Number.isInteger(p)?p:+p.toFixed(2)).toLocaleString('ar-EG')+'٪';};
  const clean=v=>{const t=String(v==null?'':v).trim();return (t&&t!=='nan'&&t!=='NaN'&&t!=='undefined')?t:'';};
  const money=v=>num(v).toLocaleString('ar-EG',{minimumFractionDigits:2,maximumFractionDigits:2});
  const count=v=>{const n=num(v);return (Number.isInteger(n)?n:+n.toFixed(2)).toLocaleString('ar-EG');};
  const ar=s=>String(s).replace(/[0-9]/g,d=>'٠١٢٣٤٥٦٧٨٩'[d]);

  const rows = src.rows;
  const r0 = rows[0];
  document.getElementById('emp-name-display').textContent = clean(get(r0,'الاسم'))||'الموظف';
  const info=[src.code];
  ['الوظيفة','نوع الوظيفة','الفرع \\ المصنع','طريقة القبض'].forEach(c=>{const v=clean(get(r0,c));if(v&&!info.includes(v))info.push(v);});
  document.getElementById('emp-meta-display').textContent = info.join('  |  ');

  const container = document.getElementById('months-container');
  container.innerHTML='';

  // مدة ظهور المرتب خلصت: العامل بيشوف اسمه وأزراره بس، ومكان المرتب رسالة
  if(!viewOnly && src.payHidden){
    document.getElementById('sv-note').style.display='none';
    container.innerHTML='<div class="sv-sum sv-first sv-closed"><div class="sv-ic"><i class="ti ti-calendar-check"></i></div><h3>شكراً على تعبك الشهر ده</h3>'
      +'<p>كشف المرتب خلص وقت عرضه.<br>نشوفك على خير مع مرتب الشهر الجاي.</p><small>مرتب الشهر الجاي هيظهر هنا أول ما يتنزل</small></div>'
      +'<div class="sv-acts"><button data-call="openMedicalCard"><i class="ti ti-id"></i>الكارنيه الطبي</button><button data-call="openRequestForm"><i class="ti ti-user"></i>بياناتي</button><button data-call="showScreen" data-args="change-pass-screen"><i class="ti ti-lock"></i>كلمة المرور</button></div>';
    return;
  }

  rows.forEach((row,idx)=>{
    // أي بند مش صفر بيظهر (حتى لو بالسالب — تسوية مثلاً)، والمجاميع من نفس دالة مراجعة الرفع عشان تطابق الصافي
    const plus=PLUS.map(c=>[c,num(get(row,c))]).filter(x=>x[1]!==0);
    const minus=MINUS.map(c=>[c,num(get(row,c))]).filter(x=>x[1]!==0);
    const days=DAYS.map(([c,l])=>[l,num(get(row,c))]).filter(x=>x[1]>0);
    const {P, M}=salTotals(row);
    const net=salNet(row);
    const period=clean(get(row,'فترة القبض'));
    const job=clean(get(row,'الوظيفة'));

    let h='';
    if(idx>0) h+='<p class="sv-sep">كشف '+(idx+1).toLocaleString('ar-EG')+'</p>';
    h+='<div class="sv-sum'+(idx===0?' sv-first':'')+'">';
    if(period) h+='<p class="sv-per">'+esc(ar(period))+'</p>';
    if(rows.length>1&&job) h+='<p class="sv-job">'+esc(job)+'</p>';
    h+='<p class="sv-netl">صافي المرتب</p><p class="sv-net">'+money(net)+'<small>جنيه</small></p>';
    h+='<div class="sv-split"><div><span>المستحقات</span><b>'+money(P)+'</b></div><div class="sv-m"><span>الخصومات</span><b>'+money(M)+'</b></div></div>';
    h+='</div>';
    if(idx===0 && !viewOnly){
      h+='<div class="sv-acts"><button data-call="openMedicalCard"><i class="ti ti-id"></i>الكارنيه الطبي</button><button data-call="openRequestForm"><i class="ti ti-user"></i>بياناتي</button><button data-call="showScreen" data-args="change-pass-screen"><i class="ti ti-lock"></i>كلمة المرور</button></div>';
    }
    if(days.length){
      h+='<div class="sv-sec"><h2>أيام الشهر</h2><div class="sv-chips">';
      days.forEach(([l,v])=>{const bad=BAD.some(b=>l.includes(b));h+='<div class="sv-chip'+(bad?' sv-bad':'')+'"><b>'+count(v)+'</b><span>'+esc(l)+'</span></div>';});
      h+='</div></div>';
    }
    if(plus.length){
      h+='<div class="sv-sec"><h2>المستحقات <span>'+money(P)+'</span></h2>';
      const ip=pct(get(row,'نسبة الحافز'));
      plus.forEach(([l,v])=>{const lbl=(l==='قيمة الحافز'&&ip)?l+' ('+ip+')':l;h+='<div class="sv-li"><span>'+esc(lbl)+'</span><b>'+money(v)+'</b></div>';});
      h+='</div>';
    }
    if(minus.length){
      h+='<div class="sv-sec sv-minus"><h2>الخصومات <span>'+money(M)+'</span></h2>';
      minus.forEach(([l,v])=>{h+='<div class="sv-li"><span>'+esc(l)+'</span><b>'+money(v)+'</b></div>';});
      h+='</div>';
    }
    const wrap=document.createElement('div');
    wrap.innerHTML=h;
    container.appendChild(wrap);
  });
}

// ===== عرض مرتب موظف (الأدمن والمشاهد والمحاسب) — نفس شاشة الموظف بالظبط، من غير أزرار الموظف =====
let staffView = false;
async function lookupSalary(){
  const code = staffCode(document.getElementById('search-sal-code').value);
  const errEl = document.getElementById('search-sal-error');
  const msgEl = document.getElementById('search-sal-error-msg');
  const btn = document.getElementById('search-sal-btn');
  if(btn.disabled) return;   // Enter مرتين بسرعة مايبدأش بحثين
  const fail = m=>{ msgEl.textContent = m; errEl.style.display = 'block'; };
  errEl.style.display = 'none';
  if(!code){ fail('ادخل كود الموظف'); return; }
  btn.disabled = true;
  try{
    const snap = await getDocs(query(collection(db,'payroll'), where('employee_code','==',code)));
    if(snap.empty){ fail('مفيش كشف راتب متسجّل على الكود ده حالياً'); return; }
    // زي شاشة الموظف: أحدث رفعة لكل شركة، وبترتيبها في الشيت
    const docs = latestPerTab(snap.docs);
    staffView = true;
    renderSalary({code, rows: docs.map(d=>d.data().data)}, true);
    document.getElementById('sv-out').textContent = 'رجوع';
    document.getElementById('sv-note').style.display = 'none';
    showScreen('salary-screen');
  }catch(e){
    console.error('salary lookup error:', e);
    fail(e && e.code==='permission-denied' ? 'الحساب ده مالوش صلاحية يشوف المرتبات' : 'خطأ في الاتصال، حاول تاني');
  }finally{ btn.disabled = false; }
}
window.lookupSalary = lookupSalary;

// زرار الشاشة: للموظف = خروج، ولما الإدارة بتتفرج = رجوع للوحة
function svOut(){
  if(!staffView){ doLogout(); return; }
  staffView = false;
  document.getElementById('months-container').innerHTML = '';
  document.getElementById('sv-out').textContent = 'خروج';
  document.getElementById('sv-note').style.display = '';
  showScreen('admin-screen');
}
window.svOut = svOut;

async function doLogout(){
  loggedUser=null;
  reqMandatory=false;
  try{ await signOut(auth); }catch(e){ console.error('logout error:', e); }
  // تنضيف أي بيانات متعرضة (مهم لو الموبايل بيتشارك)
  document.getElementById('months-container').innerHTML='';
  document.getElementById('card-preview').innerHTML='';
  if(currentCardUrl){ URL.revokeObjectURL(currentCardUrl); currentCardUrl=null; }
  showScreen('login-screen');
  ['emp-code','emp-pass'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('login-error').style.display='none';
}
window.doLogout = doLogout;

// ===== عرض الكارنيه الطبي (PDF) على كل الأجهزة =====
// نوع الملف من أول بايتات الملف نفسه (مش من النوع المكتوب في المستند): PDF أو صورة بس.
// أي حاجة تانية (زي صفحة HTML) لو اتفتحت في تاب جديد كانت هتشتغل كأنها جزء من البوابة، فبتتعامل كملف للتحميل بس.
function cardType(stored, b){
  const at = (i, ...v) => v.every((x, k) => b[i + k] === x);
  if(b && b.length > 12){
    if(at(0, 0x25, 0x50, 0x44, 0x46)) return 'application/pdf';                       // %PDF
    if(at(0, 0xFF, 0xD8, 0xFF)) return 'image/jpeg';
    if(at(0, 0x89, 0x50, 0x4E, 0x47)) return 'image/png';
    if(at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return 'image/webp'; // RIFF....WEBP
    if(at(0, 0x47, 0x49, 0x46, 0x38)) return 'image/gif';
  }
  return 'application/octet-stream';
}
// متصفحات الموبايل مش بتعرض PDF جوه iframe (بتطلع زرار تحميل/فتح بس)،
// فبنرسم صفحات الـ PDF صور بـ pdf.js — تظهر على الموبايل والكمبيوتر، والعامل يقدر يضغط عليها مطوّلاً ويحفظها.
const PDFJS_BASE = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/legacy/build/';
let pdfjsReady = null;
function loadPdfJs(){
  if(window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  if(!pdfjsReady) pdfjsReady = new Promise((ok,fail)=>{
    const sc = document.createElement('script');
    sc.src = PDFJS_BASE+'pdf.min.js';
    sc.integrity = 'sha384-OemFRmhjDZwhIKuUld0HJozkF2YErsgDaCL41trxGQZt4/WgnopJQqQl2DvDZ07Z'; sc.crossOrigin = 'anonymous';   // لو الملف على الـ CDN اتغيّر مايشتغلش
    sc.onload = ()=>{ if(!window.pdfjsLib){ fail(new Error('pdf.js')); return; }
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_BASE+'pdf.worker.min.js'; ok(window.pdfjsLib); };
    sc.onerror = ()=>{ pdfjsReady = null; fail(new Error('pdf.js مااتحمّلش')); };
    document.head.appendChild(sc);
  });
  return pdfjsReady;
}
async function renderCardPreview(preview, bytes, type, url){
  if(type.indexOf('pdf') === -1){
    preview.innerHTML = '<img src="'+url+'" style="width:100%;display:block;" alt="البطاقة الطبية"/>';
    return;
  }
  preview.innerHTML = '<p style="text-align:center;color:#6b6b6b;font-size:13px;padding:24px 0;"><span class="spinner" style="border-color:#ccc;border-top-color:#c0392b;"></span> جاري عرض البطاقة...</p>';
  try{
    const lib = await loadPdfJs();
    const pdf = await lib.getDocument({data: bytes.slice(), isEvalSupported: false}).promise;   // isEvalSupported: false = ملف PDF ملغّم مايقدرش يشغّل كود (ثغرة CVE-2024-4367 في pdf.js 3.x)
    const w = Math.max(preview.clientWidth || 360, 300);
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const imgs = [];
    for(let n=1; n<=Math.min(pdf.numPages, 10); n++){
      const page = await pdf.getPage(n);
      const vp0 = page.getViewport({scale:1});
      const vp = page.getViewport({scale: (w*dpr)/vp0.width});
      const cv = document.createElement('canvas');
      cv.width = Math.floor(vp.width); cv.height = Math.floor(vp.height);
      const ctx = cv.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0,0,cv.width,cv.height);
      await page.render({canvasContext: ctx, viewport: vp}).promise;
      imgs.push(cv.toDataURL('image/jpeg', 0.92));
      cv.width = cv.height = 0;
    }
    preview.innerHTML = imgs.map(src=>'<img src="'+src+'" style="width:100%;display:block;background:#fff;" alt="البطاقة الطبية"/>').join('<div style="height:6px;"></div>');
  }catch(e){
    console.error('card render error:', e);
    // لو pdf.js مااشتغلش (نت ضعيف مثلاً) نرجع للطريقة القديمة على الكمبيوتر، ورسالة واضحة على الموبايل
    preview.innerHTML = '<iframe src="'+url+'" style="width:100%;height:420px;border:none;"></iframe>'
      + '<p style="font-size:12px;color:#6b6b6b;padding:8px 10px;">لو البطاقة مش ظاهرة، دوس «تحميل البطاقة» تحت.</p>';
  }
}

// ===== البطاقة الطبية =====
let currentCardUrl = null;
let currentCardType = null;

async function openMedicalCard(){
  showScreen('card-screen');
  // لو البطاقة اتحمّلت قبل كده في نفس الجلسة، نعرضها من غير ما نقراها تاني
  if(currentCardUrl && document.getElementById('card-preview').innerHTML){
    document.getElementById('card-loading').style.display = 'none';
    document.getElementById('card-notfound').style.display = 'none';
    document.getElementById('card-content').style.display = 'block';
    return;
  }
  document.getElementById('card-loading').style.display = 'block';
  document.getElementById('card-notfound').style.display = 'none';
  document.getElementById('card-content').style.display = 'none';
  document.getElementById('card-preview').innerHTML = '';
  currentCardUrl = null;

  const r = loggedUser.rows[0];
  document.getElementById('card-emp-name').textContent = String(salGet(r,'الاسم')||'').trim() + ' — كود ' + loggedUser.code;

  try{
    const snap = await getDoc(doc(db,'medical_cards',loggedUser.code));
    document.getElementById('card-loading').style.display = 'none';

    if(!snap.exists()){
      // نرجّع النص الأصلي (لو اتغير قبل كده لرسالة الخطأ بسبب النت)
      document.querySelector('#card-notfound p').textContent = 'مفيش بطاقة طبية متسجّلة على الكود ده';
      document.getElementById('card-notfound').style.display = 'block';
      return;
    }

    const d = snap.data();
    const b64 = d.data;
    // نحوّل base64 لـ Blob ونعمل رابط مؤقت
    const byteChars = atob(b64);
    const bytes = new Uint8Array(byteChars.length);
    for(let i=0;i<byteChars.length;i++) bytes[i] = byteChars.charCodeAt(i);
    const type = cardType(d.contentType, bytes);
    currentCardType = type;
    const blob = new Blob([bytes], {type});
    currentCardUrl = URL.createObjectURL(blob);

    // معاينة
    const preview = document.getElementById('card-preview');
    document.getElementById('card-content').style.display = 'block';   // نظهر الكارت الأول عشان عرضه يتحسب صح
    await renderCardPreview(preview, bytes, type, currentCardUrl);
  }catch(e){
    document.getElementById('card-loading').style.display = 'none';
    document.getElementById('card-notfound').style.display = 'block';
    document.querySelector('#card-notfound p').textContent = 'حصل خطأ أثناء تحميل البطاقة، حاول تاني';
    console.error('medical card error:', e);
  }
}
window.openMedicalCard = openMedicalCard;

function downloadMedicalCard(){
  if(!currentCardUrl) return;
  const ext = (currentCardType && currentCardType.indexOf('pdf')!==-1) ? 'pdf' : 'jpg';
  const a = document.createElement('a');
  a.href = currentCardUrl;
  a.download = 'البطاقة_الطبية_' + loggedUser.code + '.' + ext;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
window.downloadMedicalCard = downloadMedicalCard;

function openCardNewTab(){
  if(currentCardUrl) window.open(currentCardUrl, '_blank');
}
window.openCardNewTab = openCardNewTab;

// ===== بعد تسجيل الدخول: نتأكد إن البيانات المطلوبة متملّية قبل عرض الشيت =====
async function proceedAfterAuth(){
  try{
    const snap = await getDoc(doc(db,'employee_requests',loggedUser.code));
    const d = snap.exists() ? snap.data() : null;
    loggedUser.request = d; // نحتفظ بيها عشان منقراهاش تاني
    if(!isValidRequest(d)){
      reqMandatory = true;
      await openRequestForm();
      return;
    }
  }catch(e){
    // لو حصل خطأ في القراءة، منقفلش عليه الشيت — نكمّل عادي
    console.error('check request error:', e);
  }
  reqMandatory = false;
  renderSalary();
  showScreen('salary-screen');
}

// ===== البيانات المطلوبة (شيت منفصل) =====
async function openRequestForm(){
  showScreen('request-screen');
  document.getElementById('req-error').style.display = 'none';
  document.getElementById('req-success').style.display = 'none';
  const r = loggedUser.rows[0];
  document.getElementById('req-emp-name').textContent = String(salGet(r,'الاسم')||'').trim() + ' — كود ' + loggedUser.code;

  // وضع إجباري (أول دخول قبل الشيت) مقابل وضع عادي (من داخل الشيت)
  const backBtn = document.getElementById('req-back-btn');
  const infoEl = document.getElementById('req-info-text');
  if(reqMandatory){
    backBtn.innerHTML = '<i class="ti ti-logout" style="font-size:14px;"></i> خروج';
    backBtn.setAttribute('onclick', "doLogout()");
    if(infoEl) infoEl.textContent = 'من فضلك املأ البيانات دي الأول عشان تقدر تشوف شيت راتبك.';
  } else {
    backBtn.innerHTML = '<i class="ti ti-arrow-right" style="font-size:14px;"></i> رجوع للراتب';
    backBtn.setAttribute('onclick', "showScreen('salary-screen')");
    if(infoEl) infoEl.textContent = 'من فضلك اكتب البيانات دي بدقة، هنحتاجها في تجهيز مستلزماتك.';
  }

  // لو الموظف سجّل قبل كده، نجيب بياناته ونعرضها
  try{
    let d;
    if(loggedUser.request !== undefined){
      d = loggedUser.request; // متقرية قبل كده في نفس الجلسة
    } else {
      const snap = await getDoc(doc(db,'employee_requests',loggedUser.code));
      d = snap.exists() ? snap.data() : null;
      loggedUser.request = d;
    }
    if(isValidRequest(d)){
      document.getElementById('req-tshirt').value = d.tshirt;
      document.getElementById('req-shoe').value = d.shoe;
      document.getElementById('req-phone').value = d.phone;
    } else {
      // تسجيل قديم أو مفيش — الخانات تبدأ فاضية
      document.getElementById('req-tshirt').selectedIndex = 0;
      document.getElementById('req-shoe').selectedIndex = 0;
      document.getElementById('req-phone').value = '';
    }
  }catch(e){ console.error('load request error:', e); }
}
window.openRequestForm = openRequestForm;

async function saveRequest(){
  const tshirt = document.getElementById('req-tshirt').value.trim();
  const shoe = document.getElementById('req-shoe').value.trim();
  const phone = document.getElementById('req-phone').value.replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/\s+/g,'');
  const errEl = document.getElementById('req-error');
  const okEl = document.getElementById('req-success');
  const btn = document.getElementById('req-save-btn');
  errEl.style.display = 'none';
  okEl.style.display = 'none';

  if(!tshirt || !shoe || !phone){
    document.getElementById('req-error-msg').textContent = 'من فضلك املأ كل الخانات';
    errEl.style.display = 'block';
    return;
  }
  if(!TSHIRT_SIZES.includes(tshirt) || !SHOE_SIZES.includes(shoe)){
    document.getElementById('req-error-msg').textContent = 'من فضلك اختار المقاس من القائمة';
    errEl.style.display = 'block';
    return;
  }
  if(!/^0\d{10}$/.test(phone)){
    document.getElementById('req-error-msg').textContent = 'رقم تليفون غير صحيح (لازم 11 رقم يبدأ بصفر)';
    errEl.style.display = 'block';
    return;
  }

  btn.disabled = true;
  const oldTxt = btn.innerHTML;   // innerHTML عشان الأيقونة ماتضيعش بعد أول مرة
  btn.textContent = 'جاري الحفظ...';
  try{
    const r = loggedUser.rows[0];
    const reqData = {
      code: loggedUser.code,
      name: String(salGet(r,'الاسم')||'').trim(),
      tshirt, shoe, phone,
      form_v: REQ_FORM_VERSION,
      updated_at: new Date().toISOString()
    };
    await setDoc(doc(db,'employee_requests',loggedUser.code), reqData);
    loggedUser.request = reqData;
    okEl.style.display = 'block';
    if(reqMandatory){
      reqMandatory = false;
      renderSalary();
      showScreen('salary-screen');
    }
  }catch(e){
    document.getElementById('req-error-msg').textContent = 'حصل خطأ أثناء الحفظ، حاول تاني';
    errEl.style.display = 'block';
    console.error('save request error:', e);
  }finally{
    btn.disabled = false;
    btn.innerHTML = oldTxt;
  }
}
window.saveRequest = saveRequest;

// ===== تصدير بيانات الموظفين المطلوبة (للأدمن) =====
async function exportRequests(){
  const errEl = document.getElementById('req-export-error');
  const countEl = document.getElementById('req-export-count');
  const btn = document.getElementById('req-export-btn');
  errEl.style.display = 'none';
  btn.disabled = true;
  const oldTxt = btn.innerHTML;   // innerHTML عشان الأيقونة ماتضيعش بعد أول مرة
  btn.textContent = 'جاري التحميل...';
  try{
    const snap = await getDocs(collection(db,'employee_requests'));
    const rows = [];
    let oldCount = 0;
    snap.forEach(docSnap=>{
      const d = docSnap.data();
      if(!isValidRequest(d)){ oldCount++; return; }
      rows.push({
        'كود الموظف': d.code || docSnap.id,
        'الاسم': d.name || '',
        'مقاس التيشرت': d.tshirt || '',
        'مقاس الحذاء': d.shoe || '',
        'رقم التليفون': d.phone || '',
        'آخر تحديث': d.updated_at ? new Date(d.updated_at).toLocaleString('ar-EG') : ''
      });
    });

    if(rows.length === 0){
      document.getElementById('req-export-error-msg').textContent = 'مفيش أي بيانات متسجّلة بالفورم الجديد لسه';
      errEl.style.display = 'block';
      return;
    }

    const XLSX = await loadXlsx();
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'بيانات الموظفين');
    const d0 = new Date(), today = d0.getFullYear()+'-'+String(d0.getMonth()+1).padStart(2,'0')+'-'+String(d0.getDate()).padStart(2,'0');   // تاريخ مصر (مش UTC)
    XLSX.writeFile(wb, 'بيانات_الموظفين_المطلوبة_' + today + '.xlsx');
    countEl.textContent = 'تم تحميل ' + rows.length + ' موظف.' + (oldCount ? ' (' + oldCount + ' تسجيل قديم مش متحسب)' : '');
  }catch(e){
    document.getElementById('req-export-error-msg').textContent = 'حصل خطأ أثناء التحميل، حاول تاني';
    errEl.style.display = 'block';
    console.error('export requests error:', e);
  }finally{
    btn.disabled = false;
    btn.innerHTML = oldTxt;
  }
}
window.exportRequests = exportRequests;

// ===== بحث عن كارنيه طبي (أدمن + مشرف) =====
let adminCardUrl = null;
let adminCardType = null;
let adminCardCode = '';
// الرقم القومى ← الكود: الأدمن من فهرس الأرقام القومية (employee_index/nids)،
// والباقيين من كشوف المواقع اللي حسابهم يقدر يقراها (نفس الـ Rules — من غير أي تعديل فيها)
const SHARQIA_ROSTER = 'الشرقية للدخان';
let cardRosters = null;   // {رقم قومى: كود} — بيتحمّل مرة واحدة لكل دخول
async function codeFromNid(nid){
  const claims = (await auth.currentUser.getIdTokenResult()).claims || {};
  const role = claims.role, sites = Array.isArray(claims.sites) && claims.sites.length ? claims.sites : null;
  if(role === 'admin'){
    try{ const s = await getDoc(doc(db,'employee_index','nids')); const c = s.exists() ? (s.data().map||{})[nid] : ''; if(c) return String(c); }
    catch(e){ console.warn('nids index:', e); }
  }
  if(!cardRosters || cardRosters.uid !== auth.currentUser.uid){
    let list;
    if(role === 'supervisor') list = sites || [SHARQIA_ROSTER];          // مشرف بمواقع، أو حساب الشرقية المشترك
    else list = sites || [...SUP_SITES, SHARQIA_ROSTER];                 // أدمن / HR / مشاهد
    const map = {};
    await Promise.all(list.map(async site=>{
      try{ const r = await getDoc(doc(db,'rosters',site)); (r.exists() ? r.data().workers||[] : []).forEach(w=>{ if(w.nid && w.code) map[String(w.nid)] = String(w.code); }); }
      catch(e){}   // موقع مش مسموح للحساب ده — نعدّيه
    }));
    cardRosters = { uid: auth.currentUser.uid, map };
  }
  return cardRosters.map[nid] || '';
}
async function searchMedicalCard(){
  const raw = staffCode(document.getElementById('search-card-code').value);
  const isNid = /^[23]\d{13}$/.test(raw);
  let codes = isNid ? [] : staffCodes(raw), code = codes[0];
  const errEl = document.getElementById('search-card-error');
  const loading = document.getElementById('search-card-loading');
  const result = document.getElementById('search-card-result');
  errEl.style.display = 'none';
  result.style.display = 'none';
  if(!isNid && !code){
    document.getElementById('search-card-error-msg').textContent = 'ادخل كود الموظف أو الرقم القومى';
    errEl.style.display = 'block';
    return;
  }
  loading.style.display = 'block';
  if(isNid){
    try{ code = await codeFromNid(raw); }catch(e){ code = ''; console.error('nid lookup:', e); }
    if(!code){
      loading.style.display = 'none';
      document.getElementById('search-card-error-msg').textContent = 'الرقم القومى ده مش موجود في كشوف العمال المسموحلك بيهم — جرّب بالكود';
      errEl.style.display = 'block';
      return;
    }
    codes = [code];
  }
  if(adminCardUrl){ URL.revokeObjectURL(adminCardUrl); adminCardUrl = null; }
  adminCardCode = '';
  try{
    // نجرب الكود زي ما اتكتب الأول. لو مسموح بيه بنقف عنده (موجود أو لأ) — الـ T بنجربها بس لو الأول اترفض
    let snap = null, denied = null;
    for(const c of codes){
      try{ const s = await getDoc(doc(db,'medical_cards',c)); denied = null; if(s.exists()){ snap = s; adminCardCode = c; } break; }
      catch(e){ if(e && e.code==='permission-denied'){ denied = e; continue; } throw e; }
    }
    if(!snap && denied) throw denied;
    loading.style.display = 'none';
    if(!snap){
      document.getElementById('search-card-error-msg').textContent = 'مفيش كارنيه مسجّل للكود ده';
      errEl.style.display = 'block';
      return;
    }
    const d = snap.data();
    const byteChars = atob(d.data);
    const bytes = new Uint8Array(byteChars.length);
    for(let i=0;i<byteChars.length;i++) bytes[i] = byteChars.charCodeAt(i);
    const type = cardType(d.contentType, bytes);
    adminCardType = type;
    const blob = new Blob([bytes], {type});
    adminCardUrl = URL.createObjectURL(blob);
    const preview = document.getElementById('search-card-preview');
    result.style.display = 'block';
    await renderCardPreview(preview, bytes, type, adminCardUrl);
  }catch(e){
    loading.style.display = 'none';
    document.getElementById('search-card-error-msg').textContent = (e && e.code==='permission-denied') ? 'الكارنيه ده لعامل مش ضمن العمال المسموحلك بيهم' : 'حصل خطأ أثناء التحميل، حاول تاني';
    errEl.style.display = 'block';
    console.error('search card error:', e);
  }
}
window.searchMedicalCard = searchMedicalCard;

function openAdminCardNewTab(){
  if(adminCardUrl) window.open(adminCardUrl, '_blank');
}
window.openAdminCardNewTab = openAdminCardNewTab;

function downloadAdminCard(){
  if(!adminCardUrl) return;
  const ext = (adminCardType && adminCardType.indexOf('pdf') !== -1) ? 'pdf' : 'jpg';
  const code = adminCardCode || 'card';
  const a = document.createElement('a');
  a.href = adminCardUrl;
  a.download = 'card_' + code + '.' + ext;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
window.downloadAdminCard = downloadAdminCard;


// Enter keys
// Enter في كلمة المرور = «دخول» (الفورم بيدوس الزرار لوحده)
document.getElementById('emp-code').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();document.getElementById('emp-pass').focus();}});
document.getElementById('new-pass2').addEventListener('keydown',e=>{if(e.key==='Enter')doSetPass();});
document.getElementById('search-sal-code').addEventListener('keydown',e=>{if(e.key==='Enter')lookupSalary();});
// الصفحة خلصت تحميل: نشيل رسالة «لحظة» لو لسه ظاهرة
document.getElementById('boot-toast')?.remove();
