import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { test, expect, type Browser, type Page } from "@playwright/test";

/**
 * PRODUCTION CALENDAR & PLANNING — owner programme 2026-10-12 §3A: leave,
 * a work plan, the conflict between them, and the same facts on the worker's
 * own calendar, across sessions and organizations.
 *
 * Runs only in `.github/workflows/prod-qa-walk.yml` (spec=calendar-planning)
 * with the synthetic cast:
 *   worker   qa.worker+multiw   — Vytas Darbininkas, employee of QA-SYNTHETIC Alfa
 *   owner    qa.owner+multiw    — owns QA-SYNTHETIC Alfa
 *   manager  qa.manager+multiw  — owns QA-SYNTHETIC Gama (another organization)
 *
 * One weekday inside the plan horizon is chosen per run; the plan note carries
 * the run id. The walk cancels what it created at the end, so repeated runs do
 * not pile up leave or plans on the synthetic worker.
 */
const RUN = process.env.GITHUB_RUN_ID ?? `local${Date.now().toString(36)}`;
const NOTE = `QA-SYNTHETIC ${RUN} planas`;
const ALFA = "QA-SYNTHETIC Alfa";
const WORKER_NAME = /Vytas Darbininkas/;
const state = (slot: string) => resolve(__dirname, `.storage-state.prod-qa.${slot}.json`);
const ENABLED = process.env.PROD_QA_WALK === "1" && ["worker", "owner"].every((s) => existsSync(state(s)));
test.skip(!ENABLED, "production walk: runs only in prod-qa-walk.yml with minted QA sessions");
test.describe.configure({ mode: "serial", timeout: 180_000, retries: 0 });
test.use({ actionTimeout: 30_000 });

/** A weekday 14–40 days ahead, varied by run so reruns rarely meet old rows. */
function walkDay(): string {
  const seed = Number(String(RUN).replace(/\D/g, "").slice(-4) || "0");
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 14 + (seed % 26));
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
const DAY = walkDay();

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

const myRow = (page: Page) => page.getByTestId("my-absences-list").locator("li", { hasText: `${DAY} → ${DAY}` }).first();

test("1. the worker asks for a day of leave", async ({ browser }) => {
  const { page, close } = await as(browser, "worker");
  await page.goto("/lt/dashboard/absences");
  await expect(page.getByTestId("my-absences-panel")).toBeVisible({ timeout: 30_000 });
  for (const blocked of ["absences-no-worker", "absences-preapply"]) {
    if (await page.getByTestId(blocked).isVisible().catch(() => false)) {
      throw new Error(`leave form not offered (${blocked}): ${await page.getByTestId("my-absences-panel").innerText()}`);
    }
  }
  // A leftover from an interrupted earlier run on the same day is cancelled first.
  while ((await myRow(page).count()) > 0 && (await myRow(page).getByTestId("absence-cancel").count()) > 0) {
    await myRow(page).getByTestId("absence-cancel").click();
    await page.waitForTimeout(2_000);
    await page.reload();
  }
  // The form is controlled: a fill before hydration is lost, so refill until
  // the submit button reflects both dates.
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => undefined);
  for (let i = 0; i < 6 && !(await page.getByTestId("absence-submit").isEnabled()); i += 1) {
    await page.getByTestId("absence-start").fill(DAY);
    await page.getByTestId("absence-end").fill(DAY);
    await page.waitForTimeout(1_000);
  }
  await page.getByTestId("absence-note").fill(`QA-SYNTHETIC ${RUN}`);
  await page.getByTestId("absence-submit").click();
  await expect(page.getByTestId("absences-msg")).toBeVisible({ timeout: 30_000 });
  await expect.poll(async () => { await page.reload(); return myRow(page).count(); }, { timeout: 30_000, intervals: [3_000] }).toBe(1);
  await close();
});

test("2. the employer sees the request and approves it", async ({ browser }) => {
  const { page, close } = await as(browser, "owner");
  await page.goto("/lt/dashboard");
  await workspace(page, ALFA);
  await page.goto("/lt/dashboard/absences");
  const row = page.getByTestId("manager-absence-row").filter({ hasText: WORKER_NAME }).filter({ hasText: `${DAY} → ${DAY}` }).first();
  await expect(row).toBeVisible({ timeout: 30_000 });
  await row.getByTestId("absence-approve").click();
  await expect(page.getByTestId("manager-absences-msg")).toBeVisible({ timeout: 30_000 });
  await expect.poll(async () => { await page.reload(); return page.getByTestId("manager-absence-row").filter({ hasText: `${DAY} → ${DAY}` }).filter({ hasText: WORKER_NAME }).count(); }, { timeout: 30_000, intervals: [3_000] }).toBe(0);
  await close();
});

