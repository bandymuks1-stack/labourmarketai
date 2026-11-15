import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { test, expect, firstVisit, type Browser, type Page } from "./prod-walk";

/**
 * PRODUCTION — A SWEDISH VISITOR (Lane F inventory 2026-11-12: no walk opened the site the
 * way a person in Sweden does).
 *
 * Swedish IS a routed interface language since #3261 (lib/i18n/config.ts `activeLocales`
 * carries `sv`), so the promise is now the Swedish site itself: a Swedish browser on `/` and
 * a `/sv` address get Swedish pages (`<html lang="sv">`, Swedish copy from messages/sv.json)
 * — never Lithuanian, never English, never an error — the language switcher offers Svenska,
 * and the job board finds work advertised in Swedish. (Until #3261 this walk asserted the
 * English fallback; its header said to rewrite it the day sv was routed.)
 *
 * Read-only, signed out, no form sent, no account, no language switched (the switcher is
 * opened and read, never used). Dispatch only (spec=swedish-visitor).
 */
const ENABLED = process.env.PROD_QA_WALK === "1";
test.skip(!ENABLED, "production walk: runs only in prod-qa-walk.yml");
test.describe.configure({ timeout: 240_000, retries: 0 });
test.use({ actionTimeout: 30_000, channel: "chrome" });

/** The Swedish catalogue: the copy the pages must show comes from it, never a second copy here. */
type Messages = {
  common: { localeSwitch: string };
  nav: { jobs: string };
  landing: { v3: { lead: string } };
  pages: { companies: { title: string } };
};
const SV = JSON.parse(readFileSync(resolve(__dirname, "../../messages/sv.json"), "utf8")) as Messages;
const EN = JSON.parse(readFileSync(resolve(__dirname, "../../messages/en.json"), "utf8")) as Messages;

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
const JOB = /\/sv\/jobs\/[0-9a-f-]{36}$/;

/**
 * Each key public page and the Swedish copy it must carry (messages/sv.json). Read from the
 * page's own region — `main` or the site header — never from `body`, whose text also holds the
 * serialized message bundle. `/` is the Swedish browser's entry: next-intl negotiates it to /sv.
 */
const PAGES: ReadonlyArray<{ start: string; region: "main" | "header"; copy: string; english: string }> = [
  { start: "/", region: "main", copy: SV.landing.v3.lead, english: EN.landing.v3.lead },
  { start: "/sv", region: "main", copy: SV.landing.v3.lead, english: EN.landing.v3.lead },
  { start: "/sv/jobs", region: "header", copy: SV.nav.jobs, english: EN.nav.jobs },
  { start: "/sv/for-companies", region: "main", copy: SV.pages.companies.title, english: EN.pages.companies.title },
];

test("SV-1. a Swedish browser and a /sv address get the Swedish site, on a computer and a phone", async ({ browser }) => {
  for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
    const { ctx, page } = await swede(browser, viewport);
    for (const { start, region, copy, english } of PAGES) {
      const res = await page.goto(start, { waitUntil: "domcontentloaded" });
      const where = `${start} @${viewport.width}`;
      expect(res?.status(), `${where}: answers 200 after its redirect`).toBe(200);
      expect(path(page), `${where}: stays in Swedish, not English or Lithuanian`).toMatch(/^\/sv(\/|$)/);
      await expect(page.locator("html"), `${where}: the page says it is Swedish`).toHaveAttribute("lang", "sv");
      await healthy(page, where);
      const scope = page.locator(region).first();
      await expect(scope, `${where}: shows the Swedish copy from messages/sv.json`).toContainText(copy, { timeout: 30_000 });
      if (english !== copy) {
        await expect(scope, `${where}: not the English copy`).not.toContainText(english);
      }
      await expect(page.locator('link[rel="alternate"][hreflang="sv"]'), `${where}: Swedish is a named alternate`).toHaveCount(1);
      // The BODY, not documentElement: globals.css clips the root, so the root reads the screen
      // width while content runs off it (phone-journeys-isolated.spec.ts, the same measure).
      expect(
        await page.evaluate(() => document.body.scrollWidth - document.documentElement.clientWidth),
        `${where}: nothing is wider than the screen`,
      ).toBeLessThanOrEqual(1);
    }
    await ctx.close();
  }
});

test("SV-2. the language switcher offers Svenska, and marks it as the current language", async ({ browser }) => {
  const { ctx, page } = await swede(browser);
  await page.goto("/sv", { waitUntil: "domcontentloaded" });
  await healthy(page, "/sv");
  // The header control (components/marketing/locale-switcher.tsx), named in Swedish. Opened
  // and read only: choosing a language would write the NEXT_LOCALE cookie.
  const trigger = page
    .locator('button[aria-haspopup="menu"]')
    .filter({ visible: true })
    .and(page.getByRole("button", { name: SV.common.localeSwitch }))
    .first();
  await expect(trigger, "the language control is named in Swedish").toBeVisible({ timeout: 30_000 });
  await trigger.click();
  const svenska = page.getByTestId("locale-switcher-menu").getByRole("menuitem", { name: "Svenska" });
  await expect(svenska, "the switcher offers Svenska").toBeVisible({ timeout: 15_000 });
  await expect(svenska, "Svenska is the current language").toHaveAttribute("aria-current", "true");
  expect(new URL((await svenska.getAttribute("href")) ?? "", page.url()).pathname, "Svenska leads to /sv").toMatch(/^\/sv(\/|$)/);
  await ctx.close();
});

test("SV-3. the job board finds work advertised in Swedish, and an advert opens in Swedish", async ({ browser }) => {
  const { ctx, page } = await swede(browser);
  // A Swedish word for the trade, typed the way a person in Sweden would search (SR-10).
  await page.goto("/sv/jobs?q=byggarbetare", { waitUntil: "domcontentloaded" });
  await expect(page.locator("html"), "the board is Swedish").toHaveAttribute("lang", "sv");
  await expect(page.getByTestId("public-jobs-unavailable"), "the board is available").toHaveCount(0);
  const cards = page.locator('main a[href^="/sv/jobs/"]');
  await expect
    .poll(async () => (await cards.evaluateAll((links) => links.map((a) => a.getAttribute("href") ?? ""))).filter((h) => /\/jobs\/[0-9a-f-]{36}$/.test(h)).length, {
      timeout: 60_000,
      message: "at least one advert for a Swedish search word",
    })
    .toBeGreaterThan(0);
  const first = (await cards.evaluateAll((links) => links.map((a) => a.getAttribute("href") ?? ""))).find((h) => /\/jobs\/[0-9a-f-]{36}$/.test(h));
  const res = await page.goto(first ?? "/sv/jobs", { waitUntil: "domcontentloaded" });
  expect(res?.status(), "the advert answers 200").toBe(200);
  expect(path(page), "the advert opens under the Swedish site").toMatch(JOB);
  await expect(page.locator("html"), "the advert page is Swedish").toHaveAttribute("lang", "sv");
  await healthy(page, "advert");
  await ctx.close();
});
