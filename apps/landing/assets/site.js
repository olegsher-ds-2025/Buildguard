(function () {
  "use strict";
  var d = document, root = d.documentElement;
  root.classList.add("js");
  var $ = function (s, c) { return (c || d).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || d).querySelectorAll(s)); };
  var T0 = Date.now();

  /* header state */
  var head = $(".site-head");
  var onScroll = function () { head.classList.toggle("scrolled", window.scrollY > 8); };
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  /* mobile menu with focus trap */
  var menu = $("[data-menu]"), openBtn = $("[data-menu-open]"), closeBtn = $("[data-menu-close]");
  function focusables() { return $$("a[href],button:not([disabled])", menu); }
  function setMenu(open) {
    menu.classList.toggle("open", open);
    openBtn.setAttribute("aria-expanded", String(open));
    d.body.classList.toggle("lock", open);
    if (open) closeBtn.focus(); else openBtn.focus();
  }
  openBtn.addEventListener("click", function () { setMenu(true); });
  closeBtn.addEventListener("click", function () { setMenu(false); });
  menu.addEventListener("click", function (e) {
    if (e.target.closest("a")) { menu.classList.remove("open"); openBtn.setAttribute("aria-expanded", "false"); d.body.classList.remove("lock"); }
  });
  d.addEventListener("keydown", function (e) {
    if (!menu.classList.contains("open")) return;
    if (e.key === "Escape") { setMenu(false); return; }
    if (e.key !== "Tab") return;
    var f = focusables(), first = f[0], last = f[f.length - 1];
    if (e.shiftKey && d.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && d.activeElement === last) { e.preventDefault(); first.focus(); }
  });
  window.matchMedia("(min-width:1000px)").addEventListener("change", function (m) {
    if (m.matches && menu.classList.contains("open")) { menu.classList.remove("open"); d.body.classList.remove("lock"); }
  });

  /* personas: tabs on desktop, accordion on mobile (same disclosure markup) */
  var btns = $$(".p-btn");
  if (btns.length) {
  var wide = window.matchMedia("(min-width:900px)");
  function openPersona(btn, toggle) {
    var willOpen = toggle && !wide.matches ? btn.getAttribute("aria-expanded") !== "true" : true;
    btns.forEach(function (b) {
      var on = b === btn && willOpen;
      b.setAttribute("aria-expanded", String(on));
      $("#" + b.getAttribute("aria-controls")).hidden = !on;
    });
  }
  btns.forEach(function (b) { b.addEventListener("click", function () { openPersona(b, true); }); });
  openPersona(btns[0], false);
  }

  /* reveal on scroll */
  var rev = $$(".reveal");
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
    }, { rootMargin: "0px 0px -8% 0px" });
    rev.forEach(function (r) { io.observe(r); });
  } else rev.forEach(function (r) { r.classList.add("in"); });

  /* offline demo */
  var sync = $("[data-sync]"), syncBtn = $("[data-sync-toggle]");
  if (sync && syncBtn) syncBtn.addEventListener("click", function () {
    var on = sync.classList.toggle("online");
    syncBtn.setAttribute("aria-pressed", String(on));
    syncBtn.textContent = on ? "הדגמה: ניתוק החיבור" : "הדגמה: החיבור חוזר";
  });

  /* contact topic presets */
  var topicSel = $("#c-topic");
  function setTopic(t) { if (t && topicSel && topicSel.querySelector('option[value="' + t + '"]')) topicSel.value = t; }
  $$("[data-topic]").forEach(function (a) { a.addEventListener("click", function () { setTopic(a.dataset.topic); }); });
  function fromHash() {
    var m = /^#contact\?topic=([\w-]+)/.exec(location.hash);
    if (m && $("#contact")) { setTopic(m[1]); $("#contact").scrollIntoView(); }
  }
  fromHash();
  window.addEventListener("hashchange", fromHash);

  /* sticky mobile CTA: shown until the form is on screen */
  var mcta = $(".m-cta"), formAnchor = $("#register");
  if (mcta && formAnchor && "IntersectionObserver" in window) {
    d.body.classList.add("has-mcta");
    new IntersectionObserver(function (es) {
      mcta.classList.toggle("show", !es[0].isIntersecting && es[0].boundingClientRect.top < 0);
    }).observe(formAnchor);
  }

  /* forms */
  var MSG = {
    required: "שדה חובה",
    name: "יש להזין שם מלא",
    phone: "מספר טלפון לא תקין, למשל 050-1234567",
    email: "כתובת דוא״ל לא תקינה",
    role: "יש לבחור תפקיד",
    projectCount: "יש להזין מספר שלם בין 0 ל-1000",
    message: "ההודעה צריכה להכיל בין 10 ל-2000 תווים",
    privacyConsent: "יש לאשר את מדיניות הפרטיות",
    contactVia: "יש למלא טלפון או דוא״ל",
    fallback: "ערך לא תקין"
  };
  var PHONE = /^(?:\+?972|0)(?:5\d|[23489]|7\d)\d{7}$/;
  var EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function check(kind, f, name, v) {
    var val = (v || "").trim();
    switch (name) {
      case "name": return val.length < 2 ? MSG.name : "";
      case "phone":
        if (kind === "contact") {
          if (!val) return f.elements.email.value.trim() ? "" : MSG.contactVia;
        } else if (!val) return MSG.required;
        return PHONE.test(val.replace(/[\s\-()]/g, "")) ? "" : MSG.phone;
      case "email":
        if (kind === "contact" && !val) return f.elements.phone.value.trim() ? "" : MSG.contactVia;
        if (!val) return MSG.required;
        return EMAIL.test(val) ? "" : MSG.email;
      case "role": return val ? "" : MSG.role;
      case "projectCount": return val && !/^\d{1,4}$/.test(val) ? MSG.projectCount : "";
      case "message":
        if (kind === "contact") return val.length < 10 || val.length > 2000 ? MSG.message : "";
        return val.length > 2000 ? MSG.message : "";
      case "privacyConsent": return f.elements.privacyConsent.checked ? "" : MSG.privacyConsent;
    }
    return "";
  }

  function setError(el, msg) {
    var box = el.closest(".field"), out = $("#" + el.id + "-e");
    if (!out) return;
    out.textContent = msg;
    box.classList.toggle("bad", !!msg);
    if (msg) { el.setAttribute("aria-invalid", "true"); el.setAttribute("aria-describedby", out.id); }
    else { el.removeAttribute("aria-invalid"); el.removeAttribute("aria-describedby"); }
  }

  function labelOf(el) {
    if (el.dataset.label) return el.dataset.label;
    var l = $("label[for='" + el.id + "']");
    return l ? l.textContent.replace("*", "").trim() : el.name;
  }

  function el(tag, text, cls) {
    var n = d.createElement(tag);
    if (text) n.textContent = text;
    if (cls) n.className = cls;
    return n;
  }

  function utm() {
    var o = {}, p = new URLSearchParams(location.search), has = false;
    ["source", "medium", "campaign", "term", "content"].forEach(function (k) {
      var v = p.get("utm_" + k);
      if (v) { o[k] = v.slice(0, 120); has = true; }
    });
    try {
      if (has) sessionStorage.setItem("utm", JSON.stringify(o));
      else o = JSON.parse(sessionStorage.getItem("utm") || "{}");
    } catch (e) { /* storage unavailable */ }
    return o;
  }

  $$("form[data-kind]").forEach(function (f) {
    var kind = f.dataset.kind, box = f.closest("[data-form-box]");
    var summary = $("[data-summary]", box), status = $("[data-status]", box), ok = $("[data-success]", box);
    var submit = $("[data-submit]", f);
    f.elements.t0.value = String(T0);

    function fields() {
      return $$("input,select,textarea", f).filter(function (x) { return x.name && x.type !== "hidden" && x.name !== "website" && $("#" + x.id + "-e"); });
    }
    function validateAll() {
      var bad = [];
      fields().forEach(function (x) {
        var m = check(kind, f, x.name, x.type === "checkbox" ? "" : x.value);
        setError(x, m);
        if (m) bad.push({ el: x, msg: m });
      });
      return bad;
    }
    function showSummary(bad) {
      summary.textContent = "";
      summary.appendChild(el("h3", "יש לתקן " + (bad.length === 1 ? "שדה אחד" : bad.length + " שדות")));
      var ul = el("ul");
      bad.forEach(function (b) {
        var li = el("li"), a = el("a", labelOf(b.el) + ": " + b.msg);
        a.href = "#" + b.el.id;
        a.addEventListener("click", function (e) { e.preventDefault(); b.el.focus(); });
        li.appendChild(a); ul.appendChild(li);
      });
      summary.appendChild(ul);
      summary.hidden = false;
      summary.focus();
    }
    function showStatus(title, text) {
      status.textContent = "";
      status.appendChild(el("h3", title));
      status.appendChild(el("p", text));
      var wa = $("a[href^='https://wa.me']");
      if (wa) {
        var p = el("p"), a = el("a", "לכתוב לנו בוואטסאפ");
        a.href = wa.href; a.rel = "noopener";
        p.appendChild(a); status.appendChild(p);
      }
      status.hidden = false;
      status.focus();
    }

    f.addEventListener("focusout", function (e) {
      var x = e.target;
      if (!x.name || !$("#" + x.id + "-e") || (x.type !== "checkbox" && !x.value && !x.closest(".bad"))) return;
      setError(x, check(kind, f, x.name, x.type === "checkbox" ? "" : x.value));
    });
    f.addEventListener("input", function (e) {
      var x = e.target;
      if (x.closest && x.closest(".bad")) setError(x, check(kind, f, x.name, x.type === "checkbox" ? "" : x.value));
    });

    f.addEventListener("submit", function (e) {
      e.preventDefault();
      summary.hidden = true; status.hidden = true;
      var bad = validateAll();
      if (bad.length) { showSummary(bad); return; }
      if (navigator.onLine === false) {
        showStatus("אין חיבור לאינטרנט", "הטופס לא נשלח. אפשר לנסות שוב כשהחיבור יחזור, או לפנות אלינו ישירות.");
        return;
      }
      var body = { t0: T0, referrer: d.referrer.slice(0, 300), utm: utm() };
      $$("input,select,textarea", f).forEach(function (x) {
        if (!x.name || x.name === "t0") return;
        if (x.type === "radio") { if (x.checked) body[x.name] = x.value; }
        else if (x.type === "checkbox" && "multi" in x.dataset) { body[x.name] = body[x.name] || []; if (x.checked) body[x.name].push(x.value); }
        else if (x.type === "checkbox") body[x.name] = x.checked;
        else if (x.name === "projectCount") { if (x.value) body[x.name] = Number(x.value); }
        else if (x.name === "website") body[x.name] = x.value;
        else if (x.value.trim()) body[x.name] = x.value.trim();
      });
      submit.disabled = true;
      var label = submit.textContent;
      submit.textContent = "שולח…";
      fetch(f.dataset.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        credentials: "omit",
        body: JSON.stringify(body)
      }).then(function (r) {
        if (r.status === 201 || r.status === 200) {
          f.hidden = true; ok.hidden = false; ok.focus();
          return;
        }
        if (r.status === 400) {
          return r.json().then(function (j) {
            var errs = (j && j.errors) || {}, list = [];
            Object.keys(errs).forEach(function (k) {
              var x = f.elements[k];
              if (!x || !$("#" + x.id + "-e")) return;
              var code = errs[k], m = code === "required" ? MSG.required : (MSG[k] || MSG.fallback);
              setError(x, m); list.push({ el: x, msg: m });
            });
            if (list.length) showSummary(list);
            else showStatus("לא הצלחנו לשלוח", "הנתונים לא התקבלו. נא לבדוק את הפרטים ולנסות שוב.");
          });
        }
        if (r.status === 429) showStatus("יותר מדי ניסיונות", "נשלחו הרבה בקשות בזמן קצר. נא לנסות שוב בעוד כמה דקות.");
        else showStatus("משהו השתבש אצלנו", "השליחה נכשלה. נסו שוב בעוד רגע, או פנו אלינו ישירות.");
      }).catch(function () {
        showStatus("אין חיבור לשרת", "הטופס לא נשלח. בדקו את החיבור ונסו שוב, או פנו אלינו ישירות.");
      }).then(function () {
        submit.disabled = false; submit.textContent = label;
      });
    });
  });
})();
