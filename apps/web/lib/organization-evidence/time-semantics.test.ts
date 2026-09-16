import { describe, expect, it } from "vitest";

import {
  classifyTimeSemantics,
  countsAsDailyHours,
  periodWordsIn,
  remoteEvidencedIn,
  timeSemanticsOpen,
} from "./time-semantics";

/**
 * Owner correction 2026-09-16: the 800 h / 165 h figures on dated rows were
 * aggregate hours over months, not a day's work. The classifier reads the
 * source's WORDS — never the two numbers — and never invents a period.
 */

describe("a figure a day can hold needs no classification", () => {
  it("returns null for ordinary daily hours, whatever the text says", () => {
    expect(classifyTimeSemantics({ hours: 9, hasSingleDate: true, workText: "werk for 16 month", contextLabel: null })).toBeNull();
    expect(classifyTimeSemantics({ hours: 24, hasSingleDate: true, workText: null, contextLabel: null })).toBeNull();
    expect(classifyTimeSemantics({ hours: null, hasSingleDate: true, workText: null, contextLabel: null })).toBeNull();
  });
  it("a period row (start/end stated) is not a single date and is not classified here", () => {
    expect(classifyTimeSemantics({ hours: 800, hasSingleDate: false, workText: "16 month", contextLabel: null })).toBeNull();
  });
});

describe("the owner's two rows, by their own words", () => {
  it("'for at least 16 month … each month only 50 hours' → period aggregate, period UNKNOWN, remote not evidenced", () => {
    const ts = classifyTimeSemantics({
      hours: 800, hasSingleDate: true,
      workText: "Human research and director for at least 16 month calculating each month only 50 hours",
      contextLabel: "Administraciniai/koordinavimo darbai",
    })!;
    expect(ts.value).toBe("period_aggregate");
    expect(ts.method).toBe("aggregate_period_words_in_text");
    expect(ts.sourceHours).toBe(800);
    expect(ts.note).toBe("month");
    expect(ts.periodStart).toBeNull();
    expect(ts.periodEnd).toBeNull();
    expect(ts.remote).toBeNull();
    expect(timeSemanticsOpen(ts)).toBe(true);
    expect(countsAsDailyHours(ts)).toBe(false);
  });
  it("'all 16 month … 7 hours per week' → period aggregate; 'when was in Lithuania' is a location, not remote evidence", () => {
    const ts = classifyTimeSemantics({
      hours: 165, hasSingleDate: true,
      workText: "Coordination and consultation all 16 month when was in Lithuania, there is counting only 7 hours per week",
      contextLabel: "Administraciniai/koordinavimo darbai",
    })!;
    expect(ts.value).toBe("period_aggregate");
    expect(ts.remote).toBeNull();
    expect(ts.periodStart).toBeNull();
  });
  it("the numbers themselves decide nothing: 800 h with no period words is UNKNOWN, not an aggregate", () => {
    const ts = classifyTimeSemantics({ hours: 800, hasSingleDate: true, workText: "werk", contextLabel: "Hoofdgracht 3" })!;
    expect(ts.value).toBe("unknown");
    expect(ts.method).toBe("exceeds_day_no_period_evidence");
    expect(ts.sourceHours).toBe(800);
  });
});

describe("remote work is evidenced only by the source's words", () => {
  it.each([
    ["40 uur thuiswerk deze maand", true],
    ["Work from home, monthly total", true],
    ["nuotoliniu būdu, per mėnesį", true],
    ["Bürotätigkeit, Monat", null],
    ["on site all week", null],
  ])("%s → remote %s", (text, expected) => {
    expect(remoteEvidencedIn(text)).toBe(expected);
    const ts = classifyTimeSemantics({ hours: 100, hasSingleDate: true, workText: text, contextLabel: null })!;
    expect(ts.remote).toBe(expected);
    expect(ts.value).toBe("period_aggregate");
  });
  it("period words are found across the source languages, as whole words", () => {
    expect(periodWordsIn("werk per maand")).toBe("maand");
    expect(periodWordsIn("darbas per mėnesį")).toBe("menesi");
    expect(periodWordsIn("Arbeit im Monat")).toBe("monat");
    expect(periodWordsIn("работа за месяц")).toBe("месяц");
    expect(periodWordsIn("Hoofdgracht 3 dakwerk")).toBeNull();
    // `week` inside another word is not a period word.
    expect(periodWordsIn("weekend shift")).toBeNull();
  });
});

describe("a human choice closes the question; daily is the only reading that counts as a day", () => {
  it("human_choice is not open; period_aggregate and unknown never count as daily hours", () => {
    const base = classifyTimeSemantics({ hours: 800, hasSingleDate: true, workText: "16 month", contextLabel: null })!;
    const decided = { ...base, method: "human_choice" as const, remote: true, periodStart: "2024-07-01", periodEnd: "2025-10-31" };
    expect(timeSemanticsOpen(decided)).toBe(false);
    expect(countsAsDailyHours(decided)).toBe(false);
    expect(countsAsDailyHours({ ...decided, value: "unknown" })).toBe(false);
    expect(countsAsDailyHours({ ...decided, value: "daily" })).toBe(true);
    expect(countsAsDailyHours(null)).toBe(true);
  });
});
