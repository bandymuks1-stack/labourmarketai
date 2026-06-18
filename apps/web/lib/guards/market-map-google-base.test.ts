import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Market-map Google base + no-fake-markers guard
 * (slice market-map-google-base-v1).
 *
 * The base map TILES are real Google Maps (allowed). Platform MARKERS must be
 * real-data-only or absent — never fake/sample/placeholder. The browser key is
 * env-gated and never committed; with no key the map shows an honest fallback.
 *
 * Pure source + i18n assertions. Invents nothing.
 */
const ROOT = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");
const base = read("components/app/market-map-base.tsx");
const page = read("app/[locale]/dashboard/market-map/page.tsx");
const env = read("lib/env.ts");

describe("real Google Maps base, honestly config-gated", () => {
  it("loads the real Google Maps JS API (not fake tiles)", () => {
    expect(base).toMatch(/maps\.googleapis\.com\/maps\/api\/js/);
  });
  it("reads the browser key from env, declared OPTIONAL (honest fallback)", () => {
    expect(base).toMatch(/NEXT_PUBLIC_GOOGLE_MAPS_API_KEY/);
    expect(env).toMatch(/NEXT_PUBLIC_GOOGLE_MAPS_API_KEY:\s*z[\s\S]{0,40}\.optional\(\)/);
  });
  it("renders an honest config-needed fallback when no key", () => {
    expect(base).toMatch(/data-testid="market-map-base-config-needed"/);
    expect(base).toMatch(/configNeededTitle/);
  });
  it("is mounted on the canonical /dashboard/market-map route", () => {
    expect(page).toMatch(/<MarketMapBase\b/);
  });
});

describe("no fake markers / sample coordinates / placeholder data", () => {
  it("does not import placeholder/sample marker data", () => {
    expect(base).not.toMatch(/content\/placeholders|geoPayloads|getMarketPanel/);
  });
  it("creates no map markers (no real consent-gated location data yet)", () => {
    expect(base).not.toMatch(/google\.maps\.Marker|AdvancedMarkerElement|\.setMap\(/);
  });
  it("contains no array of sample coordinate objects", () => {
    // a single viewport center object is allowed; arrays of lat/lng markers are not.
    expect(base).not.toMatch(/\[\s*\{\s*lat:/);
  });
  it("shows the honest empty state (markers appear only with real visibility)", () => {
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
    expect(env).not.toMatch(/AIza[0-9A-Za-z_-]{10,}/);
  });
  it("no old LABMA wording", () => {
    expect(base).not.toMatch(/\bLABMA\b/);
  });
});

describe("base-map copy present in active locales (lt/en/ru)", () => {
  for (const loc of ["lt", "en", "ru"] as const) {
    it(`${loc}: marketMap.base copy exists and is non-empty`, () => {
      const b = JSON.parse(read(`messages/${loc}.json`)).marketMapBase;
      for (const k of ["ariaLabel", "configNeededTitle", "configNeededBody", "emptyBody", "error"]) {
        expect(typeof b?.[k] === "string" && b[k].length > 0, `${loc} base.${k}`).toBe(true);
      }
    });
  }
});