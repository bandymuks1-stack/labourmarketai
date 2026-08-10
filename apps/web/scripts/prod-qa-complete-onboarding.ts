/**
 * Complete onboarding for the ONE synthetic production QA worker, through the
 * SHIPPED production UI (no direct DB writes — the same server action every
 * real user goes through). Uses the minted session from
 * scripts/prod-qa-mint-session.ts. Idempotent: if the account is already
 * onboarded, the dashboard renders and this script just reports that.
 *
 * Choices made for the QA identity: role = person/worker, display name
 * clearly synthetic, country SE (the QA account exercises the Swedish
 * external-supply board).
 */
import { chromium } from "@playwright/test";
import { join } from "node:path";

const BASE = process.env.PROOF_BASE_URL ?? "https://labourmarket.ai";
const STATE = join(process.cwd(), "tests", "e2e", ".storage-state.prod-qa.json");

async function main(): Promise<void> {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    storageState: STATE,
    viewport: { width: 1280, height: 900 },
  });
  const page = await context.newPage();
  await page.goto(`${BASE}/lt/dashboard/opportunities`, {
    waitUntil: "networkidle",
    timeout: 60_000,
  });

  if (page.url().includes("/onboarding")) {
    // Step 1: the person/worker card, then continue.
    await page.getByRole("button", { name: /Asmuo/ }).first().click();
    await page.getByRole("button", { name: /Tęsti/ }).first().click();
    // Step 2: synthetic display name + country SE.
    await page.locator('input[name="display_name"]').fill("QA Worker (sintetinis)");
    await page.locator('select[name="country"]').selectOption("SE");
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(/dashboard/, { timeout: 60_000 });
  }

  console.log(JSON.stringify({ finalUrl: page.url() }));
  await context.close();
  await browser.close();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack : String(err));
  process.exitCode = 1;
});
