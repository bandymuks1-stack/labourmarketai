import { expect as baseExpect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

/**
 * W3 — REMOVING THE SECOND DASHBOARD, ONE PROVEN ROW AT A TIME.
 *
 * `/dashboard/advanced` is a 916-line parallel dashboard composing ~27
 * capabilities. It is the architecture violation the owner command names, and
 * it is also the only place several real capabilities currently live — so the
 * migration matrix
 * (`docs/audits/evidence/premium-rebuild/w3-capability-migration-matrix.md`)
 * moves one row at a time, and every row gets a browser assertion before the
 * route can be deleted.
 *
 * This file grows one describe-block per migrated row. It is deliberately NOT
 * a "the advanced page renders" smoke test: the point is to prove that
 * REMOVING something did not remove a capability.
 */

const SHOTS = process.env.E2E_SHOTS_DIR
  ? join(process.cwd(), "..", "..", process.env.E2E_SHOTS_DIR)
  : join(process.cwd(), "..", "..", "docs", "audits", "evidence", "premium-rebuild", "w3");

const expect = baseExpect.configure({ timeout: 15_000 });

test.use({
  storageState: "tests/e2e/.storage-state.json",
  viewport: { width: 1440, height: 900 },
});
test.beforeAll(() => mkdirSync(SHOTS, { recursive: true }));

// `/dashboard/advanced` is 916 lines composing ~27 components. Its FIRST dev
// compile genuinely exceeds the 30s default — that is build cost, not product
// latency, and shrinking the assertion to hide it would prove less.
test.setTimeout(180_000);

test.describe("row 4 — the fake market map is gone, the capability is not", () => {
  test("the advanced route still renders, without a drawn pseudo-map", async ({ page }) => {
    const consoleErrors: string[] = [];
    const failed: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error" && !/upgrade-insecure-requests/i.test(m.text())) {
        consoleErrors.push(m.text());
      }
    });
    page.on("requestfailed", (r) => {
      const why = r.failure()?.errorText ?? "";
      if (!why.includes("ERR_ABORTED")) failed.push(`${r.url()} — ${why}`);
    });
    page.on("response", (r) => {
      if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`);
    });

    await page.goto("/lt/dashboard/advanced");

    // The market panel lives inside the "More" disclosure — a native <details>,
    // closed by default. Open it the way a person would, rather than asserting
    // against a collapsed element and calling the collapse a bug.
    const more = page.getByTestId("dashboard-more-section");
    await expect(more).toBeAttached();
    await more.locator("summary").click();

    // The route is intact — removing the drawing did not break the page.
    const panel = page.getByTestId("premium-hub-map");
    await expect(panel).toBeVisible();

    // THE CAPABILITY SURVIVED — in whichever of its two REAL branches this
    // identity lands in. The fixture worker has no market signals yet, so the
    // panel correctly renders its honest empty state; a seeded identity renders
    // the three counts. Asserting only one branch would have made this test a
    // statement about the fixture rather than about the panel.
    const values = await panel.locator("dl dd").allTextContents();
    if (values.length > 0) {
      expect(values.length, "the three market signal values must survive").toBe(3);
      for (const v of values) expect(v.trim()).not.toBe("");
      const door = page.getByTestId("hub-map-open-link");
      await expect(door).toBeVisible();
      await expect(door).toHaveAttribute("href", /\/dashboard\/market-map/);
    } else {
      // Honest empty state — it must still say something and still open the map.
      await expect(panel).toContainText(/\S/);
      await expect(panel.locator('a[href*="/dashboard/market-map"]')).toHaveCount(1);
    }

    // THE FAKE MAP IS GONE. The panel drew a 400x260 <svg> of dots at invented
    // positions; a picture of a map is not a map.
    expect(
      await panel.locator("svg[viewBox='0 0 400 260']").count(),
      "the decorative pseudo-map must not come back",
    ).toBe(0);

    await page.screenshot({ path: join(SHOTS, "row4-market-panel-1440.png") });

    expect(failed, failed.join("\n")).toEqual([]);
    expect(consoleErrors, consoleErrors.join("\n")).toEqual([]);
  });

  test("the door leads to a REAL map, not another drawing", async ({ page }) => {
    // The other half of "no capability was lost": the door has to lead
    // somewhere real.
    //
    // NOTE — a duplication found while writing this test, recorded in the W3
    // matrix rather than silently accommodated: `/dashboard/market-map` does
    // NOT render the canonical <MarketMap>. It renders `market-map-base` →
    // `market-map-live`, a SECOND Leaflet chain. `market-map.tsx`'s own header
    // says it was meant to collapse `market-map-live.tsx` into itself; that
    // collapse never finished. Both are real maps, so no user is being lied
    // to — but two map implementations is one too many, and it is now a
    // tracked W3 row instead of a surprise.
    await page.goto("/lt/dashboard/market-map");
    await expect(page.getByTestId("market-map-base")).toBeVisible();
    // Real Leaflet, real coordinates — not an illustration.
    await expect(page.locator(".leaflet-container").first()).toBeVisible();
    await page.screenshot({ path: join(SHOTS, "row4-real-map-1440.png") });
  });
});
