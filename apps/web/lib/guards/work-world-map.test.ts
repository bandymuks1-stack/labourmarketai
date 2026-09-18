import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guard: the Map states WHERE-precision with the work-world grammar —
 * COUNTRY ≠ CITY ≠ ADDRESS ≠ UNKNOWN on every world row — on the ONE
 * canonical map (/dashboard/market-map), never a second map.
 */
const root = resolve(__dirname, "..", "..");
const read = (rel: string) => readFileSync(resolve(root, rel), "utf8");
const WORLD = read("components/app/market-map/world-discovery.tsx");
const PRIM = read("components/app/work-world/primitives.tsx");

describe("Guard: the Map states place precision (MAP_REACHABLE + no inferred precision)", () => {
  it("every world row wears the PlacePrecision chip from the row's own precision", () => {
    expect(WORLD).toContain('from "@/components/app/work-world/primitives"');
    expect(WORLD).toMatch(/<PlacePrecision kind=\{c\.precision\} label=\{t\(`precision\.\$\{c\.precision\}`\)\}/);
  });

  it("a country-only position is dashed, never the stated-place colour", () => {
    expect(PRIM).toMatch(/country:\s*"text-text-secondary border-dashed/);
    expect(PRIM).toMatch(/city:\s*"text-brand-cyan/);
    expect(PRIM).toMatch(/unknown:\s*"text-text-muted border-dashed border-border-subtle",\n\};\n\n\/\*\* The place-precision chip/);
  });

  it("the precision labels are translated in every routed locale and never inferred as an address", () => {
    const en = JSON.parse(read("messages/en.json")).marketMap.world.precision as Record<string, string>;
    expect(Object.keys(en).sort()).toEqual(["city", "country"]);
    for (const loc of ["lt", "ru", "de", "nl"]) {
      const p = JSON.parse(read(`messages/${loc}.json`)).marketMap.world.precision as Record<string, string>;
      for (const k of ["city", "country"]) {
        expect(p[k], `${loc}.${k}`).toBeTruthy();
        expect(p[k], `${loc}.${k} is still English`).not.toBe(en[k]);
      }
    }
  });

  it("the world still mounts the ONE canonical map and no other", () => {
    expect(WORLD).toMatch(/<MarketMap\b/);
    expect(WORLD).not.toMatch(/leaflet|mapbox|maplibre/i);
  });
});
