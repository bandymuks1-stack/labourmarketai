import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { test, expect, type Browser, type Locator, type Page } from "./prod-walk";

/**
 * AN ORGANIZATION'S DAY (owner 2026-11-07): the Today panel, the Work Journal's
 * period reports and the manager's quick confirmation, on desktop and on a phone.
 * READ-ONLY: it opens the screens and confirms nothing. Dispatch only.
 *
 * Cast: `owner` owns "QA-SYNTHETIC Alfa", from the allowlist in
 * `lib/testing/prod-qa-guard.ts`. Logs carry case names and counts only.
 */
const state = resolve(__dirname, ".storage-state.prod-qa.owner.json");
const ENABLED = process.env.PROD_QA_WALK === "1" && existsSync(state);
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
