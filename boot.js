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
  function run(el, name, e) {
    if (el.tagName === "A") e.preventDefault();   // روابط href="#": من غير ما الصفحة تنط لفوق
    var fn = window[name];
    if (typeof fn !== "function") { e.preventDefault(); toast(); return; }
    fn.apply(null, args(el));
  }
  document.addEventListener("click", function (e) {
    var el = e.target.closest && e.target.closest("[data-call]");
    if (el) run(el, el.getAttribute("data-call"), e);
  });
  document.addEventListener("change", function (e) {
    var el = e.target.closest && e.target.closest("[data-change]");
    if (el) run(el, el.getAttribute("data-change"), e);
  });
})();
