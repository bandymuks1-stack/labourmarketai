/**
 * W7-S5b browser evidence — LOCAL stack only.
 *
 * Captures /dashboard/profile for accounts holding no person identity:
 *   - dev.company@local.test  → organization-only + sections-empty
 *   - dev.orgonly@local.test  → organization-only + sections-hidden
 * at 1440 and 375, into docs/audits/evidence/w7-s5b/.
 *
 * Run: pnpm exec tsx scripts/w7-s5b-evidence.ts  (dev:acceptance on :3000)
 */
import { chromium, type Browser } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.EVIDENCE_BASE_URL ?? "http://127.0.0.1:3000";
const OUT = join(__dirname, "..", "..", "..", "docs", "audits", "evidence", "w7-s5b");

async function capture(
  browser: Browser,
  email: string,
  tag: string,
  expectPresentation: "sections-empty" | "sections-hidden",
) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/en/auth/login`, { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', "password");
  await Promise.all([
    page.waitForURL(/dashboard|onboarding/, { timeout: 30000 }),
    page.click('button[type="submit"]'),
  ]);
  await page.goto(`${BASE}/en/dashboard/profile`, { waitUntil: "networkidle" });
  console.log(`${email}: landed on ${page.url()}`);

  const notice = page.locator('[data-testid="profile-identity-context-notice"]');
  await notice.waitFor({ state: "visible", timeout: 30000 });
  const reason = await notice.getAttribute("data-reason");
  const presentation = await notice.getAttribute("data-presentation");
  if (presentation !== expectPresentation) {
    throw new Error(
      `${email}: expected presentation=${expectPresentation}, got ${presentation} (reason=${reason})`,
    );
  }
  console.log(`${email}: reason=${reason} presentation=${presentation}`);

  // caret:"initial" — caret:"hide" injects styles that have produced phantom
  // hydration mismatches in past evidence runs.
  await page.screenshot({
    path: join(OUT, `profile-${tag}-1440.png`),
    fullPage: true,
    caret: "initial",
  });

  await page.setViewportSize({ width: 375, height: 812 });
  await page.waitForTimeout(500);
  await page.screenshot({
    path: join(OUT, `profile-${tag}-375.png`),
    fullPage: true,
    caret: "initial",
  });
  await ctx.close();
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  try {
    await capture(browser, "dev.company@local.test", "org-only-sections-empty", "sections-empty");
    await capture(browser, "dev.orgonly@local.test", "org-only-sections-hidden", "sections-hidden");
  } finally {
    await browser.close();
  }
  console.log("evidence written to", OUT);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
