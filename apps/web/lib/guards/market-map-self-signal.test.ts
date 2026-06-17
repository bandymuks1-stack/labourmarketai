import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { VISIBLE_PRIMARY_NAV_ITEMS } from "../config/navigation";

/**
 * Market Map owner-signal + primary-nav guard.
 *
 * The logged-in user sees their OWN signals on the one shared market map (via
 * the #459 owner read layer), and the map is a first-class primary-nav route
 * (desktop tabs + mobile bottom nav). No "preparing / ruošiama" framing.
 * (Detailed owner-view category/privacy assertions live in
 * market-map-ui-wiring-v1; this guard owns the nav route + copy honesty.)
 */

const ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

const ACTIVE_LOCALES = ["lt", "en", "ru"] as const;

describe("market map is a first-class primary-nav route", () => {
  it("market_map is a visible primary nav item pointing at /dashboard/market-map", () => {
    const item = VISIBLE_PRIMARY_NAV_ITEMS.find((i) => i.id === "market_map");
    expect(item, "market_map must be a visible primary nav item").toBeTruthy();
    expect(item?.href).toBe("/dashboard/market-map");
  });

  it("both nav surfaces render the catalogue-driven items (desktop + mobile)", () => {
    const tabs = read("components/app/dashboard-tabs.tsx");
    const bottom = read("components/app/bottom-nav.tsx");
    expect(tabs).toMatch(/VISIBLE_PRIMARY_NAV_ITEMS/);
    expect(bottom).toMatch(/VISIBLE_PRIMARY_NAV_ITEMS/);
    expect(bottom).toMatch(/map:\s*MapIcon/);
  });

  it("the feature catalogue marks market_map active + primary-nav-safe", () => {
    const cat = read("lib/config/feature-availability.ts");
    expect(cat).toMatch(/key:\s*"market_map"/);
    expect(cat).toMatch(/primaryRoute:\s*"\/dashboard\/market-map"/);
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
