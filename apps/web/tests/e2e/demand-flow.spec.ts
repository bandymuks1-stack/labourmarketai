/**
 * Authenticated demand-flow smoke (post-PR #338).
 *
 * Drives the dashboard company/client demand flow end-to-end with the minted
 * session (the same `.storage-state.json` the other credentialed specs use —
 * the user holds all four roles). Verifies the behaviour the source guards can
 * only assert at the code level:
 *   - a company-context dashboard renders the demand form;
 *   - empty submit is blocked (Next disabled with no description);
 *   - describe → criteria → review shows the entered values;
 *   - final submit creates EXACTLY ONE request (read-back row count +1, no
 *     duplicate, no empty row) and echoes the submitted values back;
 *   - no fake matched/verified language on the surface.
 *
 * Skips outright when the minted session is absent (CI without a test Supabase),
 * matching demand-draft-flows.spec.ts. The customer_requests intake migration
 * (20260530150000) must be applied to the target test project for the create +
 * read-back assertions; without the read-back the spec still checks the form +
 * the post-submit confirmation panel.
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
  "demand-flow",
  "screenshots",
);

test.skip(
  !existsSync(STORAGE_STATE),
  `Storage state ${STORAGE_STATE} missing — run scripts/e2e-mint-session.ts first.`,
);

test.use({ storageState: STORAGE_STATE });
mkdirSync(SCREENSHOT_DIR, { recursive: true });

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: join(SCREENSHOT_DIR, `${name}.png`), fullPage: true });
}

/** Ensure the dashboard is in a non-worker (company) context so the demand
 *  form renders. Switches active role via the role-switcher when needed. */
async function ensureCompanyContext(page: Page): Promise<void> {
  await page.goto("/lt/dashboard", { waitUntil: "networkidle" });
  const form = page.getByTestId("demand-intake-section");
  if (await form.isVisible().catch(() => false)) return;
  // Open the role switcher and pick company (or agency) — both render the form.
  await page.getByTestId("role-switcher-toggle").click();
  const company = page.getByTestId("role-switcher-chip-company");
  const agency = page.getByTestId("role-switcher-chip-agency");
  if (await company.isVisible().catch(() => false)) {
    await company.click();
  } else if (await agency.isVisible().catch(() => false)) {
    await agency.click();
  }
  await page.goto("/lt/dashboard", { waitUntil: "networkidle" });
}

test("demand flow: empty blocked → describe → criteria → review → create", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await ensureCompanyContext(page);

  const form = page.getByTestId("demand-form");
  await expect(form).toBeVisible({ timeout: 15_000 });
  await shot(page, "01-step1");

  // ── Empty submit is blocked: with no description, Next is disabled and the
  //    review step is unreachable.
  const next = page.getByTestId("demand-next");
  await expect(next).toBeDisabled();
  await expect(page.getByTestId("demand-review")).toHaveCount(0);

  // ── Step 1 — describe.
  const description = `E2E poreikis ${Date.now()}: reikia 3 sandėlio darbuotojų, 2 pamainos`;
  await page.getByTestId("demand-role").fill("Sandėlio darbuotojas");
  await page.getByTestId("demand-description").fill(description);
  await expect(next).toBeEnabled();
  await next.click();

  // ── Step 2 — criteria.
  await page.getByTestId("demand-location").fill("Vilnius, Lietuva");
  await page.getByTestId("demand-skills").fill("Krautuvo pažymėjimas, lietuvių kalba");
  await page.getByTestId("demand-notes").fill("Pradžia kitą savaitę");
  await page.getByTestId("demand-next").click();

  // ── Step 3 — review shows the entered values.
  const review = page.getByTestId("demand-review");
  await expect(review).toBeVisible();
  await expect(page.getByTestId("demand-summary-description")).toHaveText(description);
  await expect(review).toContainText("Sandėlio darbuotojas");
  await expect(review).toContainText("Vilnius, Lietuva");
  await shot(page, "02-review");

  // ── Count existing read-back rows before creating (read-back may be absent
  //    if the intake migration is not applied to the test project).
  const readback = page.getByTestId("demand-requests-readback");
  const hasReadback = await readback.isVisible().catch(() => false);
  const before = hasReadback
    ? await page.getByTestId("demand-readback-row").count()
    : 0;

  // ── Create — exactly one request; the confirmation panel echoes the input.
  await page.getByTestId("demand-create").click();
  const done = page.getByTestId("demand-submitted-summary");
  await expect(done).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("demand-done")).toBeVisible();
  await expect(done).toContainText(description);
  await shot(page, "03-submitted");

  // ── Reload → the persistent read-back gained EXACTLY ONE row carrying the
  //    submitted description (no duplicate, no empty row).
  await page.reload({ waitUntil: "networkidle" });
  if (hasReadback || (await readback.isVisible().catch(() => false))) {
    await expect(readback).toBeVisible();
    await expect(page.getByTestId("demand-readback-row")).toHaveCount(before + 1, {
      timeout: 10_000,
    });
    // Expand the newest row's details and confirm the description is there.
    const details = page.getByTestId("demand-readback-details").first();
    const row = page.getByTestId("demand-readback-row").first();
    await row.locator("summary").click().catch(() => {});
    await expect(details).toContainText(description);
    await shot(page, "04-readback");
  }

  // ── Honesty: no fake verified / matched language on this surface.
  const body = (await page.locator("body").innerText()).replace(/\s+/g, " ");
  expect(body).not.toMatch(/(^|\s)Patvirtinta(\s|$|[.,])/);
  expect(body).not.toMatch(/\bVerified\b/);
  expect(body).not.toMatch(/\bmatched\b/i);
});
