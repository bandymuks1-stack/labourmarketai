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
 * Real Market Map guard (owner-smoke follow-up, PR #490).
 *
 * Owner decision: the Market Map must use a REAL online map provider/tile layer
 * — not an SVG/coordinate-only locator. We use OpenStreetMap raster tiles via
 * Leaflet: a free provider that needs NO API key and NO secret. Google / Mapbox
 * and any provider key/secret remain forbidden (not approved). The location +
 * radius controls stay as controls ON the real map.
 */
const ROOT = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");
const comp = read("components/app/market-map-base.tsx");
const live = read("components/app/market-map-live.tsx");
const env = read("lib/env.ts");

describe("real provider map, no paid/secret provider", () => {
  it("the live map uses OpenStreetMap tiles via Leaflet (free, no key)", () => {
    expect(live).toMatch(/from "leaflet"/);
    expect(live).toMatch(/tile\.openstreetmap\.org/);
    expect(live).toMatch(/L\.tileLayer/);
  });
  it("shows the required OpenStreetMap attribution", () => {
    expect(live).toMatch(/attribution/);
    expect(live).toMatch(/OpenStreetMap/);
    expect(live).toMatch(/openstreetmap\.org\/copyright/);
  });
  it("no Google Maps loader / key anywhere", () => {
    expect(existsSync(join(ROOT, "lib/maps/google-maps-loader.ts"))).toBe(false);
    for (const src of [comp, live]) {
      expect(src).not.toMatch(/google-maps-loader|googleapis|google\.maps/i);
      expect(src).not.toMatch(/NEXT_PUBLIC_GOOGLE_MAPS_API_KEY|GOOGLE_MAPS_API_KEY/);
    }
    expect(env).not.toMatch(/GOOGLE_MAPS/);
  });
  it("no Mapbox / paid provider and no provider key or secret", () => {
    for (const src of [comp, live]) {
      expect(src).not.toMatch(/mapbox|maplibre/i);
      expect(src).not.toMatch(/access[_-]?token|api[_-]?key|process\.env/i);
    }
  });
  it("the base mounts the real map component (not an SVG locator)", () => {
    expect(comp).toMatch(/<MarketMapLive\b/);
    expect(comp).not.toMatch(/<LocationMap\b/);
  });
  it("resolves city-level coordinates + shows an honest precision label", () => {
    expect(live).toMatch(/resolveLocation/);
    expect(comp).toMatch(/data-testid="location-precision"/);
    for (const loc of ["lt", "en", "ru"] as const) {
      const b = JSON.parse(read(`messages/${loc}.json`)).marketMapBase;
      for (const k of ["precisionDevice", "precisionCity", "precisionCountry", "precisionUnset"]) {
        expect(typeof b?.[k] === "string" && b[k].length > 0, `${loc} ${k}`).toBe(true);
      }
    }
  });
});

describe("automatic geolocation path exists (a control on the map)", () => {
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

describe("usable without any key", () => {
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

describe("privacy + honest empty state", () => {
  it("the map only draws the worker's OWN selection (no other-user reads, no fake points)", () => {
    // The live map plots only `selected`; it never fetches or renders other
    // users' locations and seeds no fake market markers.
    expect(live).not.toMatch(/markers?\s*[:=]\s*\[/i);
    expect(live).toMatch(/pointFor\(selected\)/);
  });
});

describe("no raw provider/env text in user-facing copy (lt/en/ru)", () => {
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
