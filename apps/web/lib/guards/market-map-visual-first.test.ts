import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Market-map visual-first guard (admin-control-room-map-visual-v1), restated
 * for the ONE canonical map.
 *
 * The map communicates through the visual surface — the single canonical map
 * with its layer pills and location + radius controls — NOT through
 * explanatory text. What this guard used to pin and no longer does, on purpose:
 * the separate picker map (`MarketMapBase`), the layer legend
 * (`MapLayersLegend`), the signal board (`MarketMapShell`), the world-overview
 * diagram (`LabourMarketWorldMap`) and the page lead paragraph were all
 * explanation / duplicate-map surfaces that the owner removed. The functional
 * capture tools stay, collapsed, after the map.
 */

const ROOT = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");
const page = read("app/[locale]/dashboard/market-map/page.tsx");

function at(needle: string): number {
  const i = page.indexOf(needle);
  expect(i, `expected to find ${needle} on the market-map page`).toBeGreaterThan(-1);
  return i;
}

const detailsAt = at('data-testid="market-map-advanced"');

describe("market map — the visual surface leads, prose is gone", () => {
  it("the ONE map is ABOVE the collapsed panel (primary, always-on)", () => {
    expect(at("<WorldDiscovery")).toBeLessThan(detailsAt);
  });

  it("the explanatory surfaces and the second map are not on the page at all", () => {
    for (const gone of [
      "<MarketMapBase",
      "<MapLayersLegend",
      "<MarketMapShell",
      "<LabourMarketWorldMap",
      "<MarketMapEntityLayers",
    ]) {
      expect(page, gone).not.toContain(gone);
    }
  });

  it("the collapsed panel holds only the functional tools (capture, readiness)", () => {
    expect(at("<MarketMapCapture")).toBeGreaterThan(detailsAt);
    expect(at("<MarketMapOwnerReadiness")).toBeGreaterThan(detailsAt);
  });
});

describe("market map — no lead paragraph, no documentation copy", () => {
  it("the page renders a title only (no pageLead)", () => {
    expect(page).toMatch(/tMap\("pageTitle"\)/);
    expect(page).not.toMatch(/pageLead/);
  });
  for (const loc of ["en", "lt", "ru"] as const) {
    it(`${loc}: the removed explanatory copy is gone from the catalogue`, () => {
      const m = JSON.parse(read(`messages/${loc}.json`)) as {
        marketMap: { pageLead?: unknown; entities?: unknown; world: Record<string, unknown> };
        mapLayers?: unknown;
      };
      expect(m.marketMap.pageLead).toBeUndefined();
      expect(m.marketMap.entities).toBeUndefined();
      expect(m.marketMap.world.lead).toBeUndefined();
      expect(m.mapLayers).toBeUndefined();
    });
  }
});
