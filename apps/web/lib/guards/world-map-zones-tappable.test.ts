import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildWorldMapZones, type WorldMapInput } from "@/lib/work-market/world-map";

/**
 * World-map zones are TAPPABLE (owner feedback, 2026-06-23).
 *
 * Every atlas zone card must be a real link to its exact completion step with a
 * visible CTA — pressing a missing card opens the form that fills it, on desktop
 * AND mobile. It must not merely describe the gap.
 */
const ROOT = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");
const comp = read("components/app/labour-market-world-map.tsx");

const ZONE_KEYS = [
  "profileHub",
  "skillsEvidence",
  "availability",
  "workNeeds",
  "teams",
  "company",
  "marketPulse",
  "trust",
] as const;

const EMPTY: WorldMapInput = {
  hasWorker: false,
  hasProfileSignal: false,
  skillCounts: { confirmed: 0, suggested: 0, selfDeclared: 0 },
  availabilityState: "unknown",
  preferredCount: 0,
  demandTotal: 0,
  hasCompanySignal: false,
  hasProjectSignal: false,
  signalCount: 0,
};
const FULL: WorldMapInput = {
  hasWorker: true,
  hasProfileSignal: true,
  skillCounts: { confirmed: 2, suggested: 1, selfDeclared: 3 },
  availabilityState: "available",
  preferredCount: 1,
  demandTotal: 2,
  hasCompanySignal: true,
  hasProjectSignal: true,
  signalCount: 3,
};

describe("every zone carries a concrete completion route", () => {
  for (const input of [EMPTY, FULL]) {
    it("ctaHref is always an existing /dashboard route (never null)", () => {
      for (const z of buildWorldMapZones(input)) {
        expect(typeof z.ctaHref).toBe("string");
        expect(z.ctaHref).toMatch(/^\/dashboard\//);
      }
    });
  }
});

describe("component renders each zone card as a tappable Link", () => {
  it("desktop + mobile cards link to the zone's ctaHref", () => {
    expect(comp).toMatch(/href=\{z\.ctaHref as "\/dashboard"\}/);
  });
  it("each zone exposes a CTA test hook (desktop + mobile)", () => {
    expect(comp).toMatch(/world-zone-\$\{z\.key\}-cta/);
    expect(comp).toMatch(/world-zone-m-\$\{z\.key\}-cta/);
  });
  it("shows a visible CTA label from i18n (fill / open)", () => {
    expect(comp).toMatch(/cta\.\$\{ctaActionKey\(z\)\}/);
  });
});

describe("CTA labels present in active locales (lt/en/ru)", () => {
  for (const loc of ["lt", "en", "ru"] as const) {
    it(`${loc}: worldMap.cta.fill + worldMap.cta.open are non-empty`, () => {
      const cta = JSON.parse(read(`messages/${loc}.json`)).worldMap?.cta;
      expect(typeof cta?.fill === "string" && cta.fill.length > 0).toBe(true);
      expect(typeof cta?.open === "string" && cta.open.length > 0).toBe(true);
    });
  }
});

describe("zone keys remain the stable set (no drift)", () => {
  it("8 known zones", () => {
    expect(buildWorldMapZones(EMPTY).map((z) => z.key)).toEqual([...ZONE_KEYS]);
  });
});