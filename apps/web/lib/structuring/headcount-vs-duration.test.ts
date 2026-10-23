import { describe, expect, it } from "vitest";

import { detectJobDemandFields, recognizeIntent } from "@/lib/market/recognition";
import { readNeedHeadcount, readsSingularOccupation } from "./need-headcount";
import {
  countPeopleInNeed,
  detectTeamComposition,
  readTeamComposition,
  resolveCountryAndCity,
  structureNeed,
} from "./structure-need";
import { foldText } from "./normalize";
import { parseDurationDays } from "./time-window";
import { structureValueStatement } from "./value-statement";

/**
 * HOW MANY WORKERS a need states — owner orders 2026-10-23:
 *   - a duration, a pay rate, hours or experience is NEVER a headcount;
 *   - "3 brigados po 4 žmones" is 3 teams AND 12 workers;
 *   - teams with no size or a range are ASKED, never guessed;
 *   - one singular occupation with no number is ONE worker, in all six
 *     locales.
 * Every case runs through both need surfaces:
 *   - the chat → structureValueStatement().headcount;
 *   - /dashboard/market/recognize → recognizeIntent().headcount (the shared
 *     readNeedHeadcount), detectJobDemandFields (scope);
 * plus structureNeed().teamSize (the demand wizard's prefill and the stored
 * `team_size`) and the shared duration reader parseDurationDays.
 *
 * structureNeed keeps a singular occupation's team size EMPTY (the wizard's
 * field shows the placeholder 1): it counts only a stated number or teams.
 */
const TODAY = "2026-10-23";
const YEAR = 365;
const MONTH = 30;

type Case = {
  readonly text: string;
  /** chat: structureValueStatement().headcount */
  readonly chat: number | null;
  /** recognize page: recognizeIntent("need_workers").headcount?.total */
  readonly page: number | null;
  /** wizard prefill / team_size: structureNeed().teamSize */
  readonly wizard: number | null;
  /** parseDurationDays() */
  readonly days: number | null;
};

const CASES: readonly Case[] = [
  // ── LT ──
  { text: "Ieškome suvirintojo 2 metams", chat: 1, page: 1, wizard: null, days: 2 * YEAR },
  { text: "Ieškome dvejiems metams suvirintojo", chat: 1, page: 1, wizard: null, days: 2 * YEAR },
  { text: "Reikia 2 suvirintojų 6 mėnesiams", chat: 2, page: 2, wizard: 2, days: 6 * MONTH },
  { text: "Reikia 2 mūrininkų", chat: 2, page: 2, wizard: 2, days: null },
  { text: "Reikia suvirintojo", chat: 1, page: 1, wizard: null, days: null },
  { text: "Reikia suvirintojų", chat: null, page: null, wizard: null, days: null },
  { text: "Reikia suvirintojo, 15 eur/val.", chat: 1, page: 1, wizard: null, days: null },
  { text: "Reikia mūrininko 40 val. per savaitę", chat: 1, page: 1, wizard: null, days: null },
  { text: "Reikia 3 metų patirties suvirintojo", chat: 1, page: 1, wizard: null, days: null },
  { text: "Reikia suvirintojo, 2500 eur bruto", chat: 1, page: 1, wizard: null, days: null },
  // ── EN ──
  { text: "We need a welder for 2 years", chat: 1, page: 1, wizard: null, days: 2 * YEAR },
  { text: "We need a welder", chat: 1, page: 1, wizard: null, days: null },
  { text: "We need welders", chat: null, page: null, wizard: null, days: null },
  { text: "Need 2 welders for 6 months", chat: 2, page: 2, wizard: 2, days: 6 * MONTH },
  { text: "Need a welder, 15 eur per hour", chat: 1, page: 1, wizard: null, days: null },
  { text: "Need 3 years experience", chat: null, page: null, wizard: null, days: null },
  // ── RU ──
  { text: "Нужен сварщик на 2 года", chat: 1, page: 1, wizard: null, days: 2 * YEAR },
  { text: "Нужен сварщик", chat: 1, page: 1, wizard: null, days: null },
  { text: "Нужны сварщики", chat: null, page: null, wizard: null, days: null },
  { text: "Нужны 2 сварщика на 6 месяцев", chat: 2, page: 2, wizard: 2, days: 6 * MONTH },
  { text: "Нужен сварщик, опыт 3 года", chat: 1, page: 1, wizard: null, days: null },
  // ── DE ──
  { text: "Wir suchen einen Schweißer für 2 Jahre", chat: 1, page: 1, wizard: null, days: 2 * YEAR },
  { text: "Wir suchen einen Schweißer", chat: 1, page: 1, wizard: null, days: null },
  { text: "Wir suchen Schweißer", chat: null, page: null, wizard: null, days: null },
  { text: "Wir suchen 2 Schweißer für 6 Monate", chat: 2, page: 2, wizard: 2, days: 6 * MONTH },
  { text: "Wir suchen einen Schweißer, 15 Euro pro Stunde", chat: 1, page: 1, wizard: null, days: null },
  // ── PL ──
  { text: "Szukamy spawacza na 2 lata", chat: 1, page: 1, wizard: null, days: 2 * YEAR },
  { text: "Szukamy spawacza", chat: 1, page: 1, wizard: null, days: null },
  { text: "Szukamy spawaczy", chat: null, page: null, wizard: null, days: null },
  { text: "Szukamy 2 spawaczy na 6 miesięcy", chat: 2, page: 2, wizard: 2, days: 6 * MONTH },
  { text: "Szukamy spawacza, 40 godzin tygodniowo", chat: 1, page: 1, wizard: null, days: null },
  // ── NL ──
  { text: "Lasser gezocht voor 2 jaar", chat: 1, page: 1, wizard: null, days: 2 * YEAR },
  { text: "Lasser gezocht", chat: 1, page: 1, wizard: null, days: null },
  { text: "Lassers gezocht", chat: null, page: null, wizard: null, days: null },
  { text: "We zoeken 2 lassers voor 6 maanden", chat: 2, page: 2, wizard: 2, days: 6 * MONTH },
  { text: "Lasser gezocht, 40 uur per week", chat: 1, page: 1, wizard: null, days: null },
];

