import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { test, expect, type Browser, type Page } from "@playwright/test";

import { chooseWorkContextIfAsked } from "./worklog-context";

/**
 * PRODUCTION WORK → CONFIRMATION → LIVING CV — owner programme 2026-10-12:
 * a worker records real work, the employer confirms it, and the worker sees
 * the confirmation and their Living CV reflect it.
 *
 * Runs only in `.github/workflows/prod-qa-walk.yml` (spec=journal-confirm)
 * with the synthetic cast: the worker is QA-SYNTHETIC Vytas (employee of
 * QA-SYNTHETIC Alfa, journal review on), the employer is Alfa's owner.
 * The entry text carries the run id, so the walk finds exactly its own entry.
 */
const RUN = process.env.GITHUB_RUN_ID ?? `local${Date.now().toString(36)}`;
const ENTRY = `QA-SYNTHETIC ${RUN}: šiandien 6 valandas mūrijau blokelių sieną objekte`;
const state = (slot: string) => resolve(__dirname, `.storage-state.prod-qa.${slot}.json`);
const ENABLED = process.env.PROD_QA_WALK === "1" && ["worker", "owner"].every((s) => existsSync(state(s)));
test.skip(!ENABLED, "production walk: runs only in prod-qa-walk.yml with minted QA sessions");
test.describe.configure({ mode: "serial", timeout: 180_000, retries: 0 });

async function as(browser: Browser, slot: string): Promise<{ page: Page; close: () => Promise<void> }> {
  const ctx = await browser.newContext({ storageState: state(slot), locale: "lt-LT" });
  return { page: await ctx.newPage(), close: () => ctx.close() };
}

async function workspace(page: Page, orgName: string): Promise<void> {
  const chip = page.getByTestId("workspace-chip").first();
  await expect(chip).toBeVisible({ timeout: 30_000 });
  if ((await chip.innerText()).includes(orgName)) return;
  await chip.getByRole("button").first().click();
  await page.getByTestId("workspace-chip-menu").locator('[data-testid^="workspace-option-"]', { hasText: orgName }).first().click();
  await expect(chip).toContainText(orgName, { timeout: 30_000 });
}

let entryId = "";

test("1. the worker records the day's work in the journal", async ({ browser }) => {
  const { page, close } = await as(browser, "worker");
  await page.goto("/lt/dashboard/journal");
  await page.getByTestId("journal-quick-record-text").fill(ENTRY);
  await page.getByTestId("journal-quick-record-understand").click();
  await expect(page.getByTestId("worklog-flow")).toBeVisible({ timeout: 30_000 });
  await chooseWorkContextIfAsked(page, /QA-SYNTHETIC Alfa/);
  await page.getByTestId("worklog-save").click();
  await page.getByTestId("worklog-confirm").click();
  const done = page.getByTestId("worklog-done");
  const failed = page.getByTestId("worklog-error").or(page.getByTestId("worklog-blocked"));
  await expect(done.or(failed)).toBeVisible({ timeout: 30_000 });
  if (!(await done.isVisible())) throw new Error(`the entry was not saved: ${await failed.innerText()}`);
  await page.goto("/lt/dashboard/journal");
  const card = page.locator('[data-testid^="journal-entry-card-"]', { hasText: RUN }).first();
  await expect(card).toBeVisible({ timeout: 30_000 });
  entryId = (await card.getAttribute("data-testid"))!.replace("journal-entry-card-", "");
  await close();
});

test("2. the employer finds it in the review queue and approves it", async ({ browser }) => {
  const { page, close } = await as(browser, "owner");
  await page.goto("/lt/dashboard");
  await workspace(page, "QA-SYNTHETIC Alfa");
  await page.goto("/lt/dashboard/inbox");
  const item = page.getByTestId(`inbox-entry-${entryId}`);
  await expect(item).toBeVisible({ timeout: 30_000 });
  await expect(item).toContainText(RUN);
  await page.getByTestId(`journal-approve-entry-${entryId}`).click();
  await expect(page.getByTestId(`journal-review-result-${entryId}`).or(item)).toBeVisible({ timeout: 20_000 });
  await page.goto("/lt/dashboard/inbox");
  await expect(page.getByTestId(`inbox-entry-${entryId}`)).toHaveCount(0, { timeout: 20_000 });
  await close();
});

test("3. the worker sees it confirmed, and the Living CV counts confirmed work", async ({ browser }) => {
  const { page, close } = await as(browser, "worker");
  await page.goto("/lt/dashboard/journal");
  await page.getByTestId(`journal-entry-more-${entryId}`).click();
  await expect(page.getByTestId(`journal-entry-status-${entryId}`).locator('li[data-step="approved"]')).toBeVisible({
    timeout: 20_000,
  });
  await page.goto("/lt/cv");
  const confirmed = page.getByTestId("cv-confirmed-work");
  await expect(confirmed).toBeVisible({ timeout: 30_000 });
  expect(Number(await confirmed.getAttribute("data-entries"))).toBeGreaterThan(0);
  await page.goto("/lt/dashboard/work-in-numbers");
  await expect(page.getByTestId("work-in-numbers")).toBeVisible({ timeout: 30_000 });
  await close();
});
