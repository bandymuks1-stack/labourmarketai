import { describe, expect, it } from "vitest";

import { WORK_PERIOD_KEYS } from "@/lib/journal/work-intelligence";
import { classifyIntent } from "./intent-router";
import { parseJournalPeriodPhrase } from "./journal-period-phrase";

/**
 * The period a journal question names is the period the answer is about
 * (issue #1689, outcome 1). Production 2026-09-11: "kiek valandų dirbau
 * šiandien?" answered a 13-day total. Every routed locale, both ways.
 */
describe("parseJournalPeriodPhrase", () => {
  it("reads TODAY in every routed locale, with or without diacritics", () => {
    for (const s of [
      "kiek valandų dirbau šiandien?",
      "kiek valandu dirbau siandien",
      "how many hours did I work today?",
      "сколько часов я сегодня работал?",
      "wie viele Stunden habe ich heute gearbeitet?",
      "hoeveel uur heb ik vandaag gewerkt?",
    ]) {
      expect(parseJournalPeriodPhrase(s), s).toBe("today");
    }
  });

  it("reads YESTERDAY as its own single-day window", () => {
    for (const s of ["kiek dirbau vakar?", "what did I do yesterday", "что я делал вчера", "was habe ich gestern gemacht", "wat deed ik gisteren"]) {
      expect(parseJournalPeriodPhrase(s), s).toBe("yesterday");
    }
  });

  it("reads the section's week / month / year / all periods", () => {
    const cases: Array<[string, string]> = [
      ["kiek valandų dirbau šią savaitę?", "week"],
      ["how many hours this week", "week"],
      ["сколько часов за неделю", "week"],
      ["wie viele Stunden diese Woche", "week"],
      ["hoeveel uren deze week", "week"],
      ["kiek dirbau šį mėnesį", "month"],
      ["hours this month?", "month"],
      ["сколько часов в этом месяце", "month"],
      ["Stunden diesen Monat", "month"],
      ["uren deze maand", "month"],
      ["kiek valandų dirbau šiais metais", "year"],
      ["per metus", "year"],
      ["how many hours this year", "year"],
      ["часов за год", "year"],
      ["Stunden dieses Jahr", "year"],
      ["uren dit jaar", "year"],
      ["kiek iš viso valandų dirbau?", "all"],
      ["kiek valandų dirbau per visą laiką", "all"],
      ["how many hours in total", "all"],
      ["all time hours", "all"],
      ["сколько часов всего", "all"],
      ["сколько часов за всё время", "all"],
      ["wie viele Stunden insgesamt", "all"],
      ["hoeveel uren in totaal", "all"],
    ];
    for (const [s, want] of cases) expect(parseJournalPeriodPhrase(s), s).toBe(want);
  });

  it("names NO period when the sentence names none — the recent window stays", () => {
    for (const s of [
      "kiek valandų dirbau?",
      "parodyk mano žurnalą",
      "show my latest journal entries",
      "ką dariau darbo metu", // LT "metu" is not the year
      "weekend plans",
      "",
    ]) {
      expect(parseJournalPeriodPhrase(s), s).toBeNull();
    }
    expect(parseJournalPeriodPhrase(null)).toBeNull();
    expect(parseJournalPeriodPhrase(undefined)).toBeNull();
  });

  it("the narrowest named window wins", () => {
    expect(parseJournalPeriodPhrase("kiek dirbau šiandien ir šią savaitę")).toBe("today");
    expect(parseJournalPeriodPhrase("this week and this month")).toBe("week");
  });

  it("every value is a section period key or yesterday", () => {
    const seen = new Set<string>();
    for (const s of ["šiandien", "vakar", "savaitę", "mėnesį", "metus", "iš viso"]) {
      const v = parseJournalPeriodPhrase(s);
      expect(v).not.toBeNull();
      seen.add(v!);
      expect(v === "yesterday" || (WORK_PERIOD_KEYS as readonly string[]).includes(v!)).toBe(true);
    }
    expect(seen.size).toBe(6);
  });

  it("the period questions still route to the journal read (not log-work)", () => {
    for (const s of [
      "kiek valandų dirbau šiandien?",
      "kiek valandų dirbau šią savaitę?",
      "how many hours did I work this month?",
      "сколько часов я работал вчера?",
    ]) {
      expect(classifyIntent(s).intent, s).toBe("journal-recent");
    }
  });
});
