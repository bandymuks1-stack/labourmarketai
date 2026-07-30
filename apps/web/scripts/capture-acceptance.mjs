/**
 * Acceptance screenshot capture — the owner's required evidence matrix.
 *
 * Headless Playwright, so it does NOT depend on the Claude Browser pane being
 * displayed (that pane cannot composite frames when hidden, which made
 * screenshots impossible through it).
 *
 * The matrix the owner requires for landing acceptance is 1440/390 × dark/light.
 * Theme is NOT `prefers-color-scheme` in this app: `theme-reapply.tsx` reads the
 * shared localStorage "theme" key and stamps `data-theme` on <html>, defaulting
 * to LIGHT. So the theme is seeded via addInitScript BEFORE first paint —
 * toggling after load would capture a transition rather than a settled page.
 *
 * Usage:
 *   node scripts/capture-acceptance.mjs --label before --routes /lt
 *   BASE=http://localhost:3000 node scripts/capture-acceptance.mjs --label after
 *
 * Output: docs/evidence/premium-unified-product-v1/<label>/<route>-<vp>-<theme>.png
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { resolve, join } from "node:path";

const args = process.argv.slice(2);
function arg(name, fallback) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}

const BASE = process.env.BASE || "http://localhost:3000";
const LABEL = arg("label", "before");
const ROUTES = arg("routes", "/lt").split(",").map((r) => r.trim()).filter(Boolean);
const FULL = args.includes("--full-page");

// process.cwd() is apps/web; repo root is two levels up.
const OUT = resolve(
  process.cwd(),
  "..",
  "..",
  "docs",
  "evidence",
  "premium-unified-product-v1",
  LABEL,
);

/** The owner's required viewports. 1440 and 390 are the acceptance gate; the
 *  others exist so a regression at an in-between width is still visible. */
const VIEWPORTS = [
  { name: "1440", width: 1440, height: 900 },
  { name: "390", width: 390, height: 844 },
];
const THEMES = ["light", "dark"];

const browser = await chromium.launch();
mkdirSync(OUT, { recursive: true });

let count = 0;
for (const vp of VIEWPORTS) {
  for (const theme of THEMES) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      colorScheme: theme,
      deviceScaleFactor: 2,
    });
    // Seed the theme before any script runs, so the first paint is already
    // correct and no toggle animation is captured.
    await ctx.addInitScript(
      ([t]) => {
        try {
          localStorage.setItem("theme", t);
          document.documentElement.setAttribute("data-theme", t);
        } catch {
          /* storage unavailable — the attribute alone still themes the page */
        }
      },
      [theme],
    );

    const page = await ctx.newPage();
    for (const route of ROUTES) {
      const slug = route.replace(/^\//, "").replace(/\//g, "-") || "root";
      const url = `${BASE}${route}`;
      await page.goto(url, { waitUntil: "networkidle", timeout: 60_000 });
      // Let entrance motion settle — a screenshot mid-animation reads as a
      // layout bug that is not there.
      await page.waitForTimeout(1200);
      const file = join(OUT, `${slug}-${vp.name}-${theme}.png`);
      await page.screenshot({ path: file, fullPage: FULL });
      count += 1;
      console.info(`[capture] ${slug} ${vp.name} ${theme} -> ${file}`);
    }
    await ctx.close();
  }
}

await browser.close();
console.info(`[capture] ${count} screenshots written to ${OUT}`);