describe("headcount vs duration / pay / hours / experience, and one singular occupation = 1", () => {
  it.each(CASES)("$text", ({ text, chat, page, wizard, days }) => {
    expect(structureValueStatement(text, TODAY).headcount, "chat headcount").toBe(chat);
    expect(recognizeIntent("need_workers", { rawText: text }).headcount?.total ?? null, "recognize page").toBe(page);
    expect(structureNeed({ description: text }).teamSize, "wizard team size").toBe(wizard);
    expect(parseDurationDays(text), "duration").toBe(days);
    // The recognizer's scope ("Darbų apimtis") is stated by a counted number
    // of people or by a duration — a singular occupation alone does not.
    const scope = detectJobDemandFields(text).recognized.some((r) => r.key === "scope");
    expect(scope, "recognizer scope").toBe(countPeopleInNeed({ description: text }) !== null || days !== null);
  });

  it("a number with a unit is never the headcount", () => {
    const cases: ReadonlyArray<[string, number]> = [
      ["Reikia suvirintojo, 15 eur/val.", 15],
      ["Reikia mūrininko 40 val. per savaitę", 40],
      ["Reikia 3 metų patirties suvirintojo", 3],
      ["Reikia suvirintojo, 2500 eur bruto", 2500],
      ["Need a welder, 15 eur per hour", 15],
      ["Нужен сварщик, опыт 3 года", 3],
      ["Wir suchen einen Schweißer, 15 Euro pro Stunde", 15],
      ["Szukamy spawacza, 40 godzin tygodniowo", 40],
      ["Lasser gezocht, 40 uur per week", 40],
    ];
    for (const [text, n] of cases) {
      expect(structureValueStatement(text, TODAY).headcount, text).not.toBe(n);
      expect(readNeedHeadcount(text)?.total ?? null, text).not.toBe(n);
      expect(structureNeed({ description: text }).teamSize, text).not.toBe(n);
    }
  });

  it("the person seeking work is not a headcount on the recognize page", () => {
    expect(recognizeIntent("need_work", { rawText: "Ieškau suvirintojo darbo" }).headcount).toBeUndefined();
  });

  it("a singular occupation needs a demand verb and no counted number", () => {
    expect(readsSingularOccupation("Suvirintojas")).toBe(false);
    expect(readsSingularOccupation("Reikia 2 suvirintojų")).toBe(false);
    expect(readsSingularOccupation("Reikalingi suvirintojai")).toBe(false);
  });
});

/**
 * Teams of a stated size: 3 teams AND 3 × 4 = 12 workers, in all six
 * locales. The total is the headcount everywhere (chat, recognize page,
 * wizard / `team_size`); the composition rides beside it.
 */
