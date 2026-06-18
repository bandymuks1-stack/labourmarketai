import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildWorldMapZones,
  WORLD_MAP_LEGEND,
  type WorldMapInput,
} from "@/lib/work-market/world-map";

/**
 * Labour Market World Map v1 guard — the atlas is real-data-driven with honest
 * empty/concept states. No fake workers/companies/demand/coordinates/markers/
 * scores/percentages/verified badges, no guaranteed matching, no living/gyvas/
 * живой wording, no external copying.
 */
const ROOT = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");
const comp = read("components/app/labour-market-world-map.tsx");

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

const ZONE_ORDER = [
  "profileHub",
  "skillsEvidence",
  "availability",
  "workNeeds",
  "teams",
  "company",
  "marketPulse",
  "trust",
];

describe("world map zones — stable shape", () => {
  it("always 8 zones in a stable order", () => {
    expect(buildWorldMapZones(EMPTY).map((z) => z.key)).toEqual(ZONE_ORDER);
  });
});

describe("empty input → honest empty/concept (no fabricated data)", () => {
  const z = Object.fromEntries(buildWorldMapZones(EMPTY).map((x) => [x.key, x]));
  it("profile/skills/availability/workNeeds are attention + empty", () => {
    for (const k of ["profileHub", "skillsEvidence", "availability", "workNeeds"]) {
      expect(z[k].status).toBe("attention");
      expect(z[k].dataState).toBe("empty");
    }
  });
  it("teams is always a concept zone (no team data yet)", () => {
    expect(z.teams.dataState).toBe("concept");
  });
  it("marketPulse needs more data; trust is self-declared-only", () => {
    expect(z.marketPulse.stateKey).toBe("needsData");
    expect(z.trust.stateKey).toBe("selfDeclaredOnly");
  });
  it("NO zone reports a metric on empty input", () => {
    expect(buildWorldMapZones(EMPTY).every((x) => x.metric === null)).toBe(true);
  });
});

describe("real input → honest real states (real counts only)", () => {
  const FULL: WorldMapInput = {
    hasWorker: true,
    hasProfileSignal: true,
    skillCounts: { confirmed: 2, suggested: 3, selfDeclared: 5 },
    availabilityState: "available",
    preferredCount: 2,
    demandTotal: 4,
    hasCompanySignal: true,
    hasProjectSignal: true,
    signalCount: 6,
  };
  const z = Object.fromEntries(buildWorldMapZones(FULL).map((x) => [x.key, x]));
  it("skills confirmed → supported with the real confirmed count", () => {
    expect(z.skillsEvidence.status).toBe("supported");
    expect(z.skillsEvidence.metric).toBe(2);
  });
  it("work needs → primary with the real draft count", () => {
    expect(z.workNeeds.status).toBe("primary");
    expect(z.workNeeds.metric).toBe(4);
  });
  it("trust → supported only when real confirmations exist", () => {
    expect(z.trust.status).toBe("supported");
    expect(z.trust.metric).toBe(2);
    const noConf = buildWorldMapZones({ ...FULL, skillCounts: { confirmed: 0, suggested: 1, selfDeclared: 1 } });
    expect(noConf.find((x) => x.key === "trust")!.status).toBe("concept");
  });
  it("marketPulse stays possible-fit (never a percentage/score)", () => {
    expect(z.marketPulse.stateKey).toBe("possibleFit");
  });
});

describe("component honesty", () => {
  // Strip block + JSX comments so an honest disclaimer comment ("no verified
  // badges", etc.) is not mistaken for a real claim in the code.
  const code = comp.replace(/\/\*[\s\S]*?\*\//g, " ");
  it("no map markers / coordinate arrays / external map API", () => {
    expect(code).not.toMatch(/google\.maps|AdvancedMarkerElement|new\s+\w*Marker|\[\s*\{\s*lat:/);
  });
  it("the routes svg is decorative (aria-hidden)", () => {
    expect(comp).toMatch(/<svg[\s\S]*?aria-hidden/);
  });
  it("no fake percentage/score literals (SVG offsets excluded)", () => {
    expect(code.replace(/offset="\d+%"/g, "")).not.toMatch(/\d{1,3}\s*%/);
  });
  it("no verified-badge or guarantee claim in code", () => {
    expect(code).not.toMatch(/verified|guarantee/i);
  });
  it("no living/gyvas/живой wording", () => {
    expect(code).not.toMatch(/living|gyvas|живой/i);
  });
});

describe("worldMap i18n present + honest (en/lt/ru)", () => {
  for (const loc of ["en", "lt", "ru"] as const) {
    const m = JSON.parse(read(`messages/${loc}.json`)).worldMap;
    it(`${loc}: worldMap namespace covers the 8 zones`, () => {
      expect(m && m.title && m.zone).toBeTruthy();
      expect(Object.keys(m.zone).sort()).toEqual([...ZONE_ORDER].sort());
    });
    it(`${loc}: legend covers all roles`, () => {
      for (const r of WORLD_MAP_LEGEND) expect(m.legend[r]).toBeTruthy();
    });
    it(`${loc}: no living/gyvas/живой and no percentage scores`, () => {
      const all = JSON.stringify(m);
      expect(all).not.toMatch(/living|gyvas|живой/i);
      expect(all).not.toMatch(/\d{1,3}\s*%/);
    });
  }
});