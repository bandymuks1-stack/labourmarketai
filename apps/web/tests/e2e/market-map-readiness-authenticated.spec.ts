/**
 * Authenticated Market Map READINESS e2e (local stack, real minted session).
 *
 * Proves the owner-only availability + capability blocks render the caller's OWN
 * real data:
 *   1. availability state + mobility (current / preferred countries);
 *   2. capability signals tagged confirmed / suggested / self-declared;
 *   3. mobile 390px: no horizontal overflow.
 *
 * Skips when tests/e2e/.storage-state.json is missing. The worker row + skills
 * are seeded by the harness (see the PR notes) for the minted owner.
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
  // PR #921 folded the capture/readiness tools into the collapsed
  // "advanced" <details> (progressive disclosure) — open it first.
  await page.getByTestId("market-map-advanced").locator("> summary").click();
  await page.getByTestId("market-map-readiness").waitFor({ state: "visible", timeout: 30_000 });
}

test("availability + mobility render from the owner's worker row", async ({ page }) => {
  test.setTimeout(120_000);
  await gotoMap(page);

  // Availability state badge is present (seeded available now).
  await expect(page.getByTestId("readiness-state")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("readiness-state")).toHaveAttribute("data-state", "available");

  // Mobility shows current / preferred countries (seeded).
  await expect(page.getByTestId("readiness-mobility")).toBeVisible();
});

test("capability signals are tagged confirmed / suggested / self-declared", async ({ page }) => {
  test.setTimeout(120_000);
  await gotoMap(page);

  await expect(page.getByTestId("readiness-capabilities")).toBeVisible({ timeout: 15_000 });
  // Confirmed count reflects a real verified skill (seeded verified = true).
  await expect(
    page.locator('[data-testid="capabilities-count-confirmed"][data-count]'),
  ).toHaveAttribute("data-count", /[1-9]/, { timeout: 15_000 });
  // At least one confirmed chip is rendered.
  await expect(page.getByTestId("capability-chip-confirmed").first()).toBeVisible();
});

test("mobile (390px): readiness blocks have no horizontal overflow", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoMap(page);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
  await page.getByTestId("readiness-capabilities").scrollIntoViewIfNeeded();
  await expect(page.getByTestId("readiness-capabilities")).toBeVisible();
});
