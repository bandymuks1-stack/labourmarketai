/* ============================================================================
   LabourMarket.ai R6 — one controller for the whole prototype.

   Responsibilities:
     · the living ground (WebGL world + film plates) behind the paper
     · act navigation state
     · the film engine for Act VI (scroll inside its span drives the camera)
     · scene plates for act openers
     · reveal-on-intersection for paper sheets
     · the deterministic R&D demo state machine (journal → capability →
       opportunity causality; capacity → inquiry → discovery)

   Motion law unchanged: transform + opacity only, scroll is the clock.
   Reduced motion: no camera, no reveals, everything readable in order.
   ========================================================================= */
(function () {
  "use strict";

  var reduce =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var IMG = window.R6_IMG || {};

  /* ── image slots (journal photos etc.) ─────────────────────────────── */
  document.querySelectorAll("img[data-img]").forEach(function (el) {
    var src = IMG[el.dataset.img];
    if (src) el.src = src;
    else el.remove();
  });

  /* ── the ground: world canvas + plates ─────────────────────────────── */
  var ground = document.getElementById("ground");
  var canvas = document.getElementById("worldCanvas");
  /* The world is created even under reduced motion: one static frame is not
     motion, and without it the entry loses its ground. Only the scroll-driven
     camera is disabled. */
  var world = null;
  if (window.R5World && window.R5_GEO && window.R5_DATA) {
    var counts = {};
    window.R5_DATA.topCities.forEach(function (c) { counts[c.name] = c.n; });
    var activity = window.R5_GEO.cities
      .filter(function (c) { return counts[c.name]; })
      .map(function (c) {
        return { name: c.name, lat: c.lat, lng: c.lng, count: counts[c.name] };
      });
    world = window.R5World.create(canvas, window.R5_GEO, activity);
  }
  if (!world) canvas.style.display = "none";

  /** every distinct plate used by scenes or film beats, created once */
  var plateEls = {};
  function ensurePlate(key) {
    if (plateEls[key] || !IMG[key]) return plateEls[key];
    var d = document.createElement("div");
    d.className = "film-plate";
    var img = document.createElement("img");
    img.src = IMG[key];
    img.alt = "";
    img.decoding = "async";
    d.appendChild(img);
    ground.appendChild(d);
    plateEls[key] = { el: d, o: -1, t: "" };
    return plateEls[key];
  }
  document.querySelectorAll("[data-plate]").forEach(function (s) {
    ensurePlate(s.dataset.plate);
  });

  function setPlate(key, opacity, scale) {
    var p = plateEls[key];
    if (!p) return;
    var o = Math.max(0, Math.min(1, opacity));
    if (Math.abs(o - p.o) > 0.004) {
      p.el.style.opacity = o.toFixed(3);
      p.el.style.visibility = o > 0.002 ? "visible" : "hidden";
      p.o = o;
    }
    var t = "scale(" + (scale || 1).toFixed(4) + ")";
    if (t !== p.t) { p.el.style.transform = t; p.t = t; }
  }
  function hideAllPlatesExcept(keep) {
    for (var k in plateEls) if (keep.indexOf(k) < 0) setPlate(k, 0, 1);
  }

  /* ── layout maps (recomputed on resize) ────────────────────────────── */
  var scenes = [];   // { el, plate, top, bottom }
  var film = null;   // { top, bottom, beats:[{top,kind,key|t,cap}] }
  var caps = [].slice.call(document.querySelectorAll(".film-caption"));

  function mapLayout() {
    var y = window.scrollY;
    scenes = [].slice.call(document.querySelectorAll(".scene[data-plate]"))
      .map(function (el) {
        var r = el.getBoundingClientRect();
        return { el: el, plate: el.dataset.plate, top: r.top + y, bottom: r.bottom + y };
      });
    var f = document.querySelector("[data-film]");
    if (f) {
      var fr = f.getBoundingClientRect();
      var beats = [].slice.call(f.querySelectorAll(".film-beat")).map(function (b) {
        var br = b.getBoundingClientRect();
        return {
          top: br.top + y,
          kind: b.dataset.plate ? "plate" : "world",
          key: b.dataset.plate || null,
          t: b.dataset.worldT != null ? parseFloat(b.dataset.worldT) : null,
          cap: parseInt(b.dataset.cap, 10),
        };
      });
      // carry world-camera t forward through plate beats, so the landscape
      // holds its pose behind the photographic acts
      var worldT = [];
      var lastT = 0;
      beats.forEach(function (b, i) {
        if (b.t != null) lastT = b.t;
        worldT[i] = lastT;
      });
      film = { top: fr.top + y, bottom: fr.bottom + y, beats: beats, worldT: worldT };
    }
  }

  /* ── nav state ─────────────────────────────────────────────────────── */
  var navLinks = [].slice.call(document.querySelectorAll(".actnav a"));
  var topnav = document.getElementById("topnav");
  var actEls = [].slice.call(document.querySelectorAll(".act"));
  function updateNav() {
    var mid = window.scrollY + window.innerHeight * 0.4;
    var current = actEls[0] && actEls[0].id;
    actEls.forEach(function (a) {
      var r = a.getBoundingClientRect();
      if (r.top + window.scrollY <= mid) current = a.id;
    });
    navLinks.forEach(function (l) {
      if (l.dataset.act === current) l.setAttribute("aria-current", "true");
      else l.removeAttribute("aria-current");
    });
    // paper vs world chrome
    var onPaper = false;
    var probe = document.elementFromPoint(24, 70);
    if (probe && probe.closest && probe.closest(".sheet-zone, .provenance-foot")) onPaper = true;
    topnav.classList.toggle("on-paper", onPaper);
  }

  /* ── the frame loop ────────────────────────────────────────────────── */
  var ease = function (x) { return x * x * (3 - 2 * x); };
  var lastWorldT = -1;
  var queued = false;

  function frame() {
    queued = false;
    var y = window.scrollY;
    var vh = window.innerHeight;
    var keep = [];

    /* Act openers: each .scene shows its plate while it crosses the
       viewport, with a slow dolly (scale) as it passes — physical, not a
       slideshow fade between sections. */
    scenes.forEach(function (s) {
      var enter = s.top - vh, leave = s.bottom;
      if (y < enter - vh || y > leave + vh * 0.5) return;
      var p = (y - enter) / (leave - enter);
      var o = p < 0.18 ? ease(p / 0.18) : p > 0.86 ? 1 - ease((p - 0.86) / 0.14) : 1;
      keep.push(s.plate);
      setPlate(s.plate, o, 1.04 + p * 0.09);
    });

    /* Film engine (Act VI) — the R5 camera model: a continuous beat
       coordinate g where g = j means "camera parked on beat j". Plates and
       captions are stable at beat centers and cross-dissolve between. */
    var inFilm = false;
    if (film) {
      inFilm = y > film.top - vh * 0.6 && y < film.bottom;
      if (inFilm) {
        var n = film.beats.length;
        var g = (y - film.top) / vh; // beat 0 fills the viewport at its top
        g = Math.max(0, Math.min(n - 1, g));
        var i = Math.min(n - 2, Math.floor(g));
        var f = g - i;

        // world camera: carry t forward through plate beats so the pose
        // holds while photography plays
        if (world) {
          var tArr = film.worldT;
          var wt = tArr[i] + (tArr[i + 1] - tArr[i]) * ease(f);
          if (Math.abs(wt - lastWorldT) > 0.0015) { world.render(wt); lastWorldT = wt; }
        }

        // plates: distance-based visibility around each beat center
        film.beats.forEach(function (b, j) {
          if (b.kind !== "plate") return;
          var d = g - j;
          var o;
          if (d <= -1 || d >= 1) o = 0;
          else if (d < -0.5) o = ease((d + 1) / 0.5);
          else if (d > 0.5) o = 1 - ease((d - 0.5) / 0.5);
          else o = 1;
          if (o > 0.002) {
            keep.push(b.key);
            setPlate(b.key, o, 1.04 + d * 0.08);
          }
        });

        // captions: same distance rule, tighter window
        caps.forEach(function (c) {
          var j = parseInt(c.dataset.capfor, 10);
          var dd = Math.abs(g - j);
          var co = dd >= 0.55 ? 0 : dd <= 0.3 ? 1 : 1 - ease((dd - 0.3) / 0.25);
          c.style.opacity = co.toFixed(3);
          c.style.transform = co > 0.98 ? "none" : "translateY(" + ((1 - co) * 12).toFixed(1) + "px)";
        });
      } else {
        caps.forEach(function (c) { c.style.opacity = "0"; });
      }
    }

    /* Act I backdrop: the world at macro with a slow drift. */
    if (world && !inFilm) {
      var entry = document.getElementById("ivadas");
      var er = entry.getBoundingClientRect();
      if (er.bottom > 0) {
        var drift = 0.045 + 0.03 * Math.max(0, Math.min(1, y / (vh * 2)));
        if (Math.abs(drift - lastWorldT) > 0.0015) { world.render(drift); lastWorldT = drift; }
      }
    }

    hideAllPlatesExcept(keep);
    updateNav();
  }

  function onScroll() {
    if (!queued) { queued = true; requestAnimationFrame(frame); }
  }

  if (!reduce) {
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", function () { mapLayout(); onScroll(); }, { passive: true });
  } else {
    // reduced motion: static macro pose once, captions handled by CSS,
    // scene plates become the ground for their copy only while static.
    if (world) world.render(0.05);
    window.addEventListener("scroll", updateNav, { passive: true });
  }

  /* ── reveals ───────────────────────────────────────────────────────── */
  if (!reduce && "IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
      });
    }, { rootMargin: "0px 0px -8% 0px" });
    document.querySelectorAll(".reveal").forEach(function (el) { io.observe(el); });
  } else {
    document.querySelectorAll(".reveal").forEach(function (el) { el.classList.add("in"); });
  }

  /* ── intent routing (Act I) ────────────────────────────────────────── */
  document.querySelectorAll(".intent-hints button").forEach(function (b) {
    b.addEventListener("click", function () {
      location.hash = b.dataset.goto;
    });
  });
  function routeIntent() {
    var v = (document.getElementById("intentInput").value || "").toLowerCase();
    var to = "#zmogus";
    if (/darb|job/.test(v) && /iesk|randa|noriu/.test(v)) to = "#galimybes";
    else if (/uzras|dienoras|padariau|šiandien|siandien/.test(v)) to = "#dienorastis";
    else if (/galimyb|suprast/.test(v)) to = "#istorija";
    else if (/zmog|projekt|komanda/.test(v)) to = "#org-paieska";
    else if (/pajegum|truk|trūk/.test(v)) to = "#pajegumas";
    else if (/parduo|siul|siūl|turiu/.test(v)) to = "#verte";
    location.hash = to;
  }
  document.getElementById("intentGo").addEventListener("click", routeIntent);
  document.getElementById("intentInput").addEventListener("keydown", function (e) {
    if (e.key === "Enter") routeIntent();
  });

  /* ── demo state machine ────────────────────────────────────────────── */

  /* 1. journal entry → capability → opportunity causality */
  var sent = false;
  document.getElementById("chatSend").addEventListener("click", function () {
    if (sent) return;
    sent = true;
    this.disabled = true;
    var box = document.getElementById("chatBox");
    var text = box.value.trim();
    box.value = "";

    var thread = document.getElementById("chatThread");
    function add(cls, who, html) {
      var m = document.createElement("div");
      m.className = "msg " + cls;
      m.innerHTML = '<p class="who">' + who + '</p><div class="bubble">' + html + "</div>";
      thread.appendChild(m);
      m.scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
    }
    add("me", "Tu", "<p>" + text + "</p>");
    setTimeout(function () {
      add(
        "sys",
        "LabourMarket.ai",
        "<p>Užrašiau. Šis įrašas pirmą kartą tavo istorijoje užfiksavo du dalykus:</p>" +
        '<div class="caps">' +
        '<span class="cap t-journal is-new">Krautuvo valdymas <span class="tier">iš dienoraščio</span></span>' +
        '<span class="cap t-journal is-new">Siuntų skenavimas <span class="tier">iš dienoraščio</span></span>' +
        "</div>" +
        '<p style="margin-top:0.5rem">Dėl to <a href="#kryptys">sandėlio galimybėse</a> dvi eilutės pasikeitė iš „trūksta“ į „turi pagrindą“, o <a href="#dirDriver">vairuotojo kryptis</a> pirmą kartą turi realų ryšį su tavo darbu.</p>',
      );

      // journal
      document.querySelector('[data-slot="new"]').hidden = false;
      // CV
      document.querySelector('[data-slot="newcap1"]').hidden = false;
      document.querySelector('[data-slot="newcap2"]').hidden = false;
      var cc = document.getElementById("capCount");
      cc.textContent = "8";
      document.getElementById("entryCount").textContent = "+1";
      document.getElementById("entryCount2").textContent = "+1";
      // reaction note
      document.getElementById("reactionSlot").hidden = false;
      // opportunity detail requirement rows
      var rf = document.getElementById("reqForklift");
      rf.classList.add("has");
      document.getElementById("reqForkliftSt").textContent = "turi pagrindą · ką tik";
      var rs = document.getElementById("reqScan");
      rs.classList.add("has");
      document.getElementById("reqScanSt").textContent = "turi pagrindą · ką tik";
      // driver direction opens honestly
      var dd = document.getElementById("dirDriver");
      dd.classList.add("is-open");
      document.getElementById("dirDriverWhy").innerHTML =
        "Atsivėrė dabar: krautuvo darbas — vienas iš keturių dalykų, kurių čia dažniausiai prašoma. " +
        "Vienas jau turi pagrindą; trys įvardyti kaip trūkstami — nieko negražiname.";
      mapLayout();
    }, reduce ? 0 : 650);
  });

  /* 2. natural-language search */
  document.getElementById("searchGo").addEventListener("click", function () {
    document.getElementById("searchResult").hidden = false;
    mapLayout();
  });

  /* 3. capacity gap → inquiry → factual discovery */
  document.getElementById("makeInquiry").addEventListener("click", function () {
    document.getElementById("inquiryResult").hidden = false;
    this.disabled = true;
    this.textContent = "Užklausa sudaryta (juodraštis)";
    mapLayout();
  });

  /* 4. discovery toggle */
  var tp = document.getElementById("tabPlaces");
  var td = document.getElementById("tabDirs");
  function setTab(dirs) {
    document.getElementById("viewPlaces").hidden = dirs;
    document.getElementById("viewDirs").hidden = !dirs;
    tp.setAttribute("aria-pressed", String(!dirs));
    td.setAttribute("aria-pressed", String(dirs));
    mapLayout();
  }
  tp.addEventListener("click", function () { setTab(false); });
  td.addEventListener("click", function () { setTab(true); });

  /* ── boot ──────────────────────────────────────────────────────────── */
  function boot() {
    mapLayout();
    if (!reduce) frame();
    else updateNav();
  }
  if (document.readyState === "complete") boot();
  else window.addEventListener("load", boot);
  // fonts/images shift layout; re-map shortly after
  setTimeout(function () { mapLayout(); if (!reduce) onScroll(); }, 1200);

  /** freeze-frame harness hook */
  window.R6 = {
    demo: function () {
      document.getElementById("chatSend").click();
      document.getElementById("searchGo").click();
      document.getElementById("makeInquiry").click();
      setTab(true);
    },
    remap: mapLayout,
  };
})();
