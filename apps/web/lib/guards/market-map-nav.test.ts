import { describe, expect, it } from "vitest";
import { isCanonicallyRedirected } from "./canonical-redirects";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { WORKER_TABS } from "../today/today-route";

/**
 * Market Map first-class navigation guard.
 *
 * The market map must be a clear first-class choice for a logged-in user —
 * embedded in the worker's PASAULIS tab, linked in full from that tab's map
 * header, and offered by the universal command search — with LT/EN/RU labels
 * and no fake markers. (W3 Package 4 deleted the second dashboard and its
 * IdentityActions tiles; the catalogue nav tab renders only in the admin
 * chrome, so it is NOT a door for real users — see the first test.)
 */

const ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

describe("market map is exposed in the primary nav + opportunities", () => {
  const opportunities = read("app/[locale]/dashboard/opportunities/page.tsx");

  it("the PASAULIS tab destination embeds the geographic map and links the full map before any disclosure", () => {
    // Honest door (R-11 reclassification, 2026-09-19). The catalogue's
    // primary nav tabs (VISIBLE_PRIMARY_NAV_ITEMS) render only in the admin
    // `full` chrome (dashboard-chrome.tsx: modeFor → "full" = /dashboard/admin
    // only), so "market_map is a primary nav tab" proved nothing for a real
    // user — the earlier version of this test was a reachability proof that
    // could not fail while the tab was invisible to everyone but an admin.
    // What a worker really walks: PASAULIS (WORKER_TABS.world →
    // /dashboard/opportunities) embeds WorldDiscovery — THE WORLD layer — in
    // a top-level section, and the map header links the full
    // /dashboard/market-map page. Both sit BEFORE the first collapsed
    // <details>, i.e. one tap from the tab bar at every width.
    const world = WORKER_TABS.find((t) => t.id === "world");
    expect(world?.href).toBe("/dashboard/opportunities");
    const mapSection = opportunities.indexOf('data-testid="opportunities-map"');
    const fullMapLink = opportunities.indexOf('data-testid="opportunities-map-full-link"');
    const firstDetails = opportunities.indexOf("<details");
    expect(mapSection, "embedded map section").toBeGreaterThan(-1);
    expect(fullMapLink, "top-level full-map link").toBeGreaterThan(-1);
    expect(firstDetails, "a collapsed disclosure exists further down").toBeGreaterThan(-1);
    expect(mapSection).toBeLessThan(firstDetails);
    expect(fullMapLink).toBeLessThan(firstDetails);
    expect(opportunities).toMatch(/<WorldDiscovery[\s\S]*?mapMode="result"/);
  });

  it("the universal command search offers the map before any typing, at every width", () => {
    // Second honest door: the top-bar search renders on every width and lists
    // `market_map` as a starter command with an empty input.
    const finder = read("components/app/command-finder.tsx");
    expect(finder).toMatch(/STARTER_COMMAND_IDS[^;]*"market_map"/);
  });

  it("the secondary marketplace route redirects to the map (no competing surface)", () => {
    // W1: same intent, new mechanism — the redirect lives in next.config.
    expect(isCanonicallyRedirected("/dashboard/marketplace", "/dashboard/market-map")).toBe(true);
  });

  it("the opportunities surface links to the market map", () => {
    expect(opportunities).toMatch(/opportunities-market-map-link/);
    expect(opportunities).toMatch(/\/dashboard\/market-map/);
  });
});

describe("market map labels exist in every active locale", () => {
  // W3 Package 4 removed the identityActions namespace with the second
  // dashboard; the opportunities door keeps the canonical label.
  const expected = { lt: "Rinkos žemėlapis", en: "Market map", ru: "Карта рынка" };
  for (const loc of ["lt", "en", "ru"] as const) {
    const m = JSON.parse(read(`messages/${loc}.json`));
    it(`${loc}: opportunities marketMapLink label present`, () => {
      expect(m.opportunities.marketMapLink).toBe(expected[loc]);
    });
  }
});

describe("no fake markers on the map (signal-only)", () => {
  const shell = read("components/app/market-map-shell.tsx");
  it("the shell plots no markers/coordinates/lat-lng/external map", () => {
    expect(shell).not.toMatch(/markers?\s*[:=]\s*\[/i);
    expect(shell).not.toMatch(/coordinates\s*[:=]\s*\[/i);
    expect(shell).not.toMatch(/\blat\b\s*[:=].*\blng\b/i);
    expect(shell).not.toMatch(/mapbox|google[^\n]*maps/i);
  });
});
