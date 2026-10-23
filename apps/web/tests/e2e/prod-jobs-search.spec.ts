import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { test, expect, type Browser, type BrowserContext, type Locator, type Page } from "@playwright/test";

/**
 * PRODUCTION JOB SEARCH — owner area 8 (registry rows 4.4, 4.9).
 *
 * What a visitor and a signed-in worker do on the public job board:
 *
 *   J-1  the anonymous board answers with a count and job cards;
 *   J-2  a profession filter is a real URL, and the next page keeps it;
 *   J-3  a profession typed as a word becomes the same profession filter;
 *   J-4  a page past the end goes back to the first page of the same search;
 *   J-5  an anonymous visitor opens a job: facts, and the sign-up door instead
 *        of member actions;
 *   J-6  a signed-in worker sees the saved-jobs tab, saves a job privately,
 *        finds it in the saved view, and removes it again (cleanup).
 *
 * The board is an owner-waivered public surface, so this walk reads it through
 * its existing structure (the GET form, the status line, the card links, the
 * save toggle's aria-pressed) and adds no selector to it.
 *
 * The board shows REAL public ads (external sources). This walk only READS
 * them, and the one write is the synthetic worker's own private bookmark —
 * never an application or an interest signal, which could reach a real
 * publisher or partner. It is removed again in the same test. Failure
 * messages and logs carry counts and states only, never an ad's text.
 *
 * Cast (`lib/testing/prod-qa-guard.ts`, all synthetic):
 *   anonymous  a fresh browser context, no session
 *   worker     qa.worker+multiw — the bookmark (own row, removed again)
 */
const SUPA = process.env.PROD_QA_SUPABASE_URL ?? "";
const ANON = process.env.PROD_QA_ANON_KEY ?? "";
const state = (slot: string) => resolve(__dirname, `.storage-state.prod-qa.${slot}.json`);
const ENABLED =
  process.env.PROD_QA_WALK === "1" && SUPA !== "" && ANON !== "" && existsSync(state("worker"));
test.skip(!ENABLED, "production walk: runs only in prod-qa-walk.yml with minted QA sessions");
test.describe.configure({ mode: "serial", timeout: 240_000, retries: 0 });
test.use({ actionTimeout: 30_000 });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function as(browser: Browser, slot: string | null): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({
    ...(slot ? { storageState: state(slot) } : {}),
    locale: "lt-LT",
  });
  return { ctx, page: await ctx.newPage() };
}

/** The board's GET search form. */
const searchForm = (page: Page): Locator => page.locator('main form[method="get"]').first();
/** Job cards: links to one job by id (never the pager or the tabs). */
const cards = (page: Page): Locator => page.locator('main a[href^="/lt/jobs/"]');
const jobIdOf = (href: string | null): string => (href?.match(/\/jobs\/([0-9a-f-]{36})/) ?? [])[1] ?? "";

/** The board answered: its count line, not the honest "did not answer" line (a failure here). */
async function boardAnswered(page: Page): Promise<void> {
  const count = page.locator('main p[role="status"]:not([data-testid])').first();
  const unavailable = page.getByTestId("public-jobs-unavailable");
  await expect(count.or(unavailable)).toBeVisible({ timeout: 60_000 });
  expect(await unavailable.isVisible(), "the job board answered in time").toBe(false);
}

let professionSlug = "";
let professionLabel = "";

test("J-1. the anonymous board answers with a count and job cards", async ({ browser }) => {
  const { ctx, page } = await as(browser, null);
  await page.goto("/lt/jobs");
  await boardAnswered(page);
  await expect.poll(() => cards(page).count(), { timeout: 30_000 }).toBeGreaterThan(0);
  expect(jobIdOf(await cards(page).first().getAttribute("href")), "a card links its job by id").toMatch(UUID);
  // An anonymous visitor gets no saved-jobs tab at all.
  await expect(page.locator('main a[href="/lt/jobs?saved=1"]')).toHaveCount(0);
  console.info(`J-1: cards on page one=${await cards(page).count()}`);
  await ctx.close();
});

test("J-2. a profession filter is a real URL, and the next page keeps it", async ({ browser }) => {
  const { ctx, page } = await as(browser, null);
  await page.goto("/lt/jobs");
  await boardAnswered(page);
  const select = searchForm(page).locator('select[name="profession"]');
  const options = await select.locator("option").evaluateAll((els) =>
    els.map((e) => ({ value: (e as HTMLOptionElement).value, label: (e.textContent ?? "").trim() })),
  );
  const choices = options.filter((o) => o.value !== "");
  expect(choices.length, "the profession catalogue is offered").toBeGreaterThan(0);
  // Try professions until one has live ads — some catalogue professions have
  // none today, and that is an honest empty state, not a failure.
  let withAds = 0;
  let empties = 0;
  for (const choice of choices.slice(0, 12)) {
    await page.goto(`/lt/jobs?profession=${encodeURIComponent(choice.value)}`);
    await boardAnswered(page);
    const n = await cards(page).count();
    if (n === 0) {
      empties += 1;
      continue;
    }
    withAds = n;
    professionSlug = choice.value;
    professionLabel = choice.label;
    break;
  }
  console.info(`J-2: professions tried with no live ads=${empties}, cards for the first with ads=${withAds}`);
  expect(withAds, "at least one of the first catalogue professions has live ads").toBeGreaterThan(0);
  expect(new URL(page.url()).searchParams.get("profession")).toBe(professionSlug);
  await expect(searchForm(page).locator('select[name="profession"]')).toHaveValue(professionSlug);
  // The pager (when there is a next page) carries the filter forward.
  const next = page.locator('main a[href*="page=2"]');
  if ((await next.count()) > 0) {
    expect(await next.first().getAttribute("href"), "page 2 keeps the profession filter").toContain(
      `profession=${professionSlug}`,
    );
  }
  await ctx.close();
});

