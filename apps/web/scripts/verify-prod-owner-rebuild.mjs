/** POST-DEPLOY verification on the real production domain (read-only). */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const BASE = process.env.BASE || "https://labourmarket.ai";
const OUT = resolve(process.cwd(), "..", "..", "docs", "audits", "evidence", "owner-rebuild-after");
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
let failures = 0;
const check = (name, ok, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${extra ? " — " + extra : ""}`);
  if (!ok) failures += 1;
};

// ── landing desktop + mobile ────────────────────────────────────────────────
for (const [vp, suffix] of [[{ width: 1440, height: 900 }, "1440"], [{ width: 390, height: 844 }, "390"]]) {
  const ctx = await browser.newContext({ viewport: vp });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/lt`, { waitUntil: "networkidle", timeout: 120000 });
  await page.waitForTimeout(1500);
  check(`landing@${suffix} live-product-demo`, await page.getByTestId("live-product-demo").isVisible());
  check(`landing@${suffix} market-moment`, await page.getByTestId("market-moment").isVisible());
  check(`landing@${suffix} #how-it-works`, (await page.locator("#how-it-works").count()) === 1);
  check(`landing@${suffix} old world canvas gone`, (await page.locator('svg[viewBox="0 0 1000 389"]').count()) === 0);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(`landing@${suffix} no horizontal scroll`, overflow <= 1, `overflow=${overflow}`);
  await page.screenshot({ path: `${OUT}/prod-after-landing-${suffix}-full.png`, fullPage: true });
  await page.screenshot({ path: `${OUT}/prod-after-landing-${suffix}-hero.png` });
  await ctx.close();
}

// ── P0: login page, same-tab Google, zero popups ────────────────────────────
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  let popups = 0;
  ctx.on("page", () => { popups += 1; });
  const page = await ctx.newPage();
  popups = 0;
  await page.goto(`${BASE}/lt/auth/login`, { waitUntil: "networkidle", timeout: 120000 });
  const gis = await page.evaluate(() =>
    Array.from(document.querySelectorAll("script[src]")).map((s) => s.src).filter((s) => s.includes("gsi")),
  );
  check("login: no GIS script", gis.length === 0, JSON.stringify(gis));
  await page.screenshot({ path: `${OUT}/prod-after-login-1440.png` });
  const btn = page.getByRole("button", { name: /google/i }).first();
  check("login: google button visible", await btn.isVisible());
  await Promise.all([
    page.waitForURL(/supabase\.co|accounts\.google\.com/, { timeout: 45000 }).catch(() => {}),
    btn.click(),
  ]);
  await page.waitForTimeout(2000);
  const sameTab = /accounts\.google\.com|supabase\.co/.test(page.url());
  check("login: same-tab redirect", sameTab, page.url().slice(0, 90));
  check("login: zero popup windows", popups === 0, `popups=${popups}`);
  await page.screenshot({ path: `${OUT}/prod-after-google-same-tab.png` });
  await ctx.close();
}

await browser.close();
console.log(failures === 0 ? "ALL PROD CHECKS PASS" : `${failures} CHECKS FAILED`);
process.exit(failures === 0 ? 0 : 1);
