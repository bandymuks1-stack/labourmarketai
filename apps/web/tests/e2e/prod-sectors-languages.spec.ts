import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { test, expect } from "./prod-walk";

import { answerNoProjectIfAsked, chooseWorkContextIfAsked } from "./worklog-context";

/**
 * PRODUCTION SECTORS × LANGUAGES — owner programme 2026-10-12 §3E: the same
 * person records a working day in different sectors and languages, and each
 * one is understood, saved and listed — not only construction, not only LT.
 *
 * Runs only in `.github/workflows/prod-qa-walk.yml` (spec=sectors-languages)
 * with the synthetic worker (qa.worker+multiw, employee of QA-SYNTHETIC Alfa).
 * Every entry carries the run id; nothing outside the synthetic cast is touched.
 */
const RUN = process.env.GITHUB_RUN_ID ?? `local${Date.now().toString(36)}`;
const state = (slot: string) => resolve(__dirname, `.storage-state.prod-qa.${slot}.json`);
const ENABLED = process.env.PROD_QA_WALK === "1" && existsSync(state("worker"));
test.skip(!ENABLED, "production walk: runs only in prod-qa-walk.yml with minted QA sessions");
// SERIAL: every save is bound to the worker's journal chain head (one record
// per confirmation, lib/journal/journal-chain-fingerprint). Five days confirmed
// by the SAME person in parallel make all but one token stale by design — the
// 2026-10-13 run "failed" exactly that way. One day after another, as a person does.
test.describe.configure({ mode: "serial", timeout: 150_000, retries: 0 });
test.use({ actionTimeout: 30_000 });

const DAYS: readonly { locale: string; browserLocale: string; sector: string; text: string }[] = [
  { locale: "lt", browserLocale: "lt-LT", sector: "warehouse", text: "sandėlyje 7 valandas komplektavau užsakymus ir krautuvu iškroviau 2 sunkvežimius" },
  { locale: "en", browserLocale: "en-GB", sector: "restaurant", text: "worked 8 hours as a line cook, prepared 120 covers and cleaned the kitchen" },
  { locale: "ru", browserLocale: "ru-RU", sector: "manufacturing", text: "6 часов работал оператором станка ЧПУ, изготовил 40 деталей и провёл контроль качества" },
  { locale: "en", browserLocale: "en-GB", sector: "accounting", text: "spent 5 hours reconciling supplier invoices and preparing the monthly VAT return" },
  { locale: "pl", browserLocale: "pl-PL", sector: "construction", text: "8 godzin układałem płytki w łazience, 12 m² i fugowanie" },
];

for (const day of DAYS) {
  test(`${day.sector} in ${day.locale}: the day is understood, saved and listed`, async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: state("worker"), locale: day.browserLocale });
    const page = await ctx.newPage();
    const tag = `QA-SYNTHETIC ${RUN} ${day.sector}`;
    await page.goto(`/${day.locale}/dashboard/journal`);
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => undefined);
    // Scoped to <main>: dashboard pages stream through a hidden `<div id="S:n">`
    // holder outside <main>; in a never-painting headless tab it can sit beside
    // the rendered copy, and a bare testid then fails strict mode or counts twice
    // (journal-confirm 40080278940 step 3; calendar-journal-history.spec.ts).
    const main = page.getByRole("main");
    await main.getByTestId("journal-quick-record-text").fill(`${tag}: ${day.text}`);
    await main.getByTestId("journal-quick-record-understand").click();
    await expect(main.getByTestId("worklog-flow")).toBeVisible({ timeout: 45_000 });
    await chooseWorkContextIfAsked(page, /QA-SYNTHETIC Alfa/);
    await answerNoProjectIfAsked(page);
    await main.getByTestId("worklog-save").click();
    await main.getByTestId("worklog-confirm").click();
    const done = main.getByTestId("worklog-done");
    const failed = main.getByTestId("worklog-error").or(main.getByTestId("worklog-blocked"));
    await expect(done.or(failed)).toBeVisible({ timeout: 45_000 });
    if (!(await done.isVisible())) throw new Error(`${day.sector}/${day.locale} not saved: ${await failed.innerText()}`);
    await page.goto(`/${day.locale}/dashboard/journal`);
    const card = main.locator('[data-testid^="journal-entry-card-"]', { hasText: tag }).first();
    await expect(card).toBeVisible({ timeout: 30_000 });
    // The page chrome speaks the chosen language (no LT leaking into EN/RU/PL).
    const lang = await page.locator("html").getAttribute("lang");
    console.info(`[sectors] ${day.sector}/${day.locale} saved; html lang=${lang}`);
    expect(lang?.slice(0, 2)).toBe(day.locale);
    await ctx.close();
  });
}

// ── Row 8.2: the exact sentences the 2026-10-24 local review misread ─────────
// (lib/journal/journal-six-locale-data-path.test.ts pins the parser; this
// proves the same day reads right in PRODUCTION, end to end in the UI). The
// step only asks the journal to understand the day and reads the draft: it
// never saves, so nothing is written.
const MISREAD_DAY: Record<string, { browserLocale: string; text: string }> = {
  lt: { browserLocale: "lt-LT", text: "šiandien 6 valandas mūrijau blokelių sieną objekte" },
  en: { browserLocale: "en-GB", text: "today I laid a block wall on site for 6 hours" },
  ru: { browserLocale: "ru-RU", text: "сегодня 6 часов клал стену из блоков на объекте" },
  nl: { browserLocale: "nl-NL", text: "vandaag 6 uur een blokkenmuur gemetseld op de bouwplaats" },
  de: { browserLocale: "de-DE", text: "heute 6 Stunden eine Blockmauer auf der Baustelle gemauert" },
  pl: { browserLocale: "pl-PL", text: "dzisiaj przez 6 godzin murowałem ścianę z bloczków na budowie" },
};

for (const [locale, day] of Object.entries(MISREAD_DAY)) {
  test(`8.2 ${locale}: a generic place word names no site, the 6 hours stay with the masonry`, async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: state("worker"), locale: day.browserLocale });
    const page = await ctx.newPage();
    await page.goto(`/${locale}/dashboard/journal`);
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => undefined);
    const main = page.getByRole("main");
    await main.getByTestId("journal-quick-record-text").fill(day.text);
    await main.getByTestId("journal-quick-record-understand").click();
    await expect(main.getByTestId("worklog-flow")).toBeVisible({ timeout: 45_000 });
    await chooseWorkContextIfAsked(page, /QA-SYNTHETIC Alfa/);
    const site = await main.getByTestId("worklog-site").inputValue();
    const record = main.getByTestId("worklog-record");
    const recordText = (await record.count()) ? (await record.innerText()).replace(/\s+/g, " ") : "(no record)";
    const unrecognised = (await record.count()) ? await record.locator("span.ml-1").count() : -1;
    console.info(`[8.2] ${locale}: site="${site}" record="${recordText.slice(0, 120)}" unrecognised-fragments=${unrecognised}`);
    expect(site, "a generic place word is never taken as the site name").toBe("");
    expect(recordText, "the record carries the six hours").toMatch(/\b6\b/);
    expect(unrecognised, "no fragment reads 'kind of work not recognised'").toBe(0);
    await ctx.close();
  });
}

