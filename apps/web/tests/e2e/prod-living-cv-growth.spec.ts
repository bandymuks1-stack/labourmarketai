import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { test, expect } from "./prod-walk";

/**
 * PRODUCTION LIVING CV GROWTH — owner programme 2026-10-12 §3F/§5 and
 * decision 0023: after days and weeks of recorded work across sectors (the
 * sectors, journal, chat and brigade walks keep adding to the same synthetic
 * worker), the person's own reading of their work shows what they did,
 * what was confirmed, and what they could grow into — inferred, never
 * presented as held.
 *
 * Runs only in `.github/workflows/prod-qa-walk.yml` (spec=living-cv-growth)
 * with the synthetic worker (qa.worker+multiw). Read-only.
 */
const state = (slot: string) => resolve(__dirname, `.storage-state.prod-qa.${slot}.json`);
const ENABLED = process.env.PROD_QA_WALK === "1" && existsSync(state("worker"));
test.skip(!ENABLED, "production walk: runs only in prod-qa-walk.yml with minted QA sessions");
test.describe.configure({ timeout: 150_000, retries: 0 });
test.use({ actionTimeout: 30_000 });

for (const locale of ["lt", "en", "ru"] as const) {
  test(`${locale}: the worker's own reading shows recorded, confirmed and potential capability`, async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: state("worker"), locale });
    const page = await ctx.newPage();

    await page.goto(`/${locale}/dashboard/work-in-numbers`);
    // Scoped to <main> (hidden streaming holder, prod-journal-confirm.spec.ts).
    const main = page.getByRole("main");
    const wi = main.getByTestId("work-in-numbers");
    await expect(wi).toBeVisible({ timeout: 30_000 });
    const potential = main.getByTestId("wi-potential");
    const hasPotential = await potential.isVisible().catch(() => false);
    const items = await main.locator('[data-testid^="wi-potential-"]').allInnerTexts();
    console.info(`[cv-growth] ${locale} potential shown=${hasPotential} items=${items.length}: ${items.slice(0, 6).join(" | ").replace(/\s+/g, " ")}`);

    await page.goto(`/${locale}/cv`);
    // Strict over the VISIBLE nodes (#2721): the hidden holder is never visible.
    const confirmed = page.getByTestId("cv-confirmed-work").filter({ visible: true });
    await expect(confirmed).toBeVisible({ timeout: 30_000 });
    const entries = Number(await confirmed.getAttribute("data-entries"));
    const recorded = await page.getByTestId("cv-recorded-hours").filter({ visible: true }).innerText().catch(() => "(no recorded-hours block)");
    console.info(`[cv-growth] ${locale} confirmed entries=${entries}; recorded: ${recorded.replace(/\s+/g, " ").slice(0, 200)}`);
    expect(entries, "confirmed work accumulates on the Living CV").toBeGreaterThan(0);
    // Decision 0023: a worker with evidenced work across sectors is shown
    // where it could lead — the inference must not be switched off.
    expect(items.length, "potential capabilities are inferred from evidenced work").toBeGreaterThan(0);
    await ctx.close();
  });
}
