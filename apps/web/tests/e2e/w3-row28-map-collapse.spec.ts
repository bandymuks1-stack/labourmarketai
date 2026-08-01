import { expect as baseExpect, test, type Page } from "@playwright/test";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

/**
 * W3 row 28 — the second Leaflet chain is collapsed: browser proof.
 *
 * After the collapse, every map presentation boots through the ONE engine
 * (`market-map/leaflet-engine.ts`). This spec proves the two primary surfaces
 * still WORK (the deeper capture/readiness flows are covered by the existing
 * `market-map-capture-authenticated` + `market-map-readiness-authenticated`
 * specs, run in the same pass):
 *
 *   - /dashboard/market-map renders the real location picker (engine-booted),
 *     manual fallback saves a location, the honest precision label shows;
 *   - the conversation's market result still renders the canonical map
 *     presentation in the panel;
 *   - 375px no sideways scroll; 0 unexplained console errors.
 */

const SHOTS = process.env.E2E_SHOTS_DIR
  ? join(process.cwd(), "..", "..", process.env.E2E_SHOTS_DIR)
  : join(process.cwd(), "..", "..", "docs", "audits", "evidence", "premium-rebuild", "w3");

const expect = baseExpect.configure({ timeout: 20_000 });
const STORAGE_STATE = join(__dirname, ".storage-state.json");

/** Pre-existing, named console allowances — never widened. */
const PRE_EXISTING_CONSOLE = [
  /upgrade-insecure-requests/i,
  /hydrated but some attributes of the server rendered HTML didn't match/i,
];

function watch(page: Page) {
  const consoleErrors: string[] = [];
  const failed: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" && !PRE_EXISTING_CONSOLE.some((rx) => rx.test(m.text()))) {
      consoleErrors.push(m.text());
    }
  });
  page.on("requestfailed", (r) => {
    const why = r.failure()?.errorText ?? "";
    // OSM community tiles are an external best-effort source — a single tile
    // abort must not fail the suite; anything else does.
    if (why.includes("ERR_ABORTED")) return;
    if (r.url().includes("tile.openstreetmap.org")) return;
    failed.push(`${r.url()} — ${why}`);
  });
  page.on("response", (r) => {
    if (r.status() >= 400 && !r.url().includes("tile.openstreetmap.org")) {
      failed.push(`${r.status()} ${r.url()}`);
    }
  });
  return {
    assertClean() {
      expect(failed, failed.join("\n")).toEqual([]);
      expect(consoleErrors, consoleErrors.join("\n")).toEqual([]);
    },
  };
}

test.skip(!existsSync(STORAGE_STATE), "run scripts/e2e-mint-session.ts first");
test.use({ storageState: STORAGE_STATE, viewport: { width: 1440, height: 900 } });
test.beforeAll(() => mkdirSync(SHOTS, { recursive: true }));
test.setTimeout(180_000);

test("the market-map route renders the engine-booted picker; manual save works", async ({
  page,
}) => {
  const w = watch(page);
  await page.goto("/lt/dashboard/market-map", { waitUntil: "networkidle" });
  await expect(page.getByTestId("market-map-base")).toBeVisible();
  // The ONE engine actually booted a real Leaflet map (tile pane present).
  await expect(page.getByTestId("market-map-live")).toBeVisible();
  await expect(
    page.getByTestId("market-map-live").locator(".leaflet-tile-pane"),
  ).toHaveCount(1);

  // Manual fallback (provider-free): country-only save → honest APPROXIMATE
  // precision label; the saved readout appears with one-tap actions.
  await page.getByTestId("map-locator-manual-toggle").click();
  await page.getByTestId("map-locator-country").selectOption("LT");
  await page.getByTestId("map-locator-manual-submit").click();
  await expect(page.getByTestId("map-locator-selected")).toBeVisible();
  await expect(page.getByTestId("location-precision")).toBeVisible();
  await page.screenshot({
    path: join(SHOTS, "row28-market-map-1440.png"),
    fullPage: false,
  });
  // Clean up the device-local selection so re-runs start from the empty state.
  await page.getByTestId("map-locator-reset").click();
  await expect(page.getByTestId("market-map-base-empty")).toBeVisible();
  w.assertClean();
});

test("the market RESULT still renders the canonical presentation in the panel", async ({
  page,
}) => {
  const w = watch(page);
  await page.goto("/lt/dashboard?result=market", { waitUntil: "networkidle" });
  await expect(page.getByTestId("context-panel")).toBeVisible();
  await expect(
    page.getByTestId("context-panel").getByTestId("market-map").first(),
  ).toBeVisible();
  w.assertClean();
});

test("375px: the map route fits one-handed", async ({ browser }) => {
  const ctx = await browser.newContext({
    storageState: STORAGE_STATE,
    viewport: { width: 375, height: 812 },
  });
  const page = await ctx.newPage();
  const w = watch(page);
  await page.goto("/lt/dashboard/market-map", { waitUntil: "networkidle" });
  await expect(page.getByTestId("market-map-base")).toBeVisible();
  const overflow = await page.evaluate(() => {
    const el = document.scrollingElement!;
    return el.scrollWidth - el.clientWidth;
  });
  expect(overflow).toBeLessThanOrEqual(1);
  await page.screenshot({ path: join(SHOTS, "row28-market-map-375.png") });
  w.assertClean();
  await ctx.close();
});
