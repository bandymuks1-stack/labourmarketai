/**
 * Local credentialed smoke for the pilot admin panel.
 *
 * Uses the standard minted session (sukysdonatas@gmail.com). On a
 * fresh prod DB the test user is NOT yet superadmin (the grant
 * script hasn't been applied), so this spec asserts the NEGATIVE
 * case: /dashboard/admin redirects to /dashboard. After the owner
 * runs `pnpm admin:grant-superadmin --email <…> --apply
 * --i-understand-this-mutates-production`, the same spec can be
 * re-run with E2E_EXPECT_ADMIN=1 to flip to the positive assertion.
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

test("non-superadmin is redirected away from /dashboard/admin", async ({
  page,
}) => {
  test.skip(
    process.env.E2E_EXPECT_ADMIN === "1",
    "Owner is granted admin — run without E2E_EXPECT_ADMIN to verify the negative path.",
  );

  test.setTimeout(60_000);
  await page.goto("/lt/dashboard/admin", { waitUntil: "networkidle" });

  // Server-side redirect should have rewritten the URL to /lt/dashboard
  // BEFORE any admin content rendered.
  await expect(page).toHaveURL(/\/lt\/dashboard(?!\/admin)/);
  // Admin testid never reaches the DOM (the redirect happens server-
  // side, so no flash-of-admin-content).
  expect(
    await page.getByTestId("admin-dashboard").count(),
    "admin content must NOT render for non-superadmin",
  ).toBe(0);
});

test("superadmin sees the pilot panel", async ({ page }) => {
  test.skip(
    process.env.E2E_EXPECT_ADMIN !== "1",
    "Set E2E_EXPECT_ADMIN=1 after granting the test user superadmin to run this branch.",
  );

  test.setTimeout(60_000);
  await page.goto("/lt/dashboard/admin", { waitUntil: "networkidle" });
  await expect(page).toHaveURL(/\/lt\/dashboard\/admin/);
  await expect(page.getByTestId("admin-dashboard")).toBeVisible();
  await expect(page.getByTestId("admin-recent-users")).toBeVisible();
});
