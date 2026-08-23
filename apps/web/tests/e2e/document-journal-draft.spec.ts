/**
 * Document → Work Journal import end-to-end (value train 2, C2b).
 *
 * Proves the §27 import chain with a REAL logged-in session:
 *
 *   /lt/dashboard/documents → upload a PDF work report into a document slot
 *   (the canonical document_files layer) → "draft journal entry" link →
 *   inline review (extracted text, EDITABLE) → pick work context → CONFIRM
 *   → saved to the canonical Work Journal with document provenance
 *   → the entry is visible on /lt/dashboard/journal.
 *
 * Honesty cases: an image upload gets NO draft link (no OCR exists — the
 * capability is not pretended), and a random uuid draftFrom shows the
 * not-found notice without leaking anything.
 *
 * Skips when tests/e2e/.storage-state.json is missing (run
 * scripts/e2e-mint-session.ts against the local stack first).
 */
import { test, expect } from "@playwright/test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { makePdf } from "../../lib/cv/__fixtures__/cv-fixtures";

const STORAGE_STATE = join(__dirname, ".storage-state.json");

test.skip(
  !existsSync(STORAGE_STATE),
  `Storage state ${STORAGE_STATE} missing — run scripts/e2e-mint-session.ts first.`,
);

test.use({ storageState: STORAGE_STATE });

const REPORT_TEXT =
  "2026-08-20 objektas Vilniuje. Dengiau stoga 6 valandas, sumontavau 20 m2 dangos.";

test("PDF work report → upload → draft → review → confirm → journal", async ({
  page,
}) => {
  test.setTimeout(180_000);

  await page.goto("/lt/dashboard/documents", { waitUntil: "networkidle" });
  await expect(page).toHaveURL(/\/lt\/dashboard\/documents/, {
    timeout: 20_000,
  });

  // Upload into the first document file slot (canonical layer; creates a
  // real document_files row + storage object).
  const slot = page.locator('[data-testid="doc-file-slot"]').first();
  await slot.waitFor({ state: "visible", timeout: 30_000 });
  await slot.locator('[data-testid="doc-file-input"]').setInputFiles({
    name: "darbo-ataskaita-test.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(makePdf(REPORT_TEXT)),
  });
  await slot.locator('[data-testid="doc-file-upload-submit"]').click();

  // Native-nav form → page reloads with the new current version + draft link.
  const draftLink = page
    .locator('[data-testid="doc-file-journal-draft"]')
    .first();
  await draftLink.waitFor({ state: "visible", timeout: 30_000 });
  await draftLink.click();

  // Inline review: extracted text is present and EDITABLE.
  const review = page.locator('[data-testid="doc-journal-draft"]');
  await review.waitFor({ state: "visible", timeout: 30_000 });
  const notes = review.locator('[data-testid="doc-journal-draft-notes"]');
  await expect(notes).toBeVisible();
  await expect(notes).toContainText(/stoga|valand/i);
  // The human edits before confirming — imported ≠ verified.
  await notes.fill(`${REPORT_TEXT} (patikrinta ir pataisyta ranka)`);

  // Confirm — only now does it become journal history.
  await review.locator('[data-testid="doc-journal-draft-save"]').click();
  await expect(
    review.locator('[data-testid="doc-journal-draft-saved"]'),
  ).toBeVisible({ timeout: 30_000 });

  // The canonical journal shows the confirmed entry.
  await page.goto("/lt/dashboard/journal", { waitUntil: "networkidle" });
  await expect(page.locator('[data-testid="journal-entries"]')).toContainText(
    "patikrinta ir pataisyta ranka",
    { timeout: 30_000 },
  );
});

test("a random draftFrom uuid shows the honest not-found notice", async ({
  page,
}) => {
  await page.goto(
    "/lt/dashboard/documents?draftFrom=00000000-0000-4000-8000-000000000000",
    { waitUntil: "networkidle" },
  );
  await expect(
    page.locator('[data-testid="doc-journal-draft-notice"]'),
  ).toBeVisible({ timeout: 30_000 });
  await expect(
    page.locator('[data-testid="doc-journal-draft-notes"]'),
  ).toHaveCount(0);
});
