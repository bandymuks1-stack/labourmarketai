import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { test, expect, type Browser, type Locator, type Page } from "./prod-walk";
import { answerNoProjectIfAsked, chooseWorkContextIfAsked } from "./worklog-context";

/**
 * AN ORGANIZATION'S DAY (owner 2026-11-07): the Today panel, the Work Journal's
 * period reports and the manager's quick confirmation, on desktop and on a phone.
 * Those screens are read-only. Then the synthetic worker records one entry and the
 * owner approves it from the first screen (owner P0 2026-11-07). If the walk stops
 * before the approval, the entry is removed; an approved entry stays, marked
 * QA-SYNTHETIC, because a decided entry is evidence and offers no delete. Dispatch only.
 *
 * Cast: `owner` owns "QA-SYNTHETIC Alfa", `worker` is its employee with journal review
 * on, from the allowlist in `lib/testing/prod-qa-guard.ts`. Logs carry case names and
 * counts only.
 */
const state = resolve(__dirname, ".storage-state.prod-qa.owner.json");
const workerState = resolve(__dirname, ".storage-state.prod-qa.worker.json");
const ENABLED = process.env.PROD_QA_WALK === "1" && existsSync(state) && existsSync(workerState);
test.skip(!ENABLED, "production walk: runs only in prod-qa-walk.yml with minted QA sessions");
test.describe.configure({ timeout: 480_000, retries: 0 });
test.use({ actionTimeout: 30_000, channel: "chrome" });

const ORG = "QA-SYNTHETIC Alfa";
const SIZES = [
  { name: "desktop", viewport: { width: 1280, height: 800 } },
  { name: "phone", viewport: { width: 390, height: 844 } },
] as const;
const inMain = (page: Page): Locator => page.getByRole("main");

function record(label: string, pass: boolean, detail: string): void {
  console.info(`[result] ${label}: ${pass ? "PASS" : "FAIL"} ${detail}`);
  expect.soft(pass, `${label}: ${detail}`).toBe(true);
}

async function open(browser: Browser, viewport: { width: number; height: number }) {
  const ctx = await browser.newContext({ storageState: state, locale: "lt-LT", viewport });
  const page = await ctx.newPage();
  const crashes: string[] = [];
  page.on("pageerror", (e) => {
    if (!e.message.includes("#418")) crashes.push(`${e.name}: ${e.message.slice(0, 60)}`);
  });
  return { ctx, page, crashes };
}

async function useOrganization(page: Page): Promise<void> {
  await page.goto("/lt/dashboard/company/people");
  const chip = page.getByTestId("workspace-chip").first();
  await expect(chip).toBeVisible({ timeout: 60_000 });
  if ((await chip.innerText()).includes(ORG)) return;
  await chip.getByRole("button").first().click();
  await page.getByTestId("workspace-chip-menu").locator('[data-testid^="workspace-option-"]', { hasText: ORG }).first().click();
  await expect(chip).toContainText(ORG, { timeout: 30_000 });
}

for (const size of SIZES) {
  test(`an organization's day on ${size.name}`, async ({ browser }) => {
    const { ctx, page, crashes } = await open(browser, size.viewport);
    await useOrganization(page);

    await page.goto("/lt/dashboard");
    const approvals = page.getByTestId("organization-approvals").filter({ visible: true });
    const approvalsShown = await approvals.waitFor({ state: "visible", timeout: 60_000 }).then(() => true, () => false);
    const approvalsState = approvalsShown ? await approvals.getAttribute("data-state") : "none";
    record(`${size.name} approvals card on the first screen`, approvalsShown && approvalsState !== "unreadable", `state=${approvalsState}`);

    await page.goto("/lt/dashboard/hours");
    const hoursLink = inMain(page).getByTestId("hours-approvals-link");
    const hoursLinkShown = await hoursLink.waitFor({ state: "visible", timeout: 60_000 }).then(() => true, () => false);
    record(`${size.name} hours page links to approvals`, hoursLinkShown && (await hoursLink.innerText()).includes("Laukia patvirtinimo"), `shown=${hoursLinkShown}`);

    await page.goto("/lt/dashboard/company/planning");
    const today = inMain(page).getByTestId("organization-today-panel");
    const shown = await today.waitFor({ state: "visible", timeout: 60_000 }).then(() => true, () => false);
    record(`${size.name} Today panel`, shown, `facts=${shown ? await today.locator("dt").count() : 0}`);

    for (const window of ["today", "week", "month"]) {
      await page.goto(`/lt/dashboard/reports?journalWindow=${window}`);
      const report = inMain(page).getByTestId("journal-window-report");
      const has = await report.waitFor({ state: "visible", timeout: 60_000 }).then(() => true, () => false);
      const failed = await inMain(page).getByTestId("journal-window-unavailable").count();
      const table = await inMain(page).getByTestId("journal-window-table").count();
      const empty = await inMain(page).getByTestId("journal-window-empty").count();
      record(`${size.name} journal report ${window}`, has && failed === 0 && table + empty > 0, `shown=${has} unavailable=${failed} table=${table} empty=${empty}`);
    }

    await page.goto("/lt/dashboard/inbox/quick");
    const quick = inMain(page).getByTestId("quick-detailed-link");
    const quickShown = await quick.waitFor({ state: "visible", timeout: 60_000 }).then(() => true, () => false);
    const queue = await inMain(page).getByTestId("quick-queue").count();
    // A failed read renders its own state beside the queue: it must not count as working.
    const unavailable = await inMain(page).getByTestId("quick-unavailable").count();
    record(`${size.name} quick confirmation`, quickShown && queue > 0 && unavailable === 0, `queue=${queue} unavailable=${unavailable}`);

    const wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    record(`${size.name} no sideways scroll, no crash`, !wide && crashes.length === 0, `sideways=${wide} crash=${crashes.join("/") || "none"}`);
    await ctx.close();
  });
}

