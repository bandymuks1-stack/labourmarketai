import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * ONE CANONICAL MAP (owner target). The market-map page mounts exactly ONE
 * interactive map — the canonical `<MarketMap>` through `<WorldDiscovery>`
 * (OSM tiles via the ONE Leaflet engine). Location + radius are controls OF
 * that map; public vacancies and the owner company's territory are LAYERS of
 * it. History: this guard used to pin the opposite structure (a separate
 * `MarketMapBase`/`MarketMapLive` picker map leading the page, then the signal
 * board and the world-overview diagram below it); that structure is the
 * regression the owner reported, so it is deliberately replaced here.
 */
const ROOT = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");
const page = read("app/[locale]/dashboard/market-map/page.tsx");
const world = read("components/app/market-map/world-discovery.tsx");
const map = read("components/app/market-map/market-map.tsx");

function idx(src: string, needle: string): number {
  const i = src.indexOf(needle);
  expect(i, `expected to find ${needle}`).toBeGreaterThan(-1);
  return i;
}

describe("market map page — ONE canonical map leads the flow", () => {
  it("mounts exactly one <WorldDiscovery> and no second <MarketMap>", () => {
    expect([...page.matchAll(/<WorldDiscovery\b/g)]).toHaveLength(1);
    expect(page).not.toMatch(/<MarketMap\b/);
    expect(page).not.toMatch(/<MarketMapBase\b|<MarketMapLive\b|<LocationMap\b/);
  });

  it("the map precedes the collapsed management tools", () => {
    expect(page).toMatch(/data-testid="market-map-page-header"/);
    const mapAt = idx(page, "<WorldDiscovery");
    const detailsAt = idx(page, 'data-testid="market-map-advanced"');
    expect(mapAt).toBeLessThan(detailsAt);
    expect(page).toMatch(/<details[^>]*market-map-advanced/);
  });

  it("carries none of the documentation / catalogue blocks the owner removed", () => {
    for (const gone of [
      "<MarketMapShell",
      "<LabourMarketWorldMap",
      "<MapLayersLegend",
      "<MarketMapEntityLayers",
      "<FeatureNote",
    ]) {
      expect(page, gone).not.toContain(gone);
    }
  });

  it("has no stale external map-provider copy on the page", () => {
    expect(page).not.toMatch(/google[^\n]*maps/i);
    expect(page).not.toMatch(/mapbox/i);
  });

  it("the canonical map is the REAL provider map, not an SVG/coordinate-only locator", () => {
    expect(map).toMatch(/from "leaflet"/);
    expect(map).toMatch(/mountLeafletMap\(/);
    expect(read("components/app/market-map/leaflet-engine.ts")).toMatch(
      /tile\.openstreetmap\.org/,
    );
    // The superseded SVG locator, its projection and the second Leaflet
    // instance (the standalone own-location picker map) are gone.
    expect(existsSync(join(ROOT, "components/app/location-map.tsx"))).toBe(false);
    expect(existsSync(join(ROOT, "lib/location/map-projection.ts"))).toBe(false);
    expect(existsSync(join(ROOT, "components/app/market-map/location-map.tsx"))).toBe(false);
    expect(existsSync(join(ROOT, "components/app/market-map-base.tsx"))).toBe(false);
  });

  it("location + radius are controls OF the one map, not a map of their own", () => {
    expect(world).toMatch(/<MapLocationControls\b/);
    expect(world).toMatch(/own=\{/);
    expect(map).toMatch(/own\?: OwnLocationOverlay/);
  });

  it("the map container is mobile-safe (full width, hidden overflow → no horizontal scroll)", () => {
    expect(map).toMatch(/data-testid="market-map"/);
    expect(map).toMatch(/overflow-hidden/);
    expect(map).toMatch(/size-full/);
  });
});
