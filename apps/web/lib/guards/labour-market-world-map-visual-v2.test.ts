import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Labour Market World Map Visual v2 guard (PR #481) — the world view is a
 * map-like canvas with routes + a mobile path, not a card grid; reuses the real
 * zone model; no fake coordinates/markers; the Google Maps notice is a secondary
 * layer below the world view (no broken first impression).
 */
const ROOT = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");
const comp = read("components/app/labour-market-world-map.tsx");
const page = read("app/[locale]/dashboard/market-map/page.tsx");

describe("world map v2 — map canvas + routes + mobile path", () => {
  it("has a desktop map canvas and a decorative routes svg", () => {
    expect(comp).toMatch(/data-testid="world-map-canvas"/);
    expect(comp).toMatch(/data-testid="world-map-routes"/);
    expect(comp).toMatch(/<svg[\s\S]*?aria-hidden/);
  });
  it("has a mobile vertical map path", () => {
    expect(comp).toMatch(/data-testid="world-map-path"/);
  });
  it("positions zones on the canvas (radial layout, not a card grid)", () => {
    expect(comp).toMatch(/const POS\b/);
    expect(comp).toMatch(/profileHub:\s*\{\s*x:\s*50,\s*y:\s*50\s*\}/);
    // node position applied via template percentage (no hardcoded geo coords)
    expect(comp).toMatch(/left:\s*`\$\{POS\[/);
  });
  it("no fake map markers / coordinates / external map api", () => {
    expect(comp).not.toMatch(/google\.maps|AdvancedMarkerElement|new\s+\w*Marker|\[\s*\{\s*lat:/);
  });
  it("no living/gyvas/живой wording", () => {
    expect(comp.replace(/\/\*[\s\S]*?\*\//g, " ")).not.toMatch(/living|gyvas|живой/i);
  });
});

describe("market-map page — canonical coordinate map leads, world view is secondary", () => {
  // Updated for the owner-smoke follow-up (PR #490): the canonical provider-free
  // coordinate map (<MarketMapBase>) must now be the FIRST impression; the
  // conceptual world overview is a secondary surface mounted below it. (Full
  // ordering is covered by lib/guards/market-map-canonical.test.ts.)
  it("mounts the canonical coordinate map before the world overview", () => {
    const wm = page.indexOf("<LabourMarketWorldMap");
    const base = page.indexOf("<MarketMapBase");
    expect(wm).toBeGreaterThan(-1);
    expect(base).toBeGreaterThan(-1);
    expect(base).toBeLessThan(wm);
  });
});