import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { test, expect, type Browser, type BrowserContext, type Page } from "@playwright/test";

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

/** The board answered: either a count line, or its honest "did not answer" line (a failure here). */
async function boardAnswered(page: Page): Promise<void> {
  const count = page.getByTestId("public-jobs-count");
  const unavailable = page.getByTestId("public-jobs-unavailable");
  await expect(count.or(unavailable)).toBeVisible({ timeout: 60_000 });
  expect(await unavailable.isVisible(), "the job board answered in time").toBe(false);
}

let firstJobId = "";

test("J-1. the anonymous board answers with a count and job cards", async ({ browser }) => {
  const { ctx, page } = await as(browser, null);
  await page.goto("/lt/jobs");
  await boardAnswered(page);
  const cards = page.getByTestId("public-jobs-list").getByTestId("public-vacancy-card");
  await expect.poll(() => cards.count(), { timeout: 30_000 }).toBeGreaterThan(0);
  const href = (await cards.first().getAttribute("href")) ?? "";
  firstJobId = (href.match(/\/jobs\/([0-9a-f-]{36})/) ?? [])[1] ?? "";
  expect(firstJobId, "a card links its job by id").toMatch(UUID);
  // An anonymous visitor gets no member tab at all.
  await expect(page.getByTestId("public-jobs-tabs")).toHaveCount(0);
  console.info(`J-1: cards on page one=${await cards.count()}`);
  await ctx.close();
});

let professionSlug = "";
let professionLabel = "";

test("J-2. a profession filter is a real URL, and the next page keeps it", async ({ browser }) => {
  const { ctx, page } = await as(browser, null);
  await page.goto("/lt/jobs");
  await boardAnswered(page);
  const select = page.getByTestId("public-jobs-search").locator('select[name="profession"]');
  const options = await select.locator("option").evaluateAll((els) =>
    els.map((e) => ({ value: (e as HTMLOptionElement).value, label: (e.textContent ?? "").trim() })),
  );
  const choices = options.filter((o) => o.value !== "");
  expect(choices.length, "the profession catalogue is offered").toBeGreaterThan(0);
  // Try professions until one has live ads — some catalogue professions have
  // none today, and that is an honest empty state, not a failure.
  let withAds = 0;
  for (const choice of choices.slice(0, 12)) {
    await page.goto(`/lt/jobs?profession=${encodeURIComponent(choice.value)}`);
    await boardAnswered(page);
    const empty = page.getByTestId("public-jobs-empty");
    if (await empty.isVisible()) {
      // The empty state names the filter and offers a way out.
      await expect(empty.getByRole("link")).toHaveCount(1);
      continue;
    }
    withAds = await page.getByTestId("public-jobs-list").getByTestId("public-vacancy-card").count();
    professionSlug = choice.value;
    professionLabel = choice.label;
    break;
  }
  expect(withAds, "at least one of the first catalogue professions has live ads").toBeGreaterThan(0);
  expect(new URL(page.url()).searchParams.get("profession")).toBe(professionSlug);
  await expect(select).toHaveValue(professionSlug);
  // The pager (when there is a next page) carries the filter forward.
  const pager = page.getByTestId("public-jobs-pager");
  if (await pager.isVisible()) {
    const next = pager.locator('a[href*="page=2"]');
    if ((await next.count()) > 0) {
      const href = (await next.first().getAttribute("href")) ?? "";
      expect(href, "page 2 keeps the profession filter").toContain(`profession=${professionSlug}`);
    }
  }
  console.info(`J-2: profession filter with ads found, cards=${withAds}`);
  await ctx.close();
});

test("J-3. a profession typed as a word becomes the same profession filter", async ({ browser }) => {
  test.skip(!professionSlug, "J-2 found no profession with ads");
  const { ctx, page } = await as(browser, null);
  await page.goto("/lt/jobs");
  await boardAnswered(page);
  const form = page.getByTestId("public-jobs-search");
  await form.locator('input[name="q"]').fill(professionLabel);
  await form.locator('button[type="submit"]').click();
  await expect.poll(() => new URL(page.url()).searchParams.get("profession"), { timeout: 60_000 }).toBe(professionSlug);
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
  await expect.poll(() => page.getByTestId("public-jobs-list").getByTestId("public-vacancy-card").count()).toBeGreaterThan(0);
  await ctx.close();
});

