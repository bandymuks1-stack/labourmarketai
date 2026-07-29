/** P0 verification: the Google button navigates in the SAME tab (no popup). */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const BASE = process.env.BASE || "http://localhost:3100";
const OUT = resolve(process.cwd(), "..", "..", "docs", "audits", "evidence", "owner-rebuild-after");
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
let popupCount = 0;
ctx.on("page", () => { popupCount += 1; }); // any NEW page after the first = popup
const page = await ctx.newPage();
popupCount = 0; // reset after our own page

await page.goto(`${BASE}/lt/auth/login`, { waitUntil: "networkidle", timeout: 90000 });
await page.screenshot({ path: `${OUT}/p0-login-before-click.png` });

// No GIS script may be loaded on the auth surface.
const gis = await page.evaluate(() =>
  Array.from(document.querySelectorAll("script[src]")).map((s) => s.src).filter((s) => s.includes("gsi")),
);
console.log("GIS scripts on page:", JSON.stringify(gis));

const btn = page.getByRole("button", { name: /google/i }).first();
console.log("google button visible:", await btn.isVisible());

await Promise.all([
  page.waitForURL(/supabase\.co|accounts\.google\.com/, { timeout: 30000 }).catch((e) => console.log("nav wait:", e.message)),
  btn.click(),
]);
await page.waitForTimeout(2500);
console.log("same-tab URL after click:", page.url());
console.log("popup windows opened:", popupCount);
await page.screenshot({ path: `${OUT}/p0-after-click-same-tab.png` });
await browser.close();
