import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { test, expect, type Browser, type Page } from "./prod-walk";

import { answerNoProjectIfAsked, chooseWorkContextIfAsked } from "./worklog-context";

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
  // Scoped to <main>: dashboard pages stream through a hidden `<div id="S:n">`
  // holder outside <main>; in a never-painting headless tab it can sit beside
  // the rendered copy, and a bare testid then fails strict mode or counts twice
  // (journal-confirm 40080278940 step 3; calendar-journal-history.spec.ts).
  const main = page.getByRole("main");
  await main.getByTestId("journal-quick-record-text").fill(ENTRY);
  await main.getByTestId("journal-quick-record-understand").click();
  await expect(main.getByTestId("worklog-flow")).toBeVisible({ timeout: 30_000 });
  await chooseWorkContextIfAsked(page, /QA-SYNTHETIC Alfa/);
  await answerNoProjectIfAsked(page);
  await main.getByTestId("worklog-save").click();
  await main.getByTestId("worklog-confirm").click();
  const done = main.getByTestId("worklog-done");
  const failed = main.getByTestId("worklog-error").or(main.getByTestId("worklog-blocked"));
  await expect(done.or(failed)).toBeVisible({ timeout: 30_000 });
  if (!(await done.isVisible())) throw new Error(`the entry was not saved: ${await failed.innerText()}`);
  await page.goto("/lt/dashboard/journal");
  const card = main.locator('[data-testid^="journal-entry-card-"]', { hasText: RUN }).first();
  await expect(card).toBeVisible({ timeout: 30_000 });
  entryId = (await card.getAttribute("data-testid"))!.replace("journal-entry-card-", "");
  await close();
});

test("2. the employer finds it in the review queue and approves it", async ({ browser }) => {
  const { page, close } = await as(browser, "owner");
  await page.goto("/lt/dashboard");
  await workspace(page, "QA-SYNTHETIC Alfa");
  await page.goto("/lt/dashboard/inbox");
  const main = page.getByRole("main"); // hidden streaming holder, see step 1
  const item = main.getByTestId(`inbox-entry-${entryId}`);
  await expect(item).toBeVisible({ timeout: 30_000 });
  await expect(item).toContainText(RUN);
  await main.getByTestId(`journal-approve-entry-${entryId}`).click();
  // A decided entry leaves the queue (the page refreshes after the stored
  // decision); poll with reloads until it is gone.
  await expect
    .poll(
      async () => {
        await page.goto("/lt/dashboard/inbox");
        return main.getByTestId(`inbox-entry-${entryId}`).count();
      },
      { timeout: 45_000, intervals: [3_000] },
    )
    .toBe(0);
  await close();
});

test("3. the worker sees it confirmed, and the Living CV counts confirmed work", async ({ browser }) => {
  const { page, close } = await as(browser, "worker");
  await page.goto("/lt/dashboard/journal");
  const main = page.getByRole("main"); // hidden streaming holder, see step 1
  // The decision timeline lives in the folded details of the entry card.
  await expect(main.getByTestId(`journal-entry-status-${entryId}`).locator('li[data-step="approved"]')).toHaveCount(1, {
    timeout: 20_000,
  });
  await page.goto("/lt/cv");
  // Strict over the VISIBLE nodes (#2721): the hidden holder is never visible.
  const confirmed = page.getByTestId("cv-confirmed-work").filter({ visible: true });
  await expect(confirmed).toBeVisible({ timeout: 30_000 });
  expect(Number(await confirmed.getAttribute("data-entries"))).toBeGreaterThan(0);
  await page.goto("/lt/dashboard/work-in-numbers");
  await expect(main.getByTestId("work-in-numbers")).toBeVisible({ timeout: 30_000 });
  await close();
});
