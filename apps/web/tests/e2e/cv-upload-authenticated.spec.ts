/**
 * Authenticated CV FILE IMPORT end-to-end (local stack).
 *
 * ## Why this file was rewritten
 *
 * It used to navigate to `/lt/dashboard/profile` and wait for
 * `[data-testid="cv-import-upload"] input[type=file]`. Measured on that page:
 * **0 of each**. `CvImportUpload` is mounted in the chat CV flow
 * (`components/app/conversation/worker-cv-flow.tsx`) and in the marketing
 * `/create-cv` panel — never on the profile page, which has never hosted a CV
 * upload control.
 *
 * That is the #1319 class in its second form. #1319 found selectors that could
 * never FAIL; this one could never PASS, because it asserted a surface the
 * product does not have. The fix is NOT to restore an obsolete profile upload
 * control to satisfy a test — it is to point the coverage at the interaction a
 * real person actually performs.
 *
 * ## What a real person actually does
 *
 *   /lt/dashboard  →  says "įkelk mano CV" in the composer
 *   →  the CV import control APPEARS in the conversation (intent → surface)
 *   →  picks a file  →  POST /api/cv/extract (real unpdf / mammoth)
 *   →  deterministic `parseCvSections` proposes sections
 *   →  NOTHING is saved yet (doctrine §7.1)
 *   →  one explicit per-item confirm  →  canonical `confirmCv*` server action
 *   →  the item is in the Living CV, and survives a reload.
 *
 * ## Two negative controls, because a green chain proves less than it looks
 *
 *   1. BEFORE the confirm click, the Living CV must NOT contain the item.
 *      Without this, a flow that saved on upload would pass every assertion
 *      below while violating the one rule that matters here.
 *   2. The PDF path asserts a WORK-HISTORY proposal, not merely "some text
 *      came back". Until `lib/cv/extract.ts` stopped passing unpdf's
 *      `mergePages: true` (which collapses every newline), a PDF CV reached
 *      `parseCvSections` as ONE line and could not yield a single job. Text
 *      arrived; structure did not. Only a structural assertion sees that.
 */
import { test, expect, type Page } from "@playwright/test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { makeDocx, makePdf } from "../../lib/cv/__fixtures__/cv-fixtures";

const STORAGE_STATE = join(__dirname, ".storage-state.json");
const HAS_SESSION = existsSync(STORAGE_STATE);

/**
 * "DID NOT RUN" MUST NEVER BE REPORTED AS "PASSED" (#1319).
 *
 * A missing session is an honest skip for a developer without the local stack,
 * and a hard ERROR for a caller who declared this run must exercise the
 * authenticated journey.
 */
if (process.env.E2E_REQUIRE_AUTH === "1" && !HAS_SESSION) {
  throw new Error(
    `E2E_REQUIRE_AUTH=1 but ${STORAGE_STATE} is missing. The authenticated CV ` +
      "import did NOT run — refusing to report that as a pass. Mint a session " +
      "first: E2E_OWNER_EMAIL=dev.worker@local.test pnpm tsx " +
      "scripts/e2e-mint-session.ts (needs the local stack).",
  );
}

test.skip(
  !HAS_SESSION,
  `Storage state ${STORAGE_STATE} missing — run scripts/e2e-mint-session.ts first.`,
);

test.use({ storageState: HAS_SESSION ? STORAGE_STATE : undefined });

/**
 * A CV as a person writes one: several LINES. The employer line carries a
 * company-form marker and a year range, which is what `parseCvSections` needs
 * to propose a job; the school line and the language line prove the other
 * sections come through the same import.
 *
 * ASCII only. The PDF fixture writes WinAnsi Helvetica, so Lithuanian
 * diacritics would not survive the round trip — the file would then be testing
 * the fixture's encoding rather than the product.
 */
function cvLines(company: string): string[] {
  return [
    "Jonas Petraitis",
    `2019-2023 ${company}, stogdengys`,
    "Vilniaus technologiju mokykla, statybos programa 2015-2019",
    "Anglu kalba B2",
  ];
}

/**
 * A company name unique to THIS run.
 *
 * The fixture database is not reset between runs, so a fixed name would be
 * saved by the first run and then already present on the second — which would
 * silently defeat negative control #1 ("not in the CV before the confirm").
 * The name is generated, never pinned as a literal (`fixture-ids.ts`).
 */
function uniqueCompany(): string {
  return `UAB Testas ${Date.now().toString(36).toUpperCase()}`;
}

