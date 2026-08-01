/**
 * Guard — global country/location/map model (PR-G).
 *
 * The product serves ALL ISO countries; Georgia (GE) and the USA (US) are
 * first-class markets. This guard makes the de-Lithuania-defaulting permanent:
 *   (a) GE and US are ACTIVE_MARKETS;
 *   (b) NO silent "LT" fallback in market-map capture, the onboarding wizard,
 *       or the company setup form (source-scanned);
 *   (c) the live market map defaults to a WORLD view when nothing is selected
 *       (source-scanned constants);
 *   (d) every ISO country resolves a country centroid.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { ACTIVE_MARKETS, MARKET_COUNTRIES, isMarketCountry } from "@/lib/taxonomy/work-categories";
import { ALL_ISO_COUNTRIES, isIsoCountry } from "@/lib/location/country-model";
import { COUNTRY_CENTROID, resolveLocation } from "@/lib/location/city-coordinates";

const APP = join(__dirname, "..", "..");

function read(rel: string): string {
  return readFileSync(join(APP, rel), "utf8");
}
/** Strip comments so a prose mention of "LT" can't trip the scans. */
function strip(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
}

describe("(a) GE and US are first-class ACTIVE_MARKETS", () => {
  it("ACTIVE_MARKETS contains GE and US and only ISO codes", () => {
    expect(ACTIVE_MARKETS).toContain("GE");
    expect(ACTIVE_MARKETS).toContain("US");
    for (const c of ACTIVE_MARKETS) expect(isIsoCountry(c), `${c} is ISO`).toBe(true);
  });

  it("back-compat: MARKET_COUNTRIES aliases ACTIVE_MARKETS and isMarketCountry accepts US", () => {
    expect(MARKET_COUNTRIES).toEqual(ACTIVE_MARKETS);
    expect(isMarketCountry("US")).toBe(true);
    expect(isMarketCountry("GE")).toBe(true);
    expect(isMarketCountry("ZZ")).toBe(false);
  });

  it("every ACTIVE_MARKET has a localized name in the countryNames catalogue (all locales)", () => {
    const locales = ["lt", "en", "ru", "de", "pl", "nl", "da", "no", "sv", "fi", "et", "lv"];
    for (const locale of locales) {
      const catalogue = JSON.parse(
        read(join("messages", locale, "labour-market.json")),
      ) as { countryNames?: Record<string, string> };
      for (const code of ACTIVE_MARKETS) {
        expect(
          catalogue.countryNames?.[code]?.length ?? 0,
          `${locale} countryNames.${code}`,
        ).toBeGreaterThan(0);
      }
    }
  });
});

describe("(b) no silent 'LT' country default", () => {
  const SILENT_LT = /\?\?\s*["']LT["']|\|\|\s*["']LT["']/;

  it("market-map capture never defaults a country to LT", () => {
    const src = strip(read("lib/market-map/capture.ts"));
    expect(SILENT_LT.test(src)).toBe(false);
    // The honest replacement is present: a country-less first write is invalid.
    expect(src).toMatch(/missing_country/);
  });

  it("onboarding wizard has no pre-selected LT (placeholder + explicit choice)", () => {
    const src = strip(read("components/app/onboarding-wizard.tsx"));
    expect(SILENT_LT.test(src)).toBe(false);
    expect(src).not.toMatch(/useState<string>\(\s*["']LT["']\s*\)/);
    expect(src).toMatch(/country_placeholder/);
    expect(src).toMatch(/error_country_required/);
    expect(src).toMatch(/ACTIVE_MARKETS/);
  });

  it("company setup form has no LT fallback (placeholder + honest empty)", () => {
    const src = strip(read("components/app/company-setup-form.tsx"));
    expect(SILENT_LT.test(src)).toBe(false);
    expect(src).toMatch(/countryPlaceholder/);
  });
});

describe("(c) live market map defaults to a WORLD view", () => {
  it("DEFAULT_CENTER/DEFAULT_ZOOM are the world view, not a Europe crop", () => {
    const src = strip(read("components/app/market-map/location-map.tsx"));
    const center = src.match(/DEFAULT_CENTER[^=]*=\s*\[([^\]]+)\]/);
    const zoom = src.match(/DEFAULT_ZOOM\s*=\s*(\d+)/);
    expect(center, "DEFAULT_CENTER present").toBeTruthy();
    expect(zoom, "DEFAULT_ZOOM present").toBeTruthy();
    const [lat, lng] = center![1].split(",").map((s) => parseFloat(s.trim()));
    // World view: low zoom, centred near the equator/prime-meridian band —
    // NOT the old Baltic-region default ([56.5, 17], zoom 4).
    expect(parseInt(zoom![1], 10)).toBeLessThanOrEqual(2);
    expect(Math.abs(lat)).toBeLessThanOrEqual(40);
    expect(Math.abs(lng)).toBeLessThanOrEqual(40);
  });
});

describe("(d) every ISO country resolves a centroid", () => {
  it("COUNTRY_CENTROID covers the full ISO registry with in-range coordinates", () => {
    expect(ALL_ISO_COUNTRIES.length).toBe(249);
    for (const code of ALL_ISO_COUNTRIES) {
      const c = COUNTRY_CENTROID[code];
      expect(c, `${code} centroid`).toBeTruthy();
      expect(Number.isFinite(c.lat) && Math.abs(c.lat) <= 90, `${code} lat`).toBe(true);
      expect(Number.isFinite(c.lng) && Math.abs(c.lng) <= 180, `${code} lng`).toBe(true);
    }
  });

  it("a country-only selection resolves with honest 'country' precision — incl. GE and US", () => {
    for (const code of ["GE", "US", "JP", "BR", "ZA"]) {
      const r = resolveLocation({ country: code });
      expect(r.coord, `${code} coord`).toBeTruthy();
      expect(r.precision).toBe("country");
    }
    // Unknown stays honestly unset — never a guessed point.
    expect(resolveLocation({ country: "ZZ" }).precision).toBe("unset");
  });
});
