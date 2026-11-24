import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  buildDemandSignalBoard,
  type DemandLocation,
} from "@/lib/market-map/demand-locations";

/**
 * Guard: the market-map SIGNAL-ONLY read layer shows real demand signals
 * grouped by country, and can NEVER render a coordinate or a map point.
 *  - the board excludes coordinate-confirmed (mappable) rows;
 *  - the board entry shape carries no latitude/longitude;
 *  - the layer component renders no coordinate / marker;
 *  - the shell still seeds no markers;
 *  - copy present in every active locale.
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

function signalRow(over: Partial<DemandLocation>): DemandLocation {
  return {
    id: "id",
    requestId: "req",
    ownerId: "own",
    countryCode: "LT",
    region: null,
    city: null,
    locality: null,
    addressText: null,
    locationLabel: "label",
    latitude: null,
    longitude: null,
    geoPrecision: "city",
    geocodeStatus: "pending",
    source: "demand_form",
    ...over,
  };
}

describe("buildDemandSignalBoard — signal-only, grouped, coordinate-free", () => {
  it("excludes coordinate-confirmed (mappable) rows", () => {
    const mappable = signalRow({
      id: "m",
      latitude: 1,
      longitude: 1,
      geoPrecision: "coordinates",
      geocodeStatus: "verified",
    });
    const signal = signalRow({ id: "s", city: "Vilnius" });
    const board = buildDemandSignalBoard([mappable, signal]);
    expect(board.total).toBe(1);
    expect(board.groups.flatMap((g) => g.entries).map((e) => e.id)).toEqual(["s"]);
  });

  it("groups by country and sorts by count desc", () => {
    const board = buildDemandSignalBoard([
      signalRow({ id: "a", countryCode: "LT" }),
      signalRow({ id: "b", countryCode: "NL" }),
      signalRow({ id: "c", countryCode: "NL" }),
    ]);
    expect(board.groups.map((g) => g.countryCode)).toEqual(["NL", "LT"]);
    expect(board.groups[0].count).toBe(2);
  });

  it("entries expose NO latitude/longitude (cannot render a point)", () => {
    const board = buildDemandSignalBoard([signalRow({ id: "x" })]);
    const entry = board.groups[0].entries[0] as unknown as Record<string, unknown>;
    expect("latitude" in entry).toBe(false);
    expect("longitude" in entry).toBe(false);
  });
});

describe("signal layer + read model sources — no coordinates / markers", () => {
  it("the signal layer component renders no lat/lng / marker / map api", () => {
    const code = strip(read("components/app/market-map-signal-layer.tsx"));
    expect(code).not.toMatch(/latitude|longitude/i);
    expect(code).not.toMatch(/markers?\s*[:=]\s*\[/i);
    expect(code).not.toMatch(/mapbox|google[^\n]*maps/i);
  });

  it("the board builder drops mappable rows by construction", () => {
    const code = strip(read("lib/market-map/demand-locations.ts"));
    expect(code).toMatch(/isMappableDemandLocation\(row\)\)\s*continue/);
    // DemandSignalEntry interface has no coordinate members
    const iface = code.slice(code.indexOf("interface DemandSignalEntry"));
    const body = iface.slice(0, iface.indexOf("}"));
    expect(body).not.toMatch(/latitude|longitude/);
  });

  it("the shell renders the signal layer but seeds no markers", () => {
    const shell = read("components/app/market-map-shell.tsx");
    expect(shell).toMatch(/MarketMapSignalLayer/);
    expect(shell).toMatch(/getOwnDemandSignalBoard/);
    expect(shell).not.toMatch(/markers?\s*[:=]\s*\[/i);
    expect(shell).not.toMatch(/coordinates\s*[:=]\s*\[/i);
    expect(shell).not.toMatch(/mapbox|google[^\n]*maps/i);
  });
});

describe("signal layer copy — present in every active locale", () => {
  for (const locale of ACTIVE) {
    const m = loadMessages(locale);
    it(`${locale}: signalLayer keys present`, () => {
      expect(val(m, "marketMap.signalLayer.title"), `${locale} title`).toContain("{count}");
      expect(val(m, "marketMap.signalLayer.note"), `${locale} note`).toBeTruthy();
      expect(val(m, "marketMap.signalLayer.noPoints"), `${locale} noPoints`).toBeTruthy();
      expect(val(m, "marketMap.signalLayer.countryCount"), `${locale} countryCount`).toContain("{count}");
      for (const p of ["country", "city", "address", "coordinates", "unknown"]) {
        expect(val(m, `marketMap.signalLayer.precision.${p}`), `${locale} precision.${p}`).toBeTruthy();
      }
    });
  }
});
