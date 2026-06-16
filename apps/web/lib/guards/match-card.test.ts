import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Match Card guard (full-completion train PR 3).
 *
 * Demand (company need) + Supply (worker readiness) → an HONEST Match Card
 * breakdown. No fake match, no score/percentage, no guaranteed match; the
 * strongest honest state is `possible_match`.
 */

const ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

describe("Match Card breakdown is reusable + mounted on opportunities", () => {
  const page = read("app/[locale]/dashboard/opportunities/page.tsx");
  const comp = read("components/app/match-signals.tsx");
  // Strip comments so honest "no score / no guarantee" doc text does not trip
  // the code-only assertions below.
  const stripComments = (s: string) =>
    s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  const view = stripComments(read("lib/opportunities/match-card-view.ts"));

  it("the reusable MatchSignals component exists", () => {
    expect(comp).toMatch(/export function MatchSignals/);
    expect(comp).toMatch(/data-signal=/);
    expect(comp).toMatch(/data-state=/);
  });

  it("opportunities page renders the match breakdown per need", () => {
    expect(page).toMatch(/MatchSignals/);
    expect(page).toMatch(/buildMatchCardView/);
    expect(page).toMatch(/data-testid="opportunity-match-breakdown"/);
  });

  it("the view reuses the deterministic fit engine, adds no score", () => {
    expect(view).toMatch(/computeOpportunityFit/);
    expect(view).not.toMatch(/score|percent|rating/i);
  });

  it("possible_match is the strongest state — never a guarantee", () => {
    expect(view).toMatch(/possible_match/);
    expect(view).not.toMatch(/guaranteed|guarantee/i);
  });
});

describe("match dimension/state copy exists in every active locale", () => {
  for (const loc of ["lt", "en", "ru"] as const) {
    it(`${loc}: opportunities.matchDim + matchState present`, () => {
      const o = JSON.parse(read(`messages/${loc}.json`)).opportunities;
      expect(o.matchTitle).toBeTruthy();
      for (const k of ["workType", "skills", "country", "availability", "documents"]) {
        expect(o.matchDim?.[k], `${loc} matchDim.${k}`).toBeTruthy();
      }
      for (const s of ["fit", "check", "unknown"]) {
        expect(o.matchState?.[s], `${loc} matchState.${s}`).toBeTruthy();
      }
    });
  }
});
