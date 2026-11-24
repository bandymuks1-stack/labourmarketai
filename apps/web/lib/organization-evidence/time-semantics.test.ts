import { describe, expect, it } from "vitest";

import {
  classifyTimeSemantics,
  countsAsDailyHours,
  extractSourceTimeCues,
  periodFromHumanInput,
  periodSpanIn,
  periodWordsIn,
  remoteEvidencedIn,
  sourceTimeConflicts,
  timeSemanticsOpen,
  withSourceCues,
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

/**
 * Owner rule 2026-09-23 — never manufacture precision. The source's own
 * sentence states a duration and a rate; they are READ (verbatim), and a
 * human's period is set against them as a WARNING, never a refusal.
 */
const AGGREGATE_A_TEXT = "Human research and director for at least 16 month calculating each month only 50 hours";
const AGGREGATE_B_TEXT = "Coordination and consultation all 16 month when was in Lithuania, there is counting only 7 hours per week";

describe("the source's words state a duration and a rate — read verbatim, never computed", () => {
  it("'at least 16 month … each month only 50 hours' → duration {16, month, at_least}, rate 50 h per month", () => {
    const cues = extractSourceTimeCues(AGGREGATE_A_TEXT)!;
    expect(cues.method).toBe("source_words");
    expect(cues.duration).toEqual({ count: 16, unit: "month", bound: "at_least", words: "at least 16 month" });
    expect(cues.rate).toEqual({ hours: 50, per: "month", words: "each month only 50 hours" });
  });

  it("'all 16 month … 7 hours per week' → duration {16, month, exact}, rate 7 h per week", () => {
    const cues = extractSourceTimeCues(AGGREGATE_B_TEXT)!;
    expect(cues.duration).toEqual({ count: 16, unit: "month", bound: "exact", words: "16 month" });
    expect(cues.rate).toEqual({ hours: 7, per: "week", words: "7 hours per week" });
  });

  it("classifyTimeSemantics carries the cues with the question; no period is invented", () => {
    const ts = classifyTimeSemantics({ hours: 800, hasSingleDate: true, workText: AGGREGATE_A_TEXT, contextLabel: null })!;
    expect(ts.sourceCues?.duration?.bound).toBe("at_least");
    expect(ts.sourceCues?.rate?.hours).toBe(50);
    expect(ts.periodStart).toBeNull();
    expect(ts.periodEnd).toBeNull();
  });

  it.each([
    ["mažiausiai 16 mėnesių, kas mėnesį po 50 val.", { count: 16, unit: "month", bound: "at_least" }, { hours: 50, per: "month" }],
    ["minstens 16 maanden, 7 uur per week", { count: 16, unit: "month", bound: "at_least" }, { hours: 7, per: "week" }],
    ["mindestens 16 Monate, 7 Stunden pro Woche", { count: 16, unit: "month", bound: "at_least" }, { hours: 7, per: "week" }],
    ["co najmniej 16 miesięcy, 50 godzin miesięcznie", { count: 16, unit: "month", bound: "at_least" }, { hours: 50, per: "month" }],
    ["не менее 16 месяцев, каждый месяц только 50 часов", { count: 16, unit: "month", bound: "at_least" }, { hours: 50, per: "month" }],
    ["about 3 weeks, 7,5h/day", { count: 3, unit: "week", bound: "about" }, { hours: 7.5, per: "day" }],
    ["up to 2 years", { count: 2, unit: "year", bound: "at_most" }, null],
  ])("%s", (text, duration, rate) => {
    const cues = extractSourceTimeCues(text)!;
    expect(cues).not.toBeNull();
    expect(cues.duration).toMatchObject(duration);
    if (rate) expect(cues.rate).toMatchObject(rate);
    else expect(cues.rate).toBeNull();
  });

  it("the stated words are the source's own spelling, not the folded form", () => {
    expect(extractSourceTimeCues("mažiausiai 16 mėnesių")!.duration!.words).toBe("mažiausiai 16 mėnesių");
  });

  it("negative controls: no quantity, a calendar year, a recurrence, a week NUMBER → no cue", () => {
    expect(extractSourceTimeCues("werk")).toBeNull();
    expect(extractSourceTimeCues(null)).toBeNull();
    expect(extractSourceTimeCues("Hoofdgracht 3 dakwerk")).toBeNull();
    // "2025 metų" names a year, not a span of 2025 years
    expect(extractSourceTimeCues("2025 metų lapkritis")).toBeNull();
    expect(extractSourceTimeCues("week 50")).toBeNull();
    expect(extractSourceTimeCues("every 2 weeks")).toBeNull();
    // a figure a unit cannot hold is not a rate
    expect(extractSourceTimeCues("30 hours per day")).toBeNull();
  });

  it("withSourceCues reads the text only when the classification predates the cues", () => {
    const legacy = { value: "period_aggregate" as const, method: "human_choice" as const, confidence: 1, sourceHours: 800, remote: true, periodStart: null, periodEnd: null };
    expect(withSourceCues(legacy, AGGREGATE_A_TEXT)?.sourceCues?.rate?.hours).toBe(50);
    const already = { ...legacy, sourceCues: null };
    expect(withSourceCues(already, AGGREGATE_A_TEXT)?.sourceCues).toBeNull();
    expect(withSourceCues(null, AGGREGATE_A_TEXT)).toBeNull();
  });
});

describe("a human period set against the source's words — WARN, never refuse", () => {
  it("800 h, 'at least 16 month', 'each month only 50 hours', interpreted as Jun–Nov 2025 → shorter than the minimum AND off the rate", () => {
    const conflicts = sourceTimeConflicts({
      hours: 800, periodStart: "2025-06-01", periodEnd: "2025-11-30", cues: extractSourceTimeCues(AGGREGATE_A_TEXT),
    });
    expect(conflicts).toContain("span_below_stated_minimum");
    expect(conflicts).toContain("rate_differs");
    // 16 × 50 makes the source's own total: the SOURCE agrees with itself
    expect(conflicts).not.toContain("source_internally_inconsistent");
  });

  it("165 h, 'all 16 month', '7 hours per week', interpreted as Jul–Nov 2025 → the span differs, and the source disagrees with itself", () => {
    const conflicts = sourceTimeConflicts({
      hours: 165, periodStart: "2025-07-01", periodEnd: "2025-11-30", cues: extractSourceTimeCues(AGGREGATE_B_TEXT),
    });
    expect(conflicts).toContain("span_differs_from_stated");
    expect(conflicts).toContain("source_internally_inconsistent");
    expect(conflicts.length).toBeGreaterThan(0);
  });

  it("negative control: a period that matches the words raises nothing", () => {
    // 16 whole months, 50 h each: exactly what the sentence says
    expect(
      sourceTimeConflicts({ hours: 800, periodStart: "2024-08-01", periodEnd: "2025-11-30", cues: extractSourceTimeCues(AGGREGATE_A_TEXT) }),
    ).toEqual([]);
    // nothing stated → nothing to compare
    expect(sourceTimeConflicts({ hours: 800, periodStart: "2025-06-01", periodEnd: "2025-11-30", cues: null })).toEqual([]);
    // span unknown → only the source's own consistency can be judged
    expect(sourceTimeConflicts({ hours: 800, periodStart: null, periodEnd: null, cues: extractSourceTimeCues(AGGREGATE_A_TEXT) })).toEqual([]);
  });

  it("whole calendar months count exactly; any other span converts from days", () => {
    expect(periodSpanIn("month", "2025-06-01", "2025-11-30")).toBe(6);
    expect(periodSpanIn("year", "2025-01-01", "2025-12-31")).toBe(1);
    expect(periodSpanIn("week", "2025-06-02", "2025-06-15")).toBe(2);
    expect(periodSpanIn("day", "2025-06-01", "2025-06-01")).toBe(1);
    expect(periodSpanIn("month", "2025-06-30", "2025-06-01")).toBeNull();
  });
});

describe("a human's period is read at the precision it was given; a start alone is not a period", () => {
  it("two months → the first and the last day, precision month", () => {
    expect(periodFromHumanInput("2025-06", "2025-11")).toEqual({
      ok: true, periodStart: "2025-06-01", periodEnd: "2025-11-30", precision: "month",
    });
    expect(periodFromHumanInput("2024-02", "2024-02")).toEqual({
      ok: true, periodStart: "2024-02-01", periodEnd: "2024-02-29", precision: "month",
    });
  });
  it("two days → precision day, unchanged", () => {
    expect(periodFromHumanInput("2025-06-03", "2025-06-20")).toEqual({
      ok: true, periodStart: "2025-06-03", periodEnd: "2025-06-20", precision: "day",
    });
  });
  it("nothing → no period (UNKNOWN), never a default", () => {
    expect(periodFromHumanInput("", null)).toEqual({ ok: true, periodStart: null, periodEnd: null, precision: null });
  });
  it("a start alone is REFUSED — it used to become a one-day period", () => {
    const r = periodFromHumanInput("2025-06", "");
    expect(r.ok).toBe(false);
    const d = periodFromHumanInput("2025-06-01", null);
    expect(d.ok).toBe(false);
  });
  it("an inverted, mixed or malformed period is refused", () => {
    expect(periodFromHumanInput("2025-11", "2025-06").ok).toBe(false);
    expect(periodFromHumanInput("2025-06", "2025-11-30").ok).toBe(false);
    expect(periodFromHumanInput("2025-13", "2025-14").ok).toBe(false);
    expect(periodFromHumanInput("2025-02-30", "2025-03-01").ok).toBe(false);
    expect(periodFromHumanInput(null, "2025-11").ok).toBe(false);
  });
});
