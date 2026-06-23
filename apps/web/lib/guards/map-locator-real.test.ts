import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Real map locator guard (owner correction, 2026-06-23).
 *
 * The map must WORK two real ways and must never leak developer configuration to
 * a user:
 *  1) Automatic  — browser geolocation centers the map + drops the user's marker.
 *  2) Manual     — a typed place is geocoded (with provider) or recorded as an
 *                  honest label-only fallback, and works even if geolocation is
 *                  denied or the provider is missing.
 *  3) No raw API/env-key strings (NEXT_PUBLIC_GOOGLE_MAPS_API_KEY,
 *     GOOGLE_MAPS_API_KEY, "API key missing", …) may appear in ANY user-facing
 *     product copy (lt/en/ru) — the missing-config detail belongs in the PR /
 *     owner setup doc, not the UI.
 *
 * Static source + i18n assertions. Secret-free, no-DB.
 */
const ROOT = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");
const base = read("components/app/market-map-base.tsx");
const loader = read("lib/maps/google-maps-loader.ts");

describe("automatic mode — real browser geolocation", () => {
  it("requests the browser location", () => {
    expect(base).toMatch(/navigator\.geolocation\.getCurrentPosition/);
  });
  it("exposes a 'use my location' action and reverse-geocodes a readable place", () => {
    expect(base).toMatch(/data-testid="map-locator-auto"/);
    expect(base).toMatch(/reverseGeocode/);
  });
});

describe("manual mode — typed place, geocoded or honest fallback", () => {
  it("has a manual input + submit", () => {
    expect(base).toMatch(/data-testid="map-locator-manual-input"/);
    expect(base).toMatch(/data-testid="map-locator-manual-submit"/);
  });
  it("forward-geocodes when a provider is available", () => {
    expect(base).toMatch(/forwardGeocode/);
  });
  it("loads the places library so address search works", () => {
    expect(loader).toMatch(/libraries=places/);
  });
});

describe("persistence — the chosen location survives refresh (no DB/migration)", () => {
  it("reads and writes the user's own location via the local store", () => {
    expect(base).toMatch(/readMyLocation/);
    expect(base).toMatch(/writeMyLocation/);
  });
});

describe("no raw API/env-key config text reaches the user (lt/en/ru)", () => {
  // Admin / ops namespaces legitimately reference configuration diagnostics.
  const EXCLUDED = new Set(["admin", "adminReadiness", "agentOs"]);
  const FORBIDDEN: RegExp[] = [
    /NEXT_PUBLIC_[A-Z0-9_]+/,
    /\bGOOGLE_MAPS_API_KEY\b/,
    /\bAPI key missing\b/i,
    /process\.env/,
    /import\.meta\.env/,
  ];
  function leaves(node: unknown, prefix: string, out: [string, string][]): void {
    if (typeof node === "string") out.push([prefix, node]);
    else if (Array.isArray(node)) node.forEach((v, i) => leaves(v, `${prefix}[${i}]`, out));
    else if (node && typeof node === "object")
      for (const [k, v] of Object.entries(node as Record<string, unknown>))
        leaves(v, prefix ? `${prefix}.${k}` : k, out);
  }
  for (const loc of ["lt", "en", "ru"] as const) {
    it(`${loc}: product copy carries no env-key / raw-config strings`, () => {
      const m = JSON.parse(read(`messages/${loc}.json`)) as Record<string, unknown>;
      const offenders: string[] = [];
      for (const [ns, node] of Object.entries(m)) {
        if (EXCLUDED.has(ns)) continue;
        const out: [string, string][] = [];
        leaves(node, ns, out);
        for (const [k, v] of out) {
          if (FORBIDDEN.some((re) => re.test(v))) offenders.push(`${k}: "${v}"`);
        }
      }
      expect(offenders, `${loc} leaks developer config to users:\n${offenders.join("\n")}`).toEqual([]);
    });
  }
});