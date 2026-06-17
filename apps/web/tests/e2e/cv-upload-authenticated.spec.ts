/**
 * Authenticated CV FILE UPLOAD end-to-end smoke (local stack).
 *
 * Proves the full owner-facing flow with a REAL logged-in session (minted by
 * scripts/e2e-mint-session.ts — no Google OAuth needed):
 *
 *   login session → /lt/dashboard/profile → upload a CV file (DOCX, then PDF)
 *   → server-side text extraction (/api/cv/extract via unpdf/mammoth)
 *   → deterministic skill recognition → review → confirm → SAVE
 *   → RELOAD → the imported skill persists in the capability surface.
 *
 * Skips when tests/e2e/.storage-state.json is missing (run e2e-mint-session).
 */
import { test, expect, type Page } from "@playwright/test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { makeDocx, makePdf } from "../../lib/cv/__fixtures__/cv-fixtures";

const STORAGE_STATE = join(__dirname, ".storage-state.json");

test.skip(
  !existsSync(STORAGE_STATE),
  `Storage state ${STORAGE_STATE} missing — run scripts/e2e-mint-session.ts first.`,
);

test.use({ storageState: STORAGE_STATE });

// Trade text that the deterministic profile extractor maps to real chips.
const CV_TEXT =
  "Moku programuoti ir statyti namus, dengti stogus. Dirbu pardavėju.";
const EXPECT_CHIP = "Stogų dengimas";

async function uploadCvFile(
  page: Page,
  file: { name: string; mimeType: string; buffer: Buffer },
) {
  await page.goto("/lt/dashboard/profile", { waitUntil: "networkidle" });
  await expect(page).toHaveURL(/\/lt\/dashboard\/profile/, { timeout: 20_000 });
  // The canonical CV file-pick primitive (CvImportUpload) renders an sr-only
  // file input inside the CV input panel.
  const input = page.locator('[data-testid="cv-import-upload"] input[type="file"]');
  await input.waitFor({ state: "attached", timeout: 30_000 });
  await input.setInputFiles(file);
}

test("DOCX upload → extract → recognize → save → reload persists", async ({
  page,
}) => {
  test.setTimeout(150_000);

  await uploadCvFile(page, {
    name: "cv.docx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    buffer: Buffer.from(makeDocx(CV_TEXT)),
  });

  // Extraction feeds the SAME review path as pasted text → the self-declared
  // bucket appears with recognized chips.
  await page
    .getByText("Paties nurodyti įgūdžiai", { exact: false })
    .waitFor({ state: "visible", timeout: 30_000 });
  const card = page.locator("li", { hasText: EXPECT_CHIP });
  await expect(
    card.first(),
    `${EXPECT_CHIP} should be recognized from the uploaded DOCX`,
  ).toBeVisible();

  // Confirm THIS specific recognized chip, then save.
  await card.first().getByRole("button", { name: "Pasirinkti" }).click();
  const apply = page.getByTestId("profile-text-flow-apply-button");
  await expect(apply).toBeEnabled();
  await apply.click();

  // Success only after a real save.
  await expect(page.getByTestId("profile-text-flow-applied-toast")).toBeVisible({
    timeout: 20_000,
  });

  // RELOAD (full navigation, fresh SSR) — the saved claim must persist.
  await page.reload({ waitUntil: "networkidle" });
  await expect(
    page.getByText(EXPECT_CHIP, { exact: false }).first(),
    `${EXPECT_CHIP} should persist after reload`,
  ).toBeVisible({ timeout: 15_000 });
  // It must live in the saved capability surface, not a re-extract bucket.
  await expect(
    page.locator('[data-testid="capability-profile-claims"]').getByText(EXPECT_CHIP, {
      exact: false,
    }),
  ).toBeVisible();
});

test("PDF upload → extract → recognize (no fake support)", async ({ page }) => {
  test.setTimeout(120_000);

  await uploadCvFile(page, {
    name: "cv.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(makePdf(CV_TEXT)),
  });

  await page
    .getByText("Paties nurodyti įgūdžiai", { exact: false })
    .waitFor({ state: "visible", timeout: 30_000 });
  await expect(
    page.getByText(EXPECT_CHIP, { exact: false }).first(),
    `${EXPECT_CHIP} should be recognized from the uploaded PDF`,
  ).toBeVisible();
});
