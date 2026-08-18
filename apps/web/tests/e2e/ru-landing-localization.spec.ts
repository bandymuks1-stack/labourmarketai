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

/** Strings that MUST render in Russian on the hero. */
const MUST_APPEAR = [
  "РЕШЕНИЕ ИИ",
  "Почему здесь",
  "Почему сейчас",
  "Наиболее подходящий человек",
  "Сохранить результат",
];

/** Their English originals — every one of these was on the Russian page before. */
const MUST_BE_GONE = [
  "AI DECISION",
  "Why here",
  "Why now",
  "Best matching person",
  "Save this result",
  "An account is only needed to save",
  "Checking open needs by role and region",
  "Rotterdam and Eindhoven have more open needs",
];

test.describe("Russian landing hero renders Russian (U-15)", () => {
  test("the first screen is Russian, and its English originals are gone", async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/ru", { waitUntil: "networkidle" });

    const body = page.locator("body");
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
    expect(text, "the {count} placeholder leaked as a literal").not.toContain("{count}");
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
