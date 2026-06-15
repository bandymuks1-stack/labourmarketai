import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  isMappableDemandLocation,
  summarizeDemandLocations,
  demandLayerStatus,
  type DemandLocation,
} from "@/lib/market-map/demand-locations";

/**
 * Guard: company demand location capture v1 is a SIGNAL-ONLY write path.
 *  - the owner write path NEVER writes coordinates;
 *  - it NEVER sets geocode_status='verified' (only 'pending');
 *  - it NEVER sets geo_precision='coordinates';
 *  - it writes owner_id = auth.uid() and only onto the caller's OWN demand;
 *  - it validates country against the market set;
 *  - no external geocoding API / key / network;
 *  - signal-only rows are never mappable → 0 markers;
 *  - copy is honest and present in every active locale.
 */
const APP = join(__dirname, "..", "..");
const ACTIVE = ["lt", "en", "ru"] as const;

function read(rel: string): string {
  return readFileSync(join(APP, rel), "utf8");
}
function strip(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
}
function loadMessages(locale: string): Record<string, unknown> {
  return JSON.parse(read(join("messages", `${locale}.json`))) as Record<string, unknown>;
}
function val(root: Record<string, unknown>, path: string): string {
  let cur: unknown = root;
  for (const k of path.split(".")) {
    if (cur && typeof cur === "object") cur = (cur as Record<string, unknown>)[k];
    else return "";
  }
  return typeof cur === "string" ? cur : "";
}

const WRITE = "lib/demand/demand-location.ts";
const ACTION = "lib/demand/demand-location-actions.ts";
const UI = "components/app/demand-location-capture.tsx";
const SHELL = "components/app/market-map-shell.tsx";

describe("demand-location write path — signal-only, never coordinates/verified", () => {
  const src = read(WRITE);
  const code = strip(src);

  it("hard-pins latitude/longitude to null", () => {
    expect(code).toMatch(/latitude:\s*null/);
    expect(code).toMatch(/longitude:\s*null/);
    // never assigns a numeric coordinate
    expect(code).not.toMatch(/latitude:\s*-?\d/);
    expect(code).not.toMatch(/longitude:\s*-?\d/);
  });

  it("hard-pins geocode_status to 'pending' and NEVER 'verified'", () => {
    expect(code).toMatch(/geocode_status:\s*["']pending["']/);
    expect(code).not.toMatch(/["']verified["']/);
  });

  it("never writes geo_precision='coordinates' (derive excludes it)", () => {
    expect(code).not.toMatch(/geo_precision:\s*["']coordinates["']/);
    expect(code).not.toMatch(/return\s+["']coordinates["']/);
  });

  it("writes owner_id = auth.uid() and checks the demand is the caller's own", () => {
    expect(code).toMatch(/owner_id:\s*user\.id/);
    expect(code).toMatch(/from\(["']customer_requests["']\)[\s\S]*?\.eq\(["']profile_id["'],\s*user\.id\)/);
  });

  it("validates the country against the market set", () => {
    expect(code).toMatch(/isMarketCountry/);
  });

  it("has NO external geocoding API / key / network call", () => {
    expect(code).not.toMatch(/mapbox|google[^\n]*maps|nominatim|opencage|geocod(e|ing)\s*api|maps\.googleapis/i);
    expect(code).not.toMatch(/\bfetch\s*\(|axios|https?:\/\//i);
    expect(code).not.toMatch(/process\.env[^\n]*(MAP|GEOCODE|TOKEN|KEY)/i);
  });
});

describe("demand-location server action — delegates, never relaxes the invariants", () => {
  const code = strip(read(ACTION));
  it("delegates to the raw helper and never sets verified/coordinates itself", () => {
    expect(code).toMatch(/addDemandLocation/);
    expect(code).not.toMatch(/["']verified["']/);
    expect(code).not.toMatch(/latitude|longitude/);
  });
});

describe("demand-location capture UI — no coordinate / verified controls", () => {
  const code = strip(read(UI));
  it("offers no coordinate or verified input", () => {
    expect(code).not.toMatch(/latitude|longitude|["']verified["']/i);
  });
  it("captures only signal fields (country/city/label/address)", () => {
    expect(code).toMatch(/demand-location-country/);
    expect(code).toMatch(/setCity|setLabel|setAddress/);
  });
});

describe("signal-only rows never become markers", () => {
  const signal: DemandLocation = {
    id: "x",
    requestId: "r",
    ownerId: "o",
    countryCode: "NL",
    region: null,
    city: "Rotterdam",
    locality: null,
    addressText: null,
    locationLabel: "Port district",
    latitude: null,
    longitude: null,
    geoPrecision: "city",
    geocodeStatus: "pending",
    source: "demand_form",
  };
  it("a pending, null-coordinate row is not mappable", () => {
    expect(isMappableDemandLocation(signal)).toBe(false);
  });
  it("a table of signal-only rows yields signal_only status + 0 mappable", () => {
    const s = summarizeDemandLocations([signal, { ...signal, id: "y", city: "Vilnius", countryCode: "LT" }]);
    expect(s.mappable).toBe(0);
    expect(s.total).toBe(2);
    expect(demandLayerStatus(s)).toBe("signal_only");
  });
});

describe("market-map shell — real signal-only count, still 0 markers", () => {
  const shell = read(SHELL);
  it("reads the real summary and shows a signal-only status/count", () => {
    expect(shell).toMatch(/getOwnDemandLocationSummary/);
    expect(shell).toMatch(/demandSignalNote/);
    expect(shell).toMatch(/data-testid="market-map-demand-signal-note"/);
  });
  it("still seeds NO markers / coordinates in the shell", () => {
    expect(shell).not.toMatch(/markers?\s*[:=]\s*\[/i);
    expect(shell).not.toMatch(/coordinates\s*[:=]\s*\[/i);
    expect(shell).not.toMatch(/mapbox|google[^\n]*maps/i);
  });
});

describe("demand-location capture copy — present in every active locale", () => {
  for (const locale of ACTIVE) {
    const m = loadMessages(locale);
    it(`${locale}: capture + signal-note keys present`, () => {
      expect(val(m, "demandLocationCapture.open"), `${locale} open`).toBeTruthy();
      expect(val(m, "demandLocationCapture.note"), `${locale} note`).toBeTruthy();
      expect(val(m, "demandLocationCapture.done"), `${locale} done`).toBeTruthy();
      expect(val(m, "marketMap.layerSignalOnly"), `${locale} layerSignalOnly`).toBeTruthy();
      expect(val(m, "marketMap.demandSignalNote"), `${locale} demandSignalNote`).toBeTruthy();
    });
    it(`${locale}: signal note carries the {count} placeholder`, () => {
      expect(val(m, "marketMap.demandSignalNote")).toContain("{count}");
    });
  }
});
