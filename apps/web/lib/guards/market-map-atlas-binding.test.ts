import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MAP_LAYER_KINDS } from "@/lib/work-market/atlas";
import { canDrawMarker } from "@/lib/work-market/map-layers";

/**
 * Live Market Map atlas binding guard (full-completion train PR 5).
 *
 * The market map's layer taxonomy is bound to the Work Market Atlas (#427) and
 * stays SIGNAL-ONLY: a marker only ever appears for verified coordinates. No
 * fake markers, no lat/lng, no external map API.
 */

const ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const shell = read("components/app/market-map-shell.tsx");

describe("market map binds the atlas layer model", () => {
  it("imports the atlas map-layer kinds + map-eligible categories", () => {
    expect(shell).toMatch(/MAP_LAYER_KINDS/);
    expect(shell).toMatch(/mapEligibleCategories/);
  });
  it("renders an atlas-layers section with every atlas layer kind", () => {
    expect(shell).toMatch(/data-testid="market-map-atlas-layers"/);
    expect(shell).toMatch(/data-testid="market-map-atlas-kinds"/);
    expect(shell).toMatch(/atlas\.kind\.\$\{kind\}/);
  });
});

describe("map stays signal-only — no fake markers", () => {
  it("the shell plots no markers/coordinates/lat-lng (foundation honesty)", () => {
    expect(shell).not.toMatch(/markers?\s*[:=]\s*\[/i);
    expect(shell).not.toMatch(/coordinates\s*[:=]\s*\[/i);
    expect(shell).not.toMatch(/\blat\b\s*[:=].*\blng\b/i);
    expect(shell).not.toMatch(/mapbox|google[^\n]*maps/i);
  });
  it("a marker can be drawn ONLY for verified coordinates", () => {
    expect(canDrawMarker("country")).toBe(false);
    expect(canDrawMarker("city")).toBe(false);
    expect(canDrawMarker("verified_coordinates")).toBe(true);
  });
});

describe("atlas layer copy exists in every active locale", () => {
  for (const loc of ["lt", "en", "ru"] as const) {
    it(`${loc}: marketMap.atlas has title + signalOnlyNote + every kind`, () => {
      const a = JSON.parse(read(`messages/${loc}.json`)).marketMap.atlas;
      expect(a?.title && a?.intro && a?.signalOnlyNote).toBeTruthy();
      for (const k of MAP_LAYER_KINDS) {
        expect(a.kind?.[k], `${loc} atlas.kind.${k}`).toBeTruthy();
      }
    });
    it(`${loc}: signal-only note is country/region-level and not "fake"-framed`, () => {
      const txt = (JSON.parse(read(`messages/${loc}.json`)).marketMap.atlas.signalOnlyNote as string).toLowerCase();
      // Country/region-level honesty (a real country signal IS real)...
      expect(/country|region|šali|regio|стран|регио/.test(txt)).toBe(true);
      // ...and never the banned "fake"/netikr/фальшив framing.
      expect(/\bfake\b|netikr|фальшив/.test(txt)).toBe(false);
    });
  }
});
