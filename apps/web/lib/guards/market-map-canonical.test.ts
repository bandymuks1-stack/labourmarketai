import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Owner-smoke follow-up (PR #490 pre-merge): the market-map page must LEAD with
 * the canonical REAL provider map (`MarketMapBase` → `MarketMapLive`, OSM tiles
 * via Leaflet), not the pseudo-map world overview, the signal board, or an
 * SVG/coordinate-only locator. The secondary surfaces must render BELOW it, and
 * the page must carry no stale external-provider copy.
 */
const ROOT = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");
const page = read("app/[locale]/dashboard/market-map/page.tsx");
const base = read("components/app/market-map-base.tsx");
const live = read("components/app/market-map-live.tsx");

function idx(src: string, needle: string): number {
  const i = src.indexOf(needle);
  expect(i, `expected to find ${needle}`).toBeGreaterThan(-1);
  return i;
}

describe("market map page — canonical coordinate map leads the flow", () => {
  it("renders <MarketMapBase /> before the signal board and world overview", () => {
    const baseAt = idx(page, "<MarketMapBase");
    const shellAt = idx(page, "<MarketMapShell");
    const worldAt = idx(page, "<LabourMarketWorldMap");
    expect(baseAt).toBeLessThan(shellAt);
    expect(baseAt).toBeLessThan(worldAt);
  });

  it("the pseudo-map world overview no longer leads (is last of the three)", () => {
    const baseAt = idx(page, "<MarketMapBase");
    const shellAt = idx(page, "<MarketMapShell");
    const worldAt = idx(page, "<LabourMarketWorldMap");
    expect(worldAt).toBeGreaterThan(baseAt);
    expect(worldAt).toBeGreaterThan(shellAt);
  });

  it("has no stale external map-provider copy on the page", () => {
    expect(page).not.toMatch(/google[^\n]*maps/i);
    expect(page).not.toMatch(/mapbox/i);
  });

  it("compact control center: secondary surfaces are collapsed behind <details>", () => {
    // The page must lead with the title + real map; the signal board, readiness,
    // capture and world overview must sit inside the collapsed advanced section.
    expect(page).toMatch(/data-testid="market-map-page-header"/);
    const baseAt = idx(page, "<MarketMapBase");
    const detailsAt = idx(page, 'data-testid="market-map-advanced"');
    const shellAt = idx(page, "<MarketMapShell");
    const worldAt = idx(page, "<LabourMarketWorldMap");
    // Map first, then the collapsed <details>, then the secondary surfaces.
    expect(baseAt).toBeLessThan(detailsAt);
    expect(detailsAt).toBeLessThan(shellAt);
    expect(detailsAt).toBeLessThan(worldAt);
    expect(page).toMatch(/<details[^>]*market-map-advanced/);
  });

  it("the canonical map is the REAL provider map, not an SVG/coordinate-only locator", () => {
    expect(base).toMatch(/<MarketMapLive\b/);
    expect(base).not.toMatch(/<LocationMap\b/);
    // The real map renders OSM tiles via Leaflet (free, no key).
    expect(live).toMatch(/from "leaflet"/);
    expect(live).toMatch(/tile\.openstreetmap\.org/);
    // The superseded SVG locator + its projection are gone.
    expect(existsSync(join(ROOT, "components/app/location-map.tsx"))).toBe(false);
    expect(existsSync(join(ROOT, "lib/location/map-projection.ts"))).toBe(false);
  });

  it("the real map container is mobile-safe (full width, no fixed px width → no overflow)", () => {
    expect(live).toMatch(/data-testid="market-map-live"/);
    expect(live).toMatch(/w-full/);
    expect(live).toMatch(/overflow-hidden/);
  });
});
