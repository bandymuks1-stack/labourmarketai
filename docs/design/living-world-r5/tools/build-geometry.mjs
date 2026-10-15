/**
 * R5 — build the world's real geometry.
 *
 * Pulls the Natural Earth 1:50m country outlines (public domain, via the
 * `world-atlas` package), decodes the TopoJSON inline (no dependency), keeps
 * Sweden and its Nordic neighbours for context, simplifies, and writes a
 * small local file the prototype can load offline.
 *
 *   node docs/design/living-world-r5/tools/build-geometry.mjs
 *
 * The result is REAL geography. The prototype never draws an invented
 * coastline: if this file is missing, the world does not render.
 *
 * City coordinates are public geographic fact and are listed explicitly
 * below — they are NOT derived from vacancy rows, which carry no lat/lng.
 */
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "assets", "geo");
mkdirSync(outDir, { recursive: true });

const SRC = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json";

/* ── minimal TopoJSON decode (arcs + quantisation transform) ─────────────── */
function decodeArcs(topo) {
  const { scale, translate } = topo.transform;
  return topo.arcs.map((arc) => {
    let x = 0;
    let y = 0;
    return arc.map(([dx, dy]) => {
      x += dx;
      y += dy;
      return [x * scale[0] + translate[0], y * scale[1] + translate[1]];
    });
  });
}

function ringFromArcIndexes(arcs, idxs) {
  const pts = [];
  for (const i of idxs) {
    const arc = i < 0 ? arcs[~i].slice().reverse() : arcs[i];
    // drop the joining duplicate point
    for (let k = pts.length ? 1 : 0; k < arc.length; k++) pts.push(arc[k]);
  }
  return pts;
}

/** Ramer–Douglas–Peucker, degrees. Keeps the silhouette recognizable while
 *  cutting the point count by ~90%. */
function simplify(points, tol) {
  if (points.length < 3) return points;
  let maxD = 0;
  let idx = 0;
  const [ax, ay] = points[0];
  const [bx, by] = points[points.length - 1];
  const dx = bx - ax;
  const dy = by - ay;
  const den = Math.hypot(dx, dy);
  for (let i = 1; i < points.length - 1; i++) {
    const [px, py] = points[i];
    // Degenerate baseline (a closed or near-closed span): fall back to the
    // radial distance from the anchor, otherwise every ring collapses to
    // two points and the coastline disappears.
    const d =
      den < 1e-9
        ? Math.hypot(px - ax, py - ay)
        : Math.abs(dy * px - dx * py + bx * ay - by * ax) / den;
    if (d > maxD) {
      maxD = d;
      idx = i;
    }
  }
  if (maxD <= tol) return [points[0], points[points.length - 1]];
  return [
    ...simplify(points.slice(0, idx + 1), tol).slice(0, -1),
    ...simplify(points.slice(idx), tol),
  ];
}

/** A ring's endpoints coincide, so RDP must never see the whole ring as one
 *  span. Split it in half and simplify each open polyline. */
function simplifyRing(ring, tol) {
  if (ring.length < 8) return ring;
  const mid = Math.floor(ring.length / 2);
  const head = simplify(ring.slice(0, mid + 1), tol);
  const tail = simplify(ring.slice(mid), tol);
  return [...head.slice(0, -1), ...tail];
}

function ringArea(r) {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    a += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]);
  }
  return Math.abs(a / 2);
}

/* ── real city coordinates (public geographic fact) ───────────────────────
   Paired at render time with live counts from data/world-snapshot.json.
   A marker is a CITY, never a workplace: no vacancy row carries a
   coordinate. */
