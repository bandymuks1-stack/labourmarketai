/**
 * Owner-review evidence harness for the provider-free interactive location map
 * (fix/owner-smoke-map-skills-journal-edit-v1, bug 1).
 *
 * It draws the SAME SVG the React component renders, using the REAL projection
 * module — same coordinates, same served-market reference dots, same marker +
 * radius — so the screenshot is faithful to production. No app auth needed.
 *
 * Run: npx tsx scripts/owner-evidence/render-map-evidence.mts
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  project,
  graticule,
  locationToPoint,
  radiusToViewBox,
  COUNTRY_CENTROIDS,
  VIEW_W,
  VIEW_H,
} from "../../apps/web/lib/location/map-projection.ts";
import type { SelectedLocation } from "../../apps/web/lib/location/location-model.ts";

function mapSvg(selected: SelectedLocation | null, radiusKm: number): string {
  const grid = graticule(5);
  const point = locationToPoint(selected);
  const ring = point ? radiusToViewBox(radiusKm, selected?.lat ?? 56) : null;
  const dots = Object.entries(COUNTRY_CENTROIDS)
    .map(([code, c]) => {
      const p = project(c.lat, c.lng);
      const sel = selected?.country === code;
      return `<circle cx="${p.x}" cy="${p.y}" r="${sel ? 1.4 : 0.9}" fill="rgb(37 99 235)" fill-opacity="${sel ? 0.9 : 0.45}" /><text x="${p.x + 1.6}" y="${p.y + 0.8}" font-size="2.6" fill="rgb(148 163 184)">${code}</text>`;
    })
    .join("");
  const marker =
    point && ring
      ? `<ellipse cx="${point.x}" cy="${point.y}" rx="${Math.max(ring.rx, 1)}" ry="${Math.max(ring.ry, 1)}" fill="rgb(34 211 238)" fill-opacity="0.12" stroke="rgb(34 211 238)" stroke-opacity="0.5" stroke-width="0.4" /><circle cx="${point.x}" cy="${point.y}" r="1.6" fill="rgb(34 211 238)" /><circle cx="${point.x}" cy="${point.y}" r="0.7" fill="rgb(10 14 20)" />`
      : "";
  const vlines = grid.vertical
    .map((v) => `<line x1="${v.x}" y1="0" x2="${v.x}" y2="${VIEW_H}" />`)
    .join("");
  const hlines = grid.horizontal
    .map((h) => `<line x1="0" y1="${h.y}" x2="${VIEW_W}" y2="${h.y}" />`)
    .join("");
  return `<svg viewBox="0 0 ${VIEW_W} ${VIEW_H}" preserveAspectRatio="none" style="height:176px;width:100%;border-radius:8px">
    <rect x="0" y="0" width="${VIEW_W}" height="${VIEW_H}" fill="rgb(10 14 20)" />
    <g stroke="rgb(37 99 235)" stroke-opacity="0.12" stroke-width="0.25">${vlines}${hlines}</g>
    <g>${dots}</g>${marker}
  </svg>`;
}

const base = {
  region: null,
  address: null,
  radiusKm: 25 as const,
  savedAt: 1,
};
const auto: SelectedLocation = {
  ...base,
  source: "auto",
  lat: 54.69,
  lng: 25.28,
  country: null,
}; // Vilnius
const manual: SelectedLocation = {
  ...base,
  source: "manual",
  lat: null,
  lng: null,
  country: "SE",
};

const panel = (title: string, sub: string, svg: string): string => `
  <div style="background:rgb(13 18 26);border:1px solid rgb(30 41 59);border-radius:12px;padding:12px;margin-bottom:16px">
    <div style="font:600 14px system-ui;color:rgb(226 232 240);margin-bottom:8px">${title}</div>
    <div style="background:rgb(10 14 20 / .6);border:1px solid rgb(51 65 85);border-radius:12px;padding:12px">
      ${svg}
      <p style="text-align:center;font:11px system-ui;color:rgb(148 163 184);margin:8px 0 0">${sub}</p>
    </div>
  </div>`;

const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{margin:0;background:rgb(2 6 12);padding:20px;font-family:system-ui}</style></head>
<body data-testid="map-evidence">
  <h1 style="font:700 18px system-ui;color:rgb(226 232 240)">Provider-free interactive location map — owner evidence</h1>
  <p style="font:13px system-ui;color:rgb(148 163 184)">Real coordinate map of served markets. Reference dots = real country centroids. Tapping the map sets a real coordinate (inverse projection). No external tiles, no API key.</p>
  ${panel("Automatic / tapped location — Vilnius (54.69, 25.28), 25&nbsp;km", "54.6900, 25.2800 · radius 25 km", mapSvg(auto, 25))}
  ${panel("Manual country selection — Sweden (centroid), 50&nbsp;km", "Sweden · radius 50 km", mapSvg({ ...manual, radiusKm: 50 }, 50))}
  ${panel("Empty state — no location chosen", "No location chosen yet", mapSvg(null, 25))}
</body></html>`;

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(
  here,
  "..",
  "..",
  "docs",
  "audits",
  "evidence",
  "owner-smoke-map-skills-journal-edit-v1",
);
mkdirSync(outDir, { recursive: true });
const outFile = join(outDir, "market-map.html");
writeFileSync(outFile, html, "utf8");
console.log("WROTE", outFile);
