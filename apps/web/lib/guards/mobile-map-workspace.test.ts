import { describe, expect, it } from "vitest";
import { isCanonicallyRedirected } from "./canonical-redirects";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Mobile map workspace + active-identity marker guard (rewritten for the ONE
 * canonical map).
 *
 * The map (/dashboard/market-map) is a primary mobile workspace: the map is the
 * dominant element, the own marker respects the ACTIVE identity (person vs
 * company), and nothing on the page fakes a layer. What changed: the former
 * "layers legend" (visible-now / disabled future layers, company layer row,
 * off-map needs row) is deliberately gone — layers are pills of the ONE map and
 * exist only where real data exists; the own location + radius are drawn on the
 * canonical map by `own-location-layer.ts`, not by a second map.
 */

const ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const ACTIVE_LOCALES = ["lt", "en", "ru"] as const;
const PAGE = "app/[locale]/dashboard/market-map/page.tsx";
const LAYER = "components/app/market-map/own-location-layer.ts";
const MODEL = "components/app/market-map/market-map-model.ts";
const WORLD = "components/app/market-map/world-discovery.tsx";

describe("map page is map-first on mobile", () => {
  const page = read(PAGE);
  const model = read(MODEL);

  it("the dashboard-mode map container is tall on mobile (dominant), not a small embed", () => {
    expect(model).toMatch(/dashboard:\s*"h-\[clamp\(24rem,60vh,40rem\)\]"/);
    expect(page).toMatch(/<WorldDiscovery\b/);
  });

  it("no explanatory feature note sits on the page at all", () => {
    expect(page).not.toMatch(/feature-note-market-map|FeatureNote/);
  });

  it("no layers legend / future-layer catalogue is present", () => {
    expect(page).not.toMatch(/<MapLayersLegend\b/);
  });
});

describe("ONE unified map — personal & company are layers/markers, not separate maps", () => {
  const page = read(PAGE);
  const layer = read(LAYER);
  const world = read(WORLD);

  it("personal identity marker is built from real own-user data, ALWAYS", () => {
    expect(page).toMatch(/kind:\s*"person"/);
    expect(page).toMatch(/markerYou/);
    expect(page).toMatch(/avatarUrl:\s*avatar\.signedUrl/);
    expect(page).not.toMatch(/!isCompanyContext\s*&&\s*ownName/);
  });

  it("company context does NOT suppress the personal layer (no separate map)", () => {
    expect(page).not.toMatch(/suppressOwnMarker\s*=\s*isCompanyContext/);
    expect(page).not.toMatch(/suppressOwnMarker=\{suppressOwnMarker\}/);
    expect(page).not.toMatch(/market-map-company-context/);
  });

  it("the company is a LAYER of the same map (territory), offered only when it has data", () => {
    expect(page).toMatch(/staticLayers\.territory\s*=/);
    expect(page).toMatch(/territories\.length\s*>\s*0/);
    // no fake company marker, no placeholder row for a company without data
    expect(page).not.toMatch(/companyIncomplete|state:\s*"incomplete"/);
  });

  it("own needs without coordinates are not drawn as fake points", () => {
    expect(page).not.toMatch(/off-map|notOnMapYet/);
  });

  it("there is ONE map engine on the page + the marketplace route redirects to it", () => {
    expect((page.match(/<WorldDiscovery\b/g) ?? []).length).toBe(1);
    expect(page).not.toMatch(/<MarketMap\b/);
    expect((world.match(/<MarketMap\s/g) ?? []).length).toBe(1);
    expect(isCanonicallyRedirected("/dashboard/marketplace", "/dashboard/market-map")).toBe(true);
  });

  it("marker pin distinguishes person vs company (kind drives the shape)", () => {
    expect(layer).toMatch(/kind\s*===\s*"company"/);
  });
});

describe("no fake markers / coordinates anywhere on the map", () => {
  for (const rel of [PAGE, LAYER, WORLD]) {
    const src = read(rel);
    it(`${rel}: no seeded marker / coordinate arrays`, () => {
      expect(src).not.toMatch(/markers?\s*[:=]\s*\[/i);
      expect(src).not.toMatch(/coordinates\s*[:=]\s*\[/i);
      // numeric-literal lat/lng = a hardcoded fake point (a `lat: number` TS
      // type or `coord.lat` access is fine).
      expect(src).not.toMatch(/\blat\b\s*:\s*-?\d/i);
      expect(src).not.toMatch(/\blng\b\s*:\s*-?\d/i);
    });
  }
});

describe("layers are real or absent — never a 'coming soon' catalogue", () => {
  const world = read(WORLD);
  it("static layers are offered only when their entry exists", () => {
    expect(world).toMatch(/STATIC_LAYER_ORDER\.filter\(\(k\) => staticLayers\?\.\[k\]\)/);
  });
  it("no disabled future-layer chips", () => {
    expect(world).not.toMatch(/aria-disabled="true"|map-layers-future/);
  });
});

describe("the feedback control does not obstruct the map", () => {
  /**
   * THIS USED TO REQUIRE THE FEATURE TO BE MISSING HERE.
   *
   * The feedback trigger floated over the page, so on a map-first surface it
   * covered the controls — and the fix was to render nothing at all on this
   * route. That guard then PINNED the hole: reporting a problem was impossible
   * on the map, and the assertion said that was correct.
   *
   * The trigger lives in the account menu now and covers nothing anywhere, so
   * the exception is gone and the map keeps the feature. What is pinned is the
   * property the route-exception was crudely approximating: nothing floats over
   * this surface.
   */
  it("no floating control is rendered over the map, and reporting still works here", () => {
    const w = read("components/app/language-feedback-widget.tsx");
    // No resting floating trigger at all — so no route needs an exception.
    expect(w).not.toMatch(/className="fixed right-3/);
    // …and specifically no market-map opt-out remains.
    expect(w).not.toMatch(/market-map[\s\S]{0,80}return null/);
  });
});

describe("marker labels exist in every active locale", () => {
  for (const loc of ACTIVE_LOCALES) {
    const m = JSON.parse(read(`messages/${loc}.json`));
    it(`${loc}: marker labels exist`, () => {
      expect(m.marketMap.markerYou).toBeTruthy();
      expect(m.marketMap.markerCompany).toBeTruthy();
      expect(m.marketMap.markerAvail?.available).toBeTruthy();
    });
  }
});
