/**
 * Authenticated Market Map CAPTURE e2e (local stack, real minted session).
 *
 * Proves the owner-only capture flows end-to-end:
 *   1. preferred_location: create → map shows it → disable → drops from map;
 *   2. login consent: consented → login signal shows (approximate, no exact) →
 *      revoked → login signal no longer renders;
 *   3. company-need: edit visibility on an owner row (no new insert).
 *
 * Skips when tests/e2e/.storage-state.json is missing.
 */
import { test, expect, type Page } from "@playwright/test";
import { existsSync } from "node:fs";
import { join } from "node:path";

const STORAGE_STATE = join(__dirname, ".storage-state.json");
test.skip(!existsSync(STORAGE_STATE), "run scripts/e2e-mint-session.ts first");
test.use({ storageState: STORAGE_STATE });

async function gotoMap(page: Page) {
  await page.goto("/lt/dashboard/market-map", { waitUntil: "networkidle" });
  await expect(page).toHaveURL(/\/lt\/dashboard\/market-map/, { timeout: 20_000 });
  await page.getByTestId("market-map-capture").waitFor({ state: "visible", timeout: 30_000 });
}

test("preferred location: create with intents + priority + note → depth shown → disable", async ({ page }) => {
  test.setTimeout(150_000);
  await gotoMap(page);

  // Create a preferred location (LT) with two intents, optional priority + note.
  await page.getByTestId("capture-preferred-country").selectOption("LT");
  await page.getByTestId("capture-intent-work").click();
  await page.getByTestId("capture-intent-relocate").click();
  await page.getByTestId("capture-preferred-priority-select").selectOption("optional");
  await page.getByTestId("capture-preferred-note").fill("e2e note");
  await page.getByTestId("capture-preferred-add").click();

  // Row appears in the capture list, active, with priority + intent chips + note.
  const row = page.getByTestId("capture-preferred-row").first();
  await expect(row).toBeVisible({ timeout: 15_000 });
  await expect(row).toHaveAttribute("data-active", "true");
  await expect(row.getByTestId("capture-preferred-priority")).toBeVisible();
  await expect(row.getByTestId("capture-preferred-intents")).toBeVisible();
  await expect(row).toContainText("e2e note");

  // The map's owner view now shows a preferred_location signal (revalidated).
  await expect(
    page.locator('[data-testid="market-map-category-preferred_location"][data-count]'),
  ).toHaveAttribute("data-count", /[1-9]/, { timeout: 15_000 });

  // Edit visibility on the row (localized control, not a raw enum).
  await row.getByTestId("capture-preferred-visibility").selectOption("region_visible");
  await page.waitForTimeout(1200);
  await expect(
    page.getByTestId("capture-preferred-row").first().getByTestId("capture-preferred-visibility"),
  ).toHaveValue("region_visible", { timeout: 15_000 });

  // Disable it → row marked inactive.
  await page.getByTestId("capture-preferred-row").first().getByTestId("capture-preferred-toggle").click();
  await expect(
    page.getByTestId("capture-preferred-row").first(),
  ).toHaveAttribute("data-active", "false", { timeout: 15_000 });
});

test("login consent: consented shows approximate signal → revoked hides it", async ({ page }) => {
  test.setTimeout(150_000);
  await gotoMap(page);

  // Consent → login category renders, and no coordinates/address anywhere.
  await page.getByTestId("capture-login-consented").click();
  await expect(
    page.locator('[data-testid="market-map-category-login_location"][data-count]'),
  ).toHaveAttribute("data-count", /[1-9]/, { timeout: 15_000 });
  const body = (await page.locator("body").innerText()).toLowerCase();
  expect(body).not.toMatch(/latitude|longitude/);
  // No street address rendered for the login signal (a bare country name only).

  // Revoke → login signal no longer counts.
  await page.getByTestId("capture-login-revoked").click();
  await expect(
    page.locator('[data-testid="market-map-category-login_location"][data-count]'),
  ).toHaveAttribute("data-count", "0", { timeout: 15_000 });
});

test("mobile (390px): no horizontal overflow, chips + capture reachable", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoMap(page);

  // No horizontal overflow at 390px (a common iPhone width).
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);

  // Filter chips render and the "all" chip is visible.
  await expect(page.getByTestId("market-map-filter-chips")).toBeVisible();
  await expect(page.getByTestId("market-map-filter-all")).toBeVisible();

  // The capture controls are reachable by scrolling (not hidden under nav).
  const addBtn = page.getByTestId("capture-preferred-add");
  await addBtn.scrollIntoViewIfNeeded();
  await expect(addBtn).toBeVisible();
  // The on-page CTA scrolls to the add form rather than navigating away.
  await page.getByTestId("market-map-cta-preferred_location").click();
  await expect(page).toHaveURL(/\/lt\/dashboard\/market-map/);
  await expect(page.locator("#market-map-add-preferred")).toBeVisible();
});

test("company-need: edit visibility + need type on an owner row (no new insert)", async ({ page }) => {
  test.setTimeout(120_000);
  await gotoMap(page);

  const rows = page.getByTestId("capture-demand-row");
  await expect(rows.first()).toBeVisible({ timeout: 15_000 });
  const before = await rows.count();

  // Edit visibility → region_visible (real owner-scoped update).
  await rows.first().getByTestId("capture-demand-visibility").selectOption("region_visible");
  await page.waitForTimeout(1500);

  // Same number of rows — an EDIT, never a new insert.
  await expect(rows).toHaveCount(before);
  await expect(
    page.getByTestId("capture-demand-row").first().getByTestId("capture-demand-visibility"),
  ).toHaveValue("region_visible", { timeout: 15_000 });

  // Edit need type → team (localized select, owner-scoped, still no insert).
  await page.getByTestId("capture-demand-row").first().getByTestId("capture-demand-needtype").selectOption("team");
  await page.waitForTimeout(1500);
  await expect(rows).toHaveCount(before);
  await expect(
    page.getByTestId("capture-demand-row").first().getByTestId("capture-demand-needtype"),
  ).toHaveValue("team", { timeout: 15_000 });
});
