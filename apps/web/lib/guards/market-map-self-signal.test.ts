import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { VISIBLE_PRIMARY_NAV_ITEMS } from "../config/navigation";

/**
 * Market Map owner-signal + reachability guard.
 *
 * The logged-in user sees their OWN signals on the one shared market map (via
 * the #459 owner read layer). No "preparing / ruošiama" framing.
 *
 * IA cleanup v2: the map is no longer a top-level nav tab — the compact global
 * nav is Mano erdvė / Marketplace / Žinutės / Nustatymai (+ Admin). The map is
 * still ACTIVE and is reached as a sub-surface from the Marketplace hub. This
 * guard now asserts (a) market_map stays active with its canonical route and
 * (b) the Marketplace hub links to it — so the surface never becomes
 * unreachable. (Detailed owner-view category/privacy assertions live in
 * market-map-ui-wiring-v1; this guard owns reachability + copy honesty.)
 */

const ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

const ACTIVE_LOCALES = ["lt", "en", "ru"] as const;

describe("market map stays active and reachable from the marketplace hub", () => {
  it("market_map is NOT a top-level nav tab (compact nav, IA cleanup v2)", () => {
    const item = VISIBLE_PRIMARY_NAV_ITEMS.find((i) => i.id === "market_map");
    expect(item, "market_map must not be a primary nav tab anymore").toBeFalsy();
  });

  it("both nav surfaces render the catalogue-driven items (desktop + mobile)", () => {
    const tabs = read("components/app/dashboard-tabs.tsx");
    const bottom = read("components/app/bottom-nav.tsx");
    expect(tabs).toMatch(/VISIBLE_PRIMARY_NAV_ITEMS/);
    expect(bottom).toMatch(/VISIBLE_PRIMARY_NAV_ITEMS/);
    expect(bottom).toMatch(/map:\s*MapIcon/);
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
    const hub = read("app/[locale]/dashboard/marketplace/page.tsx");
    expect(hub).toMatch(/\/dashboard\/market-map/);
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
