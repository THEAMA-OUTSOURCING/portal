// attendance-ui.js — تصميم الموبايل في صفحة الحضور (اتنقل من جوه الصفحة عشان الـ CSP)
// ===== تصميم الموبايل — المرحلة ١: الخطوات والفلتر والملخصات =====
// بيقرا من الصفحة بس (اللي الكود الأصلي بيرسمه) ومش بيغيّر أي بيانات أو قرارات.
(() => {
  const $ = id => document.getElementById(id);
  const ar = n => Number(n || 0).toLocaleString("ar-EG");
  const num = t => Number(String(t || "").replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d)).replace(/[^\d]/g, "")) || 0;
  const visible = el => el && !el.classList.contains("hidden");
  const watch = (el, fn, opts) => { if (!el) return; new MutationObserver(fn).observe(el, opts || { childList: true }); fn(); };

  // --- الخطوات ---
  function steps() {
    const box = $("steps");
    const photo = visible($("upload-card")) && visible($("app"));
    box.classList.toggle("hidden", !photo);
    if (!photo) return;
    const hasPages = $("pages").children.length > 0;
    const confirmed = $("day-state").classList.contains("ok") && $("day-state").classList.contains("show");
    const review = visible($("review"));
    const s1 = hasPages ? "done" : "now";
    const s2 = confirmed ? "done" : review ? "now" : "";
    const s3 = confirmed ? "done" : "";
    const st = (cls, n, t) => `<span class="st ${cls}"><i>${cls === "done" ? "✓" : n}</i>${t}</span>`;
    box.innerHTML = st(s1, "١", "صوّر") + `<span class="ln ${hasPages ? "done" : ""}"></span>` +
      st(s2, "٢", "راجع") + `<span class="ln ${confirmed ? "done" : ""}"></span>` + st(s3, "٣", "أكّد");
  }
  watch($("pages"), steps);
  watch($("day-state"), steps, { attributes: true, attributeFilter: ["class"] });
  watch($("review"), steps, { attributes: true, attributeFilter: ["class"] });
  watch($("upload-card"), () => {
    steps();
    // مواقع الإكسيل والمكتب: الكشف هو الشغل الأساسي، فـ«إدارة الكشف» تفضل مفتوحة
    if (!visible($("upload-card"))) $("manage-card").open = true;
  }, { attributes: true, attributeFilter: ["class"] });
  watch($("app"), steps, { attributes: true, attributeFilter: ["class"] });

  // --- فلتر العمال ---
  let F = "all";
  const isAbs = w => !!w.querySelector('.seg button.a[aria-pressed="true"]');
  const match = w => F === "all" || (F === "flag" && w.classList.contains("flag")) ||
    (F === "abs" && isAbs(w)) || (F === "miss" && w.classList.contains("missing"));
  function filter() {
    const box = $("workers"), rows = [...box.querySelectorAll(":scope > .w")];
    const c = { all: rows.length, flag: 0, abs: 0, miss: 0 };
    rows.forEach(w => { if (w.classList.contains("flag")) c.flag++; if (isAbs(w)) c.abs++; if (w.classList.contains("missing")) c.miss++; });
    if (F !== "all" && !c[F]) F = "all";
    const bar = $("fbar");
    bar.classList.toggle("hidden", rows.length < 6 || (!c.flag && !c.abs && !c.miss));
    bar.innerHTML = [["all", "الكل"], ["flag", "راجعهم"], ["abs", "غايب"], ["miss", "مش في الصور"]]
      .filter(([k]) => k === "all" || c[k])
      .map(([k, t]) => `<button type="button" data-f="${k}" class="${k === "flag" ? "fw" : ""}" aria-pressed="${F === k}">${t} ${ar(c[k])}</button>`).join("");
    let shown = 0, grp = null, grpShown = 0;
    const closeGrp = () => { if (grp) grp.classList.toggle("f-off", F !== "all" && !grpShown); };
    [...box.children].forEach(el => {
      if (el.classList.contains("grp")) { closeGrp(); grp = el; grpShown = 0; return; }
      if (el.classList.contains("w")) { const ok = match(el); el.classList.toggle("f-off", !ok); if (ok) { shown++; grpShown++; } return; }
      // البديل بيتبع صف الغايب اللي قبله
      const prev = el.previousElementSibling;
      el.classList.toggle("f-off", !!prev && prev.classList.contains("f-off"));
    });
    closeGrp();
    $("f-empty").classList.toggle("hidden", !rows.length || shown > 0);
  }
  $("fbar").addEventListener("click", e => {
    const b = e.target.closest("button[data-f]"); if (!b) return;
    F = b.dataset.f; filter();
    $("workers").closest(".card").scrollIntoView({ block: "start", behavior: "smooth" });
  });
  watch($("workers"), filter);

  // --- ملخص العدد المطلوب ---
  watch($("plan-box"), () => {
    const box = $("plan-box"), card = $("plan-card");
    const over = box.querySelectorAll(".pill.p-err").length, short = box.querySelectorAll(".pill.p-grey").length;
    const hasTable = !!box.querySelector("table");
    card.classList.toggle("warn", over > 0 || short > 0);
    $("plan-sum").textContent = !hasTable ? "مفيش عدد مطلوب متسجل للموقع ده"
      : over || short ? [over ? `زيادة في ${ar(over)} وظيفة` : "", short ? `ناقص في ${ar(short)} وظيفة` : ""].filter(Boolean).join(" · ") + " — دوس تشوف التفاصيل"
      : "مطابق ✓";
    if (over) card.open = true;   // الزيادة بتوقف التأكيد، فلازم تبان
  });

  // --- السطر اللي فوق زرار التأكيد ---
  watch($("stats"), () => {
    const get = l => { const s = [...$("stats").querySelectorAll(".stat")].find(x => x.querySelector(".l")?.textContent.trim() === l); return s ? num(s.querySelector(".v").textContent) : null; };
    const p = get("حاضر"), a = get("غايب"), q = get("توقف"), o = get("محتاج قرار");
    const el = $("c-sum");
    el.classList.toggle("hidden", p == null);
    if (p == null) return;
    el.innerHTML = `<b>${ar(p)}</b> حاضر · <b>${ar(a)}</b> غايب` + (q ? ` · <b>${ar(q)}</b> توقف` : "") + (o ? ` · <span style="color:#8a5a10">${ar(o)} محتاج قرار</span>` : "");
  });

  // --- عدد الطلبات المستنية على مربع الطلبات ---
  watch($("lv-list"), () => {
    let n = 0;
    $("lv-list").querySelectorAll('details[data-lvg="pending"],details[data-lvg="client_wait"]').forEach(g => n += num(g.querySelector("summary .pill")?.textContent));
    const b = $("lv-badge");
    b.classList.toggle("hidden", !n);
    b.textContent = `${ar(n)} مستني${n > 1 ? "ين" : ""}`;
  });
  // رسالة الطلب (اتبعت/غلط) أو قايمة شيل الاسم: المربع يتفتح عشان تبان
  watch($("lv-msg"), () => { if ($("lv-msg").classList.contains("show")) $("lv-card").open = true; }, { attributes: true, attributeFilter: ["class"] });
  watch($("m-msg"), () => { if ($("m-msg").classList.contains("show")) $("manage-card").open = true; }, { attributes: true, attributeFilter: ["class"] });
})();
