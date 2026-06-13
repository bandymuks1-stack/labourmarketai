/**
 * COMPANY SCOUTING BRIDGE — honesty + wiring guard (Step 6).
 *
 * The company dashboard must set honest expectations before scouting and link
 * to it: matches are signals (not guaranteed), worker contacts stay hidden, the
 * estimate is non-binding. No fake match/AI/verification/guarantee language.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const APP = resolve(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(APP, rel), "utf8");
const code = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\{\/\*[\s\S]*?\*\/\}/g, " ").replace(/\/\/[^\n]*/g, " ");

const COMPONENT = "components/app/company-scouting-bridge.tsx";
const PAGE = "app/[locale]/dashboard/company/page.tsx";

describe("bridge links to scouting and is mounted", () => {
  it("the component links to the scouting route", () => {
    const src = code(read(COMPONENT));
    expect(src).toMatch(/\/dashboard\/company\/scouting/);
    expect(src).toMatch(/company-scouting-bridge-cta/);
  });
  it("the company dashboard mounts it", () => {
    const src = code(read(PAGE));
    expect(src).toMatch(/<CompanyScoutingBridge\s*\/>/);
  });
});

describe("copy is honest (no fake guarantee/AI/verification)", () => {
  for (const loc of ["en", "lt", "ru"] as const) {
    it(`${loc}.json scoutingBridge present + honest`, () => {
      const j = JSON.parse(read(`messages/${loc}.json`)) as {
        roleDashboards?: { company?: { scoutingBridge?: Record<string, unknown> & { points?: Record<string, unknown> } } };
      };
      const b = j.roleDashboards?.company?.scoutingBridge;
      expect(b?.title).toBeTruthy();
      expect(b?.intro).toBeTruthy();
      expect(b?.cta).toBeTruthy();
      expect(b?.points?.matches).toBeTruthy();
      expect(b?.points?.contacts).toBeTruthy();
      expect(b?.points?.estimate).toBeTruthy();
      const blob = JSON.stringify(b).toLowerCase();
      expect(blob).not.toContain("[en]");
      // No fabricated promises.
      expect(blob).not.toMatch(/guaranteed match|ai match|verified worker|best match/);
    });
  }

  it("EN copy explicitly states the safe truths", () => {
    const j = JSON.parse(read("messages/en.json")) as {
      roleDashboards: { company: { scoutingBridge: { points: { matches: string; contacts: string } } } };
    };
    const p = j.roleDashboards.company.scoutingBridge.points;
    expect(p.matches.toLowerCase()).toMatch(/never a guarantee|not a guarantee|signals/);
    expect(p.contacts.toLowerCase()).toMatch(/hidden/);
  });
});
