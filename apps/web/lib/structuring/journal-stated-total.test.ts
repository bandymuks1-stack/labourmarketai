import { describe, expect, it } from "vitest";
import { extractJournalSuggestions } from "./extract-journal-suggestions";

/**
 * Issue #1689 — the owner's own day, read by the fragment recognizer:
 *
 *   "Šiandien 9 valandas dirbau LabourMarket.ai: 5 val. programavau,
 *    2 val. testavau, 2 val. ieškojau partnerių."
 *
 * Measured 2026-09-11 on production code: the `val.` abbreviation dot and
 * the dot in "LabourMarket.ai" split the sentence into "…LabourMarket" /
 * "ai: 5 val" / "programavau" / "2 val" / "2 val" — the 9 h header became a
 * FOURTH timed fragment (18 h for a 9 h day), the 5 h lost its activity and
 * two of three activities were never recognised. These tests pin each fix.
 */
const OWNER =
  "Šiandien 9 valandas dirbau LabourMarket.ai: 5 val. programavau, 2 val. testavau, 2 val. ieškojau partnerių.";

const timed = (text: string) =>
  extractJournalSuggestions(text).fragments.map((f) => [
    f.rawPhrase,
    f.time?.value ?? null,
    f.time?.unitSlug ?? null,
    f.activitySlug ?? f.activityLabel,
  ]);

describe("the stated total is not one more item", () => {
  it("the owner's sentence yields exactly the three itemised phrases — 5 + 2 + 2, never 18", () => {
    const s = extractJournalSuggestions(OWNER);
    expect(s.fragments.map((f) => f.time?.value)).toEqual([5, 2, 2]);
    expect(s.fragments.map((f) => f.rawPhrase)).toEqual([
      "5 val. programavau",
      "2 val. testavau",
      "2 val. ieškojau partnerių",
    ]);
    expect(s.statedTotal).toEqual({
      value: 9,
      unitSlug: "hours",
      rawPhrase: "Šiandien 9 valandas dirbau LabourMarket.ai",
      matchesFragments: true,
    });
  });

  it("every itemised phrase keeps its kind of work: programming, testing, partner search", () => {
    expect(timed(OWNER).map((f) => f[3])).toEqual([
      "software_developer",
      null,
      "Partnerių paieška / bendradarbiavimas",
    ]);
  });

  it("the same day in Russian", () => {
    const s = extractJournalSuggestions(
      "Сегодня 9 часов работал: 5 ч. программировал, 2 ч. тестировал, 2 ч. искал партнеров.",
    );
    expect(s.fragments.map((f) => f.time?.value)).toEqual([5, 2, 2]);
    expect(s.statedTotal?.value).toBe(9);
    expect(s.statedTotal?.matchesFragments).toBe(true);
  });

  it("a total the items do NOT add up to is reported as such, still outside the items", () => {
    const s = extractJournalSuggestions(
      "Šiandien 9 valandas dirbau LabourMarket.ai: 5 val. programavau, 2 val. testavau.",
    );
    expect(s.fragments.map((f) => f.time?.value)).toEqual([5, 2]);
    expect(s.statedTotal).toMatchObject({ value: 9, matchesFragments: false });
  });

  it("without a colon, a restated day is still the total when the items add up to it", () => {
    const s = extractJournalSuggestions(
      "Dirbau 9 val. 5 val. programavau, 2 val. testavau, 2 val. ieškojau partnerių.",
    );
    expect(s.fragments.map((f) => f.time?.value)).toEqual([5, 2, 2]);
    expect(s.statedTotal).toMatchObject({ value: 9, rawPhrase: "Dirbau 9 val", matchesFragments: true });
  });

  it("without a colon, a timed phrase that names work is an item — even when the rest happen to sum to it", () => {
    // 4 + 2 + 2 = 8 but "8 val. klijavau plyteles" is work, not a header.
    const s = extractJournalSuggestions(
      "8 val. klijavau plyteles, 4 val. glaisčiau, 2 val. gruntavau, 2 val. dažiau.",
    );
    expect(s.fragments).toHaveLength(4);
    expect(s.statedTotal).toBeNull();
  });

  it("a colon header that names the work hands it to the items that name none", () => {
    const s = extractJournalSuggestions("9 val. klijavau plyteles: 5 val. salone, 4 val. vonioje");
    expect(s.fragments.map((f) => [f.time?.value, f.activitySlug])).toEqual([
      [5, "tiler"],
      [4, "tiler"],
    ]);
    expect(s.statedTotal).toMatchObject({ value: 9, matchesFragments: true });
  });

  it("two items are two items: no total is read out of a pair", () => {
    const s = extractJournalSuggestions("Klijavau plyteles 6 val., glaisčiau sienas 2 val.");
    expect(s.fragments.map((f) => f.time?.value)).toEqual([6, 2]);
    expect(s.statedTotal).toBeNull();
  });
});

describe("a dot that is not a sentence boundary", () => {
  it("the unit abbreviation dot before a lower-case word keeps the time with its activity", () => {
    expect(timed("5 val. programavau, 2 val. testavau")).toEqual([
      ["5 val. programavau", 5, "hours", "software_developer"],
      ["2 val. testavau", 2, "hours", null],
    ]);
  });

  it("an upper-case continuation is still a new sentence — two items stating their own time stay two", () => {
    expect(timed("Klijavau plyteles 6 val. Glaisčiau sienas 2 val.").map((f) => f[1])).toEqual([6, 2]);
  });

  it("a decimal is one number, with a dot or a comma", () => {
    expect(timed("Klijavau plyteles 3.5 val., glaisčiau 1,5 val.").map((f) => f[1])).toEqual([3.5, 1.5]);
  });

  it("a dotted name is one word", () => {
    const s = extractJournalSuggestions("Dirbau LabourMarket.ai 8 val.");
    expect(s.fragments.map((f) => [f.rawPhrase, f.time?.value])).toEqual([["Dirbau LabourMarket.ai 8 val", 8]]);
  });

  it("the `tema:` qualifier still rides with its fragment, and the topic is still read", () => {
    const s = extractJournalSuggestions("Dirbau 8 val. objekte Vilniuje, tema: sienos");
    expect(s.fragments).toHaveLength(1);
    expect(s.fragments[0].time?.value).toBe(8);
    expect(s.topic).toBe("sienos");
  });
});
