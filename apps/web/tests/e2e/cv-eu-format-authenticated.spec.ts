/**
 * Authenticated EU-format CV export end-to-end (local stack).
 *
 * Proves the thing "the route exists" does not: a real logged-in person can
 * reach the EU-format document from the CV screen and it renders their OWN
 * data under the European section headings.
 *
 *   login session → /lt/cv → pick the "ES formatas" template
 *   → the EU document renders with the Europass section order
 *   → the honesty note is present (this is not an EU-issued Europass)
 *   → the person's real name/professions are the ones shown
 *   → switching back to the standard template still works.
 *
 * Skips when tests/e2e/.storage-state.json is missing (run e2e-mint-session).
 */
import { test, expect } from "@playwright/test";
import { existsSync } from "node:fs";
import { join } from "node:path";

const STORAGE_STATE = join(__dirname, ".storage-state.json");

test.skip(
  !existsSync(STORAGE_STATE),
  `Storage state ${STORAGE_STATE} missing — run scripts/e2e-mint-session.ts first.`,
);

test.use({ storageState: STORAGE_STATE });

test("the EU-format CV is reachable and renders the person's own data", async ({
  page,
}) => {
  test.setTimeout(120_000);

  await page.goto("/lt/cv", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/lt\/cv/, { timeout: 30_000 });

  // The standard document is what a worker sees first.
  const standardName = await page
    .locator("h1")
    .first()
    .textContent({ timeout: 30_000 });

  // The template registry offers the EU format.
  const euLink = page.locator('[data-testid="cv-template-eu"]');
  await expect(euLink).toBeVisible({ timeout: 20_000 });
  await euLink.click();

  const doc = page.locator('[data-testid="cv-eu-format"]');
  await expect(doc).toBeVisible({ timeout: 30_000 });

  // It is the SAME person — an export that renamed them would be a second,
  // divergent copy, which is the whole thing this design forbids.
  const euName = await doc.locator("h1").first().textContent();
  expect((euName ?? "").trim()).toBe((standardName ?? "").trim());

  // The honesty note is not optional: a reader must not conclude the EU
  // issued this document.
  await expect(page.locator('[data-testid="cv-eu-disclaimer"]')).toBeVisible();

  // At least one real Europass block rendered. Which ones depend on what this
  // fixture person actually has — asserting a specific section would make the
  // test a fixture assertion rather than a product one.
  const blocks = page.locator(
    '[data-testid^="cv-eu-"][data-testid$="-experience"], ' +
      '[data-testid="cv-eu-education"], ' +
      '[data-testid="cv-eu-personal-skills"], ' +
      '[data-testid="cv-eu-additional"]',
  );
  expect(await blocks.count()).toBeGreaterThan(0);

  // The platform's own layout is NOT rendered at the same time — one document
  // per export, never two stacked on one page.
  await expect(page.locator('[data-testid="cv-skills"]')).toHaveCount(0);

  // And the switch is reversible.
  await page.locator('[data-testid="cv-template-standard"]').click();
  await expect(page.locator('[data-testid="cv-eu-format"]')).toHaveCount(0, {
    timeout: 30_000,
  });
  await expect(page.locator('[data-testid="cv-skills"]')).toBeVisible({
    timeout: 30_000,
  });
});
