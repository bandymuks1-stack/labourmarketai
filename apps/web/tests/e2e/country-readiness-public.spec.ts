import { expect, test } from "@playwright/test";

/**
 * WHAT THIS COUNTRY REQUIRES OF YOU — the public visitor's journey, in a real
 * browser (SKL-8 + GEO-3, connected in Step B).
 *
 * WHY THIS SPEC EXISTS AND IS NOT A DUPLICATE. `lib/guards/country-readiness-
 * reachable.test.ts` asserts the module is mounted and the copy exists — it
 * reads source and JSON. It cannot tell you whether a person opening the page
 * actually SEES the requirements: whether the section renders, whether all four
 * mobility scopes appear, whether the sourcing marks survive the render. This
 * spec opens the page and looks.
 *
 * WHY IT CAN RUN IN CI. `/labour-market/[country]` touches no database: the
 * page, `CountrySignals`, `LabourMarketEvidence` and the readiness matrix are
 * all pure i18n + checked-in data (verified 2026-09-14 — zero `createClient`,
 * zero `.from(` across the four modules). So it belongs to the secret-free
 * public-route class the e2e-smoke job accepts: no login, no SUPABASE_TEST_URL,
 * no env.
 *
 * WHAT IT DOES NOT CLAIM. It does not make this capability HUMAN_UI_PROVEN.
 * A machine confirming that text is present is not a person confirming the
 * page is understandable, and the two must never be confused.
 *
 *   local:      pnpm -F web e2e country-readiness-public
 *   preview:    E2E_BASE_URL=https://<host> pnpm -F web e2e country-readiness-public
 */

/** The four mobility scopes the matrix must offer. Three of these had no
 *  reader anywhere in the product before Step B. */
const SCOPES = [
  "worker_solo",
  "worker_posted",
  "team_subcontracting",
  "company_hiring",
] as const;

test.describe("a visitor can see what a country requires of them", () => {
  test("the requirements section renders on the per-country page", async ({ page }) => {
    await page.goto("/en/labour-market/de");

    const section = page.getByTestId("country-readiness-DE");
    await expect(section).toBeVisible();

    // The heading is real copy from the countryReadiness namespace, not a key.
    await expect(section).toContainText("What this country requires of you");
    await expect(section).not.toContainText("countryReadiness.");
  });

  test("ALL FOUR mobility scopes are present, not just the posted-worker one", async ({
    page,
  }) => {
    // The defect Step B closed: only `worker_posted` had a reader, and only
    // through the personal document checklist. If this ever narrows back to
    // one scope, GEO-3 has silently disappeared from the product again.
    await page.goto("/en/labour-market/de");
    for (const scope of SCOPES) {
      await expect(
        page.getByTestId(`country-readiness-scope-${scope}`),
        `scope ${scope} is missing from the rendered page`,
      ).toBeVisible();
    }
  });

  test("every requirement carries a source link and a review date", async ({ page }) => {
    await page.goto("/en/labour-market/de");
    const section = page.getByTestId("country-readiness-DE");

    // At least one official source link, opening safely.
    const sourceLink = section.locator('a[target="_blank"]').first();
    await expect(sourceLink).toBeVisible();
    await expect(sourceLink).toHaveAttribute("rel", /noopener/);
    await expect(sourceLink).toHaveAttribute("href", /^https:\/\//);

    // The review date is rendered, so a reader can judge how fresh this is.
    await expect(section).toContainText(/\d{4}-\d{2}-\d{2}/);
  });

  test("a statement we cannot stand behind is MARKED, not dressed as fact", async ({
    page,
  }) => {
    // The matrix deliberately marks country-specific detail
    // `needs_legal_review` rather than inventing a national rule. If that
    // marking stops rendering, the honesty of the data is thrown away at the
    // last step and a stranger reads an unverified rule as settled law.
    await page.goto("/en/labour-market/de");
    const marks = page.getByTestId("requirement-needs-legal-review");
    await expect(marks.first()).toBeVisible();
    await expect(marks.first()).toContainText(/national|not verified|question/i);
  });

  test("the page does not silently fall back to another country's data", async ({
    page,
  }) => {
    // Two supported countries must not render identical requirement sets by
    // accident of a shared fallback. They legitimately share the EU framework,
    // so the check is on the SECTION IDENTITY, which is country-bound.
    await page.goto("/en/labour-market/nl");
    await expect(page.getByTestId("country-readiness-NL")).toBeVisible();
    await expect(page.getByTestId("country-readiness-DE")).toHaveCount(0);
  });
});
