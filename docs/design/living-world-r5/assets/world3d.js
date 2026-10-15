/* ============================================================================
   Living Opportunity World R5 — the macro world, in real 3D.

   Raw WebGL. No framework, no CDN, no build step: the prototype opens from
   disk and is still the real thing.

   THE ONE IDEA:
   the country's own TERRAIN carries the economy. Land rises where real work
   is — Stockholm and Göteborg are highlands because production says so.
   No HUD, no glowing network, no floating rectangle, no particle, no dots
   on a map. The data shapes the ground; the camera flies over it.

   AND: this is a LANDSCAPE, not a map. Sea, sky, horizon, sun and haze are
   all present, and the camera descends to an oblique human-adjacent angle —
   the frame where real photography takes over.

   Geometry: Natural Earth 1:50m coastlines (public domain), vendored by
   tools/build-geometry.mjs. City coordinates are public geographic fact.
   Elevation amplitude comes from live production counts — nothing invented.
   ========================================================================= */
(function (global) {
  "use strict";

  /* ── projection ─────────────────────────────────────────────────────── */
  var CENTER = { lat: 62.0, lng: 16.0 };
  var KX = Math.cos((60 * Math.PI) / 180);
  function px(lng) { return (lng - CENTER.lng) * KX; }
  function pz(lat) { return -(lat - CENTER.lat); }

  var GBG = { lat: 57.7089, lng: 11.9746 };

  /* ── matrices ───────────────────────────────────────────────────────── */
  function mul(a, b) {
    var o = new Float32Array(16);
    for (var i = 0; i < 4; i++)
      for (var j = 0; j < 4; j++) {
        var s = 0;
        for (var k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k];
        o[i * 4 + j] = s;
      }
    return o;
  }
  function perspective(fovy, aspect, near, far) {
    var f = 1 / Math.tan(fovy / 2), o = new Float32Array(16);
    o[0] = f / aspect; o[5] = f; o[11] = -1;
    o[10] = (far + near) / (near - far);
    o[14] = (2 * far * near) / (near - far);
    return o;
  }
  function lookAt(eye, at, up) {
    var zx = eye[0] - at[0], zy = eye[1] - at[1], zz = eye[2] - at[2];
    var zl = Math.hypot(zx, zy, zz) || 1; zx /= zl; zy /= zl; zz /= zl;
    var xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx;
    var xl = Math.hypot(xx, xy, xz) || 1; xx /= xl; xy /= xl; xz /= xl;
    var yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
    return new Float32Array([
      xx, yx, zx, 0, xy, yy, zy, 0, xz, yz, zz, 0,
      -(xx * eye[0] + xy * eye[1] + xz * eye[2]),
      -(yx * eye[0] + yy * eye[1] + yz * eye[2]),
      -(zx * eye[0] + zy * eye[1] + zz * eye[2]), 1,
    ]);
  }

  function inRing(ring, x, y) {
    var inside = false;
    for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      var xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)
        inside = !inside;
    }
    return inside;
  }

  /* Cheap deterministic value noise — gives the ground the irregularity of
     terrain so it never reads as a chart surface. Purely cosmetic relief;
     the ECONOMIC signal is the broad rise, which is real data. */
  function hash(x, z) {
    var n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
    return n - Math.floor(n);
  }
  function vnoise(x, z) {
    var xi = Math.floor(x), zi = Math.floor(z);
    var xf = x - xi, zf = z - zi;
    var u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
    var a = hash(xi, zi), b = hash(xi + 1, zi), c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1);
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
  }

  /* ── shaders ────────────────────────────────────────────────────────── */

  var SKY_VERT =
    "attribute vec2 aP; varying vec2 vP;" +
    "void main(){ vP=aP; gl_Position=vec4(aP,0.999,1.0); }";
  var SKY_FRAG = [
    "precision mediump float; varying vec2 vP;",
    "uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uSunCol;",
    "uniform float uHorizonY; uniform float uSunX;",
    "void main(){",
    "  float h = clamp((vP.y - uHorizonY) / (1.35 - uHorizonY), 0.0, 1.0);",
    "  vec3 c = mix(uHorizon, uZenith, pow(h, 0.82));",
    // low sun bloom sitting ON the horizon, not a lens flare
    "  float d = distance(vec2(vP.x, vP.y*1.7), vec2(uSunX, uHorizonY*1.7));",
    "  c += uSunCol * exp(-d*d*3.1) * 0.75;",
    "  c += uSunCol * exp(-d*d*0.28) * 0.16;",
    "  gl_FragColor = vec4(c,1.0);",
    "}",
  ].join("\n");

  var VERT = [
    "attribute vec3 aPos; attribute vec3 aNorm; attribute float aAct;",
    "uniform mat4 uMVP; uniform mat4 uView;",
    "varying vec3 vN; varying float vH; varying float vAct; varying float vDepth; varying vec3 vW;",
    "void main(){ vN=aNorm; vH=aPos.y; vAct=aAct; vW=aPos;",
    "  vec4 vp = uView*vec4(aPos,1.0); vDepth = -vp.z;",
    "  gl_Position = uMVP*vec4(aPos,1.0); }",
  ].join("\n");

  var FRAG = [
    "precision mediump float;",
    "varying vec3 vN; varying float vH; varying float vAct; varying float vDepth; varying vec3 vW;",
    "uniform vec3 uSun; uniform vec3 uLow; uniform vec3 uHigh; uniform vec3 uSunCol;",
    "uniform vec3 uHaze; uniform float uHazeNear; uniform float uHazeFar; uniform float uSubject;",
    "void main(){",
    "  vec3 n = normalize(vN);",
    "  float lam = max(dot(n, normalize(uSun)), 0.0);",
    "  float sky = 0.62 + 0.38*clamp(n.y,0.0,1.0);",
    "  float grain = 0.5 + 0.28*sin(vW.x*2.7 + sin(vW.z*1.9)*1.7)",
"            + 0.17*sin(vW.z*4.3 + sin(vW.x*3.1)*2.2);",
"  vec3 base = mix(uLow, uHigh, clamp(vH*1.9, 0.0, 1.0));",
"  base = mix(base*vec3(0.88,0.92,0.85), base*vec3(1.07,1.04,0.99), clamp(grain,0.0,1.0));",
    // where real work is, the ground is higher AND warmer — one signal, two reads
    "  base = mix(base, base*vec3(1.20,1.05,0.84), clamp(vAct,0.0,1.0)*0.85);",
    "  vec3 col = base*(0.62*sky) + base*uSunCol*lam*0.78;",
    "  col = mix(col*vec3(0.90,0.92,0.94), col, uSubject);",
    "  float f = clamp((vDepth-uHazeNear)/(uHazeFar-uHazeNear),0.0,1.0); f=f*f;",
    "  gl_FragColor = vec4(mix(col,uHaze,f*0.95),1.0);",
    "}",
  ].join("\n");

  var SEA_FRAG = [
    "precision mediump float;",
    "varying vec3 vN; varying float vH; varying float vAct; varying float vDepth; varying vec3 vW;",
    "uniform vec3 uHaze; uniform float uHazeNear; uniform float uHazeFar;",
    "uniform vec3 uSeaNear; uniform vec3 uSeaFar; uniform vec3 uSunCol;",
    "void main(){",
    "  float f = clamp((vDepth-uHazeNear)/(uHazeFar-uHazeNear),0.0,1.0);",
    "  vec3 c = mix(uSeaNear, uSeaFar, clamp(vDepth/48.0,0.0,1.0));",
    // a broad sun path on the water, no sparkle
    "  c += uSunCol * clamp(vAct,0.0,1.0) * 0.30;",
    "  gl_FragColor = vec4(mix(c,uHaze,f*f*0.97),1.0);",
    "}",
  ].join("\n");

  var LINE_VERT =
    "attribute vec3 aPos; uniform mat4 uMVP; uniform mat4 uView; varying float vDepth;" +
    "void main(){ vec4 vp=uView*vec4(aPos,1.0); vDepth=-vp.z; gl_Position=uMVP*vec4(aPos,1.0); }";
  var LINE_FRAG = [
    "precision mediump float; varying float vDepth;",
    "uniform vec3 uColor; uniform vec3 uHaze; uniform float uHazeNear; uniform float uHazeFar;",
    "void main(){ float f=clamp((vDepth-uHazeNear)/(uHazeFar-uHazeNear),0.0,1.0);",
    "  gl_FragColor=vec4(mix(uColor,uHaze,f*f*0.97),1.0); }",
  ].join("\n");

  function compile(gl, type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || "shader");
    return s;
  }
  function program(gl, v, f) {
    var p = gl.createProgram();
    gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, v));
    gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, f));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || "link");
    return p;
  }

  /* ── the world ──────────────────────────────────────────────────────── */

  function World(canvas, geo, activity) {
    var gl = canvas.getContext("webgl", { antialias: true, alpha: false, powerPreference: "low-power" });
    if (!gl) throw new Error("no webgl");
    this.gl = gl; this.canvas = canvas;

    this.prog = program(gl, VERT, FRAG);
    this.seaProg = program(gl, VERT, SEA_FRAG);
    this.lineProg = program(gl, LINE_VERT, LINE_FRAG);
    this.skyProg = program(gl, SKY_VERT, SKY_FRAG);

    var maxCount = 1;
    activity.forEach(function (c) { if (c.count > maxCount) maxCount = c.count; });
    this.field = activity.map(function (c) {
      return { x: px(c.lng), z: pz(c.lat), a: Math.sqrt(c.count / maxCount) };
    });

    this.meshes = []; this.lines = [];
    var self = this;
    geo.landmasses.forEach(function (l) { self.buildLand(l); self.buildOutline(l); });
    this.buildSea();
    this.buildSky();

    gl.enable(gl.DEPTH_TEST);
  }

  /** Ground height in world units. The BROAD rise is real economic data; the
   *  fine irregularity is cosmetic terrain so it never reads as a chart. */
  World.prototype.heightAt = function (x, z, subject) {
    var terrain =
      (vnoise(x*0.5,z*0.5)*0.62 + vnoise(x*1.6,z*1.6)*0.28 + vnoise(x*4.1,z*4.1)*0.12) * 0.135;
    if (!subject) return 0.03 + terrain * 0.5;
    var h = 0.050 + terrain;
    var act = 0;
    for (var i = 0; i < this.field.length; i++) {
      var f = this.field[i];
      var dx = x - f.x, dz = z - f.z;
      // ~0.55° sigma: a city shapes its own district, not the whole country
      var g = Math.exp(-(dx * dx + dz * dz) / 0.26);
      h += g * f.a * 0.235;
      act += g * f.a;
    }
    return [h, Math.min(1, act * 1.25)];
  };

  World.prototype.buildLand = function (land) {
    var gl = this.gl;
    var subject = land.role === "subject";
    var step = subject ? 0.040 : 0.09;

    var minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    land.rings.forEach(function (r) {
      r.forEach(function (p) {
        if (p[0] < minX) minX = p[0]; if (p[0] > maxX) maxX = p[0];
        if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1];
      });
    });

    var rings = land.rings, self = this;
    function inside(lng, lat) {
      for (var i = 0; i < rings.length; i++) if (inRing(rings[i], lng, lat)) return true;
      return false;
    }

    var cols = Math.ceil((maxX - minX) / step), rows = Math.ceil((maxY - minY) / step);
    while (cols * rows > 460000) {
      step *= 1.5;
      cols = Math.ceil((maxX - minX) / step); rows = Math.ceil((maxY - minY) / step);
    }

    var W = cols + 1;
    var H = new Float32Array(W * (rows + 1)), A = new Float32Array(W * (rows + 1));
    for (var r = 0; r <= rows; r++)
      for (var c = 0; c <= cols; c++) {
        var lng = minX + c * step, lat = minY + r * step;
        var h = this.heightAt(px(lng), pz(lat), subject);
        if (subject) { H[r * W + c] = h[0]; A[r * W + c] = h[1]; }
        else { H[r * W + c] = h; A[r * W + c] = 0; }
      }

    var pos = [], nrm = [], act = [];
    /** Assigned once the solid grid exists; until then the land is flat. */
    var taperAt = function () { return 1; };
    var SHORE = 0.012; // land meets water just above sea level, never as a cliff
    function corner(c, r) {
      var lng = minX + c * step, lat = minY + r * step;
      var t = taperAt(c, r);
      return [px(lng), SHORE + (H[r * W + c] - SHORE) * t, pz(lat), A[r * W + c] * t];
    }
    function tri(a, b, cc) {
      var ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
      var vx = cc[0] - a[0], vy = cc[1] - a[1], vz = cc[2] - a[2];
      var nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      var nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
      if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; }
      [a, b, cc].forEach(function (p) {
        pos.push(p[0], p[1], p[2]); nrm.push(nx, ny, nz); act.push(p[3]);
      });
    }
    /** Coastal wall — land has thickness, so the country is a landmass and
     *  not a paper cutout lying on the water. */
    function wall(a, b) {
      var nx = -(b[2] - a[2]), nz = b[0] - a[0];
      var nl = Math.hypot(nx, nz) || 1; nx /= nl; nz /= nl;
      var a0 = [a[0], 0, a[2]], b0 = [b[0], 0, b[2]];
      [[a, b, b0], [a, b0, a0]].forEach(function (t) {
        t.forEach(function (p) {
          pos.push(p[0], p[1], p[2]); nrm.push(nx, 0.12, nz); act.push(0);
        });
      });
    }

    var solid = [];
    for (var rr = 0; rr < rows; rr++) {
      solid[rr] = [];
      for (var cc2 = 0; cc2 < cols; cc2++)
        solid[rr][cc2] = inside(minX + (cc2 + 0.5) * step, minY + (rr + 0.5) * step);
    }

    /* Shoreline taper. Without it every coast is a vertical cliff and the
       country reads as a table-top model rather than land meeting water.
       Chebyshev distance from the edge, eased over ~5 cells. */
    var REACH = 14;
    var dist = [];
    for (var dr = 0; dr < rows; dr++) {
      dist[dr] = new Int16Array(cols);
      for (var dc = 0; dc < cols; dc++) dist[dr][dc] = solid[dr][dc] ? 32000 : 0;
    }
    for (var pass = 0; pass < 2; pass++) {
      var r0 = pass === 0 ? 0 : rows - 1;
      var stepR = pass === 0 ? 1 : -1;
      for (var rq = r0; rq >= 0 && rq < rows; rq += stepR) {
        var c0 = pass === 0 ? 0 : cols - 1;
        var stepC = pass === 0 ? 1 : -1;
        for (var cq = c0; cq >= 0 && cq < cols; cq += stepC) {
          if (!solid[rq][cq]) continue;
          var best = dist[rq][cq];
          for (var oy = -1; oy <= 1; oy++)
            for (var ox = -1; ox <= 1; ox++) {
              var ny = rq + oy, nx = cq + ox;
              var nd = ny < 0 || ny >= rows || nx < 0 || nx >= cols ? 0 : dist[ny][nx];
              if (nd + 1 < best) best = nd + 1;
            }
          dist[rq][cq] = best;
        }
      }
    }
    function cellTaper(c, r) {
      if (r < 0 || r >= rows || c < 0 || c >= cols || !solid[r][c]) return 0;
      var d = Math.min(REACH, dist[r][c]) / REACH;
      return d * d * (3 - 2 * d);
    }
    /** Corner taper = the softest of the four cells that share it, so the
     *  shore never steps. */
    taperAt = function (c, r) {
      return Math.max(
        cellTaper(c - 1, r - 1), cellTaper(c, r - 1),
        cellTaper(c - 1, r), cellTaper(c, r),
      );
    };

    for (var rr2 = 0; rr2 < rows; rr2++)
      for (var c2 = 0; c2 < cols; c2++) {
        if (!solid[rr2][c2]) continue;
        var p00 = corner(c2, rr2), p10 = corner(c2 + 1, rr2),
          p11 = corner(c2 + 1, rr2 + 1), p01 = corner(c2, rr2 + 1);
        tri(p00, p11, p10); tri(p00, p01, p11);
        if (!solid[rr2][c2 - 1]) wall(p01, p00);
        if (c2 + 1 >= cols || !solid[rr2][c2 + 1]) wall(p10, p11);
        if (rr2 === 0 || !solid[rr2 - 1][c2]) wall(p00, p10);
        if (rr2 + 1 >= rows || !solid[rr2 + 1][c2]) wall(p11, p01);
      }

    if (!pos.length) return;
    function buf(arr, size) {
      var b = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(arr), gl.STATIC_DRAW);
      return { b: b, size: size };
    }
    this.meshes.push({
      pos: buf(pos, 3), nrm: buf(nrm, 3), act: buf(act, 1),
      count: pos.length / 3, subject: subject ? 1 : 0,
    });
  };

  /** The true coastline, drawn crisp on top of the sampled relief. */
  World.prototype.buildOutline = function (land) {
    var gl = this.gl, subject = land.role === "subject", pts = [], self = this;
    land.rings.forEach(function (ring) {
      for (var i = 0; i < ring.length; i++) {
        var a = ring[i], b = ring[(i + 1) % ring.length];
        [a, b].forEach(function (p) {
          var h = self.heightAt(px(p[0]), pz(p[1]), subject);
          pts.push(px(p[0]), 0.018, pz(p[1]));
        });
      }
    });
    if (!pts.length) return;
    var b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(pts), gl.STATIC_DRAW);
    this.lines.push({ b: b, count: pts.length / 3, subject: subject });
  };

  /** Sea to the horizon. Without it the country is a chart; with it the
   *  frame is a place. `act` carries the sun path down the water. */
  World.prototype.buildSea = function () {
    var gl = this.gl, pos = [], nrm = [], act = [];
    var S = 190, N = 30;
    var sunX = px(GBG.lng) - 5;
    for (var i = 0; i < N; i++)
      for (var j = 0; j < N; j++) {
        var x0 = -S + (2 * S * i) / N, x1 = -S + (2 * S * (i + 1)) / N;
        var z0 = -S + (2 * S * j) / N, z1 = -S + (2 * S * (j + 1)) / N;
        var q = [[x0, z0], [x1, z0], [x1, z1], [x0, z0], [x1, z1], [x0, z1]];
        for (var k = 0; k < q.length; k++) {
          pos.push(q[k][0], 0, q[k][1]);
          nrm.push(0, 1, 0);
          var d = Math.abs(q[k][0] - sunX);
          act.push(Math.exp(-(d * d) / 46));
        }
      }
    function buf(arr) {
      var b = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(arr), gl.STATIC_DRAW);
      return { b: b };
    }
    this.sea = { pos: buf(pos), nrm: buf(nrm), act: buf(act), count: pos.length / 3 };
  };

  World.prototype.buildSky = function () {
    var gl = this.gl, b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    this.sky = b;
  };

  World.prototype.resize = function () {
    var dpr = Math.min(global.devicePixelRatio || 1, 1.75);
    var w = Math.floor(this.canvas.clientWidth * dpr) || this.canvas.width;
    var h = Math.floor(this.canvas.clientHeight * dpr) || this.canvas.height;
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w; this.canvas.height = h;
    }
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  };

  /* ── flight path ─────────────────────────────────────────────────────
     From Scandinavia entire down to a low oblique over the Göta älv mouth.
     The last key is deliberately eye-level-ish with the horizon high in
     frame: that is where real photography takes over from geometry. */
  var GX = px(GBG.lng), GZ = pz(GBG.lat);
  var KEYS = [
    { eye: [GX - 11.0, 14.6, GZ + 20.0], at: [GX + 2.2, 0.5, GZ - 4.0], fov: 40, horizon: -0.24 },
    { eye: [GX - 8.2, 8.4, GZ + 13.6], at: [GX + 0.8, 0.4, GZ - 1.6], fov: 38, horizon: -0.10 },
    { eye: [GX - 5.2, 3.9, GZ + 8.2], at: [GX - 0.1, 0.32, GZ - 0.8], fov: 36, horizon: 0.04 },
    { eye: [GX - 3.05, 1.72, GZ + 4.85], at: [GX + 0.70, 0.26, GZ - 1.15], fov: 33, horizon: 0.13 },
  ];
  function smooth(t) { return t * t * (3 - 2 * t); }
  function lerp3(a, b, f) {
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
  }

  World.prototype.render = function (t, par) {
    var gl = this.gl;
    this.resize();

    var n = KEYS.length - 1;
    var g = Math.min(0.9999, Math.max(0, t)) * n;
    var i = Math.floor(g), f = smooth(g - i);
    var a = KEYS[i], b = KEYS[Math.min(n, i + 1)];
    var eye = lerp3(a.eye, b.eye, f), at = lerp3(a.at, b.at, f);
    if (par) {
      // pointer parallax: shift the look-at a touch, the eye less — depth
      var s = 0.5 + 2.2 * (1 - t);
      at = [at[0] + par.dx * s, at[1] + par.dy * s * 0.35, at[2] + par.dy * s * 0.5];
      eye = [eye[0] + par.dx * s * 0.35, eye[1], eye[2]];
    }
    var fov = ((a.fov + (b.fov - a.fov) * f) * Math.PI) / 180;


    var aspect = this.canvas.width / Math.max(1, this.canvas.height);
    var view = lookAt(eye, at, [0, 1, 0]);
    var mvp = mul(perspective(fov, aspect, 0.04, 420), view);
    this._mvp = mvp;

    /* The sky is drawn in screen space, so its horizon must be derived from
       the real camera — otherwise a seam appears where the painted horizon
       and the sea's true horizon disagree. Project a point at sea level,
       far along the flattened view direction, and read its NDC height. */
    var fx = at[0] - eye[0], fz = at[2] - eye[2];
    var fl = Math.hypot(fx, fz) || 1;
    var hx = eye[0] + (fx / fl) * 360, hz = eye[2] + (fz / fl) * 360;
    var cw = mvp[3] * hx + mvp[7] * 0 + mvp[11] * hz + mvp[15];
    var cy = mvp[1] * hx + mvp[5] * 0 + mvp[9] * hz + mvp[13];
    var horizonY = Math.max(-1.2, Math.min(1.2, cy / (cw || 1e-6)));

    var hazeNear = 4.5 + 20 * (1 - t);
    var hazeFar = 26 + 120 * (1 - t);
    var HAZE = [0.855, 0.879, 0.894];
    var SUNCOL = [1.0, 0.856, 0.672];
    /* optional palette override: caller may set world.palette = {haze, sun,
       zenith, horizon, seaNear, seaFar, landLow, landHigh} */
    var P = this.palette || {};
    if (P.haze) HAZE = P.haze;
    if (P.sun) SUNCOL = P.sun;
    function pv(key, a, b, c) { return P[key] || [a, b, c]; }

    gl.depthMask(false);
    gl.disable(gl.DEPTH_TEST);
    var sp = this.skyProg;
    gl.useProgram(sp);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.sky);
    var aP = gl.getAttribLocation(sp, "aP");
    gl.enableVertexAttribArray(aP);
    gl.vertexAttribPointer(aP, 2, gl.FLOAT, false, 0, 0);
    gl.uniform3fv(gl.getUniformLocation(sp, "uZenith"), pv("zenith", 0.442, 0.592, 0.712));
    gl.uniform3fv(gl.getUniformLocation(sp, "uHorizon"), pv("horizon", 0.855, 0.879, 0.894));
    gl.uniform3fv(gl.getUniformLocation(sp, "uSunCol"), pv("skySun", 0.46, 0.32, 0.15));
    gl.uniform1f(gl.getUniformLocation(sp, "uHorizonY"), horizonY);
    gl.uniform1f(gl.getUniformLocation(sp, "uSunX"), -0.42);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
    gl.clear(gl.DEPTH_BUFFER_BIT);

    function bindMesh(prog, m) {
      var aPos = gl.getAttribLocation(prog, "aPos");
      var aNorm = gl.getAttribLocation(prog, "aNorm");
      var aAct = gl.getAttribLocation(prog, "aAct");
      gl.bindBuffer(gl.ARRAY_BUFFER, m.pos.b);
      gl.enableVertexAttribArray(aPos); gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, m.nrm.b);
      gl.enableVertexAttribArray(aNorm); gl.vertexAttribPointer(aNorm, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, m.act.b);
      gl.enableVertexAttribArray(aAct); gl.vertexAttribPointer(aAct, 1, gl.FLOAT, false, 0, 0);
    }

    // sea
    var sq = this.seaProg;
    gl.useProgram(sq);
    gl.uniformMatrix4fv(gl.getUniformLocation(sq, "uMVP"), false, mvp);
    gl.uniformMatrix4fv(gl.getUniformLocation(sq, "uView"), false, view);
    gl.uniform3fv(gl.getUniformLocation(sq, "uHaze"), HAZE);
    gl.uniform1f(gl.getUniformLocation(sq, "uHazeNear"), hazeNear);
    gl.uniform1f(gl.getUniformLocation(sq, "uHazeFar"), hazeFar);
    gl.uniform3fv(gl.getUniformLocation(sq, "uSeaNear"), pv("seaNear", 0.310, 0.408, 0.474));
    gl.uniform3fv(gl.getUniformLocation(sq, "uSeaFar"), pv("seaFar", 0.622, 0.694, 0.744));
    gl.uniform3fv(gl.getUniformLocation(sq, "uSunCol"), SUNCOL);
    bindMesh(sq, this.sea);
    gl.drawArrays(gl.TRIANGLES, 0, this.sea.count);

    // land
    var p = this.prog;
    gl.useProgram(p);
    gl.uniformMatrix4fv(gl.getUniformLocation(p, "uMVP"), false, mvp);
    gl.uniformMatrix4fv(gl.getUniformLocation(p, "uView"), false, view);
    gl.uniform3f(gl.getUniformLocation(p, "uSun"), -0.62, 0.30, 0.72);
    gl.uniform3fv(gl.getUniformLocation(p, "uSunCol"), SUNCOL);
    gl.uniform3fv(gl.getUniformLocation(p, "uLow"), pv("landLow", 0.462, 0.496, 0.394));
    gl.uniform3fv(gl.getUniformLocation(p, "uHigh"), pv("landHigh", 0.936, 0.888, 0.762));
    gl.uniform3fv(gl.getUniformLocation(p, "uHaze"), HAZE);
    gl.uniform1f(gl.getUniformLocation(p, "uHazeNear"), hazeNear);
    gl.uniform1f(gl.getUniformLocation(p, "uHazeFar"), hazeFar);
    var uSubject = gl.getUniformLocation(p, "uSubject");
    for (var m = 0; m < this.meshes.length; m++) {
      gl.uniform1f(uSubject, this.meshes[m].subject);
      bindMesh(p, this.meshes[m]);
      gl.drawArrays(gl.TRIANGLES, 0, this.meshes[m].count);
    }

    // coastline
    var lp = this.lineProg;
    gl.useProgram(lp);
    gl.uniformMatrix4fv(gl.getUniformLocation(lp, "uMVP"), false, mvp);
    gl.uniformMatrix4fv(gl.getUniformLocation(lp, "uView"), false, view);
    gl.uniform3fv(gl.getUniformLocation(lp, "uHaze"), HAZE);
    gl.uniform1f(gl.getUniformLocation(lp, "uHazeNear"), hazeNear);
    gl.uniform1f(gl.getUniformLocation(lp, "uHazeFar"), hazeFar);
    var lPos = gl.getAttribLocation(lp, "aPos");
    var uCol = gl.getUniformLocation(lp, "uColor");
    for (var q = 0; q < this.lines.length; q++) {
      var ln = this.lines[q];
      if (ln.subject) gl.uniform3f(uCol, 0.196, 0.180, 0.152);
      else gl.uniform3f(uCol, 0.50, 0.52, 0.53);
      gl.bindBuffer(gl.ARRAY_BUFFER, ln.b);
      gl.enableVertexAttribArray(lPos);
      gl.vertexAttribPointer(lPos, 3, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.LINES, 0, ln.count);
    }
  };

  /** Screen position (CSS px) of a lat/lng point at terrain height, from the
   *  last rendered frame's camera. Null before the first frame or behind it. */
  World.prototype.project = function (lng, lat, lift) {
    var m = this._mvp;
    if (!m) return null;
    var x = px(lng), z = pz(lat);
    var h = this.heightAt(x, z, true)[0] + (lift || 0);
    var cw = m[3] * x + m[7] * h + m[11] * z + m[15];
    if (cw <= 0.05) return null;
    var cx = m[0] * x + m[4] * h + m[8] * z + m[12];
    var cy = m[1] * x + m[5] * h + m[9] * z + m[13];
    return {
      x: (cx / cw * 0.5 + 0.5) * (this.canvas.clientWidth || this.canvas.width),
      y: (1 - (cy / cw * 0.5 + 0.5)) * (this.canvas.clientHeight || this.canvas.height),
      w: cw,
    };
  };

  global.R5World = {
    /** Live world, or null when WebGL is unavailable — the caller keeps the
     *  static first frame. Never throws at the page. */
    create: function (canvas, geo, activity) {
      try { return new World(canvas, geo, activity); }
      catch (e) {
        if (global.console) console.warn("[R5] world unavailable:", e.message);
        return null;
      }
    },
  };
})(window);
