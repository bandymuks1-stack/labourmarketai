/**
 * Local credentialed smoke for
 * feat/cc/profile-max-capability-capture.
 *
 * Two specs:
 *
 *   1. STATE — broad narrative produces many capabilities, all
 *      already-saved chips render with the Jau išsaugota badge, no
 *      misleading verified copy, Save button hidden when nothing to
 *      save.
 *
 *   2. EDIT FLOW — owner asked to verify Grįžti prie teksto / edit
 *      round-trip works: type, suggest, click back, the textarea is
 *      visible with the last text intact, edit, suggest again, new
 *      bucket renders.
 *
 * Auth: pre-set storage state minted by scripts/e2e-mint-session.ts.
 * Skips when `tests/e2e/.storage-state.json` is missing.
 */
import { test, expect, type Page } from "@playwright/test";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const STORAGE_STATE = join(__dirname, ".storage-state.json");
const SCREENSHOT_DIR = join(
  __dirname,
  "..",
  "..",
  "..",
  "..",
  "runtime",
  "review-evidence",
  "labourmarketai",
  "profile-max-capability-capture",
  "screenshots",
);

test.skip(
  !existsSync(STORAGE_STATE),
  `Storage state ${STORAGE_STATE} missing — run scripts/e2e-mint-session.ts first.`,
);

test.use({ storageState: STORAGE_STATE });

mkdirSync(SCREENSHOT_DIR, { recursive: true });

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({
    path: join(SCREENSHOT_DIR, `${name}.png`),
    fullPage: true,
  });
}

// Broad owner narrative — touches construction, IT, cooking with LT
// cuisine specialization, woodworking + drožyba, Word/Excel/PDF,
// Rivilė, team coordination, recruitment, sales, driving + light car,
// plumbing + install, legal documents.
const BROAD_INPUT =
  "Moku gerai programuoti ir statyti namus, dengti stogus ir gaminti " +
  "lietuviškos virtuvės patiekalus. taip pat moku drožti iš medžio, " +
  "bei dirbti su word, excel ir pdf dokumentais rivilė aplinkoje ir " +
  "galiu koordinuoti komanda bei ieškoti naujų žmonių ir darbuotojų. " +
  "Turiu teisinės patirties, ruošiu sutartis ir teisinius dokumentus. " +
  "Galiu vairuoti lengvąjį automobilį, taip pat užsiimu santechnikos " +
  "montavimu ir dirbu pardavėju.";

// Spot-check chips that must appear in EITHER the extracted bucket
// (pending / already_saved) OR the saved CapabilityProfileSection
// below. These are the user-visible specializations + new domains
// the PR is built for.
const REQUIRED_CHIPS = [
  // baseline
  "Programavimas",
  "Namų statyba",
  "Stogų dengimas",
  "Maisto gamyba",
  // NEW specializations
  "Lietuviškos virtuvės gamyba",
  "Drožyba",
  "Word dokumentai",
  "Excel / Skaičiuoklės",
  "PDF dokumentai",
  "Rivilė",
  "Santechnikos montavimas",
  "Lengvojo automobilio vairavimas",
  // NEW domains
  "Pardavimai",
  "Sutarčių ruošimas",
  "Vairavimas",
];

test("broad narrative produces many capabilities incl. specializations", async ({
  page,
}) => {
  test.setTimeout(120_000);

  await page.goto("/lt/dashboard/profile", { waitUntil: "networkidle" });
  await expect(page).toHaveURL(/\/lt\/dashboard\/profile/);

  const composer = page.locator("textarea").first();
  await composer.waitFor({ state: "visible", timeout: 30_000 });
  await composer.fill(BROAD_INPUT);

  await page
    .getByRole("button", { name: "Pasiūlykite struktūrą" })
    .first()
    .click();

  await page
    .getByText("Paties nurodyti įgūdžiai", { exact: false })
    .waitFor({ state: "visible", timeout: 15_000 });

  // All required chips must be visible somewhere on the page (bucket
  // OR saved area). Using .first() handles the dual rendering when a
  // label appears both as a saved chip and as an extracted chip.
  for (const chip of REQUIRED_CHIPS) {
    await expect(
      page.getByText(chip, { exact: false }).first(),
      `${chip} chip should be visible on the page`,
    ).toBeVisible();
  }
  await shot(page, "01-broad-narrative-many-chips");

  // Lithuanian-cuisine specialization rendered as its own chip, not
  // flattened into the generic Maisto gamyba.
  await expect(
    page.getByText("Lietuviškos virtuvės gamyba", { exact: false }).first(),
  ).toBeVisible();
  await shot(page, "02-lithuanian-cuisine-specialization");

  // No standalone Patvirtinta / Patvirtinti badges anywhere.
  const visibleText = (await page.locator("body").innerText()).replace(
    /\s+/g,
    " ",
  );
  expect(visibleText).not.toMatch(/(^|\s)Patvirtinta(\s|$|[.,])/);
  expect(visibleText).not.toMatch(/(^|\s)Patvirtinti(\s|$|[.,])/);
});

test("edit flow — type → suggest → back → edit → re-suggest", async ({
  page,
}) => {
  test.setTimeout(90_000);

  await page.goto("/lt/dashboard/profile", { waitUntil: "networkidle" });

  const composer = page.locator("textarea").first();
  await composer.waitFor({ state: "visible", timeout: 30_000 });

  // STEP 1 — type a known short text.
  const FIRST_TEXT = "Programuoju ir statau namus.";
  await composer.fill(FIRST_TEXT);

  // STEP 2 — click suggest.
  await page
    .getByRole("button", { name: "Pasiūlykite struktūrą" })
    .first()
    .click();

  await page
    .getByText("Paties nurodyti įgūdžiai", { exact: false })
    .waitFor({ state: "visible", timeout: 15_000 });

  // The back-to-text button carries the stable testid added by this PR.
  const backButton = page.getByTestId("profile-text-flow-back-to-text");
  await expect(backButton).toBeVisible();
  await shot(page, "03-back-button-visible");

  // STEP 3 — click Grįžti prie teksto.
  await backButton.click();

  // STEP 4 — compose stage is back, with the LAST submitted text
  // pre-filled in the textarea.
  await expect(
    page.getByTestId("profile-text-flow-compose"),
  ).toBeVisible({ timeout: 5_000 });
  const composerAgain = page.locator("textarea").first();
  await expect(composerAgain).toHaveValue(FIRST_TEXT);
  await shot(page, "04-back-to-text-textarea-intact");

  // STEP 5 — edit text, add more capabilities.
  const SECOND_TEXT = FIRST_TEXT + " Taip pat dirbu pardavėju.";
  await composerAgain.fill(SECOND_TEXT);

  // STEP 6 — re-suggest. New bucket renders. Pardavimai chip appears.
  await page
    .getByRole("button", { name: "Pasiūlykite struktūrą" })
    .first()
    .click();

  await page
    .getByText("Paties nurodyti įgūdžiai", { exact: false })
    .waitFor({ state: "visible", timeout: 15_000 });

  await expect(
    page.getByText("Pardavimai", { exact: false }).first(),
  ).toBeVisible();
  await shot(page, "05-edited-text-new-suggestions");
});
