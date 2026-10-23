import { describe, expect, it } from "vitest";

import { detectJobDemandFields } from "@/lib/market/recognition";
import {
  countPeopleInNeed,
  detectTeamComposition,
  structureNeed,
} from "./structure-need";
import { parseDurationDays } from "./time-window";
import { structureValueStatement } from "./value-statement";

/**
 * A DURATION, a PAY RATE, HOURS or EXPERIENCE is never a HEADCOUNT (owner
 * order 2026-10-23: confusing them produces wrong needs and a wrong
 * candidate search). Every case runs through BOTH surfaces that read an
 * employer's sentence:
 *   - structureValueStatement (chat / intake) → `headcount`;
 *   - the /dashboard/market/recognize path → structureNeed's `teamSize`,
 *     countPeopleInNeed (the recognizer's scope), detectJobDemandFields;
 * and the one shared duration reader, parseDurationDays.
 *
 * A singular occupation after a seek verb is ONE person in the value
 * statement when the LT grammar states it ("Ieškome suvirintojo" → 1);
 * elsewhere a singular stays null (unstated). structureNeed never invents 1.
 */
const TODAY = "2026-10-23";
const YEAR = 365;
const MONTH = 30;

type Case = {
  readonly text: string;
  /** structureValueStatement().headcount */
  readonly head: number | null;
  /** structureNeed().teamSize and countPeopleInNeed() */
  readonly people: number | null;
  /** parseDurationDays() */
  readonly days: number | null;
};

const CASES: readonly Case[] = [
  // ── LT ──
  { text: "Ieškome suvirintojo 2 metams", head: 1, people: null, days: 2 * YEAR },
  { text: "Ieškome dvejiems metams suvirintojo", head: 1, people: null, days: 2 * YEAR },
  { text: "Reikia 2 suvirintojų 6 mėnesiams", head: 2, people: 2, days: 6 * MONTH },
  { text: "Reikia 2 mūrininkų", head: 2, people: 2, days: null },
  { text: "Reikia suvirintojo, 15 eur/val.", head: 1, people: null, days: null },
  { text: "Reikia mūrininko 40 val. per savaitę", head: 1, people: null, days: null },
  { text: "Reikia 3 metų patirties suvirintojo", head: null, people: null, days: null },
  { text: "Reikia suvirintojo, 2500 eur bruto", head: 1, people: null, days: null },
  // ── EN ──
  { text: "We need a welder for 2 years", head: null, people: null, days: 2 * YEAR },
  { text: "Need 2 welders for 6 months", head: 2, people: 2, days: 6 * MONTH },
  { text: "Need a welder, 15 eur per hour", head: null, people: null, days: null },
  { text: "Need 3 years experience", head: null, people: null, days: null },
  // ── RU ──
  { text: "Нужен сварщик на 2 года", head: null, people: null, days: 2 * YEAR },
  { text: "Нужны 2 сварщика на 6 месяцев", head: 2, people: 2, days: 6 * MONTH },
  { text: "Нужен сварщик, опыт 3 года", head: null, people: null, days: null },
  // ── DE ──
  { text: "Wir suchen einen Schweißer für 2 Jahre", head: null, people: null, days: 2 * YEAR },
  { text: "Wir suchen 2 Schweißer für 6 Monate", head: 2, people: 2, days: 6 * MONTH },
  { text: "Wir suchen einen Schweißer, 15 Euro pro Stunde", head: null, people: null, days: null },
  // ── PL ──
  { text: "Szukamy spawacza na 2 lata", head: null, people: null, days: 2 * YEAR },
  { text: "Szukamy 2 spawaczy na 6 miesięcy", head: 2, people: 2, days: 6 * MONTH },
  { text: "Szukamy spawacza, 40 godzin tygodniowo", head: null, people: null, days: null },
  // ── NL ──
  { text: "Lasser gezocht voor 2 jaar", head: null, people: null, days: 2 * YEAR },
  { text: "We zoeken 2 lassers voor 6 maanden", head: 2, people: 2, days: 6 * MONTH },
  { text: "Lasser gezocht, 40 uur per week", head: null, people: null, days: null },
];

describe("headcount vs duration / pay / hours / experience", () => {
  it.each(CASES)("$text", ({ text, head, people, days }) => {
    expect(structureValueStatement(text, TODAY).headcount, "value statement headcount").toBe(head);
    expect(structureNeed({ description: text }).teamSize, "structureNeed teamSize").toBe(people);
    expect(countPeopleInNeed({ description: text }), "recognizer people count").toBe(people);
    expect(parseDurationDays(text), "duration").toBe(days);
    // The recognizer's scope is stated exactly when a people count or a
    // duration is.
    const scope = detectJobDemandFields(text).recognized.some((r) => r.key === "scope");
    expect(scope, "recognizer scope").toBe(people !== null || days !== null);
  });

  it("a number with a unit is never a value-statement headcount", () => {
    for (const text of [
      "Reikia suvirintojo, 15 eur/val.",
      "Reikia mūrininko 40 val. per savaitę",
      "Reikia 3 metų patirties suvirintojo",
      "Reikia suvirintojo, 2500 eur bruto",
    ]) {
      const v = structureValueStatement(text, TODAY);
      for (const n of [15, 40, 3, 2500]) expect(v.headcount, `${text} → ${n}`).not.toBe(n);
    }
  });

  it("'dvejiems metams' before the occupation is two years, not two welders", () => {
    const v = structureValueStatement("Ieškome dvejiems metams suvirintojo", TODAY);
    expect(v.headcount).not.toBe(2);
    expect(parseDurationDays("Ieškome dvejiems metams suvirintojo")).toBe(730);
  });
});

/**
 * Teams of a stated size. The total is teams × perTeam (12), but neither
 * the value statement nor the need structure has a team field yet, so the
 * plain headcount stays UNRESOLVED and the composition is FLAGGED — never
 * reported as 3 or 4.
 */
describe("teams of a stated size: unresolved and flagged, never 3 or 4", () => {
  it.each([
    "Reikia 3 brigadų po 4 žmones",
    "Need 3 crews of 4 people",
    "Нужны 3 бригады по 4 человека",
    "Wir suchen 3 Teams zu 4 Personen",
    "Potrzebujemy 3 brygady po 4 osoby",
    "We zoeken 3 ploegen van 4 mensen",
  ])("%s", (text) => {
    expect(detectTeamComposition(text)).toEqual({ teams: 3, perTeam: 4 });

    const v = structureValueStatement(text, TODAY);
    expect(v.headcount).toBeNull();
    expect(v.reasons).toContain("team_composition:3x4");
    if (v.axis === "seek") {
      expect(v.subject).toBe("workforce");
      expect(v.missing).toContain("headcount");
    }

    const s = structureNeed({ description: text });
    expect(s.teamSize).toBeNull();
    expect(s.reasons).toContain("team_composition:3x4");
    expect(s.needsReview).toBe(true);

    expect(countPeopleInNeed({ description: text })).toBeNull();
    // The extent of the work IS stated, so the recognizer does not ask for it.
    expect(detectJobDemandFields(text).recognized.map((r) => r.key)).toContain("scope");
  });

  it("an ordinary count is not a team composition", () => {
    expect(detectTeamComposition("Reikia 2 suvirintojų 6 mėnesiams")).toBeNull();
    expect(detectTeamComposition("Need 4 welders for 3 months")).toBeNull();
  });
});