const CITIES = [
  { name: "Stockholm", lat: 59.3293, lng: 18.0686 },
  { name: "Göteborg", lat: 57.7089, lng: 11.9746 },
  { name: "Malmö", lat: 55.605, lng: 13.0038 },
  { name: "Uppsala", lat: 59.8586, lng: 17.6389 },
  { name: "Linköping", lat: 58.4109, lng: 15.6216 },
  { name: "Jönköping", lat: 57.7826, lng: 14.1618 },
  { name: "Örebro", lat: 59.2741, lng: 15.2066 },
  { name: "Umeå", lat: 63.8258, lng: 20.263 },
  { name: "Västerås", lat: 59.6099, lng: 16.5448 },
  { name: "Luleå", lat: 65.5842, lng: 22.1547 },
  { name: "Norrköping", lat: 58.5877, lng: 16.1924 },
  { name: "Lund", lat: 55.7047, lng: 13.191 },
  { name: "Helsingborg", lat: 56.0465, lng: 12.6945 },
];

/* ── run ─────────────────────────────────────────────────────────────────── */
const topo = await (await fetch(SRC)).json();
const arcs = decodeArcs(topo);
const geoms = topo.objects.countries.geometries;

/** Sweden is the subject; the neighbours give the silhouette context so the
 *  place reads as Scandinavia rather than as a floating shape. */
const WANTED = {
  Sweden: "subject",
  Norway: "context",
  Finland: "context",
  Denmark: "context",
  Estonia: "context",
  Latvia: "context",
  Lithuania: "context",
  Poland: "context",
  Germany: "context",
};

const landmasses = [];
for (const g of geoms) {
  const role = WANTED[g.properties?.name];
  if (!role) continue;
  const polys = g.type === "Polygon" ? [g.arcs] : g.arcs;
  const rings = [];
  for (const poly of polys) {
    const outer = simplifyRing(
      ringFromArcIndexes(arcs, poly[0]),
      role === "subject" ? 0.035 : 0.09,
    );
    if (outer.length < 4) continue;
    if (ringArea(outer) < (role === "subject" ? 0.02 : 0.35)) continue;
    rings.push(outer.map(([x, y]) => [+x.toFixed(3), +y.toFixed(3)]));
  }
  rings.sort((a, b) => ringArea(b) - ringArea(a));
  landmasses.push({
    name: g.properties.name,
    role,
    rings: rings.slice(0, role === "subject" ? 24 : 6),
  });
}

const out = {
  provenance: {
    source:
      "Natural Earth 1:50m admin-0 countries (public domain), via world-atlas@2 countries-50m.json",
    decoded: "TopoJSON decoded and Douglas–Peucker simplified by tools/build-geometry.mjs",
    note: "Real coastlines. City coordinates are public geographic fact, not derived from vacancy rows (which carry no lat/lng).",
  },
  cities: CITIES,
  landmasses,
};

writeFileSync(join(outDir, "nordics.json"), JSON.stringify(out));

/* A prototype must open from disk. `fetch()` is blocked on file:// in every
   Chromium-based browser, so the world's data ships as a SCRIPT that assigns
   globals — the only form that loads identically from file:// and from a
   server. The .json above stays for tooling. */
const snapshot = JSON.parse(
  readFileSync(join(here, "..", "data", "world-snapshot.json"), "utf8"),
);
writeFileSync(
  join(here, "..", "assets", "world-data.js"),
  "/* GENERATED by tools/build-geometry.mjs — do not edit by hand.\n" +
    "   Geography: Natural Earth 1:50m (public domain).\n" +
    "   Counts: labourmarket.ai production, see data/queries.sql. */\n" +
    "window.R5_GEO = " +
    JSON.stringify(out) +
    ";\nwindow.R5_DATA = " +
    JSON.stringify(snapshot) +
    ";\n",
);

const pts = landmasses.reduce(
  (n, l) => n + l.rings.reduce((m, r) => m + r.length, 0),
  0,
);
console.log(
  `wrote assets/geo/nordics.json + assets/world-data.js — ${landmasses.length} landmasses, ${pts} points, ${(
    JSON.stringify(out).length / 1024
  ).toFixed(0)}KB geo`,
);