const RUN = process.env.GITHUB_RUN_ID ?? `local${Date.now().toString(36)}`;
const ENTRY = `QA-SYNTHETIC ${RUN}: šiandien 1 valandą tikrinau darbų patvirtinimą objekte`;
let entryId = "";
let approved = false;

test.afterAll(async ({ browser }) => {
  if (!entryId || approved) return;
  const ctx = await browser.newContext({ storageState: workerState, locale: "lt-LT" });
  const page = await ctx.newPage();
  await page.goto("/lt/dashboard/journal");
  const del = inMain(page).getByTestId(`journal-entry-delete-${entryId}`);
  await expect(inMain(page).locator(`[data-testid="journal-entry-card-${entryId}"]`)).toBeVisible({ timeout: 30_000 });
  if (!(await del.isVisible())) await inMain(page).getByTestId(`journal-entry-more-${entryId}`).locator("summary").first().click();
  await del.click();
  await inMain(page).getByTestId(`journal-entry-delete-${entryId}-yes`).click();
  await expect(inMain(page).getByTestId(`journal-entry-deleted-${entryId}`)).toBeVisible({ timeout: 30_000 });
  console.info("[cleanup] the undecided synthetic entry was removed");
  await ctx.close();
});

test("the owner approves a worker's hours from the first screen", async ({ browser }) => {
  const worker = await browser.newContext({ storageState: workerState, locale: "lt-LT" });
  const wp = await worker.newPage();
  await wp.goto("/lt/dashboard/journal");
  const wm = inMain(wp);
  await wm.getByTestId("journal-quick-record-text").fill(ENTRY);
  await wm.getByTestId("journal-quick-record-understand").click();
  await expect(wm.getByTestId("worklog-flow")).toBeVisible({ timeout: 30_000 });
  await chooseWorkContextIfAsked(wp, /QA-SYNTHETIC Alfa/);
  await answerNoProjectIfAsked(wp);
  await wm.getByTestId("worklog-save").click();
  await wm.getByTestId("worklog-confirm").click();
  await expect(wm.getByTestId("worklog-done")).toBeVisible({ timeout: 30_000 });
  await wp.goto("/lt/dashboard/journal");
  const entryCard = wm.locator('[data-testid^="journal-entry-card-"]', { hasText: RUN }).first();
  await expect(entryCard).toBeVisible({ timeout: 30_000 });
  entryId = (await entryCard.getAttribute("data-testid"))!.replace("journal-entry-card-", "");

  const { ctx, page, crashes } = await open(browser, { width: 390, height: 844 });
  await useOrganization(page);
  await page.goto("/lt/dashboard");
  const card = page.getByTestId("organization-approvals").filter({ visible: true });
  await expect(card).toHaveAttribute("data-state", "waiting", { timeout: 60_000 });
  await expect(card.getByTestId("organization-approvals-title")).toContainText("Laukia patvirtinimo:");
  // The card holds the oldest few, so older synthetic entries can push this one to the queue.
  const here = card.getByTestId(`quick-confirm-tap-${entryId}`);
  const onCard = (await here.count()) > 0;
  record("the entry is on the first screen, or one tap away", onCard || (await card.getByTestId("organization-approvals-all").count()) > 0, `onCard=${onCard}`);
  if (!onCard) await card.getByTestId("organization-approvals-all").click();
  const tap = page.getByTestId(`quick-confirm-tap-${entryId}`).filter({ visible: true });
  await expect(tap).toBeVisible({ timeout: 30_000 });
  const hours = await page.getByTestId(`quick-hours-${entryId}`).filter({ visible: true }).innerText();
  record("the reviewer sees the hours", /1/.test(hours), "hours line shown");
  await tap.click();
  await expect(page.getByTestId(`quick-receipt-${entryId}`).filter({ visible: true })).toBeVisible({ timeout: 30_000 });
  approved = true;
  await page.goto("/lt/dashboard");
  await expect(page.getByTestId("organization-approvals").filter({ visible: true })).toBeVisible({ timeout: 60_000 });
  record("an approved entry leaves the card", (await page.getByTestId(`quick-confirm-tap-${entryId}`).count()) === 0, "gone");
  record("no crash while approving", crashes.length === 0, `crash=${crashes.join("/") || "none"}`);
  await ctx.close();

  await wp.goto("/lt/dashboard/journal");
  await expect(wm.getByTestId(`journal-entry-status-${entryId}`).locator('li[data-step="approved"]')).toHaveCount(1, { timeout: 30_000 });
  await worker.close();
});
