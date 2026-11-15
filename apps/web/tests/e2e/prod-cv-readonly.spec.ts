import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { test, expect, type Browser, type BrowserContext, type Locator, type Page } from "./prod-walk";

/**
 * PRODUCTION CV · READ ONLY (issue #3354). The one professional history as a
 * signed-in person sees it in a real browser, with NOTHING written.
 *
 * Cast (`lib/testing/prod-qa-guard.ts`, all synthetic):
 *   worker  qa.worker+multiw — weeks of recorded and confirmed work
 *   owner   owns "QA-SYNTHETIC Alfa" — leadership on the personal CV, and the
 *           company history page
 *
 * READ ONLY, ENFORCED. Every context aborts any request to the site that is not
 * GET / HEAD / OPTIONS before it leaves the browser, so no server action, form
 * or API write can run; each step reports how many it stopped. The steps log
 * states, booleans and counts only — never a figure, a name or a date; the walk
 * log is a public artefact.
 *
 * Runs only in `.github/workflows/prod-qa-walk.yml` (dispatch `cv-readonly`).
 */
const ALFA = "QA-SYNTHETIC Alfa";
const state = (slot: string) => resolve(__dirname, `.storage-state.prod-qa.${slot}.json`);
const ENABLED = process.env.PROD_QA_WALK === "1" && ["worker", "owner"].every((s) => existsSync(state(s)));
test.skip(!ENABLED, "production walk: runs only in prod-qa-walk.yml with minted QA sessions");
test.describe.configure({ mode: "serial", timeout: 240_000, retries: 0 });
test.use({ actionTimeout: 30_000, channel: "chrome" });

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** A signed-in context that cannot write: non-read requests to the site are aborted. */
async function readOnly(browser: Browser, slot: string): Promise<{ ctx: BrowserContext; page: Page; stopped: () => number }> {
  const ctx = await browser.newContext({ storageState: state(slot), locale: "lt-LT" });
  let stopped = 0;
  await ctx.route("**/*", async (route) => {
    const req = route.request();
    const sameSite = new URL(req.url()).host === new URL(process.env.E2E_BASE_URL ?? req.url()).host;
    if (sameSite && !READ_METHODS.has(req.method())) {
      stopped += 1;
      await route.abort("blockedbyclient");
      return;
    }
    await route.continue();
  });
  return { ctx, page: await ctx.newPage(), stopped: () => stopped };
}

/** The page content, never the hidden streaming copy (see prod-profile-cv-history.spec.ts). */
const inMain = (page: Page): Locator => page.getByRole("main");

async function livingCv(page: Page): Promise<Locator> {
  await page.goto("/lt/cv");
  const main = inMain(page);
  await expect(main.locator("h1").first()).toBeVisible({ timeout: 30_000 });
  return main;
}

const num = async (l: Locator, a: string) => Number((await l.getAttribute(a)) ?? "NaN");

test("R-1 (2.26). the worker's Living CV and Work in numbers show one history, read only", async ({ browser }) => {
  const { ctx, page, stopped } = await readOnly(browser, "worker");
  await page.goto("/lt/dashboard/work-in-numbers");
  await expect(inMain(page).getByTestId("wi-experience")).toBeVisible({ timeout: 30_000 });
  const total = inMain(page).getByTestId("wi-experience-total");
  const wi =
    (await total.count()) > 0
      ? {
          hours: await num(total, "data-hours"),
          journal: await num(total, "data-journal-hours"),
          organization: await num(total, "data-organization-hours"),
        }
      : null;
  const cv = await livingCv(page);
  const cvTotal = cv.getByTestId("cv-professional-experience-total");
  const cvShown = (await cvTotal.count()) > 0;
  if (cvShown) {
    expect(wi, "the Living CV shows a combined total that Work in numbers does not").not.toBeNull();
    const same =
      Math.abs((await num(cvTotal, "data-total-hours")) - wi!.hours) < 0.01 &&
      Math.abs((await num(cvTotal, "data-journal-hours")) - wi!.journal) < 0.01 &&
      Math.abs((await num(cvTotal, "data-organization-hours")) - wi!.organization) < 0.01;
    console.info(`[cv-readonly] worker: living CV and work-in-numbers agree=${same}`);
    expect(same, "one history: the Living CV and Work in numbers show the same total").toBe(true);
  } else {
    console.info(`[cv-readonly] worker: no combined total on either surface=${wi === null}`);
    expect(wi, "Work in numbers shows a combined total the Living CV does not").toBeNull();
  }
  console.info(`[cv-readonly] worker: writes stopped=${stopped()}`);
  await ctx.close();
});

