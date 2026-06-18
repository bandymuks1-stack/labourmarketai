import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  wazeDeepLink,
  wazeDestinationFromLocation,
  type WazeDestination,
} from "@/lib/maps/waze";

/**
 * Waze navigation-handoff guard (slice waze-handoff-v1).
 *
 * Waze is an external navigation handoff only — an official deep link. We never
 * compute/claim a Waze ETA, never scrape Waze, use no Waze API/key, place no
 * fake coordinates, and never navigate to an exact personal home. The action is
 * shown only when a real, permitted destination exists.
 */
const ROOT = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");
const helper = read("lib/maps/waze.ts");
const comp = read("components/app/open-in-waze.tsx");

describe("official Waze deep link (no API, no ETA)", () => {
  it("builds the official waze.com/ul link for coordinates", () => {
    expect(wazeDeepLink({ kind: "coords", lat: 54.6872, lng: 25.2797 })).toBe(
      "https://waze.com/ul?ll=54.6872,25.2797&navigate=yes",
    );
  });
  it("builds an encoded query link for an area", () => {
    expect(wazeDeepLink({ kind: "query", q: "Vilnius, LT" })).toBe(
      "https://waze.com/ul?q=Vilnius%2C%20LT&navigate=yes",
    );
  });
  it("uses ONLY the official waze.com/ul universal link", () => {
    expect(helper).toMatch(/https:\/\/waze\.com\/ul/);
    expect(helper).not.toMatch(/waze\.com\/(?!ul)/);
  });
});

describe("privacy: permitted destinations only, never exact personal home", () => {
  it("an exact personal home is never a destination", () => {
    expect(
      wazeDestinationFromLocation({
        kind: "person",
        isPersonalHome: true,
        lat: 1,
        lng: 1,
        exactAllowed: true,
        areaQuery: "X",
      }),
    ).toBeNull();
  });
  it("a person navigates only to an approximate area (never exact coords)", () => {
    const d = wazeDestinationFromLocation({
      kind: "person",
      lat: 54.6,
      lng: 25.2,
      exactAllowed: true,
      areaQuery: "Vilnius region",
    });
    expect(d).toEqual({ kind: "query", q: "Vilnius region" } as WazeDestination);
  });
  it("a person with no area yields no destination", () => {
    expect(wazeDestinationFromLocation({ kind: "person" })).toBeNull();
  });
  it("company exact coords ONLY when explicitly allowed, else area query", () => {
    expect(
      wazeDestinationFromLocation({ kind: "company", lat: 54.6, lng: 25.2, exactAllowed: true }),
    ).toEqual({ kind: "coords", lat: 54.6, lng: 25.2 });
    expect(
      wazeDestinationFromLocation({ kind: "company", lat: 54.6, lng: 25.2, exactAllowed: false, areaQuery: "Vilnius" }),
    ).toEqual({ kind: "query", q: "Vilnius" });
  });
  it("no permitted destination → null (action hidden)", () => {
    expect(wazeDestinationFromLocation({ kind: "project" })).toBeNull();
  });
});

describe("no ETA / scraping / API / fake coordinates in code", () => {
  // Strip block comments so the honest disclaimer ("does NOT compute a Waze ETA
  // / travel time; uses no Waze API or key") is not mistaken for a claim.
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, " ");
  for (const [name, src] of [
    ["helper", strip(helper)],
    ["component", strip(comp)],
  ] as const) {
    it(`${name}: no ETA / travel-time claim`, () => {
      expect(src).not.toMatch(/\beta\b|travel time|\btrukm|\bduration\b|minutes? away|min away|atvyk\w* laik/i);
    });
    it(`${name}: no Waze scraping / API / key`, () => {
      expect(src).not.toMatch(/fetch\(|axios|waze[^\n]*\bapi\b|api[._-]?key|access[_-]?token/i);
    });
    it(`${name}: no hardcoded coordinate literals`, () => {
      expect(src).not.toMatch(/ll=\d|lat:\s*-?\d+\.\d+|lng:\s*-?\d+\.\d+/);
    });
  }
  it("helper carries the honest note (no ETA computed)", () => {
    expect(helper).toMatch(/does NOT compute|not compute/i);
  });
});

describe("component shows the action only with a real permitted destination", () => {
  it("returns null when destination is null (no fake action / route)", () => {
    expect(comp).toMatch(/if \(!destination\) return null/);
  });
  it("opens Waze externally with safe rel", () => {
    expect(comp).toMatch(/target="_blank"/);
    expect(comp).toMatch(/rel="noopener noreferrer( nofollow)?"/);
    expect(comp).toMatch(/wazeDeepLink/);
  });
});

describe("Open-in-Waze label present in the requested locales", () => {
  const EXPECT: Record<string, string> = {
    lt: "Atidaryti Waze",
    en: "Open in Waze",
    ru: "Открыть в Waze",
    pl: "Otwórz w Waze",
    nl: "Openen in Waze",
  };
  for (const [loc, label] of Object.entries(EXPECT)) {
    it(`${loc}: waze.open = "${label}"`, () => {
      const w = JSON.parse(read(`messages/${loc}.json`)).waze;
      expect(w?.open).toBe(label);
    });
  }
});