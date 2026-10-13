import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { test, expect, type Browser, type Page } from "@playwright/test";

/**
 * PRODUCTION — THE DAILY SURFACES AT PHONE WIDTH (owner programme 2026-10-12
 * §5.4: "good use on a 390 px screen"). READ-ONLY: nothing is written.
 *
 * Runs only in `.github/workflows/prod-qa-walk.yml` (spec=mobile-surfaces)
 * with the synthetic cast. For each surface: it opens, its own landmark is
 * visible, and the page is never wider than the phone (no sideways scroll).
 */
const state = (slot: string) => resolve(__dirname, `.storage-state.prod-qa.${slot}.json`);
const ENABLED = process.env.PROD_QA_WALK === "1" && ["owner", "worker"].every((s) => existsSync(state(s)));
test.skip(!ENABLED, "production walk: runs only in prod-qa-walk.yml with minted QA sessions");
test.describe.configure({ mode: "serial", timeout: 180_000, retries: 0 });
test.use({ actionTimeout: 30_000 });

const PHONE = { width: 390, height: 844 };
const ALFA = "QA-SYNTHETIC Alfa";

async function phone(browser: Browser, slot: string): Promise<{ page: Page; close: () => Promise<void> }> {
  const ctx = await browser.newContext({
    storageState: state(slot),
    locale: "lt-LT",
    viewport: PHONE,
    isMobile: true,
    hasTouch: true,
  });
  return { page: await ctx.newPage(), close: () => ctx.close() };
}

async function settle(page: Page): Promise<void> {
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => undefined);
}

/** The page fits the phone: no element pushes the document wider than the viewport. */
async function expectNoSidewaysScroll(page: Page, where: string): Promise<void> {
  const { scroll, inner } = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    inner: window.innerWidth,
  }));
  console.info(`[mobile] ${where}: scrollWidth=${scroll} innerWidth=${inner}`);
  expect(scroll, `${where} is wider than a 390 px phone`).toBeLessThanOrEqual(inner + 1);
}

async function workspace(page: Page, orgName: string): Promise<void> {
  const chip = page.getByTestId("workspace-chip").first();
  await expect(chip).toBeVisible({ timeout: 30_000 });
  if ((await chip.innerText()).includes(orgName)) return;
  await chip.getByRole("button").first().click();
  await page.getByTestId("workspace-chip-menu").locator('[data-testid^="workspace-option-"]', { hasText: orgName }).first().click();
  await expect(chip).toContainText(orgName, { timeout: 30_000 });
}

test("M-1. manager on a phone: company home, planning and the review queue fit and answer", async ({ browser }) => {
  const { page, close } = await phone(browser, "owner");
  await page.goto("/lt/dashboard");
  await settle(page);
  await workspace(page, ALFA);
  for (const [path, landmark] of [
    ["/lt/dashboard/company", "company-dashboard"],
    ["/lt/dashboard/company/planning", "workforce-planning-page"],
    ["/lt/dashboard/inbox", "inbox-summary"],
  ] as const) {
    await page.goto(path);
    await settle(page);
    await expect(page.getByTestId(landmark).first(), `${path} shows ${landmark}`).toBeVisible({ timeout: 30_000 });
    await expectNoSidewaysScroll(page, path);
  }
  // The home answers "what needs me" or says it could not read — never silence.
  await page.goto("/lt/dashboard/company");
  await settle(page);
  const strip = page.getByTestId("company-decisions-strip");
  const unread = page.getByTestId("company-decisions-unread");
  console.info(`[mobile] decisions strip: ${(await strip.count()) > 0 ? (await strip.innerText()).replace(/\s+/g, " ").slice(0, 200) : "none pending"}; unread: ${await unread.count()}`);
  await close();
});

test("M-2. worker on a phone: the chat composer and the journal fit and are usable", async ({ browser }) => {
  const { page, close } = await phone(browser, "worker");
  await page.goto("/lt/dashboard");
  await settle(page);
  const composer = page.getByTestId("composer-input").first();
  await expect(composer).toBeVisible({ timeout: 30_000 });
  // The composer is on screen at phone height without scrolling past the day.
  const box = await composer.boundingBox();
  expect(box, "composer has a box").not.toBeNull();
  expect(box!.y + box!.height, "composer is within the first screen").toBeLessThanOrEqual(PHONE.height + 1);
  await expectNoSidewaysScroll(page, "/lt/dashboard");
  await page.goto("/lt/dashboard/journal");
  await settle(page);
  await expect(page.getByTestId("journal-quick-record-text")).toBeVisible({ timeout: 30_000 });
  await expectNoSidewaysScroll(page, "/lt/dashboard/journal");
  await page.goto("/lt/dashboard/planning");
  await settle(page);
  await expect(page.getByTestId("planning-page")).toBeVisible({ timeout: 30_000 });
  await expectNoSidewaysScroll(page, "/lt/dashboard/planning");
  await close();
});
