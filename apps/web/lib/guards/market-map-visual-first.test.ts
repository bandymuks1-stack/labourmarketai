import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Market-map visual-first guard (admin-control-room-map-visual-v1).
 *
 * The map must communicate through the visual surface — the real provider map
 * (`MarketMapBase`) and the integrated layer legend (`MapLayersLegend`) — NOT
 * through long explanatory text below it. The explanatory surfaces (the signal
 * board `MarketMapShell` and the `LabourMarketWorldMap` overview) and the
 * capture tools must live INSIDE the collapsed "manage locations" panel, never
 * as the primary, always-on carrier of meaning.
 *
 * This codifies the spec rule: "the map itself shows the signals; legend
 * explains the symbols; cards open on demand; text below is minimal helper
 * text only, not the main explanation."
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

describe("market map — the visual surface leads, prose is secondary", () => {
  it("the real map + the integrated legend are ABOVE the collapsed panel (primary, always-on)", () => {
    expect(at("<MarketMapBase")).toBeLessThan(detailsAt);
    expect(at("<MapLayersLegend")).toBeLessThan(detailsAt);
  });

  it("the explanatory signal board + world overview are INSIDE the collapsed panel (never primary)", () => {
    expect(at("<MarketMapShell")).toBeGreaterThan(detailsAt);
    expect(at("<LabourMarketWorldMap")).toBeGreaterThan(detailsAt);
  });

  it("no explanatory prose surface sits between the map and the collapsed panel", () => {
    // Only the visual legend may appear between the map and the collapsed panel.
    // The heavy text surfaces (shell, world overview, readiness) must not lead.
    expect(at("<MarketMapShell")).toBeGreaterThan(detailsAt);
    expect(at("<LabourMarketWorldMap")).toBeGreaterThan(detailsAt);
    expect(at("<MarketMapOwnerReadiness")).toBeGreaterThan(detailsAt);
  });

  it("the collapsed panel LEADS with the functional capture tools, not the prose", () => {
    // Inside the panel: manage-locations capture comes before the signal board
    // and the world overview, so the panel reads as a tool, not an essay.
    expect(at("<MarketMapCapture")).toBeLessThan(at("<MarketMapShell"));
    expect(at("<MarketMapCapture")).toBeLessThan(at("<LabourMarketWorldMap"));
  });
});

describe("market map — the lead text is minimal helper text, not the explanation", () => {
  const LOCALES = ["en", "lt", "ru"] as const;
  for (const loc of LOCALES) {
    const lead: string = JSON.parse(read(`messages/${loc}.json`)).marketMap.pageLead;
    it(`${loc}: pageLead is short and carries no long colon-introduced explanation`, () => {
      // A minimal helper line — not a paragraph that the visual depends on.
      expect(lead.length, `pageLead too long in ${loc}: "${lead}"`).toBeLessThanOrEqual(80);
      // The old lead used a colon to dump "...: identity and real market signals".
      expect(lead, `pageLead should not carry a colon-introduced explanation in ${loc}`).not.toMatch(/:/);
    });
  }
});
