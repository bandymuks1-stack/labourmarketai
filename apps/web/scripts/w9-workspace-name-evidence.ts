/**
 * W9 — the active organization name follows the ACTIVE WORKSPACE. Local only.
 *
 * Fixture: dev.agency@local.test OWNS one (unnamed) agency organization and
 * is an active `manager` of "Dev Construction", which it does NOT own. It
 * switches to Dev Construction through the real workspace chip, then the
 * role switcher must name Dev Construction.
 *
 * Before this slice the layout resolved the name from OWNED organizations
 * only, so the pointer at a member org fell through to the single owned org
 * — the chip said "Dev Construction" while the role switcher named the
 * agency. Two answers for one acting context.
 *
 * Run: pnpm exec tsx scripts/w9-workspace-name-evidence.ts  (server on :3002)
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.EVIDENCE_BASE_URL ?? "http://127.0.0.1:3002";
const MEMBER_ORG_ID = "de4f125a-de44-4bb0-8bf3-705b568d1196";
const MEMBER_ORG_NAME = "Dev Construction";
const OUT = join(__dirname, "..", "..", "..", "docs", "audits", "evidence", "w9-workspace-name");

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/en/auth/login`, { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', "dev.agency@local.test");
  await page.fill('input[type="password"]', "password");
  await Promise.all([
    page.waitForURL(/dashboard|onboarding/, { timeout: 60000 }),
    page.click('button[type="submit"]'),
  ]);
  await page.goto(`${BASE}/en/dashboard`, { waitUntil: "networkidle" });

  // Switch to the organization this account is a MEMBER of, not an owner.
  const chip = page.locator('[data-testid="workspace-chip"]').first();
  await chip.waitFor({ state: "visible", timeout: 30000 });
  await chip.click();
  const option = page.locator(`[data-testid="workspace-option-${MEMBER_ORG_ID}"]`);
  await option.waitFor({ state: "visible", timeout: 15000 });
  await option.click();
  await page.waitForTimeout(2000);

  // The role switcher lives in the FULL (module-route) chrome; the chat
  // uses simple chrome and never mounts it.
  await page.goto(`${BASE}/en/dashboard/network`, { waitUntil: "networkidle" });
  const chipText = (await page.locator('[data-testid="workspace-chip"]').first().innerText()).replace(/\s+/g, " ").trim();
  console.log("workspace chip:", JSON.stringify(chipText));

  // The role switcher's company label — the surface that used to disagree.
  const switcher = page.locator('[data-testid="role-switcher-active-org"]').first();
  let switcherText = "";
  if (await switcher.count()) {
    switcherText = (await switcher.innerText()).replace(/\s+/g, " ").trim();
  }
  console.log("role switcher:", JSON.stringify(switcherText));

  const agrees =
    chipText.includes(MEMBER_ORG_NAME) && switcherText.includes(MEMBER_ORG_NAME);
  console.log("chip and switcher name the SAME org:", agrees);

  await page.screenshot({ path: join(OUT, "member-org-active-1440.png"), fullPage: false, caret: "initial" });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(OUT, "member-org-active-375.png"), fullPage: false, caret: "initial" });
  await browser.close();

  if (!agrees) {
    console.error("FAIL: the two surfaces disagree about the active organization");
    process.exit(1);
  }
  console.log("evidence written to", OUT);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
