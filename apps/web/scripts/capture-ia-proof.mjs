// Owner visual-proof capture for the marketplace IA cleanup (PR #496).
//
// Why a script: the Vercel preview is behind Vercel SSO and the app uses
// Google-only auth, so an automated/headless agent cannot log in. You (owner)
// run this once locally; it opens a REAL, headed browser, you log in with
// Google by hand, then it captures all required screenshots at desktop +
// mobile — no fakes, no stored production credentials beyond your own manual
// browser login.
//
// The browser uses a PERSISTENT user-data directory
// (apps/web/.playwright-ia-proof-profile) so your Google session survives
// between runs — log in once, re-run without logging in again.
//
// Usage (from apps/web, with `pnpm dev` already running):
//   node scripts/capture-ia-proof.mjs
//   # or against another origin:
//   BASE_URL="http://localhost:3000" node scripts/capture-ia-proof.mjs
//
// Output: apps/web/ia-proof/<route>__<viewport>.png
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { createInterface } from "node:readline";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Resolve paths relative to apps/web (the parent of this scripts/ dir) so the
// script works no matter what cwd it is launched from.
const APP_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
const PROFILE_DIR = join(APP_DIR, ".playwright-ia-proof-profile");
const OUT = join(APP_DIR, "ia-proof");

const BASE = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");

mkdirSync(OUT, { recursive: true });

// route id → path. Authenticated routes assume you are logged in.
// IA cleanup v2 (PR #497): the compact-nav surfaces the owner verifies on the
// preview — dashboard command center, marketplace hub, profile (identity),
// Mano CV, account. Plus the player-card→Mano CV redirect proof and company.
const ROUTES = [
  ["dashboard", "/lt/dashboard"],
  ["marketplace", "/lt/dashboard/marketplace"],
  ["profile", "/lt/dashboard/profile"],
  ["mano-cv", "/lt/dashboard/journal"],
  ["account", "/lt/dashboard/account"],
  ["player-card-redirect", "/lt/dashboard/player-card"], // should redirect to Mano CV (/journal)
  ["company-channel", "/lt/dashboard/company"], // commercial/company surface from this branch
];
const VIEWPORTS = [
  ["desktop", { width: 1440, height: 900 }],
  ["mobile", { width: 390, height: 844 }],
];

function waitForEnter(promptText) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(promptText, () => {
      rl.close();
      resolve();
    });
  });
}

// Persistent context = the browser keeps its own user-data dir, so the Google
// login session is preserved across runs. headless:false → you can interact.
const context = await chromium.launchPersistentContext(PROFILE_DIR, {
  headless: false,
  viewport: { width: 1440, height: 900 },
});
const page = context.pages()[0] ?? (await context.newPage());

// 1) Open the login page. We do NOT close the browser here — you log in by hand.
await page.goto(`${BASE}/lt/auth/login`, { waitUntil: "domcontentloaded" });

console.log("\n========================================================");
console.log("Log in manually with Google, then press Enter in this terminal to continue.");
console.log("(Do not close the browser window.)");
console.log("========================================================\n");

// 2) Block until the owner has finished logging in and presses Enter.
await waitForEnter("Press Enter once you are logged in and on the dashboard... ");
console.log("\nContinuing — capturing screenshots.\n");

// 3) Capture each route at each viewport.
for (const [id, path] of ROUTES) {
  for (const [vp, size] of VIEWPORTS) {
    await page.setViewportSize(size);
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
    const finalUrl = page.url();
    const file = join(OUT, `${id}__${vp}.png`);
    await page.screenshot({ path: file, fullPage: true });
    console.log(`captured ${id}__${vp}.png  (final URL: ${finalUrl})`);

    // Proof that player-card redirects to the Mano CV surface (/journal).
    if (id === "player-card-redirect") {
      const ok = /\/lt\/dashboard\/journal(\/|$|\?)/.test(finalUrl);
      console.log(
        `  >>> player-card final URL [${vp}]: ${finalUrl}  ${ok ? "✓ redirected to Mano CV (/journal)" : "✗ did NOT redirect to /journal"}`,
      );
    }
  }
}

// 4) Header crop (admin fast-access affordance) on the dashboard, desktop.
await page.setViewportSize({ width: 1440, height: 900 });
await page.goto(`${BASE}/lt/dashboard`, { waitUntil: "networkidle" });
await page.screenshot({
  path: join(OUT, "header-admin__desktop.png"),
  clip: { x: 0, y: 0, width: 1440, height: 96 },
});
console.log("captured header-admin__desktop.png");

console.log("\nDone. Screenshots are in apps/web/ia-proof/.");
console.log("The player-card-redirect__*.png final URL should be /lt/dashboard/journal (Mano CV).");

await context.close();
