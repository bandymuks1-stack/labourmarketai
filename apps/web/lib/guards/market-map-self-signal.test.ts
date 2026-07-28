import { describe, expect, it } from "vitest";
import { isCanonicallyRedirected } from "./canonical-redirects";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { VISIBLE_PRIMARY_NAV_ITEMS } from "../config/navigation";

/**
 * Market Map owner-signal + reachability guard.
 *
 * The logged-in user sees their OWN signals on the one shared market map (via
 * the #459 owner read layer). No "preparing / ruošiama" framing.
 *
 * Map-first IA: the map is its OWN primary product surface — the "Žemėlapis"
 * global nav tab routes directly to /dashboard/market-map. This guard asserts
 * (a) market_map is a visible primary nav item with its canonical route and
 * (b) it stays active. (Detailed owner-view category/privacy assertions live in
 * market-map-ui-wiring-v1; this guard owns reachability + copy honesty.)
 */

const ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

const ACTIVE_LOCALES = ["lt", "en", "ru"] as const;

describe("market map is the primary 'Žemėlapis' nav surface", () => {
  it("market_map is a visible primary nav item → /dashboard/market-map", () => {
    const item = VISIBLE_PRIMARY_NAV_ITEMS.find((i) => i.id === "market_map");
    expect(item, "market_map must be a primary nav tab").toBeTruthy();
    expect(item?.href).toBe("/dashboard/market-map");
  });

  it("both nav surfaces render the catalogue-driven items (desktop + mobile)", () => {
    const tabs = read("components/app/dashboard-tabs.tsx");
    const bottom = read("components/app/bottom-nav.tsx");
    expect(tabs).toMatch(/getAdvancedNavItems|VISIBLE_PRIMARY_NAV_ITEMS/);
    expect(bottom).toMatch(/getAdvancedNavItems|VISIBLE_PRIMARY_NAV_ITEMS/);
    expect(bottom).toMatch(/map:\s*MapPin/); // audit PR8: one icon per destination
  });

  it("the feature catalogue keeps market_map ACTIVE with its canonical route", () => {
    const cat = read("lib/config/feature-availability.ts");
    expect(cat).toMatch(/key:\s*"market_map"/);
    expect(cat).toMatch(/primaryRoute:\s*"\/dashboard\/market-map"/);
    // Active (not preparing/hidden) so it stays a real, reachable surface.
    expect(cat).toMatch(
      /key:\s*"market_map",[\s\S]{0,120}availability:\s*"active"/,
    );
  });

  it("the Marketplace hub links to the market map (reachability)", () => {
    expect(isCanonicallyRedirected("/dashboard/marketplace", "/dashboard/market-map")).toBe(true);
  });
});

describe("the shell renders the owner's signals via the read layer", () => {
  const shell = read("components/app/market-map-shell.tsx");
  it("fetches the owner read layer and renders the owner-signals panel", () => {
    expect(shell).toMatch(/getOwnMarketSignals/);
    expect(shell).toMatch(/MarketMapMySignals/);
  });
  it("there is no leftover self-signal panel (single owner architecture)", () => {
    expect(shell).not.toMatch(/MarketMapSelfSignal|getOwnSelfSignals/);
  });
});

describe("market map copy carries no 'preparing' framing", () => {
  for (const locale of ACTIVE_LOCALES) {
    const m = JSON.parse(read(`messages/${locale}.json`));
    it(`${locale}: no 'preparing' key + subtitle isn't 'being prepared'`, () => {
      expect(m.marketMap.preparing).toBeUndefined();
      expect(String(m.marketMap.subtitle)).not.toMatch(
        /ruošiam|готовится|being prepared/i,
      );
    });
    it(`${locale}: market_map nav tab label exists`, () => {
      expect(m.auth.dashboard.tabs.marketMap).toBeTruthy();
    });
    it(`${locale}: the retired selfSignal block is gone`, () => {
      expect(m.marketMap.selfSignal).toBeUndefined();
    });
  }
});
