/**
 * Browser smoke for the admin role-switcher badge — captures the
 * before/after evidence the owner asked for.
 *
 * Pre-state: production `profiles.active_role='admin'` for the
 * minted-session user (the prior Path-A activation set this).
 *
 * After this PR ships, the dashboard header renders TWO distinct
 * widgets when isAdmin:
 *   - an Admin Mode badge (brand-orange) linking to /dashboard/admin
 *   - the workspace role switcher (worker/company/agency/customer)
 *
 * Negative case: when isAdmin=false (any normal user), the admin
 * badge is absent. We can't easily flip the session user's
 * active_role from this spec without service-role writes (forbidden),
 * so the negative path is covered by the source-level guards instead.
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
  "admin-role-switcher-display",
  "screenshots",
);

test.skip(
  !existsSync(STORAGE_STATE),
  `Storage state ${STORAGE_STATE} missing — run scripts/e2e-mint-session.ts first.`,
);
test.skip(
  process.env.E2E_EXPECT_ADMIN !== "1",
  "Set E2E_EXPECT_ADMIN=1 (and ensure the session user has active_role='admin' in prod).",
);

test.use({ storageState: STORAGE_STATE });

mkdirSync(SCREENSHOT_DIR, { recursive: true });

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({
    path: join(SCREENSHOT_DIR, `${name}.png`),
    fullPage: true,
  });
}

test("admin badge renders in the dashboard header AND links to /dashboard/admin", async ({
  page,
}) => {
  test.setTimeout(60_000);

  await page.goto("/lt/dashboard", { waitUntil: "networkidle" });
  await expect(page).toHaveURL(/\/lt\/dashboard/);

  // The admin badge must be visible in the header.
  const badge = page.getByTestId("role-switcher-admin-badge");
  await expect(badge).toBeVisible();

  // Label is the new "Admin režimas" copy, NOT a user-facing role.
  await expect(badge).toContainText(/admin režimas/i);
  // Negative: the badge does NOT contain any user-facing role label.
  for (const userRole of [
    "darbuotojas",
    "įmonė",
    "agentūra",
    "pirkėjas",
  ]) {
    await expect(badge).not.toContainText(new RegExp(userRole, "i"));
  }

  await shot(page, "01-admin-badge-in-header");

  // The badge is a link to /dashboard/admin.
  const href = await badge.getAttribute("href");
  expect(href).toBeTruthy();
  expect(href).toMatch(/\/lt\/dashboard\/admin/);

  // Clicking navigates to the pilot panel (the admin gate already
  // passed in the prior smoke; here we just verify the link works).
  await badge.click();
  await expect(page).toHaveURL(/\/lt\/dashboard\/admin/);
  await shot(page, "02-admin-badge-click-navigates");
});
