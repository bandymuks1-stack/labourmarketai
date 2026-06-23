import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  RADIUS_OPTIONS,
  DEFAULT_RADIUS_KM,
  isUsableForSearch,
  type SelectedLocation,
} from "@/lib/location/location-model";

/**
 * Provider-free location guard (PR #484 owner redirect).
 *
 * The location feature must work with NO Google Maps, NO paid provider, and NO
 * external geocoding/tile service: automatic browser geolocation first, manual
 * country/city/region/radius fallback, a no-tile location panel, and structured
 * location that drives job search without a provider key. No raw provider/API/
 * env text may reach users; no fake map-ready state.
 */
const ROOT = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");
const comp = read("components/app/market-map-base.tsx");
const env = read("lib/env.ts");

describe("no Google Maps / paid-provider dependency", () => {
  it("the Google Maps loader is gone", () => {
    expect(existsSync(join(ROOT, "lib/maps/google-maps-loader.ts"))).toBe(false);
  });
  it("the component imports no map provider and no Google key", () => {
    expect(comp).not.toMatch(/google-maps-loader|googleapis|google\.maps/i);
    expect(comp).not.toMatch(/NEXT_PUBLIC_GOOGLE_MAPS_API_KEY|GOOGLE_MAPS_API_KEY/);
    expect(comp).not.toMatch(/mapbox|maplibre|leaflet|nominatim|tile\.openstreetmap/i);
  });
  it("env.ts no longer declares a Google Maps key", () => {
    expect(env).not.toMatch(/GOOGLE_MAPS/);
  });
});

describe("automatic geolocation path exists (first)", () => {
  it("requests the browser location and exposes the primary action", () => {
    expect(comp).toMatch(/navigator\.geolocation\.getCurrentPosition/);
    expect(comp).toMatch(/data-testid="map-locator-auto"/);
  });
});

describe("manual fallback path exists (country + region + radius)", () => {
  it("has country, city/region and radius inputs + save", () => {
    expect(comp).toMatch(/data-testid="map-locator-country"/);
    expect(comp).toMatch(/data-testid="map-locator-region"/);
    expect(comp).toMatch(/data-testid="map-locator-radius"/);
    expect(comp).toMatch(/data-testid="map-locator-manual-submit"/);
  });
  it("opens the manual form automatically when geolocation is denied", () => {
    expect(comp).toMatch(/setManualOpen\(true\)/);
  });
});

describe("provider-free, usable without any key", () => {
  it("radius options are 10/25/50/100 with a sensible default", () => {
    expect([...RADIUS_OPTIONS]).toEqual([10, 25, 50, 100]);
    expect(RADIUS_OPTIONS).toContain(DEFAULT_RADIUS_KM);
  });
  it("auto coords AND manual country-only are both usable for search", () => {
    const auto: SelectedLocation = { source: "auto", lat: 54.6, lng: 25.2, country: null, region: null, address: null, radiusKm: 25, savedAt: 1 };
    const manual: SelectedLocation = { source: "manual", lat: null, lng: null, country: "LT", region: "Vilnius", address: null, radiusKm: 25, savedAt: 1 };
    const empty: SelectedLocation = { source: "manual", lat: null, lng: null, country: null, region: null, address: null, radiusKm: 25, savedAt: 1 };
    expect(isUsableForSearch(auto)).toBe(true);
    expect(isUsableForSearch(manual)).toBe(true);
    expect(isUsableForSearch(empty)).toBe(false);
  });
  it("persists the choice locally (this device), no DB/provider", () => {
    expect(comp).toMatch(/readSelectedLocation/);
    expect(comp).toMatch(/writeSelectedLocation/);
  });
});

describe("provider-free visual panel, no fake map-ready state", () => {
  it("renders an honest location panel, not external tiles", () => {
    expect(comp).toMatch(/data-testid="location-panel"/);
    expect(comp).not.toMatch(/maps\.googleapis\.com|tile\.openstreetmap\.org/);
  });
});

describe("no raw Google/API/env text in user-facing copy (lt/en/ru)", () => {
  const EXCLUDED = new Set(["admin", "adminReadiness", "agentOs"]);
  const FORBIDDEN: RegExp[] = [
    /NEXT_PUBLIC_[A-Z0-9_]+/,
    /\bGOOGLE_MAPS_API_KEY\b/,
    /Google Maps/i,
    /\bAPI key missing\b/i,
    /process\.env/,
  ];
  function leaves(node: unknown, prefix: string, out: [string, string][]): void {
    if (typeof node === "string") out.push([prefix, node]);
    else if (Array.isArray(node)) node.forEach((v, i) => leaves(v, `${prefix}[${i}]`, out));
    else if (node && typeof node === "object")
      for (const [k, v] of Object.entries(node as Record<string, unknown>))
        leaves(v, prefix ? `${prefix}.${k}` : k, out);
  }
  for (const loc of ["lt", "en", "ru"] as const) {
    it(`${loc}: no provider/env strings in product copy`, () => {
      const m = JSON.parse(read(`messages/${loc}.json`)) as Record<string, unknown>;
      const offenders: string[] = [];
      for (const [ns, node] of Object.entries(m)) {
        if (EXCLUDED.has(ns)) continue;
        const out: [string, string][] = [];
        leaves(node, ns, out);
        for (const [k, v] of out) if (FORBIDDEN.some((re) => re.test(v))) offenders.push(`${k}: "${v}"`);
      }
      expect(offenders, `${loc} leaks provider/env text:\n${offenders.join("\n")}`).toEqual([]);
    });
  }
});

describe("marketMapBase copy is provider-free + complete (lt/en/ru)", () => {
  for (const loc of ["lt", "en", "ru"] as const) {
    it(`${loc}: has the provider-free keys`, () => {
      const b = JSON.parse(read(`messages/${loc}.json`)).marketMapBase;
      for (const k of ["autoButton", "manualToggle", "countryLabel", "regionLabel", "radiusLabel", "radiusValue", "savedLocally", "usableNote", "sourceAuto", "sourceManual"]) {
        expect(typeof b?.[k] === "string" && b[k].length > 0, `${loc} ${k}`).toBe(true);
      }
    });
  }
});