// boot.js — أزرار البوابة (index.html) من غير onclick جوه الـ HTML (عشان الـ CSP تمنع أي سكريبت مكتوب جوه الصفحة).
// الزرار بيتكتب: <button data-call="doLogin">  أو بمعطيات: <button data-call="toggleField" data-args="emp-pass,eye1">
// وللخانات: <input data-change="resetPayReview">
// الدالة لازم تبقى على window (سكريبت الصفحة بيحطها: window.doLogin = doLogin).
// الأزرار بتنادي دوال من سكريبت الصفحة، وده بيستنى مكتبات Firebase تتحمّل من النت.
// لو حد داس قبل ما يخلص تحميل (نت ضعيف)، بدل ما الزرار مايعملش حاجة بتظهر رسالة «لحظة».
(function () {
  function args(el) {
    var a = el.getAttribute("data-args");
    if (a == null || a === "") return [];
    return a.split(",").map(function (x) { return x === "true" ? true : x === "false" ? false : x; });
  }
  function toast() {
    var t = document.getElementById("boot-toast");
    if (!t) {
      t = document.createElement("div"); t.id = "boot-toast";
      t.style.cssText = "position:fixed;bottom:18px;left:50%;transform:translateX(-50%);background:#222;color:#fff;padding:10px 16px;border-radius:10px;font-size:13px;z-index:9999;max-width:90vw;text-align:center;";
      document.body.appendChild(t);
    }
    var slow = performance.now() > 15000;
    t.textContent = slow ? "الصفحة ماخلصتش تحميل — النت ضعيف. اعمل تحديث للصفحة وجرّب تاني." : "لحظة، الصفحة لسه بتحمّل...";
    clearTimeout(t._h); t._h = setTimeout(function () { t.remove(); }, 3000);
  }
  // الدوال اللى الزراير تقدر تناديها بس (ك8): من غيرها أى HTML يتزرع في الصفحة كان يقدر ينادى أى دالة على window
  // (open، fetch، …). زرار جديد في index.html: ضيف اسم دالته هنا، وصفحة index بتحطها على window زى ما هى.
  var CALLS = ["showScreen", "toggleField", "checkAdminPass", "adminLogout", "resetPayReview", "reviewSheet", "extendPayVis",
    "uploadSheet", "confirmClear", "resetEmployeePass", "runSync", "doLogin", "doSetPass", "doChangePass", "lookupSalary", "svOut",
    "doLogout", "openMedicalCard", "downloadMedicalCard", "openCardNewTab", "openRequestForm", "saveRequest", "exportRequests",
    "searchMedicalCard", "openAdminCardNewTab", "downloadAdminCard"];
  function run(el, name, e) {
    if (el.tagName === "A") e.preventDefault();   // روابط href="#": من غير ما الصفحة تنط لفوق
    if (CALLS.indexOf(name) < 0) { e.preventDefault(); console.warn("boot.js: data-call مش في القايمة:", name); return; }
    var fn = window[name];
    if (typeof fn !== "function") { e.preventDefault(); toast(); return; }
    fn.apply(null, args(el));
  }
  document.addEventListener("click", function (e) {
    var el = e.target.closest && e.target.closest("[data-call]");
    if (el) run(el, el.getAttribute("data-call"), e);
  });
  // فورم الدخول: Enter أو «دخول» بيدوس الزرار (data-call) — الفورم نفسه مايبعتش ولا يعمل تحديث للصفحة.
  // فورم الرسايل (dialog.tdlg في shared.js — method="dialog") لازم يتساب: منع الـ submit بتاعه كان بيخلّى زراير الرسالة
  // («تمام» / «إلغاء») ماتقفلهاش في الصفحة دى، فأى تأكيد (مسح الكشوف، تمديد الظهور، رفع بتنبيهات) كان بيقف.
  document.addEventListener("submit", function (e) {
    if (e.target && e.target.getAttribute && e.target.getAttribute("method") === "dialog") return;
    e.preventDefault();
  });
  document.addEventListener("change", function (e) {
    var el = e.target.closest && e.target.closest("[data-change]");
    if (el) run(el, el.getAttribute("data-change"), e);
  });
})();
