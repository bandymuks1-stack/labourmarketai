import { test, expect, firstVisit, type Browser, type Page } from "./prod-walk";

/**
 * PRODUCTION — A SWEDISH VISITOR (Lane F inventory 2026-11-12: no walk opened the site the
 * way a person in Sweden does). Swedish is not a routed interface language
 * (lib/i18n/config.ts `activeLocales`), so the honest promise is: a Swedish browser and a
 * `/sv` address get the ENGLISH site — never Lithuanian, never an error — and the job
 * board finds work advertised in Swedish.
 *
 * Read-only, signed out, no form sent, no account. Dispatch only (spec=swedish-visitor).
 * It fails when Swedish becomes a routed language: that is the moment to rewrite it to
 * expect Swedish pages.
 */
const ENABLED = process.env.PROD_QA_WALK === "1";
test.skip(!ENABLED, "production walk: runs only in prod-qa-walk.yml");
test.describe.configure({ timeout: 240_000, retries: 0 });
test.use({ actionTimeout: 30_000, channel: "chrome" });

async function swede(browser: Browser, viewport = { width: 1280, height: 800 }) {
  const ctx = await browser.newContext(firstVisit({ viewport, locale: "sv-SE", extraHTTPHeaders: { "Accept-Language": "sv-SE,sv;q=0.9" } }));
  return { ctx, page: await ctx.newPage() };
}

async function healthy(page: Page, what: string) {
  await expect(page.getByTestId("global-error-message"), `${what}: no error screen`).toHaveCount(0);
  await expect(page.getByTestId("error-boundary-message"), `${what}: no error screen`).toHaveCount(0);
  await expect(page.locator("h1").first(), `${what}: a heading is shown`).toBeVisible({ timeout: 30_000 });
}

const path = (page: Page) => new URL(page.url()).pathname;
const JOB = /\/en\/jobs\/[0-9a-f-]{36}$/;

test("SV-1. a Swedish browser and a /sv address get the English site, on a computer and a phone", async ({ browser }) => {
  for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
    const { ctx, page } = await swede(browser, viewport);
    for (const start of ["/", "/sv", "/sv/jobs", "/sv/for-companies"]) {
      const res = await page.goto(start, { waitUntil: "domcontentloaded" });
      const where = `${start} @${viewport.width}`;
      expect(res?.status(), `${where}: answers 200 after its redirect`).toBe(200);
      expect(path(page), `${where}: lands in English, not Lithuanian`).toMatch(/^\/en(\/|$)/);
      await expect(page.locator("html"), `${where}: the page says it is English`).toHaveAttribute("lang", "en");
      await healthy(page, where);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
        `${where}: nothing is wider than the screen`,
      ).toBeLessThanOrEqual(1);
    }
    await ctx.close();
  }
});

test("SV-2. the job board finds work advertised in Swedish, and an advert opens", async ({ browser }) => {
  const { ctx, page } = await swede(browser);
  // A Swedish word for the trade, typed the way a person in Sweden would search (SR-10).
  await page.goto("/en/jobs?q=byggarbetare", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("public-jobs-unavailable"), "the board is available").toHaveCount(0);
  const cards = page.locator('main a[href^="/en/jobs/"]');
  await expect
    .poll(async () => (await cards.evaluateAll((links) => links.map((a) => a.getAttribute("href") ?? ""))).filter((h) => /\/jobs\/[0-9a-f-]{36}$/.test(h)).length, {
      timeout: 60_000,
      message: "at least one advert for a Swedish search word",
    })
    .toBeGreaterThan(0);
  const first = (await cards.evaluateAll((links) => links.map((a) => a.getAttribute("href") ?? ""))).find((h) => /\/jobs\/[0-9a-f-]{36}$/.test(h));
  const res = await page.goto(first ?? "/en/jobs", { waitUntil: "domcontentloaded" });
  expect(res?.status(), "the advert answers 200").toBe(200);
  expect(path(page), "the advert opens under the English site").toMatch(JOB);
  await healthy(page, "advert");
  await ctx.close();
});
