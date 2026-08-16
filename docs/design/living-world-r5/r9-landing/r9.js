/* R9 landing runtime — the world IS the page.
   Scroll changes scale, the pointer tilts the camera, one sentence
   reorganizes the environment. Every count shown is a real production
   count (Arbetsförmedlingen via labourmarket.ai, 2026-08-15). */
(function () {
  "use strict";
  var $ = function (s) { return document.querySelector(s); };
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ── real counts ── */
  var CITY_N = { Stockholm: 6523, "Göteborg": 3066, "Malmö": 1522, Uppsala: 1073,
    "Linköping": 1051, "Jönköping": 805, "Örebro": 716, "Umeå": 692,
    "Västerås": 684, "Luleå": 625, "Norrköping": 618, Lund: 600, Helsingborg: 571 };
  var LEVELS = [
    { until: 0.34, name: "Švedija", n: 41432, what: "aktyvios darbo vietos" },
    { until: 0.72, name: "Västra Götaland", n: 6289, what: "aktyvios darbo vietos" },
    { until: 1.01, name: "Göteborg", n: 3078, what: "aktyvios darbo vietos · 1 036 darbdavių" },
  ];

  /* ── world ── */
  var canvas = $("#world"), world = null;
  if (window.R5World && window.R5_GEO) {
    var activity = window.R5_GEO.cities
      .filter(function (c) { return CITY_N[c.name]; })
      .map(function (c) { return { name: c.name, lat: c.lat, lng: c.lng, count: CITY_N[c.name] }; });
    world = window.R5World.create(canvas, window.R5_GEO, activity);
  }
  if (!world) { canvas.style.display = "none"; $("#skyfall").hidden = false; $("#hint").textContent = ""; }

  /* ── camera state ── */
  var t = 0.06, tTarget = 0.06;
  var parX = 0, parY = 0, parTX = 0, parTY = 0;
  var drift = 0;

  /* scroll = scale */
  function nudge(d) {
    tTarget = Math.max(0, Math.min(0.985, tTarget + d));
    introAway();
  }
  window.addEventListener("wheel", function (e) {
    e.preventDefault();
    nudge(e.deltaY * 0.00042);
  }, { passive: false });
  var lastTouchY = null;
  window.addEventListener("touchstart", function (e) {
    if (e.target.closest("#ask, #top, .mk-city")) return;
    lastTouchY = e.touches[0].clientY;
  }, { passive: true });
  window.addEventListener("touchmove", function (e) {
    if (lastTouchY == null || e.target.closest("#ask, #top")) return;
    var y = e.touches[0].clientY;
    nudge((lastTouchY - y) * 0.0011);
    lastTouchY = y;
    e.preventDefault();
  }, { passive: false });
  window.addEventListener("touchend", function () { lastTouchY = null; });

  /* pointer = tilt */
  window.addEventListener("pointermove", function (e) {
    if (e.pointerType !== "mouse") return;
    parTX = (e.clientX / window.innerWidth - 0.5) * 0.5;
    parTY = (e.clientY / window.innerHeight - 0.5) * 0.35;
  });

  /* ── intro ── */
  var introDone = false;
  function introAway() {
    if (introDone) return;
    introDone = true;
    $("#intro").classList.add("is-away");
  }
  setTimeout(introAway, 3600);

  /* ── scale readout ── */
  var shownN = 41432, level = LEVELS[0];
  function fmt(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, " "); }
  function updateScale() {
    var lv = LEVELS[0];
    for (var i = 0; i < LEVELS.length; i++) if (t < LEVELS[i].until) { lv = LEVELS[i]; break; }
    if (lv !== level) { level = lv; $("#scaleName").textContent = lv.name; $("#scaleWhat").textContent = lv.what; }
    shownN += (level.n - shownN) * 0.12;
    if (Math.abs(shownN - level.n) < 1) shownN = level.n;
    $("#scaleN").textContent = fmt(shownN);
  }

  /* ── projected markers ── */
  var markers = [];
  var mkRoot = $("#markers"), pathsSvg = $("#paths");
  function addMarker(lng, lat, el, lift, minT, anchor) {
    mkRoot.appendChild(el);
    var m = { lng: lng, lat: lat, el: el, lift: lift || 0, minT: minT || 0, anchor: anchor || "" };
    markers.push(m);
    return m;
  }
  function clearIntent() {
    markers = markers.filter(function (m) {
      if (!m.intent) return true;
      m.el.remove();
      return false;
    });
    pathsSvg.innerHTML = "";
    livePaths = [];
  }
  function place() {
    if (!world) return;
    for (var i = 0; i < markers.length; i++) {
      var m = markers[i];
      if (t < m.minT) { m.el.style.display = "none"; continue; }
      var p = world.project(m.lng, m.lat, m.lift);
      if (!p || p.x < -80 || p.x > innerWidth + 80 || p.y < -60 || p.y > innerHeight + 60) {
        m.el.style.display = "none"; continue;
      }
      m.el.style.display = "";
      var depth = m.depthScale ? " scale(" + Math.max(0.5, Math.min(1.2, 3.2 / p.w)).toFixed(2) + ")" : "";
      m.el.style.transform = "translate3d(" + p.x.toFixed(1) + "px," + p.y.toFixed(1) + "px,0)" + m.anchor + depth;
    }
    for (var j = 0; j < livePaths.length; j++) {
      var L = livePaths[j];
      var a = world.project(L.a[0], L.a[1], 0.02), b = world.project(L.b[0], L.b[1], 0.02);
      if (!a || !b) { L.el.setAttribute("d", ""); continue; }
      var mx = (a.x + b.x) / 2, my = Math.min(a.y, b.y) - 34;
      L.el.setAttribute("d", "M" + a.x + " " + a.y + " Q" + mx + " " + my + " " + b.x + " " + b.y);
    }
  }

  /* city glints (real counts, discoverable) */
  window.R5_GEO && window.R5_GEO.cities.forEach(function (c) {
    if (!CITY_N[c.name]) return;
    var el = document.createElement("div");
    el.className = "mk mk-city";
    el.innerHTML = '<span class="dot"></span><span class="tip">' + c.name +
      " · <b>" + fmt(CITY_N[c.name]) + "</b> aktyvios</span>";
    el.addEventListener("click", function () { el.classList.toggle("is-tip"); });
    addMarker(c.lng, c.lat, el, 0.015, 0, " translate(-50%,-50%)").depthScale = true;
  });

  /* ── intent layer ── */
  var livePaths = [];
  function bloom(lng, lat, tone) {
    var el = document.createElement("div");
    el.className = "mk mk-bloom" + (tone ? " is-" + tone : "");
    el.innerHTML = '<span class="ring"></span><span class="ring"></span><span class="ring"></span><span class="core"></span>';
    var m = addMarker(lng, lat, el, 0.02, 0);
    m.intent = true;
    return m;
  }
  function label(lng, lat, html) {
    var el = document.createElement("div");
    el.className = "mk mk-label";
    el.innerHTML = html;
    var m = addMarker(lng, lat, el, 0.12, 0, " translate(-50%,-135%)");
    m.intent = true;
    return m;
  }
  function path(a, b, color) {
    var NS = "http://www.w3.org/2000/svg";
    var p = document.createElementNS(NS, "path");
    p.setAttribute("stroke", color);
    pathsSvg.appendChild(p);
    livePaths.push({ a: a, b: b, el: p });
  }
  function mote(from, to, tone, dur) {
    var el = document.createElement("div");
    el.className = "mk mk-mote" + (tone ? " is-" + tone : "");
    var m = addMarker(from[0], from[1], el, 0.03, 0);
    m.intent = true;
    var t0 = performance.now();
    (function step(now) {
      if (!el.isConnected) return;
      var k = Math.min(1, (now - t0) / dur);
      var e = k * k * (3 - 2 * k);
      m.lng = from[0] + (to[0] - from[0]) * e;
      m.lat = from[1] + (to[1] - from[1]) * e;
      if (k < 1) requestAnimationFrame(step);
      else { m.lng = from[0]; m.lat = from[1]; t0 = performance.now(); requestAnimationFrame(step); }
    })(t0);
  }

  /* typewriter */
  var sayTimer = null;
  function say(html) {
    var el = $("#say");
    clearTimeout(sayTimer);
    if (reduced) { el.innerHTML = html; return; }
    el.innerHTML = "";
    var tmp = document.createElement("div");
    tmp.innerHTML = html;
    var full = tmp.textContent, i = 0;
    (function tick() {
      i += 2;
      el.textContent = full.slice(0, i);
      if (i < full.length) sayTimer = setTimeout(tick, 14);
      else el.innerHTML = html;
    })();
  }

  var GBG = [11.9746, 57.7089];
  var INTENTS = [
    {
      test: /(darb|sand[eė]l|iešk)/i,
      go: 0.955,
      line: "Suprantu — <b>sandėlio darbas Göteborge</b>. Kryptis gyva: 98 aktyvios vietos, 40 darbdavių.",
      act: function () {
        bloom(GBG[0], GBG[1]);
        label(GBG[0], GBG[1], 'Sandėlio kryptis · <b class="a">98</b> aktyvios · <i>40 darbdavių</i>');
        label(15.5, 59.9, '<i>visoje Švedijoje</i> · <b class="a">923</b> šios krypties vietos').lift = 0.16;
      },
    },
    {
      test: /(tr[uū]kst|reiki|elektrik|darbuotoj[uų]? reikia)/i,
      go: 0.9,
      line: "Paklausa pažymėta: <b>4 elektrikai kitai savaitei</b>. Aplink Göteborgą ši kryptis gyva — 71 aktyvi vieta.",
      act: function () {
        bloom(GBG[0], GBG[1], "rose");
        label(GBG[0], GBG[1], 'Užklausa · 4 elektrikai · <b class="r">71</b> aktyvi kryptis · <i>47 darbdaviai</i>');
        [[12.9401, 57.721], [12.2858, 58.2837], [12.5331, 57.93], [11.9746, 57.8706]].forEach(function (c) {
          path(c, GBG, "rgba(207,84,104,0.75)");
          mote(c, GBG, null, 2400 + Math.random() * 1400);
        });
      },
    },
    {
      test: /(agurk|parduo|turiu \d|kg|u[žz]augin)/i,
      go: 0.8,
      line: "Tai — <b>vertės pasiūla</b>, ne darbo skelbimas. Tas pats pasaulis rodo, kur ji gali būti realizuota.",
      act: function () {
        var farm = [13.15, 58.32];
        bloom(farm[0], farm[1], "green");
        label(farm[0], farm[1], '30 kg agurkų · <b class="g">pasiūla suprasta</b>').lift = 0.17;
        path(farm, GBG, "rgba(77,157,100,0.75)");
        path(farm, [12.9401, 57.721], "rgba(77,157,100,0.6)");
        mote(farm, GBG, "green", 2600);
        label(GBG[0], GBG[1], 'Göteborg · <i>realizacijos kryptys</i> · <b class="g">demo</b>').lift = 0.05;
      },
    },
  ];
  function handle(text) {
    introAway();
    clearIntent();
    var it = null;
    for (var i = 0; i < INTENTS.length; i++) if (INTENTS[i].test.test(text)) { it = INTENTS[i]; break; }
    $("#chips").classList.add("is-small");
    if (!it) {
      say("Suprantu. Pasakyk, ko <b>ieškai</b>, ko <b>reikia</b> ar ką <b>turi</b> — pasaulis reaguos.");
      tTarget = Math.max(0.3, tTarget);
      return;
    }
    say(it.line);
    tTarget = it.go;
    it.act();
  }
  $("#askForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var v = $("#askInput").value.trim();
    if (v) handle(v);
  });
  document.querySelectorAll("#chips button").forEach(function (b) {
    b.addEventListener("click", function () {
      $("#askInput").value = b.dataset.say;
      handle(b.dataset.say);
    });
  });

  /* ── frame loop ── */
  function frame(now) {
    drift += 0.0014;
    var wob = reduced ? 0 : Math.sin(drift) * 0.0035;
    t += (tTarget - t) * (reduced ? 1 : 0.045);
    parX += (parTX - parX) * 0.06;
    parY += (parTY - parY) * 0.06;
    if (world) world.render(Math.max(0, Math.min(0.9999, t + wob)),
      reduced ? null : { dx: parX, dy: parY });
    place();
    updateScale();
    requestAnimationFrame(frame);
  }
  if (world) requestAnimationFrame(frame);
  else { updateScale(); }
})();
