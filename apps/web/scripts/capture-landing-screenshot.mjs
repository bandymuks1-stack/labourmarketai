/**
 * Landing screenshot capture for the trust-positioning copy (read-only).
 * Captures the landing hero (en + lt, desktop + mobile) against a running server.
 * OUT defaults to an ABSOLUTE repo path so it never lands in a stray apps/docs.
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const BASE = process.env.BASE || "http://localhost:3100";
// process.cwd() is apps/web when run via pnpm -F web; repo root is two levels up.
const OUT = process.env.OUT ||
  resolve(process.cwd(), "..", "..", "docs", "evidence", "trust-positioning-v1", "screenshots");

const ROUTES = [
  { path: "/en", name: "landing-en" },
  { path: "/lt", name: "landing-lt" },
];
const DESKTOP = { width: 1366, height: 900 };
const MOBILE = { width: 390, height: 844 };

const browser = await chromium.launch();
mkdirSync(OUT, { recursive: true });
for (const [vp, suffix] of [[DESKTOP, "desktop"], [MOBILE, "mobile"]]) {
  const ctx = await browser.newContext({ viewport: vp });
  const page = await ctx.newPage();
  for (const r of ROUTES) {
    await page.goto(BASE + r.path, { waitUntil: "networkidle", timeout: 60000 });
    await page.waitForTimeout(500);
    // Capture just the top of the page (hero) — clip to viewport height x2.
    await page.screenshot({ path: `${OUT}/${r.name}-${suffix}.png`, clip: { x: 0, y: 0, width: vp.width, height: Math.min(vp.height * 2, 1600) } });
    console.log(`captured ${r.name}-${suffix}`);
  }
  await ctx.close();
}
await browser.close();
console.log("done →", OUT);
