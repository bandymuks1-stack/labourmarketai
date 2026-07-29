/** Landing rebuild visual check — full page lt/en, 1440 + 390. */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const BASE = process.env.BASE || "http://localhost:3100";
const OUT = resolve(process.cwd(), "..", "..", "docs", "audits", "evidence", "owner-rebuild-after");
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
for (const [vp, suffix] of [[{ width: 1440, height: 900 }, "1440"], [{ width: 390, height: 844 }, "390"]]) {
  const ctx = await browser.newContext({ viewport: vp });
  const page = await ctx.newPage();
  for (const loc of ["lt", "en"]) {
    await page.goto(`${BASE}/${loc}`, { waitUntil: "networkidle", timeout: 90000 });
    await page.waitForTimeout(1200);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    const demo = await page.getByTestId("live-product-demo").isVisible();
    const moment = await page.getByTestId("market-moment").isVisible();
    const how = await page.locator("#how-it-works").count();
    const oldMap = await page.locator('svg[viewBox="0 0 1000 389"]').count();
    console.log(`${loc}@${suffix}: overflow=${overflow} demo=${demo} moment=${moment} how=${how} oldWorldMap=${oldMap}`);
    await page.screenshot({ path: `${OUT}/landing-rebuild-${loc}-${suffix}-full.png`, fullPage: true });
    await page.screenshot({ path: `${OUT}/landing-rebuild-${loc}-${suffix}-hero.png` });
  }
  await ctx.close();
}
await browser.close();
console.log("done →", OUT);