describe("teams of a stated size: teams AND the total", () => {
  it.each([
    "Reikia 3 brigadų po 4 žmones",
    "Reikia 3 brigados po 4 žmones",
    "Need 3 crews of 4 people",
    "Нужны 3 бригады по 4 человека",
    "Wir suchen 3 Teams zu 4 Personen",
    "Potrzebujemy 3 brygady po 4 osoby",
    "We zoeken 3 ploegen van 4 mensen",
  ])("%s → 3 × 4 = 12", (text) => {
    expect(readTeamComposition(text)).toEqual({ status: "known", teams: 3, perTeam: 4, total: 12 });
    expect(detectTeamComposition(text)).toEqual({ teams: 3, perTeam: 4 });

    const v = structureValueStatement(text, TODAY);
    expect(v.headcount).toBe(12);
    expect(v.teamCount).toBe(3);
    expect(v.perTeamSize).toBe(4);
    expect(v.teamClarification).toBeUndefined();
    expect(v.reasons).toContain("team_composition:3x4");
    expect(v.missing).not.toContain("headcount");
    expect(v.missing).not.toContain("team_size");

    const s = structureNeed({ description: text });
    expect(s.teamSize).toBe(12);
    expect(s.teamCount).toBe(3);
    expect(s.perTeamSize).toBe(4);
    expect(s.reasons).toContain("team_composition:3x4");

    const card = recognizeIntent("need_workers", { rawText: text });
    expect(card.headcount).toEqual({ total: 12, teams: 3, perTeam: 4, basis: "teams", clarification: null });
    expect(card.recognized.map((r) => r.key)).toContain("scope");
    // "brigad…" / "brygad…" contain "riga" / "ryga": never a Latvian location.
    expect(structureNeed({ description: text }).country).toBeNull();
    expect(card.recognized.map((r) => r.key)).not.toContain("location");
    // "4 mensen" is four people, never four months.
    expect(parseDurationDays(text)).toBeNull();
  });

  it("one team of a stated size", () => {
    expect(readNeedHeadcount("Need a crew of 5")).toEqual({ total: 5, teams: 1, perTeam: 5, basis: "teams", clarification: null });
  });

  it("an ordinary count is not a team composition", () => {
    expect(readTeamComposition("Reikia 2 suvirintojų 6 mėnesiams")).toBeNull();
    expect(readTeamComposition("Need 4 welders for 3 months")).toBeNull();
  });

  it("a team LEADER is one person, never a team to size", () => {
    expect(readTeamComposition("Reikia brigados vadovo")).toBeNull();
    expect(readTeamComposition("Reikia brigadininko")).toBeNull();
    expect(readTeamComposition("Нужен бригадир")).toBeNull();
    expect(readTeamComposition("Szukamy brygadzisty")).toBeNull();
    expect(readTeamComposition("We need a crew leader")).toBeNull();
  });

  it("Riga still resolves where it is meant", () => {
    expect(resolveCountryAndCity(foldText("Darbas Rygoje"))).toEqual({ country: "LV", city: "Riga" });
    expect(resolveCountryAndCity(foldText("Work in Riga"))).toEqual({ country: "LV", city: "Riga" });
    expect(resolveCountryAndCity(foldText("Reikia 3 brigadų po 4 žmones"))).toEqual({ country: null, city: null });
  });
});

/**
 * Teams the sentence does not size, sizes as a range, or does not count:
 * NO total is guessed — the headcount stays null, the clarification code
 * says what to ask, and both surfaces ask it.
 */
describe("unclear teams: ask, never guess", () => {
  it.each([
    ["Reikia 3–4 brigadų", "team_count_range", null],
    ["Reikia 3-4 brigadų po 5 žmones", "team_count_range", null],
    ["Reikia brigados", "team_size_missing", null],
    ["Reikia 2 brigadų", "team_size_missing", 2],
    ["Reikia brigadų po 4 žmones", "team_count_missing", null],
    ["Reikia 3 brigadų po 3-4 žmones", "per_team_range", 3],
    ["Need 2-3 crews", "team_count_range", null],
    ["We need a crew", "team_size_missing", 1],
    ["Нужна бригада", "team_size_missing", null],
    ["Нужны 2–3 бригады", "team_count_range", null],
    ["Wir suchen eine Kolonne", "team_size_missing", 1],
    ["Wir suchen 2-3 Kolonnen", "team_count_range", null],
    ["Szukamy brygady", "team_size_missing", null],
    ["Szukamy 2-3 brygad", "team_count_range", null],
    ["We zoeken een ploeg", "team_size_missing", 1],
    ["We zoeken 2-3 ploegen", "team_count_range", null],
  ] as const)("%s → %s", (text, clarification, teams) => {
    expect(readTeamComposition(text)).toEqual({ status: "unclear", clarification, teams });

    const v = structureValueStatement(text, TODAY);
    expect(v.headcount).toBeNull();
    expect(v.teamClarification).toBe(clarification);
    expect(v.reasons).toContain(`team_clarification:${clarification}`);
    if (v.subject === "workforce") expect(v.missing).toContain("team_size");

    const s = structureNeed({ description: text });
    expect(s.teamSize).toBeNull();
    expect(s.teamClarification).toBe(clarification);
    expect(s.needsReview).toBe(true);

    const card = recognizeIntent("need_workers", { rawText: text });
    expect(card.headcount?.total).toBeNull();
    expect(card.headcount?.clarification).toBe(clarification);
  });
});
