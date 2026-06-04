/**
 * Admin company-verification review smoke (PR: company verification review UI).
 *
 * Gated on a minted session (tests/e2e/.storage-state.json); skips cleanly when
 * absent. Positive path requires the session user to be admin (E2E_EXPECT_ADMIN=1)
 * AND the admin verification migration applied on the target DB.
 *
 * Writes screenshots to
 *   runtime/review-evidence/labourmarketai/company-verification-admin/screenshots/
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
  "company-verification-admin",
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

test("non-admin cannot reach the company-verification admin route", async ({ page }) => {
  test.skip(
    process.env.E2E_EXPECT_ADMIN === "1",
    "Session user is admin — run without E2E_EXPECT_ADMIN to verify the negative path.",
  );
  await page.goto("/lt/dashboard/admin/company-verification", { waitUntil: "networkidle" });
  await expect(page).toHaveURL(/\/lt\/dashboard(?!\/admin\/company-verification)/);
  expect(await page.getByTestId("admin-company-verification").count()).toBe(0);
});

test("admin sees requests, approves one, sees verified", async ({ page }) => {
  test.skip(
    process.env.E2E_EXPECT_ADMIN !== "1",
    "Set E2E_EXPECT_ADMIN=1 after granting the session user admin to run this branch.",
  );
  test.setTimeout(60_000);

  await page.goto("/lt/dashboard/admin/company-verification", { waitUntil: "networkidle" });
  await expect(page).toHaveURL(/\/lt\/dashboard\/admin\/company-verification/);
  await expect(page.getByTestId("admin-company-verification")).toBeVisible();
  await shot(page, "01-admin-list");

  // If the migration isn't applied, the honest blocker shows — screenshot + stop.
  if (await page.getByTestId("admin-company-verification-migration-blocker").isVisible().catch(() => false)) {
    test.info().annotations.push({
      type: "note",
      description: "admin_company_verification migration not applied on this DB — blocker shown.",
    });
    return;
  }

  const firstApprove = page.locator('[data-testid^="company-verification-approve-"]').first();
  if (!(await firstApprove.isVisible().catch(() => false))) {
    // Empty state is a valid result (no requests yet).
    await expect(page.getByTestId("admin-company-verification-empty")).toBeVisible();
    return;
  }

  // Capture the row id so we can assert its status badge after approval.
  const id = (await firstApprove.getAttribute("data-testid"))!.replace(
    "company-verification-approve-",
    "",
  );
  await shot(page, "02-approve-flow");
  await firstApprove.click();
  await expect(page.getByTestId(`company-verification-result-${id}`)).toBeVisible({ timeout: 15_000 });
  await page.reload();
  await expect(page.getByTestId(`company-verification-status-${id}`)).toContainText(/patvirtinta|verified/i);
  await shot(page, "03-verified-result");
});
