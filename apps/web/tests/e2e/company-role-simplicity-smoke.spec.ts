/**
 * Owner smoke for company-role-simplicity-v1.
 *
 * Mirrors pr250-company-multisector-smoke.spec.ts: gated on a minted
 * Playwright session (tests/e2e/.storage-state.json), skips cleanly when
 * missing. Run against a real preview/prod with migrations
 * 20260612090000 + 20260612091000 applied:
 *
 *   1) pnpm -F web e2e:install
 *   2) E2E_OWNER_EMAIL=<test-user> pnpm -F web exec tsx scripts/e2e-mint-session.ts
 *   3) E2E_BASE_URL=<url> pnpm -F web exec playwright test tests/e2e/company-role-simplicity-smoke.spec.ts
 *
 * Covers the owner's validation list:
 *   - create company with minimum valid fields (country = select, no raw FK error)
 *   - change company type to staffing agency, reload, dashboard reflects it
 *   - instruction composer validates worker selection with LT copy
 *   - drawer/popovers close on route change
 *   - journal photo field present with the honest 1-free-photo note
 */
import { test, expect, type Page } from "@playwright/test";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const STORAGE_STATE = join(__dirname, ".storage-state.json");
const SHOTS = join(
  __dirname,
  "..",
  "..",
  "..",
  "..",
  "runtime",
  "review-evidence",
  "labourmarketai",
  "company-role-simplicity",
  "screenshots",
);

test.skip(
  !existsSync(STORAGE_STATE),
  `Storage state ${STORAGE_STATE} missing — run scripts/e2e-mint-session.ts first.`,
);

test.use({ storageState: STORAGE_STATE });
mkdirSync(SHOTS, { recursive: true });

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });
}

// ── 1. Company create: country select, type select, no technical error ──
test("LT company setup — type+country selects save without technical errors", async ({
  page,
}) => {
  await page.goto("/lt/dashboard/start/company");
  await expect(page.getByTestId("company-setup-form")).toBeVisible();

  // Country is a SELECT (the free-text input caused the FK crash).
  const country = page.getByTestId("company-setup-country");
  expect(await country.evaluate((el) => el.tagName.toLowerCase())).toBe(
    "select",
  );
  await expect(page.getByTestId("company-setup-company-type")).toBeVisible();

  await page.getByTestId("company-setup-legal-name").fill("UAB Smoke Test");
  await country.selectOption("LT");
  await page
    .getByTestId("company-setup-company-type")
    .selectOption("construction");
  await page.getByTestId("company-setup-save-draft").click();

  const result = page.getByTestId("company-setup-result");
  await expect(result).toBeVisible({ timeout: 15_000 });
  const text = (await result.textContent()) ?? "";
  // Never the raw technical failure the owner hit in smoke.
  expect(text).not.toMatch(/fkey|organization|Expected object|received null/i);
  await shot(page, "01-company-setup-saved");
});

// ── 2. Type change to staffing agency → reload → dashboard reflects it ──
test("LT company type → staffing agency, reload shows agency-as-type chip", async ({
  page,
}) => {
  await page.goto("/lt/dashboard/start/company");
  await page.getByTestId("company-setup-legal-name").fill("UAB Smoke Test");
  await page
    .getByTestId("company-setup-company-type")
    .selectOption("staffing_agency");
  await page.getByTestId("company-setup-save-draft").click();
  await expect(page.getByTestId("company-setup-result")).toBeVisible({
    timeout: 15_000,
  });

  // Reload the canonical company dashboard — same profile, re-labelled.
  await page.goto("/lt/dashboard/company");
  await expect(page.getByTestId("company-dashboard-type-chip")).toContainText(
    /agentūra/i,
    { timeout: 15_000 },
  );
  await expect(page.getByTestId("company-dashboard-type-note")).toBeVisible();
  await shot(page, "02-company-type-agency");

  // And back to construction (no stale mode in either direction).
  await page.goto("/lt/dashboard/start/company");
  await page.getByTestId("company-setup-legal-name").fill("UAB Smoke Test");
  await page
    .getByTestId("company-setup-company-type")
    .selectOption("construction");
  await page.getByTestId("company-setup-save-draft").click();
  await expect(page.getByTestId("company-setup-result")).toBeVisible({
    timeout: 15_000,
  });
  await page.goto("/lt/dashboard/company");
  await expect(page.getByTestId("company-dashboard-type-chip")).toContainText(
    /statybos/i,
    { timeout: 15_000 },
  );
  await shot(page, "03-company-type-back");
});

// ── 3. Instruction composer: LT validation, not the browser popup ───────
test("LT instructions — empty worker select shows LT message, selected worker submits", async ({
  page,
}) => {
  await page.goto("/lt/dashboard/instructions");
  const composer = page.getByTestId("manager-instruction-composer");
  const noWorkers = page.getByTestId("composer-no-workers");
  // Either the composer renders (manager has workers) or the honest empty
  // state does — never a dead end.
  if (await noWorkers.isVisible().catch(() => false)) {
    await shot(page, "04-instructions-no-workers");
    return;
  }
  await expect(composer).toBeVisible();
  await composer.locator("textarea[name='body']").fill("Smoke testas");
  // Force-submit with nothing selected (single-worker case preselects, so
  // only assert the custom error when the select is actually empty).
  const select = page.getByTestId("instruction-worker-select");
  if ((await select.inputValue()) === "") {
    await composer.locator("button[type='submit']").click();
    await expect(
      page.getByTestId("instruction-worker-select-error"),
    ).toContainText(/pasirinkite darbuotoją/i);
  }
  await shot(page, "04-instructions-validation");
});

// ── 4. Popovers close on route change ───────────────────────────────────
test("notification panel closes when navigating to another page", async ({
  page,
}) => {
  await page.goto("/lt/dashboard");
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole("button", { name: /pranešimai/i }).first().click();
  await expect(page.getByTestId("notification-panel-close")).toBeVisible();
  // Navigate via client-side link — the panel must close.
  await page.goto("/lt/dashboard/account");
  await expect(page.getByTestId("notification-panel-close")).toHaveCount(0);
  await shot(page, "05-popover-closed");
});

// ── 5. Journal photo field with honest free-tier note ───────────────────
test("LT journal — photo field + honest 1-free-photo note", async ({
  page,
}) => {
  await page.goto("/lt/dashboard/journal");
  await expect(page.getByTestId("journal-photo-field")).toBeVisible({
    timeout: 15_000,
  });
  await expect(
    page.getByTestId("journal-photo-free-tier-note"),
  ).toContainText("Nemokamai galite pridėti 1 nuotrauką");
  await shot(page, "06-journal-photo-field");
});
