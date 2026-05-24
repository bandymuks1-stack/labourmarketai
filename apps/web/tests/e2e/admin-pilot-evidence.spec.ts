/**
 * Evidence-capture spec for the live admin pilot panel (post-Path-A
 * activation). Runs only when E2E_EXPECT_ADMIN=1 — same gate as the
 * positive branch in admin-pilot-panel.spec.ts. Captures two
 * screenshots: the index pilot panel + the per-user inspect view.
 *
 * Not a duplicate of admin-pilot-panel.spec.ts — that spec asserts
 * the negative redirect path. This one runs only when admin is
 * granted, to produce the evidence files the owner asked for.
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
  "pilot-readiness-superadmin",
  "screenshots",
);

test.skip(
  !existsSync(STORAGE_STATE),
  `Storage state ${STORAGE_STATE} missing — run scripts/e2e-mint-session.ts first.`,
);
test.skip(
  process.env.E2E_EXPECT_ADMIN !== "1",
  "Set E2E_EXPECT_ADMIN=1 after granting the test user superadmin.",
);

test.use({ storageState: STORAGE_STATE });

mkdirSync(SCREENSHOT_DIR, { recursive: true });

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({
    path: join(SCREENSHOT_DIR, `${name}.png`),
    fullPage: true,
  });
}

test("admin pilot panel renders + per-user inspect works", async ({
  page,
}) => {
  test.setTimeout(60_000);

  // 1. Pilot panel index.
  await page.goto("/lt/dashboard/admin", { waitUntil: "networkidle" });
  await expect(page).toHaveURL(/\/lt\/dashboard\/admin/);

  await expect(
    page.getByRole("heading", {
      name: /Pilotinis valdymo skydas/i,
      level: 1,
    }),
  ).toBeVisible();
  await expect(page.getByTestId("admin-dashboard")).toBeVisible();
  await expect(page.getByTestId("admin-recent-users")).toBeVisible();
  await shot(page, "admin-01-pilot-panel");

  // 2. Per-user inspect — click the first "Tikrinti →" link.
  await page.getByText(/Tikrinti →/i).first().click();
  await expect(page).toHaveURL(/\/lt\/dashboard\/admin\/users\//);
  await expect(page.getByTestId("admin-user-detail")).toBeVisible();
  // Either the profile_text section or the empty-state copy is fine.
  await expect(
    page.getByRole("heading", { name: /Profilio tekstas/i, level: 2 }),
  ).toBeVisible();
  await shot(page, "admin-02-user-inspect");
});
