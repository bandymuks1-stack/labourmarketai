#!/usr/bin/env node
/**
 * Generate the native app icon, Android adaptive-icon layers and splash image
 * FROM THE EXISTING BRAND MARK — no new artwork.
 *
 *   source:  apps/web/public/app-icon.svg  (the LM mark the website already
 *            ships as its favicon / PWA icon; its geometry is the owner's
 *            original vector, see the comment inside that file)
 *   output:  apps/mobile/assets/*.png      (committed; wired in app.json)
 *
 * Re-run after the brand mark changes:
 *
 *   pnpm install                       # sharp comes from apps/web's deps
 *   node apps/mobile/scripts/generate-app-assets.mjs
 *   node apps/mobile/scripts/generate-app-assets.mjs --check   # CI-style: fail if stale
 *
 * The mark (`<g>` with its transform) is lifted out of the SVG verbatim and
 * only RE-PLACED on differently sized canvases, because each platform has its
 * own geometry rule:
 *
 *   icon.png                    1024², opaque, SQUARE corners. Apple rejects an
 *                               icon with transparency and applies its own
 *                               corner mask, so the web tile's rx=7 is dropped.
 *   adaptive-icon.png           1024² foreground, transparent. Android masks
 *                               adaptive icons to a circle/squircle and keeps
 *                               only the inner 66% safe zone, so the mark is
 *                               scaled to fit inside that circle.
 *   adaptive-icon-monochrome.png same placement, single colour (white) —
 *                               Android 13+ themed icons tint it.
 *   splash-icon.png             1024², transparent; expo-splash-screen centres
 *                               it on the background colour (Android 12+ also
 *                               masks it to a circle, hence the same safe zone).
 *
 * STATUS: this is the existing brand mark, applied mechanically. Final store
 * artwork (icon, splash, feature graphic) still needs OWNER APPROVAL at the
 * publishing stage — docs/mobile/STORE_RELEASE_READINESS_2026-09-13.md §4.1.
 */
import { createRequire } from "node:module";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../../..");
const SOURCE = join(REPO, "apps/web/public/app-icon.svg");
const OUT = join(REPO, "apps/mobile/assets");
const CHECK = process.argv.includes("--check");

// sharp is a dependency of apps/web (image optimisation) — resolved from there
// so the mobile app gains no build-time dependency for a one-off generator.
const require = createRequire(join(REPO, "apps/web/package.json"));
const sharp = require("sharp");

/** Brand colours, read from the source rather than restated. */
const svg = readFileSync(SOURCE, "utf8");
const tileFill = /<rect[^>]*fill="(#[0-9A-Fa-f]{6})"/.exec(svg)?.[1];
const markMatch = /<g transform="translate\(([-\d.]+) ([-\d.]+)\) scale\(([-\d.]+)\)" fill="(#[0-9A-Fa-f]{6})">([\s\S]*?)<\/g>/.exec(svg);
if (!tileFill || !markMatch) {
  throw new Error(`could not find the tile <rect> and mark <g> in ${SOURCE} — the generator's premise changed`);
}
const [, , , srcScale, markFill, markBody] = markMatch;

/**
 * The mark's ink bounding box in its own coordinates (from the source SVG's
 * comment: x 89.02..653.21, y 123.09..537.11). Verified against the polygon
 * points + circle below, so a changed mark fails loudly instead of drifting.
 */
const INK = { x0: 89.02, y0: 123.09, x1: 653.21, y1: 537.11 };
{
  const nums = [...markBody.matchAll(/points="([^"]+)"/g)].flatMap((m) =>
    m[1].trim().split(/\s+/).map((p) => p.split(",").map(Number)),
  );
  const c = /cx="([\d.]+)" cy="([\d.]+)" r="([\d.]+)"/.exec(markBody);
  const xs = nums.map((p) => p[0]).concat(c ? [Number(c[1]) + Number(c[3])] : []);
  const ys = nums.map((p) => p[1]).concat(c ? [Number(c[2]) + Number(c[3])] : []);
  const near = (a, b) => Math.abs(a - b) < 0.5;
  if (!near(Math.min(...xs), INK.x0) || !near(Math.max(...xs), INK.x1) || !near(Math.min(...ys), INK.y0) || !near(Math.max(...ys), INK.y1)) {
    throw new Error("the mark's ink box no longer matches the documented box — update INK after checking the new artwork");
  }
  if (!(Number(srcScale) > 0)) throw new Error("unexpected mark scale");
}
const INK_W = INK.x1 - INK.x0;
const INK_H = INK.y1 - INK.y0;

/**
 * An SVG of `size`² with the mark centred, its ink WIDTH being `widthShare`
 * of the canvas. `background` null = transparent.
 */
function compose({ size, widthShare, background, fill }) {
  const scale = (size * widthShare) / INK_W;
  const tx = (size - INK_W * scale) / 2 - INK.x0 * scale;
  const ty = (size - INK_H * scale) / 2 - INK.y0 * scale;
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
      (background ? `<rect width="${size}" height="${size}" fill="${background}"/>` : "") +
      `<g transform="translate(${tx.toFixed(3)} ${ty.toFixed(3)}) scale(${scale.toFixed(6)})" fill="${fill}">${markBody}</g>` +
      `</svg>`,
  );
}

/**
 * Placement. The web tile puts the 24-unit-wide mark in a 32-unit tile (75%).
 * Inside a masked circle with a 66% safe zone, the ink box's DIAGONAL must
 * fit: at 50% width the box is 0.50 × 0.37 → diagonal 0.62 < 0.66.
 */
const TARGETS = [
  { file: "icon.png", size: 1024, widthShare: 0.75, background: tileFill, fill: markFill, flatten: true },
  { file: "adaptive-icon.png", size: 1024, widthShare: 0.5, background: null, fill: markFill },
  { file: "adaptive-icon-monochrome.png", size: 1024, widthShare: 0.5, background: null, fill: "#FFFFFF" },
  { file: "splash-icon.png", size: 1024, widthShare: 0.5, background: null, fill: markFill },
];

mkdirSync(OUT, { recursive: true });
let stale = 0;
for (const t of TARGETS) {
  let img = sharp(compose(t), { density: 72 }).resize(t.size, t.size);
  // Apple: no alpha channel at all on the store icon.
  img = t.flatten ? img.flatten({ background: t.background }).removeAlpha() : img.ensureAlpha();
  const png = await img.png({ compressionLevel: 9 }).toBuffer();
  const dest = join(OUT, t.file);
  if (CHECK) {
    const same = existsSync(dest) && Buffer.compare(readFileSync(dest), png) === 0;
    if (!same) {
      stale++;
      console.error(`STALE ${t.file} — re-run without --check`);
    }
    continue;
  }
  writeFileSync(dest, png);
  const meta = await sharp(png).metadata();
  console.log(`wrote apps/mobile/assets/${t.file}  ${meta.width}x${meta.height}  alpha=${meta.hasAlpha}  ${png.length} bytes`);
}
if (CHECK && stale > 0) process.exit(1);
console.log(`brand: tile ${tileFill}, mark ${markFill} — from apps/web/public/app-icon.svg`);