test("3. the employer plans the same worker on that day and is told it collides with leave", async ({ browser }) => {
  const { page, close } = await as(browser, "owner");
  await page.goto("/lt/dashboard");
  await workspace(page, ALFA);
  await page.goto("/lt/dashboard/company/planning#work-plan");
  await expect(page.getByTestId("work-plan-form")).toBeVisible({ timeout: 30_000 });
  const worker = page.getByTestId("work-plan-worker");
  const value = await worker.locator("option", { hasText: WORKER_NAME }).first().getAttribute("value");
  expect(value, "Vytas is plannable in Alfa").toBeTruthy();
  await worker.selectOption(value!);
  await page.getByTestId("work-plan-start").fill(DAY);
  await page.getByTestId("work-plan-end").fill(DAY);
  await page.locator('[data-testid="work-plan-form"] input[name="start_time"]').fill("08:00");
  await page.locator('[data-testid="work-plan-form"] input[name="end_time"]').fill("16:00");
  await page.locator('[data-testid="work-plan-form"] input[name="note"]').fill(NOTE);
  await page.getByTestId("work-plan-submit").click();
  const notice = page.getByTestId("work-plan-notice");
  await expect(notice).toBeVisible({ timeout: 30_000 });
  const outcome = await notice.getAttribute("data-outcome");
  console.info(`[calendar] plan outcome=${outcome}`);
  expect(["planned", "planned_collides", "planned_unknown"]).toContain(outcome);
  const entry = page.getByTestId("work-plan-entry").filter({ hasText: NOTE }).first();
  await expect(entry).toBeVisible({ timeout: 30_000 });
  // The approved leave of THIS worker on THIS day must be visible beside the plan.
  await expect(entry.getByTestId("work-plan-overlap")).toBeVisible();
  await close();
});

test("4. the worker's own calendar shows the leave, the plan and the conflict", async ({ browser }) => {
  const { page, close } = await as(browser, "worker");
  await page.goto(`/lt/dashboard/planning?view=day&date=${DAY}`);
  await expect(page.locator('[data-testid^="planning-item-absence:"]').first()).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-testid^="planning-item-plan:"]').first()).toBeVisible();
  await expect(page.locator('[data-testid^="planning-conflict-"]').first()).toBeVisible();
  await close();
});

test("5. another organization's owner sees neither the plan nor the leave", async ({ browser }) => {
  test.skip(!existsSync(state("manager")), "no manager session");
  const { page, close } = await as(browser, "manager");
  await page.goto("/lt/dashboard/company/planning#work-plan");
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => undefined);
  await expect(page.getByTestId("work-plan-entry").filter({ hasText: NOTE })).toHaveCount(0);
  await page.goto(`/lt/dashboard/planning?view=day&date=${DAY}`);
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => undefined);
  await expect(page.getByText(NOTE)).toHaveCount(0);
  await close();
});

test("6. a fresh session still has both, then the walk cleans up", async ({ browser }) => {
  const owner = await as(browser, "owner");
  await owner.page.goto("/lt/dashboard");
  await workspace(owner.page, ALFA);
  await owner.page.goto("/lt/dashboard/company/planning#work-plan");
  const entry = owner.page.getByTestId("work-plan-entry").filter({ hasText: NOTE }).first();
  await expect(entry).toBeVisible({ timeout: 30_000 });
  await entry.getByTestId("work-plan-cancel").click();
  await expect(owner.page.getByTestId("work-plan-notice")).toHaveAttribute("data-outcome", "cancelled", { timeout: 30_000 });
  await expect(owner.page.getByTestId("work-plan-entry").filter({ hasText: NOTE })).toHaveCount(0);
  await owner.close();

  const worker = await as(browser, "worker");
  await worker.page.goto("/lt/dashboard/absences");
  await expect(myRow(worker.page)).toBeVisible({ timeout: 30_000 });
  await myRow(worker.page).getByTestId("absence-cancel").click();
  await expect(worker.page.getByTestId("absences-msg")).toBeVisible({ timeout: 30_000 });
  await worker.close();
});
