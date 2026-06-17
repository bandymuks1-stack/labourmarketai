import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { VISIBLE_PRIMARY_NAV_ITEMS } from "../config/navigation";

/**
 * Market Map SELF-SIGNAL + primary-nav guard (unified market map handoff, P0).
 *
 * The logged-in user must be able to SEE THEMSELVES on the one shared market
 * map — a real country-level worker/company signal or a real
 * location-completion action — and the map must be a first-class primary-nav
 * route (desktop tabs + mobile bottom nav). No fake markers, no coordinates,
 * no "preparing / ruošiama" framing.
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
    // The mobile nav needs a concrete icon for the map tab.
    expect(bottom).toMatch(/map:\s*MapIcon/);
  });

  it("the feature catalogue marks market_map active + primary-nav-safe", () => {
    const cat = read("lib/config/feature-availability.ts");
    expect(cat).toMatch(/key:\s*"market_map"/);
    expect(cat).toMatch(/primaryRoute:\s*"\/dashboard\/market-map"/);
  });
});

describe("the shell renders the logged-in user's self-signal", () => {
  const shell = read("components/app/market-map-shell.tsx");

  it("fetches the self-signal board and renders the self-signal panel", () => {
    expect(shell).toMatch(/getOwnSelfSignals/);
    expect(shell).toMatch(/MarketMapSelfSignal/);
  });
});

describe("self-signal is real, country-level, and never a fake marker", () => {
  const src = read("lib/market-map/self-signal.ts");
  const ui = read("components/app/market-map-self-signal.tsx");

  it("reads the caller's own profile / worker / company rows", () => {
    expect(src).toMatch(/from\("profiles"\)/);
    expect(src).toMatch(/from\("workers"\)/);
    expect(src).toMatch(/from\("companies"\)/);
    // Scoped to the authenticated user — no cross-user reads.
    expect(src).toMatch(/auth\.getUser/);
  });

  it("emits NO coordinates / lat-lng (signal-only, country level)", () => {
    for (const s of [src, ui]) {
      expect(s).not.toMatch(/\blatitude\b|\blongitude\b/);
      expect(s).not.toMatch(/\blat\b\s*[:=].*\blng\b/i);
      expect(s).not.toMatch(/mapbox|google[^\n]*maps/i);
    }
  });

  it("offers a real location-completion action when no country is set", () => {
    expect(ui).toMatch(/hasLocation/);
    expect(ui).toMatch(/\/dashboard\/profile/);
    expect(ui).toMatch(/\/dashboard\/company/);
    expect(ui).toMatch(/addLocationCta/);
  });
});

describe("market map carries the self-signal copy and no 'preparing' framing", () => {
  for (const locale of ACTIVE_LOCALES) {
    const m = JSON.parse(read(`messages/${locale}.json`));
    it(`${locale}: marketMap.selfSignal keys exist`, () => {
      const s = m.marketMap?.selfSignal;
      expect(s, `${locale} selfSignal block`).toBeTruthy();
      for (const k of [
        "title",
        "note",
        "workerLabel",
        "companyLabel",
        "countryLevel",
        "selfDeclared",
        "workerMissingBody",
        "companyMissingBody",
        "addLocationCta",
      ]) {
        expect(s[k], `${locale} selfSignal.${k}`).toBeTruthy();
      }
    });

    it(`${locale}: no leftover 'preparing' token + subtitle isn't 'being prepared'`, () => {
      // The unused banned-token key is gone.
      expect(m.marketMap.preparing).toBeUndefined();
      // The subtitle must not read as "being prepared".
      expect(String(m.marketMap.subtitle)).not.toMatch(
        /ruošiam|готовится|being prepared/i,
      );
    });

    it(`${locale}: market_map nav tab label exists`, () => {
      expect(m.auth.dashboard.tabs.marketMap).toBeTruthy();
    });
  }
});
