/* ============================================================================
   Living Opportunity World R5 — the camera director.

   One instrument. It reads the semantic document already in the page and
   flies a camera through it, so the accessible / no-JS / reduced-motion
   version is the SOURCE and can never drift from the cinematic one.

   Two kinds of beat, one continuous camera:
     data-stage="world"  → the 3D landscape (WebGL), camera position = t
     data-stage="place"  → a real photograph on a plane in perspective,
                           dollied and cross-dissolved, never cut

   Motion law: transform + opacity only, scroll is the only clock, nothing
   pulses, nothing glows, nothing bounces.
   ========================================================================= */
(function (global) {
  "use strict";

  var root = document.documentElement;
  root.classList.add("js");

  var reduce =
    global.matchMedia && global.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var doc = document.querySelector(".static-world");
  if (!doc || reduce) return;

  var beats = [].slice.call(doc.querySelectorAll(".static-beat"));
  if (beats.length < 2) return;

  /* ── stage ─────────────────────────────────────────────────────────── */
  var stage = document.createElement("div");
  stage.className = "stage";
  stage.setAttribute("aria-hidden", "true");

  var canvas = document.createElement("canvas");
  canvas.className = "world-canvas";
  stage.appendChild(canvas);

  var photoLayer = document.createElement("div");
  photoLayer.className = "photo-layer";
  stage.appendChild(photoLayer);

  var beatLayer = document.createElement("div");
  beatLayer.className = "beat-layer";
  beatLayer.setAttribute("aria-hidden", "true");

  var worldBeats = [];
  var plates = [];
  var captions = [];

  beats.forEach(function (b, i) {
    var stageKind = b.dataset.stage || "place";
    if (stageKind === "world") {
      worldBeats.push(i);
      plates.push(null);
    } else {
      var plate = document.createElement("div");
      plate.className = "plate";
      plate.style.setProperty("--haze", b.dataset.haze || "0.08");
      var img = document.createElement("img");
      img.src = b.dataset.img;
      img.alt = "";
      img.decoding = "async";
      if (i > 4) img.loading = "lazy";
      plate.appendChild(img);
      photoLayer.appendChild(plate);
      plates.push({
        el: plate,
        img: img,
        zoom: parseFloat(b.dataset.zoom || "1.7"),
        drift: parseFloat(b.dataset.drift || "0"),
        lastT: "",
        lastO: -1,
      });
    }

    /* Lower third = a clone of the beat's whole prose column. */
    var cap = document.createElement("div");
    cap.className = "beat";
    var column = b.querySelector(".beat-copy");
    var inner = column ? column.cloneNode(true) : document.createElement("div");
    inner.className = "beat-inner";
    [].forEach.call(inner.querySelectorAll("[id]"), function (n) {
      n.removeAttribute("id");
    });
    cap.appendChild(inner);
    beatLayer.appendChild(cap);
    captions.push({ el: cap, lastO: -1 });
  });

  var track = document.createElement("div");
  track.className = "track";
  track.style.height = beats.length * 100 + "vh";

  document.body.insertBefore(stage, doc);
  document.body.insertBefore(beatLayer, doc);
  document.body.insertBefore(track, doc);
  doc.setAttribute("data-camera-active", "true");

  /* ── the world ─────────────────────────────────────────────────────── */
  var world = null;
  if (global.R5World && global.R5_GEO && global.R5_DATA) {
    var counts = {};
    global.R5_DATA.topCities.forEach(function (c) { counts[c.name] = c.n; });
    var activity = global.R5_GEO.cities
      .filter(function (c) { return counts[c.name]; })
      .map(function (c) {
        return { name: c.name, lat: c.lat, lng: c.lng, count: counts[c.name] };
      });
    world = global.R5World.create(canvas, global.R5_GEO, activity);
  }
  if (!world) stage.classList.add("no-world");

  /* ── quiet controls, last ──────────────────────────────────────────── */
  var rail = document.createElement("nav");
  rail.className = "camera-rail";
  rail.setAttribute("aria-label", "Kameros padėtis");
  var dots = beats.map(function (b, i) {
    var btn = document.createElement("button");
    btn.type = "button";
    var t = b.querySelector("h2");
    btn.setAttribute("aria-label", i + 1 + ". " + (t ? t.textContent.trim() : "kadras"));
    btn.addEventListener("click", function () {
      global.scrollTo({ top: i * global.innerHeight, behavior: "smooth" });
    });
    rail.appendChild(btn);
    return btn;
  });
  document.body.appendChild(rail);

  /* ── loop ──────────────────────────────────────────────────────────── */
  var span = 1, vh = 0;
  function measure() {
    vh = global.innerHeight;
    span = Math.max(1, track.offsetHeight - vh);
  }
  measure();

  function ease(x) { return x * x * (3 - 2 * x); }

  var lastWorldT = -1;
  var current = -1;
  var queued = false;
  var worldFirst = worldBeats.length ? worldBeats[0] : 0;
  var worldLast = worldBeats.length ? worldBeats[worldBeats.length - 1] : 0;
  var worldSpan = Math.max(1, worldLast - worldFirst);

  function frame() {
    queued = false;
    var p = Math.min(1, Math.max(0, global.scrollY / span));
    var g = p * (beats.length - 1);

    /* The 3D world flies while the camera is inside its beats, and holds its
       last pose while the photographic acts play over it. */
    if (world) {
      var wt = Math.min(1, Math.max(0, (g - worldFirst) / worldSpan));
      if (Math.abs(wt - lastWorldT) > 0.0012) {
        world.render(wt);
        lastWorldT = wt;
      }
      var inWorld = g < worldLast + 0.5;
      var worldFade = inWorld ? 1 : 0;
      if (canvas.style.opacity !== String(worldFade))
        canvas.style.opacity = String(worldFade);
      // the photographic grade must not touch the landscape
      var act = inWorld ? "world" : "place";
      if (stage.getAttribute("data-act") !== act)
        stage.setAttribute("data-act", act);
    }

    for (var i = 0; i < plates.length; i++) {
      var pl = plates[i];
      if (!pl) continue;
      var d = g - i;
      var o;
      if (d <= -1 || d >= 1) o = 0;
      else if (d < -0.5) o = ease((d + 1) / 0.5);
      else if (d > 0.5) o = 1 - ease((d - 0.5) / 0.5);
      else o = 1;

      if (o <= 0.002) {
        if (pl.lastO !== 0) {
          pl.el.style.opacity = "0";
          pl.el.style.visibility = "hidden";
          pl.lastO = 0;
        }
        continue;
      }
      // A dolly in perspective, not a flat scale: the plate sits in Z.
      var z = -520 * d;
      var t =
        "translate3d(" + (pl.drift * d).toFixed(2) + "%,0," + z.toFixed(1) + "px) " +
        "scale(" + Math.pow(pl.zoom, d * 0.5).toFixed(4) + ")";
      if (t !== pl.lastT) { pl.el.style.transform = t; pl.lastT = t; }
      if (Math.abs(o - pl.lastO) > 0.004) {
        pl.el.style.opacity = o.toFixed(3);
        pl.el.style.visibility = "visible";
        pl.lastO = o;
      }
    }

    for (var j = 0; j < captions.length; j++) {
      var c = captions[j];
      var dd = Math.abs(g - j);
      var co = dd >= 0.6 ? 0 : dd <= 0.26 ? 1 : 1 - ease((dd - 0.26) / 0.34);
      if (Math.abs(co - c.lastO) > 0.006) {
        c.el.style.opacity = co.toFixed(3);
        c.el.style.transform = "translateY(" + ((1 - co) * 12).toFixed(1) + "px)";
        c.lastO = co;
      }
    }

    var idx = Math.round(g);
    if (idx !== current) {
      if (dots[current]) dots[current].removeAttribute("aria-current");
      if (dots[idx]) dots[idx].setAttribute("aria-current", "true");
      current = idx;
    }
  }

  function onScroll() {
    if (!queued) { queued = true; requestAnimationFrame(frame); }
  }

  global.addEventListener("scroll", onScroll, { passive: true });
  global.addEventListener("resize", function () {
    measure();
    lastWorldT = -1;
    onScroll();
  }, { passive: true });

  /** Exposed so the freeze-frame harness can park the camera precisely. */
  global.R5Camera = {
    goTo: function (beatIndex) {
      global.scrollTo(0, beatIndex * global.innerHeight);
      lastWorldT = -1;
      frame();
    },
    beats: beats.length,
    hasWorld: !!world,
  };

  frame();
})(window);
