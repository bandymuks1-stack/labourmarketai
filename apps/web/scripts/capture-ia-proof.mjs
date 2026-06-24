// Owner visual-proof capture for the marketplace IA cleanup (PR #496).
//
// Why a script: the Vercel preview is behind Vercel SSO and the app uses
// Google-only magic-link auth, so an automated/headless agent cannot log in.
// You (owner) run this once; it opens a real browser, you log in with Google,
// then it captures all required screenshots at desktop + mobile — no fakes.
//
// Usage (from apps/web):
//   BASE_URL="https://<your-preview-or-local>" node scripts/capture-ia-proof.mjs
//   # e.g. BASE_URL="http://localhost:3000" after `pnpm dev`
//
// Output: ./ia-proof/<route>__<viewport>.png
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const BASE = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const OUT = "ia-proof";
mkdirSync(OUT, { recursive: true });

// route id → path. Authenticated routes assume you are logged in.
const ROUTES = [
  ["dashboard", "/lt/dashboard"],
  ["account", "/lt/dashboard/account"],
  ["mano-cv", "/lt/dashboard/journal"],
  ["player-card-redirect", "/lt/dashboard/player-card"], // should land on /journal
  ["company-channel", "/lt/dashboard/company"],
];
const VIEWPORTS = [
  ["desktop", { width: 1440, height: 900 }],
  ["mobile", { width: 390, height: 844 }],
];

const browser = await chromium.launch({ headless: false });
const context = await browser.newContext();
const page = await context.newPage();

// 1) Log in. We open the login page and wait until you reach the dashboard.
await page.goto(`${BASE}/lt/auth/login`, { waitUntil: "domcontentloaded" });
console.log("\n>>> Log in with Google in the opened browser window.");
console.log(">>> Waiting until you reach /dashboard (5 min timeout)...\n");
await page.waitForURL(/\/dashboard(\/|$|\?)/, { timeout: 5 * 60_000 });
console.log("Logged in — capturing screenshots.\n");

// 2) Capture each route at each viewport.
for (const [id, path] of ROUTES) {
  for (const [vp, size] of VIEWPORTS) {
    await page.setViewportSize(size);
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
    const finalUrl = page.url();
    const file = `${OUT}/${id}__${vp}.png`;
    await page.screenshot({ path: file, fullPage: true });
    console.log(`captured ${file}  (final URL: ${finalUrl})`);
  }
}

// 3) Header crop (admin fast-access affordance) on the dashboard, desktop.
await page.setViewportSize({ width: 1440, height: 900 });
await page.goto(`${BASE}/lt/dashboard`, { waitUntil: "networkidle" });
await page.screenshot({ path: `${OUT}/header-admin__desktop.png`, clip: { x: 0, y: 0, width: 1440, height: 96 } });
console.log(`captured ${OUT}/header-admin__desktop.png`);

console.log("\nDone. Screenshots are in apps/web/ia-proof/.");
console.log("Note the player-card-redirect__*.png final URL should be /lt/dashboard/journal.");
await browser.close();
