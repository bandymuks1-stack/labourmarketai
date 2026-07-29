import { test, expect } from "@playwright/test";
import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Authenticated E2E for the WORKSPACE MAP (W6).
 *
 * The lock's promise, verified in a real browser:
 *   1. the map lives INSIDE the workspace (in the Context Panel) — no
 *      separate screen, no navigation;
 *   2. map → selection: clicking a real marker opens that entity in the
 *      panel and scopes the conversation (open_object on shared World State);
 *   3. selection → map: opening an entity from the chat highlights/flies the
 *      map to its place;
 *   4. every marker is a real row (the fixture's Amsterdam demand).
 */
const STORAGE_STATE = join(__dirname, ".storage-state.json");
const HAS_SESSION = existsSync(STORAGE_STATE);
const OUT = join(__dirname, "..", "..", "..", "..", "docs", "audits", "evidence", "owner-rebuild-after");

test.skip(!HAS_SESSION, "needs the local stack");
test.use({ storageState: HAS_SESSION ? STORAGE_STATE : undefined });
test.setTimeout(180_000);

test("map is in the workspace and clicking a marker opens the entity", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/lt/dashboard");
  await expect(page.getByTestId("composer-input")).toBeEnabled({ timeout: 60_000 });

  const map = page.getByTestId("workspace-map");
  await expect(map).toBeVisible({ timeout: 45_000 });
  const url = page.url();

  // A real marker from the fixture demand (Amsterdam).
  const pin = page.locator(".wsmap-pin").first();
  await expect(pin).toBeVisible({ timeout: 30_000 });
  await page.screenshot({ path: join(OUT, "w6-map-in-panel-1440.png") });

  await pin.click();
  // A multi-entity place opens its popup listing the REAL entities — pick
  // the first; a single-entity place selects directly. Both are the same
  // open_object on shared World State.
  const popupRow = page.locator(".wsmap-row").first();
  if (await popupRow.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await popupRow.click();
  }
  // Map → World State → panel: the entity opens, URL does not move.
  await expect(page.getByTestId("context-panel")).toHaveAttribute(
    "data-panel-mode",
    "entity",
    { timeout: 30_000 },
  );
  expect(page.url()).toBe(url);
  await expect(page.getByTestId("context-panel-loading")).toHaveCount(0, { timeout: 30_000 });
  await page.screenshot({ path: join(OUT, "w6-map-selection-1440.png") });

  // The active place is highlighted.
  await expect(page.locator(".wsmap-pin-active")).toHaveCount(1);
});

test("selection from the chat reflects on the map", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/lt/dashboard");
  await expect(page.getByTestId("composer-input")).toBeEnabled({ timeout: 60_000 });
  await expect(page.getByTestId("workspace-map")).toBeVisible({ timeout: 45_000 });

  await page.getByTestId("composer-input").fill("Ieškau darbo");
  await page.getByTestId("composer-send").click();
  const card = page.getByTestId("chat-employer-match-card").first();
  await expect(card).toBeVisible({ timeout: 30_000 });
  await card.getByTestId("chat-employer-match-open").click();

  // Chat selection → the SAME World State → the map highlights the place.
  await expect(page.locator(".wsmap-pin-active")).toHaveCount(1, { timeout: 30_000 });
});

test("map renders on a phone without breaking the chat", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/lt/dashboard");
  await expect(page.getByTestId("composer-input")).toBeEnabled({ timeout: 60_000 });
  // The panel starts collapsed on a phone; expanding it reveals the map.
  await page.getByTestId("context-panel-toggle").click();
  await expect(page.getByTestId("workspace-map")).toBeVisible({ timeout: 45_000 });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
  expect(overflow).toBe(false);
  await page.screenshot({ path: join(OUT, "w6-map-phone-390.png") });
});
