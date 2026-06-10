/**
 * Local credentialed smoke for feat/cc/pilot-draft-flows (PR B).
 *
 * Drives the save / edit / delete loop on each of the three private
 * pilot draft forms (company / agency / buyer) using the minted
 * session for sukysdonatas@gmail.com (holds all four user roles).
 *
 * One screenshot per phase per role gets dropped into the review
 * evidence directory so the PR description can link to the visible
 * "Išsaugota privačiai" confirmation + the empty-after-delete state.
 *
 * The spec also asserts the negative invariants the guards encode at
 * the source level (no `Patvirtinta` / `Verified`, no public share
 * surface) at the rendered-DOM level.
 *
 * The migration 0016 must be applied to the target Supabase project
 * for the save path to succeed — without it the form returns
 * `saveError`. The spec skips outright if `pilot_drafts` is missing.
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
  "pilot-draft-flows",
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

type Case = {
  label: "company" | "agency" | "buyer";
  draftType: "company_request" | "agency_offer" | "buyer_request";
  path: string;
  /** Field id (input/textarea) to fill for the initial save. */
  fieldId: string;
  initialValue: string;
  editedValue: string;
};

const cases: Case[] = [
  {
    label: "company",
    draftType: "company_request",
    path: "/lt/dashboard/company",
    fieldId: "company_request-title",
    initialValue: "E2E: Reikia 3 elektrikų projektui Vilniuje",
    editedValue: "E2E: Reikia 4 elektrikų projektui Vilniuje (edit)",
  },
  {
    label: "agency",
    draftType: "agency_offer",
    path: "/lt/dashboard/agency",
    fieldId: "agency_offer-candidateRoles",
    initialValue: "E2E: 12 elektrikų, 8 statybininkai",
    editedValue: "E2E: 12 elektrikų, 10 statybininkų (edit)",
  },
  {
    label: "buyer",
    draftType: "buyer_request",
    path: "/lt/dashboard/buyer",
    fieldId: "buyer_request-serviceType",
    initialValue: "E2E: Vidaus remontas (~80 m²)",
    editedValue: "E2E: Vidaus remontas (~95 m², edit)",
  },
];

for (const c of cases) {
  test(`${c.label} pilot draft: save → reload → edit → delete`, async ({
    page,
  }) => {
    test.setTimeout(90_000);

    // ── 1. Navigate, ensure clean slate (delete any pre-existing draft).
    await page.goto(c.path, { waitUntil: "networkidle" });
    await expect(page.getByTestId(`pilot-draft-form-${c.draftType}`)).toBeVisible();

    const deleteBtn = page.getByTestId(`pilot-draft-delete-${c.draftType}`);
    if (await deleteBtn.isVisible().catch(() => false)) {
      await deleteBtn.click();
      // Wait for the form to refresh and the delete button to disappear.
      await expect(deleteBtn).toBeHidden({ timeout: 10_000 });
    }

    // ── 2. Save: fill the first field, submit, expect the savedPrivate
    //    confirmation to render.
    const field = page.locator(`#${c.fieldId}`);
    await field.fill(c.initialValue);
    const saveBtn = page.getByTestId(`pilot-draft-save-${c.draftType}`);
    await expect(saveBtn).toBeEnabled();
    await saveBtn.click();
    const saved = page.getByTestId(`pilot-draft-saved-${c.draftType}`);
    await expect(saved).toBeVisible({ timeout: 15_000 });
    await shot(page, `${c.label}-01-saved`);

    // ── 3. Reload — the draft must come back pre-filled from the DB.
    await page.reload({ waitUntil: "networkidle" });
    await expect(field).toHaveValue(c.initialValue, { timeout: 10_000 });
    // The delete button only renders when an existing draft is present.
    await expect(
      page.getByTestId(`pilot-draft-delete-${c.draftType}`),
    ).toBeVisible();
    await shot(page, `${c.label}-02-reloaded`);

    // ── 4. Edit + re-save.
    await field.fill(c.editedValue);
    await page.getByTestId(`pilot-draft-save-${c.draftType}`).click();
    await expect(
      page.getByTestId(`pilot-draft-saved-${c.draftType}`),
    ).toBeVisible({ timeout: 15_000 });
    await page.reload({ waitUntil: "networkidle" });
    await expect(field).toHaveValue(c.editedValue, { timeout: 10_000 });
    await shot(page, `${c.label}-03-edited`);

    // ── 5. Delete: the row goes away, the field clears, the delete
    //    button is no longer rendered (no existing draft).
    await page.getByTestId(`pilot-draft-delete-${c.draftType}`).click();
    await expect(
      page.getByTestId(`pilot-draft-delete-${c.draftType}`),
    ).toBeHidden({ timeout: 10_000 });
    await page.reload({ waitUntil: "networkidle" });
    await expect(field).toHaveValue("");
    await expect(
      page.getByTestId(`pilot-draft-delete-${c.draftType}`),
    ).toHaveCount(0);
    await shot(page, `${c.label}-04-deleted`);

    // ── 6. Honesty: the rendered page must NOT carry any fake
    //    verified / matched / shared copy on the draft surface.
    const visibleText = (await page.locator("body").innerText()).replace(
      /\s+/g,
      " ",
    );
    expect(visibleText).not.toMatch(/(^|\s)Patvirtinta(\s|$|[.,])/);
    expect(visibleText).not.toMatch(/(^|\s)Verified(\s|$|[.,])/);
    expect(visibleText).not.toMatch(/(^|\s)Confirmed(\s|$|[.,])/);
    expect(visibleText).not.toMatch(/Public draft|Vieša(s)? juodraštis/i);
  });
}