test("J-3. a profession typed as a word becomes the same profession filter", async ({ browser }) => {
  test.skip(!professionSlug, "J-2 found no profession with ads");
  const { ctx, page } = await as(browser, null);
  await page.goto("/lt/jobs");
  await boardAnswered(page);
  const form = searchForm(page);
  await form.locator('input[name="q"]').fill(professionLabel);
  await form.locator('button[type="submit"]').click();
  await expect
    .poll(() => new URL(page.url()).searchParams.get("profession"), { timeout: 60_000 })
    .toBe(professionSlug);
  await boardAnswered(page);
  await ctx.close();
});

test("J-4. a page past the end goes back to the first page of the same search", async ({ browser }) => {
  test.skip(!professionSlug, "J-2 found no profession with ads");
  const { ctx, page } = await as(browser, null);
  await page.goto(`/lt/jobs?profession=${encodeURIComponent(professionSlug)}&page=9999`);
  await boardAnswered(page);
  const url = new URL(page.url());
  expect(url.searchParams.get("page"), "redirected off the empty page").toBeNull();
  expect(url.searchParams.get("profession")).toBe(professionSlug);
  await expect.poll(() => cards(page).count(), { timeout: 30_000 }).toBeGreaterThan(0);
  await ctx.close();
});

test("J-5. an anonymous visitor opens a job: facts, and the sign-up door", async ({ browser }) => {
  const { ctx, page } = await as(browser, null);
  await page.goto("/lt/jobs");
  await boardAnswered(page);
  await cards(page).first().click();
  await page.waitForURL(/\/lt\/jobs\/[0-9a-f-]{36}/, { timeout: 60_000 });
  const closed = page.getByTestId("public-job-closed");
  const facts = page.getByTestId("public-job-facts");
  await expect(facts.or(closed)).toBeVisible({ timeout: 60_000 });
  expect(await closed.isVisible(), "a job listed on the board opens as an open job").toBe(false);
  await expect(page.locator('main a[href*="/auth/signup?next="]').first()).toBeVisible();
  // No member action is offered to a visitor.
  await expect(page.locator("main button[aria-pressed]")).toHaveCount(0);
  await expect(page.getByTestId("public-job-interest")).toHaveCount(0);
  await ctx.close();
});

test("J-6. a signed-in worker saves a job privately, finds it in the saved view, and removes it", async ({ browser }) => {
  const { ctx, page } = await as(browser, "worker");
  await page.goto("/lt/jobs");
  await boardAnswered(page);
  await expect(page.locator('main a[href="/lt/jobs?saved=1"]'), "the worker sees the saved-jobs tab").toBeVisible();
  await expect.poll(() => cards(page).count(), { timeout: 30_000 }).toBeGreaterThan(0);
  const jobId = jobIdOf(await cards(page).first().getAttribute("href"));
  expect(jobId).toMatch(UUID);

  const save = page.locator("main button[aria-pressed]");
  const settle = async (pressed: "true" | "false") => {
    await expect(save).toHaveAttribute("aria-pressed", pressed, { timeout: 30_000 });
    await expect(save).toBeEnabled({ timeout: 30_000 });
  };
  await page.goto(`/lt/jobs/${jobId}`);
  await expect(save).toHaveCount(1, { timeout: 60_000 });
  await expect(page.getByTestId("public-job-comparison")).toBeVisible();
  if ((await save.getAttribute("aria-pressed")) === "true") {
    // A leftover from an interrupted run: remove it first, so this run proves the act.
    await save.click();
    await settle("false");
  }
  await save.click();
  await settle("true");

  // Persistence + the return path: the saved view lists it.
  await page.goto("/lt/jobs?saved=1");
  await expect(page.locator(`main a[href="/lt/jobs/${jobId}"]`)).toHaveCount(1, { timeout: 60_000 });

  // Cleanup: remove the bookmark, and the saved view no longer lists it.
  await page.goto(`/lt/jobs/${jobId}`);
  await expect(save).toHaveAttribute("aria-pressed", "true", { timeout: 60_000 });
  await save.click();
  await settle("false");
  await page.goto("/lt/jobs?saved=1");
  await expect(page.locator('main a[href="/lt/jobs?saved=1"]')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator(`main a[href="/lt/jobs/${jobId}"]`)).toHaveCount(0);
  await ctx.close();
});
