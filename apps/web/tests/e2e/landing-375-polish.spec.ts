import { expect, test } from "@playwright/test";

/**
 * THE PUBLIC LANDING AT 375px — readable chips, a switcher that covers
 * nothing, a sample with no two identical cards (owner directive 2026-09-24).
 *
 * ANONYMOUS, READ-ONLY, OPT-IN. This walks a deployed landing (production or
 * a preview) as a visitor with no session: it signs nothing in and writes
 * nothing. It is SKIPPED everywhere unless `E2E_PUBLIC_LANDING=1`, so CI —
 * which runs vitest and a local subset — never reaches out to production.
 *
 *   E2E_PUBLIC_LANDING=1 E2E_NO_SERVER=1 \
 *     pnpm -F web exec playwright test landing-375-polish
 *
 * The base URL is `E2E_PUBLIC_LANDING_URL` (default https://labourmarket.ai).
 * The static halves of the same three properties are pinned without a
 * browser in lib/guards/landing-375-polish.test.ts.
 */

const ENABLED = process.env.E2E_PUBLIC_LANDING === "1";
const BASE = (process.env.E2E_PUBLIC_LANDING_URL ?? "https://labourmarket.ai").replace(/\/$/, "");
const LOCALES = ["lt", "en", "ru", "nl", "de", "pl"] as const;

test.describe("@375px the public landing", () => {
  test.skip(!ENABLED, "anonymous read-only walk of a deployed landing; set E2E_PUBLIC_LANDING=1");
  test.use({ viewport: { width: 375, height: 812 } });

  for (const locale of LOCALES) {
    test(`/${locale}: every example chip is fully readable`, async ({ page }) => {
      await page.goto(`${BASE}/${locale}`, { waitUntil: "networkidle" });
      await expect(page.getByTestId("entry-example").first()).toBeVisible();
      const chips = await page.getByTestId("entry-example").evaluateAll((els) =>
        els.map((el) => {
          const r = el.getBoundingClientRect();
          const lineHeight = parseFloat(getComputedStyle(el).lineHeight);
          return {
            label: (el.textContent ?? "").trim(),
            cut: el.scrollWidth > el.clientWidth + 1,
            lines: Math.round((r.height - 12 - 2) / lineHeight),
            right: r.right,
          };
        }),
      );
      expect(chips.length).toBeGreaterThan(0);
      for (const chip of chips) {
        expect(chip.cut, `"${chip.label}" is cut with an ellipsis`).toBe(false);
        expect(chip.lines, `"${chip.label}" needs more than two lines`).toBeLessThanOrEqual(2);
        expect(chip.right, `"${chip.label}" escapes the viewport`).toBeLessThanOrEqual(375.5);
      }
    });

    // The LIVE / FOCUS control that once covered the counter line is gone
    // with the LIVE arm (owner decision 2026-09-30): nothing of it renders.
    test(`/${locale}: no LIVE/FOCUS control floats over the page`, async ({ page }) => {
      await page.goto(`${BASE}/${locale}`, { waitUntil: "networkidle" });
      await expect(page.getByRole("group", { name: "LIVE / FOCUS" })).toHaveCount(0);
      await expect(page.getByText(/^LIVE$/)).toHaveCount(0);
    });

    test(`/${locale}: no two sample cards read the same`, async ({ page }) => {
      await page.goto(`${BASE}/${locale}`, { waitUntil: "networkidle" });
      const cards = page.getByTestId("landing-open-job");
      const n = await cards.count();
      test.skip(n === 0, "the reader did not answer, so the band is honestly absent");
      const texts = await cards.evaluateAll((els) =>
        els.map((el) => (el.textContent ?? "").replace(/\s+/g, " ").trim()),
      );
      expect(new Set(texts).size, `identical cards:\n${texts.join("\n")}`).toBe(texts.length);
      expect(n).toBeLessThanOrEqual(4);
    });
  }
});
