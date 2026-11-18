/**
 * Browser smoke for the admin entry in the ONE header — captures the
 * evidence the owner asked for.
 *
 * Pre-state: the minted-session user is an admin (`profile_roles.admin` or
 * `profiles.active_role='admin'`).
 *
 * HISTORY. This spec used to assert the role switcher's "Admin režimas"
 * badge in the dashboard header. The role switcher was retired from every
 * header on 2026-10-25 (owner order: ONE navigation system — it was a second
 * workspace selector naming the same organization as the workspace chip).
 * The admin console is now one more destination in the header's "More"
 * menu, shown ONLY to admins; while the operator works inside it the "More"
 * trigger itself names it and carries the active state. The avatar menu
 * keeps its own gated "Platformos administravimas" link.
 *
 * Negative case: for a non-admin the entry is absent — covered by the
 * source-level guard `lib/guards/one-header-navigation.test.ts`.
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
  "Set E2E_EXPECT_ADMIN=1 (and ensure the session user is an admin).",
);

test.use({ storageState: STORAGE_STATE });

mkdirSync(SCREENSHOT_DIR, { recursive: true });

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({
    path: join(SCREENSHOT_DIR, `${name}.png`),
    fullPage: true,
  });
}

test("the admin console is reachable from the one header's More menu and highlighted inside it", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1280, height: 900 });

  await page.goto("/lt/dashboard", { waitUntil: "networkidle" });
  await expect(page).toHaveURL(/\/lt\/dashboard/);

  // Exactly one workspace selector (the retired role switcher's file is gone —
  // lib/guards/one-header-navigation.test.ts pins it).
  await expect(page.getByTestId("workspace-chip")).toHaveCount(1);

  await page.getByTestId("header-nav-more").click();
  const entry = page.getByTestId("header-nav-more-admin");
  await expect(entry).toBeVisible();
  expect(await entry.getAttribute("href")).toMatch(/\/lt\/dashboard\/admin$/);
  await shot(page, "01-admin-entry-in-more-menu");

  await entry.click();
  await expect(page).toHaveURL(/\/lt\/dashboard\/admin/);
  // Inside the console the More trigger names it and carries the active state.
  await expect(page.getByTestId("header-nav-more")).toHaveAttribute("aria-current", "page");
  await shot(page, "02-admin-console-active-in-header");
});
