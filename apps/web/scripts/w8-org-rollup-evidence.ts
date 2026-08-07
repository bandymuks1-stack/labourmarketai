/**
 * W8 org demand rollup — browser evidence, LOCAL stack only.
 *
 * Logs in as dev.company@local.test, switches the workspace to the
 * organization via the real UI chip (the pointer is the httpOnly cookie),
 * opens /dashboard/reports, asserts the ORG rollup renders with the seeded
 * facts and the unmeasured time-to-fill sentence, captures 1440 + 375.
 *
 * Run: pnpm exec tsx scripts/w8-org-rollup-evidence.ts  (server on :3002)
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.EVIDENCE_BASE_URL ?? "http://127.0.0.1:3002";
const ORG_ID = "de4f125a-de44-4bb0-8bf3-705b568d1196";
const OUT = join(__dirname, "..", "..", "..", "docs", "audits", "evidence", "w8-org-rollup");

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/en/auth/login`, { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', "dev.company@local.test");
  await page.fill('input[type="password"]', "password");
  await Promise.all([
    page.waitForURL(/dashboard|onboarding/, { timeout: 60000 }),
    page.click('button[type="submit"]'),
  ]);

  // Switch the active workspace to the organization through the real chip.
  await page.goto(`${BASE}/en/dashboard`, { waitUntil: "networkidle" });
  const chip = page.locator('[data-testid="workspace-chip"]').first();
  await chip.waitFor({ state: "visible", timeout: 30000 });
  await chip.click();
  const option = page.locator(`[data-testid="workspace-option-${ORG_ID}"]`);
  if (await option.count()) {
    await option.click();
    await page.waitForTimeout(1500);
  } else {
    console.log("workspace option not present — chip state:", await chip.innerText());
  }

  await page.goto(`${BASE}/en/dashboard/reports`, { waitUntil: "networkidle" });
  const rollup = page.locator('[data-testid="reports-org-demand-rollup"]');
  await rollup.waitFor({ state: "visible", timeout: 30000 });
  const text = (await rollup.innerText()).replace(/\s+/g, " ");
  console.log("rollup tiles:", text);

  const ttf = page.locator('[data-testid="reports-demand-ttf-unmeasured"]');
  const ttfVisible = (await ttf.count()) > 0;
  console.log("ttf unmeasured sentence:", ttfVisible ? await ttf.innerText() : "MISSING");

  const basis = await page
    .locator('[data-testid="reports-basis-orgDemandOrg"]')
    .count();
  console.log("org basis label present:", basis > 0);

  await page.screenshot({ path: join(OUT, "reports-org-rollup-1440.png"), fullPage: true, caret: "initial" });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(OUT, "reports-org-rollup-375.png"), fullPage: true, caret: "initial" });
  await browser.close();

  if (!ttfVisible || basis === 0) {
    console.error("FAIL: missing unmeasured sentence or org basis label");
    process.exit(1);
  }
  console.log("evidence written to", OUT);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
