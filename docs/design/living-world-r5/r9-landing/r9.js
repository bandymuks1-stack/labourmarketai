/* R10 Gate 1 runtime — the world is the hero.
   WebGL terrain (real coastline, real activity) + a canvas life layer:
   settlements, flowing commerce, activity sparks. One input reorganizes it.
   Every count shown is a real production count (Arbetsförmedlingen, 08-15). */
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
    { until: 0.8, name: "Västra Götaland", n: 6289, what: "aktyvios darbo vietos" },
    { until: 1.01, name: "Göteborg", n: 3078, what: "aktyvios darbo vietos · 1 036 darbdavių" },
  ];

  /* ── world ── */
  var canvas = $("#world"), world = null, CITIES = [];
  if (window.R5World && window.R5_GEO) {
    CITIES = window.R5_GEO.cities.filter(function (c) { return CITY_N[c.name]; });
    var activity = CITIES.map(function (c) {
      return { name: c.name, lat: c.lat, lng: c.lng, count: CITY_N[c.name] };
    });
    world = window.R5World.create(canvas, window.R5_GEO, activity);
  }
  if (!world) { canvas.style.display = "none"; $("#life").style.display = "none"; $("#skyfall").hidden = false; }
  if (world) world.palette = {
    zenith: [0.16, 0.27, 0.40],
    horizon: [0.93, 0.78, 0.58],
    skySun: [0.66, 0.42, 0.16],
    sun: [1.0, 0.82, 0.6],
    haze: [0.62, 0.6, 0.58],
    seaNear: [0.10, 0.21, 0.27],
    seaFar: [0.36, 0.44, 0.50],
    landLow: [0.28, 0.43, 0.31],
    landHigh: [0.9, 0.73, 0.47],
  };

  /* ── camera ── */
  var t = 0.6, tTarget = 0.6;
  var parX = 0, parY = 0, parTX = 0, parTY = 0, drift = 0;
  function nudge(d) { tTarget = Math.max(0.06, Math.min(0.985, tTarget + d)); }
  window.addEventListener("wheel", function (e) { e.preventDefault(); nudge(e.deltaY * 0.00042); }, { passive: false });
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
  window.addEventListener("pointermove", function (e) {
    if (e.pointerType !== "mouse") return;
    parTX = (e.clientX / window.innerWidth - 0.5) * 0.5;
    parTY = (e.clientY / window.innerHeight - 0.5) * 0.35;
  });

  /* ── scale readout ── */
  var shownN = 6289, level = LEVELS[1];
  function fmt(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, " "); }
  function updateScale() {
    var lv = LEVELS[0];
    for (var i = 0; i < LEVELS.length; i++) if (t < LEVELS[i].until) { lv = LEVELS[i]; break; }
    if (lv !== level) { level = lv; $("#scaleName").textContent = lv.name; $("#scaleWhat").textContent = lv.what; }
    shownN += (level.n - shownN) * 0.12;
    if (Math.abs(shownN - level.n) < 1) shownN = level.n;
    $("#scaleN").textContent = fmt(shownN);
  }

  /* ── DOM markers (tips + intent) ── */
  var markers = [], livePaths = [];
  var mkRoot = $("#markers"), pathsSvg = $("#paths");
  function addMarker(lng, lat, el, lift, anchor) {
    mkRoot.appendChild(el);
    var m = { lng: lng, lat: lat, el: el, lift: lift || 0, anchor: anchor || "" };
    markers.push(m);
    return m;
  }
  function clearIntent() {
    markers = markers.filter(function (m) {
      if (!m.intent) return true;
      m.el.remove(); return false;
    });
    pathsSvg.innerHTML = "";
    livePaths = [];
  }
  function placeDom() {
    if (!world) return;
    for (var i = 0; i < markers.length; i++) {
      var m = markers[i];
      var p = world.project(m.lng, m.lat, m.lift);
      if (!p || p.x < -80 || p.x > innerWidth + 80 || p.y < -60 || p.y > innerHeight + 60) {
        m.el.style.display = "none"; continue;
      }
      m.el.style.display = "";
      m.el.style.transform = "translate3d(" + p.x.toFixed(1) + "px," + p.y.toFixed(1) + "px,0)" + m.anchor;
    }
    for (var j = 0; j < livePaths.length; j++) {
      var L = livePaths[j];
      var a = world.project(L.a[0], L.a[1], 0.02), b = world.project(L.b[0], L.b[1], 0.02);
      if (!a || !b) { L.el.setAttribute("d", ""); continue; }
      var mx = (a.x + b.x) / 2, my = Math.min(a.y, b.y) - 34;
      L.el.setAttribute("d", "M" + a.x + " " + a.y + " Q" + mx + " " + my + " " + b.x + " " + b.y);
    }
  }
  CITIES.forEach(function (c) {
    var el = document.createElement("div");
    el.className = "mk mk-city";
    el.innerHTML = '<span class="dot"></span><span class="tip">' + c.name +
      " · <b>" + fmt(CITY_N[c.name]) + "</b> aktyvios</span>";
    el.addEventListener("click", function () { el.classList.toggle("is-tip"); });
    addMarker(c.lng, c.lat, el, 0.02, " translate(-50%,-50%)");
  });

  /* ── LIFE LAYER: settlements, commerce flows, sparks ── */
  var life = $("#life"), lctx = life ? life.getContext("2d") : null;
  function sizeLife() {
    if (!life) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    life.width = life.clientWidth * dpr;
    life.height = life.clientHeight * dpr;
    lctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  sizeLife();
  window.addEventListener("resize", sizeLife);

  function hash(s, i) {
    var h = 2166136261 >>> 0;
    for (var k = 0; k < s.length; k++) { h ^= s.charCodeAt(k); h = Math.imul(h, 16777619); }
    h ^= i * 2654435761;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  }

  /* commerce routes between real cities */
  var ROUTES = [
    ["Göteborg", "Stockholm"], ["Göteborg", "Malmö"], ["Göteborg", "Jönköping"],
    ["Stockholm", "Uppsala"], ["Stockholm", "Norrköping"], ["Malmö", "Lund"],
    ["Stockholm", "Västerås"], ["Göteborg", "Linköping"],
  ].map(function (pair) {
    var A = CITIES.filter(function (c) { return c.name === pair[0]; })[0];
    var B = CITIES.filter(function (c) { return c.name === pair[1]; })[0];
    if (!A || !B) return null;
    var motes = [];
    for (var i = 0; i < 4; i++) motes.push({ p: hash(pair[0] + pair[1], i), v: 0.00018 + hash(pair[1], i) * 0.00028 });
    return { a: A, b: B, motes: motes };
  }).filter(Boolean);

  var sparks = [], nextSpark = 800;
  function drawLife(now, dt) {
    if (!lctx || !world) return;
    var W = life.clientWidth, H = life.clientHeight;
    lctx.clearRect(0, 0, W, H);

    /* settlements — abstract building silhouettes, scaled by real volume */
    for (var ci = 0; ci < CITIES.length; ci++) {
      var c = CITIES[ci];
      var p = world.project(c.lng, c.lat, 0.004);
      if (!p || p.x < -60 || p.x > W + 60 || p.y < -40 || p.y > H + 40) continue;
      var s = Math.max(0.35, Math.min(1.6, 3.4 / p.w));
      var k = Math.round(3 + Math.log(CITY_N[c.name]) * 1.35);
      for (var bi = 0; bi < k; bi++) {
        var off = (hash(c.name, bi) - 0.5) * 30 * s;
        var bh = (3.5 + hash(c.name, bi + 40) * 13) * s;
        var bw = (1.6 + hash(c.name, bi + 80) * 2.2) * s;
        var bx = p.x + off, by = p.y;
        lctx.fillStyle = "rgba(16, 24, 33, " + (0.5 + 0.3 * Math.min(1, s)).toFixed(2) + ")";
        lctx.fillRect(bx - bw / 2, by - bh, bw, bh);
        if (hash(c.name, bi + 120) > 0.35) {
          lctx.fillStyle = "rgba(255, 198, 130, " + (0.5 + 0.4 * hash(c.name, bi + 160)).toFixed(2) + ")";
          lctx.fillRect(bx - bw / 2 + 0.5, by - bh + 1 + hash(c.name, bi + 200) * (bh - 2), Math.max(0.8, bw - 1.4), 1.1);
        }
      }
      /* soft ground glow under each settlement */
      var gr = lctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 26 * s);
      gr.addColorStop(0, "rgba(255, 186, 110, 0.22)");
      gr.addColorStop(1, "rgba(255, 186, 110, 0)");
      lctx.fillStyle = gr;
      lctx.beginPath(); lctx.arc(p.x, p.y, 26 * s, 0, 6.2832); lctx.fill();
    }

    /* commerce flows — faint arcs with travelling light */
    for (var ri = 0; ri < ROUTES.length; ri++) {
      var r = ROUTES[ri];
      var A = world.project(r.a.lng, r.a.lat, 0.01), B = world.project(r.b.lng, r.b.lat, 0.01);
      if (!A || !B) continue;
      var mx = (A.x + B.x) / 2, my = Math.min(A.y, B.y) - Math.min(90, Math.hypot(B.x - A.x, B.y - A.y) * 0.16);
      lctx.strokeStyle = "rgba(255, 210, 150, 0.10)";
      lctx.lineWidth = 1;
      lctx.beginPath(); lctx.moveTo(A.x, A.y); lctx.quadraticCurveTo(mx, my, B.x, B.y); lctx.stroke();
      for (var mi = 0; mi < r.motes.length; mi++) {
        var mo = r.motes[mi];
        if (!reduced) mo.p = (mo.p + mo.v * dt) % 1;
        var q = mo.p, iq = 1 - q;
        var x = iq * iq * A.x + 2 * iq * q * mx + q * q * B.x;
        var y = iq * iq * A.y + 2 * iq * q * my + q * q * B.y;
        var mrad = 1.1 + 1.3 * Math.min(1, 3.4 / ((A.w + B.w) / 2));
        lctx.fillStyle = "rgba(255, 222, 170, 0.85)";
        lctx.beginPath(); lctx.arc(x, y, mrad, 0, 6.2832); lctx.fill();
      }
    }

    /* activity sparks — "something just happened there" */
    if (!reduced) {
      nextSpark -= dt;
      if (nextSpark <= 0) {
        nextSpark = 1400 + Math.random() * 1800;
        var sc = CITIES[Math.floor(Math.random() * CITIES.length)];
        sparks.push({ c: sc, born: now });
      }
      for (var si = sparks.length - 1; si >= 0; si--) {
        var sp = sparks[si];
        var age = (now - sp.born) / 1600;
        if (age >= 1) { sparks.splice(si, 1); continue; }
        var pp = world.project(sp.c.lng, sp.c.lat, 0.012);
        if (!pp) continue;
        var ss = Math.max(0.4, Math.min(1.5, 3.4 / pp.w));
        lctx.strokeStyle = "rgba(255, 208, 140, " + (0.55 * (1 - age)).toFixed(2) + ")";
        lctx.lineWidth = 1.4;
        lctx.beginPath(); lctx.arc(pp.x, pp.y, 4 + age * 30 * ss, 0, 6.2832); lctx.stroke();
      }
    }
  }

  /* ── intent layer (kept from R9) ── */
  function bloom(lng, lat, tone) {
    var el = document.createElement("div");
    el.className = "mk mk-bloom" + (tone ? " is-" + tone : "");
    el.innerHTML = '<span class="ring"></span><span class="ring"></span><span class="ring"></span><span class="core"></span>';
    var m = addMarker(lng, lat, el, 0.02);
    m.intent = true;
    return m;
  }
  function label(lng, lat, html) {
    var el = document.createElement("div");
    el.className = "mk mk-label";
    el.innerHTML = html;
    var m = addMarker(lng, lat, el, 0.12, " translate(-50%,-135%)");
    m.intent = true;
    return m;
  }
  function path(a, b, color) {
    var p = document.createElementNS("http://www.w3.org/2000/svg", "path");
    p.setAttribute("stroke", color);
    pathsSvg.appendChild(p);
    livePaths.push({ a: a, b: b, el: p });
  }
  function mote(from, to, tone, dur) {
    var el = document.createElement("div");
    el.className = "mk mk-mote" + (tone ? " is-" + tone : "");
    var m = addMarker(from[0], from[1], el, 0.03);
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
      test: /(darb|sand[eė]l|iešk)/i, go: 0.955,
      line: "Suprantu — <b>sandėlio darbas Göteborge</b>. Kryptis gyva: 98 aktyvios vietos, 40 darbdavių.",
      act: function () {
        bloom(GBG[0], GBG[1]);
        label(GBG[0], GBG[1], 'Sandėlio kryptis · <b class="a">98</b> aktyvios · <i>40 darbdavių</i>');
        label(15.5, 59.9, '<i>visoje Švedijoje</i> · <b class="a">923</b> šios krypties vietos').lift = 0.16;
      },
    },
    {
      test: /(tr[uū]kst|reiki|elektrik|darbuotoj[uų]? reikia)/i, go: 0.9,
      line: "Paklausa pažymėta: <b>4 elektrikai kitai savaitei</b>. Aplink Göteborgą — 71 aktyvi šios krypties vieta.",
      act: function () {
        bloom(GBG[0], GBG[1], "rose");
        label(GBG[0], GBG[1], 'Užklausa · 4 elektrikai · <b class="r">71</b> aktyvi kryptis · <i>47 darbdaviai</i>');
        [[12.9401, 57.721], [12.2858, 58.2837], [12.5331, 57.93], [11.9746, 57.8706]].forEach(function (c) {
          path(c, GBG, "rgba(255,143,163,0.8)");
          mote(c, GBG, null, 2400 + Math.random() * 1400);
        });
      },
    },
    {
      test: /(agurk|parduo|turiu \d|kg|u[žz]augin)/i, go: 0.8,
      line: "Tai — <b>vertės pasiūla</b>, ne darbo skelbimas. Tas pats pasaulis rodo, kur ji gali būti realizuota.",
      act: function () {
        var farm = [13.15, 58.32];
        bloom(farm[0], farm[1], "green");
        label(farm[0], farm[1], '30 kg agurkų · <b class="g">pasiūla suprasta</b>').lift = 0.17;
        path(farm, GBG, "rgba(127,211,154,0.8)");
        path(farm, [12.9401, 57.721], "rgba(127,211,154,0.6)");
        mote(farm, GBG, "green", 2600);
        label(GBG[0], GBG[1], 'Göteborg · <i>realizacijos kryptys</i> · <b class="g">demo</b>').lift = 0.05;
      },
    },
  ];
  function handle(text) {
    clearIntent();
    var it = null;
    for (var i = 0; i < INTENTS.length; i++) if (INTENTS[i].test.test(text)) { it = INTENTS[i]; break; }
    if (!it) {
      say("Suprantu. Pasakyk, ko <b>ieškai</b>, ko <b>reikia</b> ar ką <b>turi</b> — pasaulis reaguos.");
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
  document.querySelectorAll(".try button").forEach(function (b) {
    b.addEventListener("click", function () {
      $("#askInput").value = b.dataset.say;
      handle(b.dataset.say);
    });
  });

  /* ── frame loop ── */
  var lastNow = performance.now();
  function frame(now) {
    var dt = Math.min(64, now - lastNow);
    lastNow = now;
    drift += 0.0011;
    var wob = reduced ? 0 : Math.sin(drift) * 0.0028;
    t += (tTarget - t) * (reduced ? 1 : 0.045);
    parX += (parTX - parX) * 0.06;
    parY += (parTY - parY) * 0.06;
    if (world) world.render(Math.max(0, Math.min(0.9999, t + wob)),
      reduced ? null : { dx: parX, dy: parY });
    drawLife(now, dt);
    placeDom();
    updateScale();
    requestAnimationFrame(frame);
  }
  if (world) requestAnimationFrame(frame);
  else updateScale();
})();