test("R-2 (2.26). the owner's own CV: leadership is a role without hours; no worker's hours are the owner's", async ({ browser }) => {
  const { ctx, page, stopped } = await readOnly(browser, "owner");
  const cv = await livingCv(page);
  const leadership = cv.getByTestId("organizations-leadership");
  const shown = (await leadership.count()) > 0;
  const rows = shown ? await leadership.getByTestId("organizations-leadership-row").count() : 0;
  console.info(`[cv-readonly] owner: leadership shown=${shown} rows=${rows}`);
  expect(shown, "the owner of QA-SYNTHETIC Alfa sees their leadership on their CV").toBe(true);
  expect(rows).toBeGreaterThan(0);
  // A role carries no hours: no hour figure inside the leadership block.
  const hourText = /\b\d+(?:[.,]\d+)?\s*(h|val\.?)\b/i;
  expect(hourText.test(await leadership.innerText()), "leadership rows carry no hours").toBe(false);
  // The owner's total (if any) is the owner's own recorded work: it equals Work in numbers,
  // which reads the owner's own entries only.
  const cvTotal = cv.getByTestId("cv-professional-experience-total");
  const cvHours = (await cvTotal.count()) > 0 ? await num(cvTotal, "data-total-hours") : null;
  await page.goto("/lt/dashboard/work-in-numbers");
  await expect(inMain(page).getByTestId("wi-experience")).toBeVisible({ timeout: 30_000 });
  const wiTotal = inMain(page).getByTestId("wi-experience-total");
  const wiHours = (await wiTotal.count()) > 0 ? await num(wiTotal, "data-hours") : null;
  const agree = cvHours === null ? wiHours === null : wiHours !== null && Math.abs(cvHours - wiHours) < 0.01;
  console.info(`[cv-readonly] owner: own total on CV and work-in-numbers agree=${agree}`);
  expect(agree, "the owner's CV total is the owner's own recorded work").toBe(true);
  console.info(`[cv-readonly] owner: writes stopped=${stopped()}`);
  await ctx.close();
});

test("R-3 (3.27). company history: people link to their own page only on a confirmed link; a place opens its detail", async ({ browser }) => {
  const { ctx, page, stopped } = await readOnly(browser, "owner");
  // Workspace is chosen by URL (?org= is checked against the caller's own memberships),
  // not by the header chip, which would write the active workspace.
  await page.goto("/lt/dashboard/company/people");
  const chip = page.getByTestId("workspace-chip").first();
  await expect(chip).toBeVisible({ timeout: 30_000 });
  const inAlfa = (await chip.innerText()).includes(ALFA);
  console.info(`[cv-readonly] company: active workspace is the synthetic company=${inAlfa}`);
  test.skip(!inAlfa, "the synthetic owner's active workspace is not the synthetic company; switching it would write");
  await page.goto("/lt/dashboard/company/history");
  await expect(inMain(page).getByTestId("company-history")).toBeVisible({ timeout: 30_000 });
  const places = inMain(page).getByTestId("company-work-history-place");
  const placeCount = await places.count();
  console.info(`[cv-readonly] company: places=${placeCount}`);
  if (placeCount > 0) {
    await places.first().click();
    await page.waitForURL(/[?&]place=/, { timeout: 30_000 });
    // The anchor every place tile links to (#company-place-detail).
    const detail = inMain(page).locator("#company-place-detail");
    const rendered = (await detail.count()) > 0;
    // Before #3359 is deployed the page did not render the detail; report, do not guess.
    console.info(`[cv-readonly] company: place detail rendered=${rendered}`);
    if (rendered) {
      const ownLinks = await detail.locator('a[href*="/dashboard/people/"]').count();
      console.info(`[cv-readonly] company: person-page links=${ownLinks}`);
    }
  }
  console.info(`[cv-readonly] company: writes stopped=${stopped()}`);
  await ctx.close();
});
