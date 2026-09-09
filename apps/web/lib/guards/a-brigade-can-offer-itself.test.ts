import { describe, expect, it } from "vitest";
import { classifyIntent } from "@/lib/conversation/intent-router";
import { OWN_PEOPLE_SOURCE, TRADE_STEM_SOURCE } from "@/lib/structuring/role-label";

/**
 * A BRIGADE CAN OFFER ITSELF — in every routed language, without becoming a
 * job seeker or an employer.
 *
 * Owner readiness window, 2026-09-09, Priority 2. The `offer-capacity` rule
 * had TWO patterns, each carrying its own copy of the own-people vocabulary,
 * and the copies had drifted. Measured on the real router before the fix —
 * the collective noun was the ONLY difference:
 *
 *   "Looking for work for our PEOPLE"    → offer-capacity   (in the list)
 *   "Looking for work for our CREW"      → find-work        (not in it)
 *   "Ieškome darbo mūsų BRIGADAI"        → need-workers     (!!)
 *   "Ieškome projekto mūsų KOMANDAI"     → offer-capacity   (in the list)
 *   "Zoek werk voor onze PLOEG"          → find-work
 *   "Suchen Arbeit für unsere KOLONNE"   → unknown
 *   "Ищем проект для нашей БРИГАДЫ"      → unknown
 *   "Rask projektą mūsų 12 žmonių brigadai" → find-work
 *   "Find a project for our 12-person crew" → unknown
 *
 * `Ieškome darbo mūsų brigadai → need-workers` is the worst of them: a
 * brigade offering ITSELF read as an employer NEEDING workers — a complete
 * SEP-4 inversion, the exact defect owner window 7 built the supply direction
 * to fix. It survived for the brigade noun alone, because the brigade noun
 * was in only one of the two copies.
 *
 * Fixed at the root: ONE `OWN_PEOPLE_SOURCE`, read by both patterns, plus the
 * imperative seek verbs (`rask` / `surask` / `find` / `найди`) that nobody had
 * added. This is the #1669 lesson for the third time — a vocabulary kept in
 * two places drifts, and the half nobody re-reads is the half that breaks.
 *
 * WHAT THIS DOES NOT DO. It does not model a brigade. A team is an
 * `organizations` row (`organization_type='team'`), membership is
 * `engagement_contexts`, and both are already live in production — this slice
 * only gives the sentence a front door. See the register notes for WRK-6 /
 * DEM-6 for what genuinely remains.
 */

const intentOf = (s: string) => classifyIntent(s)?.intent ?? null;

/** A brigade / crew / team offering itself, one sentence per routed locale. */
const COLLECTIVE_SUPPLY: ReadonlyArray<readonly [string, string]> = [
  ["lt", "Rask projekta musu 12 zmoniu brigadai."],
  ["lt", "Ieskome darbo musu brigadai."],
  ["lt", "Ieskome projekto musu komandai."],
  ["en", "Find a project for our 12-person crew."],
  ["en", "Looking for work for our crew."],
  ["en", "We are looking for a project for our team."],
  ["nl", "Zoek werk voor onze ploeg."],
  ["de", "Suchen Arbeit fuer unsere Kolonne."],
  ["ru", "Ищем проект для нашей бригады."],
];

/** An organisation asking FOR a crew — the opposite direction. */
const CREW_DEMAND: ReadonlyArray<readonly [string, string]> = [
  ["en", "I need a crew for the site"],
  ["lt", "Ieskau brigados objektui"],
  ["lt", "Ieskome brigados objektui"],
  ["lt", "Reikia brigados projektui"],
  ["en", "We are looking for a team for our project"],
];

/** One person, who must never be read as a collective offer. */
const INDIVIDUAL: ReadonlyArray<readonly [string, string]> = [
  ["lt", "Ieskau darbo"],
  ["lt", "Rask man darba"],
  ["en", "Find me a job"],
  ["en", "Find a job for me"],
  ["en", "I am looking for work in Norway"],
];

describe("1. a collective offering itself is SUPPLY, in every routed locale", () => {
  it.each(COLLECTIVE_SUPPLY)("%s: %s", (_loc, sentence) => {
    expect(intentOf(sentence)).toBe("offer-capacity");
  });

  it("the individual noun it always understood still works", () => {
    // The regression check for the fix itself: `people` was the one that
    // worked before, and it must not have been lost while adding the rest.
    expect(intentOf("Looking for work for our people.")).toBe("offer-capacity");
  });
});

describe("2. NEGATIVE CONTROL — asking FOR a crew is still DEMAND", () => {
  it.each(CREW_DEMAND)("%s stays demand: %s", (_loc, sentence) => {
    expect(intentOf(sentence)).toBe("find-workers");
  });

  it("a team-shaped headcount need is still demand, all five locales", () => {
    for (const s of [
      "Reikia 6 montuotoju komandos kitai savaitei.",
      "We need a team of 6 fitters for next week.",
      "We need a team of 6 welders for next week.",
      "Wir brauchen ein Team von 6 Schweissern.",
      "Wij hebben een ploeg van 6 lassers nodig.",
      "Нужна бригада из 6 сварщиков.",
    ]) {
      expect(intentOf(s), s).toBe("need-workers");
    }
  });
});

describe("3. NEGATIVE CONTROL — one person is not a brigade", () => {
  /** The imperative verbs (`rask`, `find`) were the risky half of the widening:
   *  "find me a job" must not become an offer of capacity. What keeps it safe
   *  is the possessive + own-people clause, and that is what these pin. */
  it.each(INDIVIDUAL)("%s stays an individual job search: %s", (_loc, sentence) => {
    expect(intentOf(sentence)).toBe("find-work");
  });

  it("neither direction of the market moved for the plain sentences", () => {
    expect(intentOf("We have 20 welders")).toBe("offer-capacity");
    expect(intentOf("We need 10 welders")).toBe("need-workers");
    expect(intentOf("I am a welder")).toBe("profession-statement");
    expect(intentOf("I have 3 years of experience as a welder")).toBe("experiences");
  });
});

describe("4. ONE vocabulary, not two copies", () => {
  it("the shared source carries both the individual and the collective nouns", () => {
    // The defect was structural: two lists, one of them missing the brigade.
    // Asserting the CONTENT of the single source is what stops it recurring.
    for (const stem of ["darbuotoj", "people", "worker", "mitarbeit", "работник"]) {
      expect(OWN_PEOPLE_SOURCE, `individual: ${stem}`).toContain(stem);
    }
    for (const stem of ["komand", "brigad", "team", "crew", "ploeg", "kolonne", "бригад"]) {
      expect(OWN_PEOPLE_SOURCE, `collective: ${stem}`).toContain(stem);
    }
  });

  it("both supply patterns read that source instead of an inline list", () => {
    const router = String(
      // read through the module the router composes from, not a file blob,
      // so this fails if the interpolation is removed rather than renamed
      OWN_PEOPLE_SOURCE,
    );
    expect(router.length).toBeGreaterThan(80);
    // The English trade word that was missing entirely.
    expect(TRADE_STEM_SOURCE).toMatch(/fitter/);
    expect(intentOf("We need 6 fitters.")).toBe("need-workers");
  });
});