test("J-5. an anonymous visitor opens a job: facts, and the sign-up door", async ({ browser }) => {
  const { ctx, page } = await as(browser, null);
  await page.goto("/lt/jobs");
  await boardAnswered(page);
  await page.getByTestId("public-jobs-list").getByTestId("public-vacancy-card").first().click();
  await page.waitForURL(/\/lt\/jobs\/[0-9a-f-]{36}/, { timeout: 60_000 });
  const closed = page.getByTestId("public-job-closed");
  const facts = page.getByTestId("public-job-facts");
  await expect(facts.or(closed)).toBeVisible({ timeout: 60_000 });
  expect(await closed.isVisible(), "a job listed on the board opens as an open job").toBe(false);
  await expect(page.getByTestId("public-job-locked")).toBeVisible();
  await expect(page.getByTestId("public-job-locked").locator('a[href*="/auth/signup?next="]')).toHaveCount(1);
  // No member action is offered to a visitor.
  await expect(page.getByTestId("public-job-save")).toHaveCount(0);
  await expect(page.getByTestId("public-job-interest")).toHaveCount(0);
  await ctx.close();
});

test("J-6. a signed-in worker saves a job privately, finds it in the saved view, and removes it", async ({ browser }) => {
  const { ctx, page } = await as(browser, "worker");
  await page.goto("/lt/jobs");
  await boardAnswered(page);
  await expect(page.getByTestId("public-jobs-tabs"), "the worker sees the saved-jobs tab").toBeVisible();
  // A job this worker has NOT saved, so the run proves the act.
  const cards = page.getByTestId("public-jobs-list").getByTestId("public-vacancy-card");
  await expect.poll(() => cards.count(), { timeout: 30_000 }).toBeGreaterThan(0);
  const href = (await cards.first().getAttribute("href")) ?? "";
  const jobId = (href.match(/\/jobs\/([0-9a-f-]{36})/) ?? [])[1] ?? "";
  expect(jobId).toMatch(UUID);
  await page.goto(`/lt/jobs/${jobId}`);
  const save = page.getByTestId("public-job-save");
  await expect(save).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("public-job-comparison")).toBeVisible();
  if ((await save.getAttribute("data-saved")) === "true") {
    // A leftover from an interrupted run: remove it first.
    await save.click();
    await expect(save).toHaveAttribute("data-saved", "false", { timeout: 30_000 });
    await expect(save).toHaveAttribute("data-pending", "false", { timeout: 30_000 });
  }
  await save.click();
  await expect(save).toHaveAttribute("data-saved", "true", { timeout: 30_000 });
  await expect(save).toHaveAttribute("data-pending", "false", { timeout: 30_000 });

  // Persistence + the return path: the saved view lists it.
  await page.goto("/lt/jobs?saved=1");
  const savedList = page.getByTestId("public-jobs-saved-list");
  await expect(savedList).toBeVisible({ timeout: 60_000 });
  await expect(savedList.locator(`a[href*="/jobs/${jobId}"]`)).toHaveCount(1);

  // Cleanup: remove the bookmark, and the saved view no longer lists it.
  await page.goto(`/lt/jobs/${jobId}`);
  await expect(save).toHaveAttribute("data-saved", "true", { timeout: 60_000 });
  await save.click();
  await expect(save).toHaveAttribute("data-saved", "false", { timeout: 30_000 });
  await expect(save).toHaveAttribute("data-pending", "false", { timeout: 30_000 });
  await page.goto("/lt/jobs?saved=1");
  await expect(page.getByTestId("public-jobs-saved-list").or(page.getByTestId("public-jobs-saved-empty"))).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.locator(`[data-testid="public-jobs-saved-list"] a[href*="/jobs/${jobId}"]`)).toHaveCount(0);
  await ctx.close();
});