/** Ask, in the composer, for the thing this spec is about. */
async function askForCvImport(page: Page): Promise<void> {
  await page.goto("/lt/dashboard", { waitUntil: "domcontentloaded" });
  const composer = page.getByTestId("composer-input");
  await expect(composer).toBeVisible({ timeout: 60_000 });
  await composer.fill("Įkelk mano CV");
  await page.getByTestId("composer-send").click();
}

/** The real file-pick primitive, reached only through the conversation. */
function cvFileInput(page: Page) {
  return page.locator('[data-testid="cv-import-upload"] input[type="file"]');
}

/** Is `title` currently listed in the person's Living CV work history? */
async function inLivingCvWorkHistory(page: Page, title: string): Promise<boolean> {
  await page.goto("/lt/cv", { waitUntil: "domcontentloaded" });
  await expect(page.locator("h1").first()).toBeVisible({ timeout: 60_000 });
  const section = page.locator('[data-testid="cv-work-history"]');
  if ((await section.count()) === 0) return false;
  return (await section.getByText(title, { exact: false }).count()) > 0;
}

test("CV intent → real import control → review → explicit confirm → Living CV", async ({
  page,
}) => {
  test.setTimeout(180_000);

  const company = uniqueCompany();
  const jobTitle = `${company}, stogdengys`;

  // 1. INTENT brings the control. The person navigates to no CV page.
  await askForCvImport(page);
  await expect(
    page.getByTestId("conversation-cv-flow"),
    "asking for a CV import must produce the import surface",
  ).toBeVisible({ timeout: 60_000 });

  const input = cvFileInput(page);
  await input.waitFor({ state: "attached", timeout: 30_000 });

  // 2. A real DOCX through the real route (/api/cv/extract → mammoth).
  await input.setInputFiles({
    name: "cv.docx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    buffer: Buffer.from(makeDocx(cvLines(company).join("\n"))),
  });

  // 3. The deterministic parser proposed the job as its own reviewable row.
  const review = page.getByTestId("cv-import-section-review");
  await expect(review, "extraction must reach the section review").toBeVisible({
    timeout: 60_000,
  });
  const jobRow = page.getByTestId("cv-import-item-wh-0");
  await expect(jobRow).toBeVisible({ timeout: 30_000 });
  await expect(jobRow).toContainText(company);

  // 4. NEGATIVE CONTROL — a proposal is not a save (doctrine §7.1). If this
  //    passes only because the row is absent for some other reason, step 6
  //    below (same query, after the confirm) would also find nothing, and the
  //    test fails. The pair is what makes each half meaningful.
  expect(
    await inLivingCvWorkHistory(page, company),
    "nothing may be persisted before the explicit confirm",
  ).toBe(false);

  // 5. Back to the conversation and confirm THAT row explicitly.
  await askForCvImport(page);
  const input2 = cvFileInput(page);
  await input2.waitFor({ state: "attached", timeout: 30_000 });
  await input2.setInputFiles({
    name: "cv.docx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    buffer: Buffer.from(makeDocx(cvLines(company).join("\n"))),
  });
  await expect(page.getByTestId("cv-import-item-wh-0")).toBeVisible({
    timeout: 60_000,
  });
  await page.getByTestId("cv-import-confirm-wh-0").click();
  await expect(
    page.getByTestId("cv-import-saved-wh-0"),
    "the confirm must report a real save, not an optimistic one",
  ).toBeVisible({ timeout: 30_000 });

  // 6. It is in the Living CV — read back from a fresh navigation, so this is
  //    server state and not the client's memory of what it just sent.
  expect(
    await inLivingCvWorkHistory(page, company),
    `"${jobTitle}" should be in the Living CV work history after the confirm`,
  ).toBe(true);
});

test("PDF import proposes a JOB, not just text (line structure survives)", async ({
  page,
}) => {
  test.setTimeout(180_000);

  const company = uniqueCompany();

  await askForCvImport(page);
  await expect(page.getByTestId("conversation-cv-flow")).toBeVisible({
    timeout: 60_000,
  });

  const input = cvFileInput(page);
  await input.waitFor({ state: "attached", timeout: 30_000 });
  await input.setInputFiles({
    name: "cv.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(makePdf(cvLines(company).join("\n"))),
  });

  // The structural assertion. "Some text came back" was true even while every
  // PDF CV arrived as a single line and produced zero jobs; only the presence
  // of a WORK-HISTORY row distinguishes the two.
  await expect(page.getByTestId("cv-import-section-review")).toBeVisible({
    timeout: 60_000,
  });
  const jobRow = page.getByTestId("cv-import-item-wh-0");
  await expect(
    jobRow,
    "a PDF CV must yield a work-history proposal, not one collapsed line",
  ).toBeVisible({ timeout: 30_000 });
  await expect(jobRow).toContainText(company);
});
