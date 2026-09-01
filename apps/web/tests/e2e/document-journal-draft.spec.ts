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
 * Honesty case: a random uuid `?draftFrom=` shows the not-found notice and
 * renders NO editable draft — RLS answers with one silence for "missing"
 * and "not yours", so nothing leaks.
 *
 * Needs the local Supabase stack + a minted session (docs/TESTING.md):
 * `pnpm tsx scripts/e2e-mint-session.ts` writes tests/e2e/.storage-state.json.
 */
import { test, expect } from "@playwright/test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { makePdf } from "../../lib/cv/__fixtures__/cv-fixtures";

const STORAGE_STATE = join(__dirname, ".storage-state.json");
const HAS_SESSION = existsSync(STORAGE_STATE);

// "Did not run" must never be reported as "passed" (#1319): a missing
// session is an honest skip locally, and a hard error for a caller who
// declared this run must exercise the authenticated journey.
if (process.env.E2E_REQUIRE_AUTH === "1" && !HAS_SESSION) {
  throw new Error(
    `E2E_REQUIRE_AUTH=1 but ${STORAGE_STATE} is missing. The document → ` +
      "journal import did NOT run — refusing to report that as a pass. Mint " +
      "a session first: E2E_OWNER_EMAIL=dev.worker@local.test pnpm tsx " +
      "scripts/e2e-mint-session.ts (needs the local stack).",
  );
}

test.skip(
  !HAS_SESSION,
  `Storage state ${STORAGE_STATE} missing — run scripts/e2e-mint-session.ts first.`,
);

test.use({ storageState: HAS_SESSION ? STORAGE_STATE : undefined });

/**
 * ASCII only: the PDF fixture writes WinAnsi Helvetica, so Lithuanian
 * diacritics would not survive the round trip — the file would then be
 * testing the fixture's encoding rather than the product.
 */
const REPORT_TEXT =
  "2026-08-20 objektas Vilniuje. Dengiau stoga 6 valandas, sumontavau 20 m2 dangos.";

test("PDF work report → upload → draft → review → confirm → journal", async ({
  page,
}) => {
  test.setTimeout(180_000);

  await page.goto("/lt/dashboard/documents", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/lt\/dashboard\/documents/, {
    timeout: 20_000,
  });

  // Upload into the first document file slot (canonical layer; creates a
  // real document_files row + storage object — the honest E2E path, and it
  // exercises the C1 RLS predicate for real).
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

  // The canonical journal shows the confirmed entry — read back from a fresh
  // navigation, so this is server state and not the client's memory.
  await page.goto("/lt/dashboard/journal", { waitUntil: "domcontentloaded" });
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
    { waitUntil: "domcontentloaded" },
  );
  await expect(
    page.locator('[data-testid="doc-journal-draft-notice"]'),
  ).toBeVisible({ timeout: 30_000 });
  await expect(
    page.locator('[data-testid="doc-journal-draft-notes"]'),
  ).toHaveCount(0);
});
