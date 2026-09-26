/**
 * R5 keyframe harness — local file:// prototype only. Not a test.
 * Run from apps/web:  node ../../docs/design/living-world-r5/shoot.mjs
 *
 * The camera is scroll-driven, so a "frame" is a camera position. Each
 * capture parks the camera on a beat and lets the plates settle — that IS
 * the freeze-frame test: logo and UI off, would this be a frame from a
 * premium brand film?
 *
 * SwiftShader flags are passed so the WebGL landscape renders on a headless
 * machine with no GPU; on real hardware the same page uses the GPU.
 */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(join(process.cwd(), "package.json"));
const { chromium } = require("@playwright/test");

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "screenshots");
mkdirSync(outDir, { recursive: true });
const url = "file:///" + join(here, "flagship-goteborg.html").replace(/\\/g, "/");

/** beat index → keyframe name. Indices match .static-beat document order. */
const KEYS = [
  [0, "01-country"],
  [1, "02-region"],
  [2, "03-coast"],
  [3, "04-city"],
  [4, "05-quay"],
  [6, "06-worker"],
  [7, "07-detail"],
  [8, "08-work-journal"],
  [9, "09-what-is-known"],
  [10, "10-new-direction"],
  [12, "11-kitchen"],
  [14, "12-pull-back"],
];

const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});

async function park(page, beat) {
  await page.evaluate((k) => window.R5Camera && window.R5Camera.goTo(k), beat);
  await page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  );
  await page.waitForTimeout(650);
}

// ── desktop 1440×900 ─────────────────────────────────────────────────────
let page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(url, { waitUntil: "networkidle" });
await page.waitForTimeout(2200);
const state = await page.evaluate(() =>
  window.R5Camera ? { beats: window.R5Camera.beats, world: window.R5Camera.hasWorld } : null,
);
console.log("camera:", JSON.stringify(state));
for (const [beat, name] of KEYS) {
  await park(page, beat);
  await page.screenshot({ path: join(outDir, `desktop-${name}.png`) });
}
await page.close();

// ── mobile 390×844 — its own direction, not a crop ───────────────────────
page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2,
});
await page.goto(url, { waitUntil: "networkidle" });
await page.waitForTimeout(2200);
for (const [beat, name] of KEYS) {
  await park(page, beat);
  await page.screenshot({ path: join(outDir, `mobile-${name}.png`) });
}
await page.close();

// ── reduced motion: the L0 document must carry EVERYTHING ────────────────
page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
  reducedMotion: "reduce",
});
await page.goto(url, { waitUntil: "networkidle" });
await page.waitForTimeout(1200);
await page.screenshot({
  path: join(outDir, "reduced-motion-full.png"),
  fullPage: true,
});
await page.close();

await browser.close();
console.log("keyframes written to", outDir);
