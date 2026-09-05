import { expect, test } from "@playwright/test";
import { join } from "node:path";

/**
 * RUSSIAN LANDING LOCALIZATION — production verification for OWNER DECISION U-15.
 *
 * U-15 requires the Russian production surface to be browser-verified after
 * deployment. This spec IS that verification, committed rather than performed
 * once by hand, so it can be re-run by anyone against any environment and does
 * not depend on who happened to look.
 *
 *   local:      pnpm -F web e2e ru-landing-localization
 *   preview:    E2E_BASE_URL=https://<preview-host> pnpm -F web e2e ru-landing-localization
 *   PRODUCTION: E2E_BASE_URL=https://labourmarket.ai pnpm -F web e2e ru-landing-localization
 *
 * WHY IT IS COMMITTED RATHER THAN ALREADY RUN AGAINST PRODUCTION. The session
 * that made this change runs behind an egress policy that refuses CONNECT to
 * `labourmarket.ai:443` (gateway 403), so it could not reach the deployed site
 * at all. Rather than claim a verification it could not perform, it left the
 * verification runnable. See the U-15 section of
 * `docs/audits/landing-freeze-baseline-update-2026-08-18.md`.
 *
 * WHAT IT ASSERTS. Not "some Russian is present" — that would pass on a page
 * where only the nav was translated. It asserts the specific first-screen
 * strings that were English before this change now render in Russian, AND that
 * their English originals are gone from the page.
 */

const OUT = join(
  __dirname, "..", "..", "..", "..",
  "docs", "audits", "evidence", "ru-landing-localization",
);

/** Strings that MUST render in Russian on the first screen — the public
 *  entry (frozen design contract 2026-09-05, P1): the field label, the
 *  understanding of a real sentence, the doors. */
const MUST_APPEAR = [
  "Напишите, что вам нужно",
  "Понял",
  "Вам нужны работники",
  "Создать учётную запись",
  "У меня есть учётная запись",
];

/** Their English originals — none of these may appear on the Russian page. */
const MUST_BE_GONE = [
  "Write what you need",
  "Understood",
  "You need workers",
  "Create an account",
  "I have an account",
  "For example:",
  "I did not understand at first",
];

test.describe("Russian landing hero renders Russian (U-15)", () => {
  test("the first screen is Russian, and its English originals are gone", async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/ru", { waitUntil: "networkidle" });

    const body = page.locator("body");

    // THE UNDERSTANDING MUST BE PRODUCED, NOT WAITED FOR.
    //
    // Three of MUST_APPEAR — the understanding label, the understanding line
    // and the two doors — render only after a sentence has been read. The
    // first example chip is a real Russian sentence routed LIVE through the
    // deterministic router (P1), so driving it keeps the assertion strong:
    // the strings must still be Russian, and the router must still read
    // Russian.
    const example = page.getByTestId("entry-example").first();
    await expect(
      example,
      "the entry's example sentences should be present on /ru",
    ).toBeVisible({ timeout: 30_000 });
    await example.click();
    await expect(
      page.getByTestId("entry-understanding"),
      "reading the example should produce an understanding",
    ).toBeVisible({ timeout: 15_000 });

    for (const phrase of MUST_APPEAR) {
      await expect(
        body,
        `the Russian hero should render "${phrase}"`,
      ).toContainText(phrase, { timeout: 15_000 });
    }

    const text = (await body.innerText()).replace(/\s+/g, " ");
    for (const phrase of MUST_BE_GONE) {
      expect(
        text,
        `"${phrase}" is English and must not appear on /ru`,
      ).not.toContain(phrase);
    }

    // A dropped ICU placeholder renders as a literal and is invisible to a
    // "does it look Russian" glance, so it is asserted explicitly.
    for (const placeholder of ["{vacancies}", "{employers}", "{date}"]) {
      expect(text, `the ${placeholder} placeholder leaked as a literal`).not.toContain(placeholder);
    }
  });

  test("evidence screenshots at 390 / 768 / 1440", async ({ page }) => {
    test.setTimeout(180_000);
    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      await page.goto("/ru", { waitUntil: "networkidle" });
      await page.waitForTimeout(2000);
      await page.screenshot({ path: join(OUT, `ru-landing-hero-${width}.png`) });
      await page.screenshot({
        path: join(OUT, `ru-landing-full-${width}.png`),
        fullPage: true,
      });
    }
  });
});
