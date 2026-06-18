import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildWorkViewBlocks,
  buildWorkViewActions,
  WORK_VIEW_BLOCK_ORDER,
  type MyWorkViewInput,
} from "@/lib/dashboard/my-work-view";

/**
 * My Work View cockpit v1 guard — real-data-driven blocks + honest empty/concept
 * states, prioritized live next actions (no dead CTAs). No fake data, no fake
 * parsing/verification, no guaranteed matching, no living/gyvas/живой.
 */
const ROOT = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");
const comp = read("components/app/my-work-view.tsx");
const ALLOWED_HREFS = new Set([
  "/dashboard/profile",
  "/dashboard/journal",
  "/dashboard/company",
  "/dashboard/market-map",
]);

const EMPTY: MyWorkViewInput = {
  hasProfile: false,
  hasSummary: false,
  hasWorker: false,
  skillCount: 0,
  skillCounts: { confirmed: 0, suggested: 0, selfDeclared: 0 },
  availabilityState: "unknown",
  journalCount: 0,
  demandTotal: 0,
  worldRealZones: 0,
  worldTotalZones: 8,
};

const FULL: MyWorkViewInput = {
  hasProfile: true,
  hasSummary: true,
  hasWorker: true,
  skillCount: 7,
  skillCounts: { confirmed: 2, suggested: 3, selfDeclared: 2 },
  availabilityState: "available",
  journalCount: 5,
  demandTotal: 3,
  worldRealZones: 4,
  worldTotalZones: 8,
};

describe("cockpit blocks — shape + honesty", () => {
  it("always 8 blocks in a stable order", () => {
    expect(buildWorkViewBlocks(EMPTY).map((b) => b.key)).toEqual(WORK_VIEW_BLOCK_ORDER);
  });
  it("empty input → no fabricated metric on any block", () => {
    expect(buildWorkViewBlocks(EMPTY).every((b) => b.metric === null)).toBe(true);
  });
  it("empty input → profile/skills/availability/journal need action", () => {
    const z = Object.fromEntries(buildWorkViewBlocks(EMPTY).map((b) => [b.key, b]));
    for (const k of ["profile", "skills", "availability", "journal"]) {
      expect(z[k].tone).toBe("attention");
      expect(z[k].dataState).toBe("empty");
    }
    expect(z.worldMap.stateKey).toBe("noSignals");
    expect(z.workNeeds.tone).toBe("concept");
  });
  it("real input → real tones + real counts", () => {
    const z = Object.fromEntries(buildWorkViewBlocks(FULL).map((b) => [b.key, b]));
    expect(z.skills.metric).toBe(7);
    expect(z.evidence.tone).toBe("supported");
    expect(z.evidence.metric).toBe(2);
    expect(z.journal.metric).toBe(5);
    expect(z.worldMap.metric).toBe(4);
  });
  it("evidence stays honest: supported only with real confirmations", () => {
    const z = Object.fromEntries(
      buildWorkViewBlocks({ ...FULL, skillCounts: { confirmed: 0, suggested: 0, selfDeclared: 3 } }).map((b) => [b.key, b]),
    );
    expect(z.evidence.stateKey).toBe("needsEvidence");
  });
  it("every block CTA points at a real route", () => {
    for (const b of buildWorkViewBlocks(FULL)) expect(ALLOWED_HREFS.has(b.ctaHref)).toBe(true);
  });
});

describe("next actions — no dead CTAs, max 5, market map always present", () => {
  it("empty input surfaces the missing-step actions + market map", () => {
    const keys = buildWorkViewActions(EMPTY).map((a) => a.key);
    expect(keys).toContain("completeProfile");
    expect(keys).toContain("openMarketMap");
    expect(keys.length).toBeLessThanOrEqual(5);
  });
  it("a completed profile still has a live action (never an empty panel)", () => {
    const acts = buildWorkViewActions(FULL);
    expect(acts.length).toBeGreaterThan(0);
    expect(acts.some((a) => a.key === "openMarketMap")).toBe(true);
  });
  it("every action links to a real route and is enabled (no dead CTA)", () => {
    for (const a of [...buildWorkViewActions(EMPTY), ...buildWorkViewActions(FULL)]) {
      expect(ALLOWED_HREFS.has(a.href)).toBe(true);
      expect(a.enabled).toBe(true);
    }
  });
});

describe("component honesty", () => {
  const code = comp.replace(/\/\*[\s\S]*?\*\//g, " ");
  it("no map markers / coordinates / external map API", () => {
    expect(code).not.toMatch(/google\.maps|AdvancedMarkerElement|new\s+\w*Marker|\[\s*\{\s*lat:/);
  });
  it("no fake percentage/score literals", () => {
    expect(code).not.toMatch(/\d{1,3}\s*%/);
  });
  it("no verified-badge / guarantee / unlock wording in code", () => {
    expect(code).not.toMatch(/verified|guarantee|unlock/i);
  });
  it("no living/gyvas/живой wording", () => {
    expect(code).not.toMatch(/living|gyvas|живой/i);
  });
});

describe("myWorkView i18n present + honest (en/lt/ru)", () => {
  for (const loc of ["en", "lt", "ru"] as const) {
    const m = JSON.parse(read(`messages/${loc}.json`)).myWorkView;
    it(`${loc}: namespace covers all 8 blocks + actions`, () => {
      expect(m && m.title && m.block && m.action).toBeTruthy();
      expect(Object.keys(m.block).sort()).toEqual([...WORK_VIEW_BLOCK_ORDER].sort());
      expect(m.action.openMarketMap).toBeTruthy();
    });
    it(`${loc}: no living/gyvas/живой, no unlock, no percentage`, () => {
      const all = JSON.stringify(m);
      expect(all).not.toMatch(/living|gyvas|живой/i);
      expect(all).not.toMatch(/unlock|\bdemo\b/i);
      expect(all).not.toMatch(/\d{1,3}\s*%/);
    });
  }
});