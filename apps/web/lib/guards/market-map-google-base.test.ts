import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Market-map Google base + no-fake-markers guard (v2 — real locator).
 *
 * The base map TILES are real Google Maps (allowed). The signed-in user's OWN
 * location IS a real marker (placed only after they press "use my location" or
 * type a place) — that is honest, consent-gated data, not a fake/sample point.
 * What stays forbidden: arrays of sample coordinates, imported placeholder
 * marker data, and any raw API/env-key string reaching the user. The browser
 * key is env-gated, optional, and never committed; with no key the screen falls
 * back to an honest, non-technical manual-entry state.
 *
 * Pure source + i18n assertions. Invents nothing.
 */
const ROOT = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");
const base = read("components/app/market-map-base.tsx");
const loader = read("lib/maps/google-maps-loader.ts");
const page = read("app/[locale]/dashboard/market-map/page.tsx");
const env = read("lib/env.ts");

describe("real Google Maps base, honestly config-gated", () => {
  it("loads the real Google Maps JS API (not fake tiles)", () => {
    expect(loader).toMatch(/maps\.googleapis\.com\/maps\/api\/js/);
  });
  it("reads the browser key from env, declared OPTIONAL (honest fallback)", () => {
    expect(base).toMatch(/NEXT_PUBLIC_GOOGLE_MAPS_API_KEY/);
    expect(env).toMatch(/NEXT_PUBLIC_GOOGLE_MAPS_API_KEY:\s*z[\s\S]{0,40}\.optional\(\)/);
  });
  it("renders an honest, non-technical fallback when no key / load fails", () => {
    expect(base).toMatch(/data-testid="market-map-base-fallback"/);
    expect(base).toMatch(/fallbackBody/);
  });
  it("is mounted on the canonical /dashboard/market-map route", () => {
    expect(page).toMatch(/<MarketMapBase\b/);
  });
});

describe("no fake markers / sample coordinates / placeholder data", () => {
  it("does not import placeholder/sample marker data", () => {
    expect(base).not.toMatch(/content\/placeholders|geoPayloads|getMarketPanel/);
  });
  it("creates markers only via the shared loader helper (no inline fake markers)", () => {
    // The component must not new-up Google marker classes directly with literals;
    // it routes the user's own point through setSelfMarker().
    expect(base).not.toMatch(/new\s+(?:google\.maps\.|window\.google\.maps\.)?Marker\(/);
    expect(base).toMatch(/setSelfMarker/);
  });
  it("contains no array of sample coordinate objects", () => {
    expect(base).not.toMatch(/\[\s*\{\s*lat:/);
    expect(loader).not.toMatch(/\[\s*\{\s*lat:/);
  });
  it("shows an honest empty state until the user picks a location", () => {
    expect(base).toMatch(/data-testid="market-map-base-empty"/);
    expect(base).toMatch(/emptyBody/);
  });
});

describe("privacy + secret safety", () => {
  it("never renders an exact street/home address", () => {
    expect(base).not.toMatch(/home address|exact address|street[_ ]?address/i);
  });
  it("hardcodes no Google API key literal (no AIza... prefix)", () => {
    expect(base).not.toMatch(/AIza[0-9A-Za-z_-]{10,}/);
    expect(loader).not.toMatch(/AIza[0-9A-Za-z_-]{10,}/);
    expect(env).not.toMatch(/AIza[0-9A-Za-z_-]{10,}/);
  });
  it("no old LABMA wording", () => {
    expect(base).not.toMatch(/\bLABMA\b/);
  });
});

describe("base-map copy present in active locales (lt/en/ru)", () => {
  for (const loc of ["lt", "en", "ru"] as const) {
    it(`${loc}: marketMapBase copy exists and is non-empty`, () => {
      const b = JSON.parse(read(`messages/${loc}.json`)).marketMapBase;
      for (const k of ["ariaLabel", "configNeededTitle", "configNeededBody", "emptyBody", "error", "fallbackBody"]) {
        expect(typeof b?.[k] === "string" && b[k].length > 0, `${loc} base.${k}`).toBe(true);
      }
    });
  }
});