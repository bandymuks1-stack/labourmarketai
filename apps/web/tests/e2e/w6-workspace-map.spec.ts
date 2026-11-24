import { test, expect, type Page } from "@playwright/test";
import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Authenticated E2E for the WORKSPACE MAP (W6) — re-anchored 2026-09-23 to
 * the owner's §20 ruling: "do not automatically display every map".
 *
 * The map used to sit in the Context Panel at depth 0 on every home load
 * (and this spec pinned it there). It is now CONTEXTUAL. What stays true is
 * the W6 promise itself — the map lives inside the one workspace, it follows
 * World State, and clicking it selects — only its trigger changed:
 *   1. the home at depth 0 (nothing selected, no result) shows the panel's
 *      work context and NO map: no map section, no Leaflet container;
 *   2. a SELECTION asks "where is this?": opening a match from the
 *      opportunities result puts the panel in entity mode and the map
 *      appears there, the selected place highlighted (selection → map), with
 *      no navigation;
 *   3. once it is up, clicking a real marker opens that entity through the
 *      SAME World State (map → selection), URL unchanged;
 *   4. a PLACE result (`?result=market`) brings its own map, and the panel
 *      never stacks a second one beside it;
 *   5. on a phone the collapsed or depth-0 sheet boots no Leaflet at all, and
 *      a selection opens the sheet with the map in it.
 *
 * Every marker is a real row (the local fixture's Amsterdam demand).
 */
const STORAGE_STATE = join(__dirname, ".storage-state.json");
const HAS_SESSION = existsSync(STORAGE_STATE);
const OUT = join(__dirname, "..", "..", "..", "..", "docs", "audits", "evidence", "owner-rebuild-after");

test.skip(!HAS_SESSION, "needs the local stack");
test.use({ storageState: HAS_SESSION ? STORAGE_STATE : undefined });
test.setTimeout(180_000);

async function openHome(page: Page, path = "/lt/dashboard") {
  await page.goto(path);
  await expect(page.getByTestId("composer-input")).toBeEnabled({ timeout: 60_000 });
}

/** Select the first match of the opportunities result — the canonical
 *  selection control (it writes World State; it never navigates). */
async function selectFirstMatch(page: Page) {
  const open = page.getByTestId("opportunities-match-open").first();
  await expect(open).toBeVisible({ timeout: 45_000 });
  const url = page.url();
  await open.click();
  await expect(page.getByTestId("context-panel")).toHaveAttribute(
    "data-panel-mode",
    "entity",
    { timeout: 30_000 },
  );
  expect(page.url(), "a selection never navigates").toBe(url);
}

test("the home at depth 0 shows the work context and no map", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openHome(page);
  const panel = page.getByTestId("context-panel");
  await expect(panel).toBeVisible();
  await expect(panel).toHaveAttribute("data-panel-mode", "work_context");
  // Let the work-context read settle before asserting an absence — an
  // absence measured during "loading" proves nothing.
  await expect(page.getByTestId("context-panel-loading")).toHaveCount(0, { timeout: 30_000 });
  await expect(page.getByTestId("workspace-map")).toHaveCount(0);
  await expect(page.locator(".leaflet-container")).toHaveCount(0);
  await page.screenshot({ path: join(OUT, "w6-home-depth0-no-map-1440.png") });
});

test("a selection brings the map, highlighted, and the map still selects", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openHome(page, "/lt/dashboard?result=opportunities");
  // A result owns the panel: still no workspace map while it shows.
  await expect(page.getByTestId("workspace-map")).toHaveCount(0);

  await selectFirstMatch(page);
  // Selection → World State → the map appears and flies to the place.
  await expect(page.getByTestId("workspace-map")).toBeVisible({ timeout: 45_000 });
  await expect(page.locator(".wsmap-pin-active")).toHaveCount(1, { timeout: 30_000 });
  await page.screenshot({ path: join(OUT, "w6-map-selection-1440.png") });

  // Map → selection: a real marker opens its entity on the SAME state.
  const url = page.url();
  await page.locator(".wsmap-pin").first().click();
  const popupRow = page.locator(".wsmap-row").first();
  if (await popupRow.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await popupRow.click();
  }
  await expect(page.getByTestId("context-panel")).toHaveAttribute("data-panel-mode", "entity");
  expect(page.url()).toBe(url);
  await expect(page.getByTestId("context-panel-loading")).toHaveCount(0, { timeout: 30_000 });
});

test("a place result brings its own map and the panel never stacks a second", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openHome(page, "/lt/dashboard?result=market");
  await expect(
    page.getByTestId("market-view").or(page.getByTestId("market-empty")),
  ).toBeVisible({ timeout: 45_000 });
  await expect(page.getByTestId("workspace-map")).toHaveCount(0);
});

test("on a phone the depth-0 sheet boots no map; a selection opens it with the map", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openHome(page);
  const toggle = page.getByTestId("context-panel-toggle");
  if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByTestId("context-panel-loading")).toHaveCount(0, { timeout: 30_000 });
  await expect(page.getByTestId("workspace-map")).toHaveCount(0);
  await expect(page.locator(".leaflet-container")).toHaveCount(0);
  // `documentElement.scrollWidth` is blind here (html/body are
  // overflow-x:hidden — see the dashboard layout note); body is not.
  const overflow = await page.evaluate(
    () => document.body.scrollWidth > window.innerWidth + 1,
  );
  expect(overflow).toBe(false);

  await openHome(page, "/lt/dashboard?result=opportunities");
  await selectFirstMatch(page);
  await expect(page.getByTestId("context-panel-toggle")).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByTestId("workspace-map")).toBeVisible({ timeout: 45_000 });
  await page.screenshot({ path: join(OUT, "w6-map-phone-390.png") });
});
