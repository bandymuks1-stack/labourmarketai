import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Market map — honest person-signal state guard (Core Product Sprint Train v2,
 * Wagon 5), restated for the ONE canonical map.
 *
 * The map must not overstate the user's market presence. The original defect
 * was a legend row hard-coded to "active" for a brand-new user with no saved
 * location. That legend (the "unified layers panel") was removed with the other
 * explanatory blocks; the honesty rule now holds BY CONSTRUCTION in the map
 * itself: the own marker + radius are drawn ONLY when a real location exists
 * (a saved selection that resolves to a coordinate) — otherwise nothing is
 * drawn, and the control bar offers the one-tap way to add a location.
 */

const ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const PAGE = "app/[locale]/dashboard/market-map/page.tsx";
const LAYER = "components/app/market-map/own-location-layer.ts";
const CONTROLS = "components/app/market-map/map-location-controls.tsx";

describe("the own marker reflects real saved-location state only", () => {
  const layer = read(LAYER);
  const controls = read(CONTROLS);

  it("draws nothing without a resolvable coordinate", () => {
    expect(layer).toMatch(/const \{ point, zoom \} = ownPointFor\(overlay\.selected\);\s*\n\s*if \(!point\) return null;/);
  });

  it("a marker is never invented — no unconditional own row on the page", () => {
    const page = read(PAGE);
    expect(page).not.toMatch(/state:\s*"active"/);
    expect(page).not.toMatch(/personSignal|personIncomplete/);
  });

  it("with no saved location the controls say how to add one (a tap hint, not a claim)", () => {
    expect(controls).toMatch(/data-testid="location-map-tap-hint"/);
    expect(controls).toMatch(/s\.selected \? \(/);
  });
});

describe("the removed legend copy is gone from every active locale", () => {
  for (const loc of ["lt", "en", "ru"] as const) {
    it(`${loc}: no mapLayers namespace (the overstating legend)`, () => {
      const m = JSON.parse(read(`messages/${loc}.json`)) as { mapLayers?: unknown };
      expect(m.mapLayers).toBeUndefined();
    });
  }
});
