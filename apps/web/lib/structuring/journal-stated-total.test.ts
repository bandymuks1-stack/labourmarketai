import { describe, expect, it } from "vitest";
import { describesWhereOnly, extractJournalSuggestions } from "./extract-journal-suggestions";

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

/**
 * Measured 2026-09-12 (issue #1689): across 238 locative place phrases in
 * lt / en / ru / nl / de, about fifty are ALSO lexicon needles for a trade
 * (kitchen → cooking, warehouse, factory, garden, stable, till, roof …).
 * Under "9 val. klijavau plyteles: 5 val. virtuvėje, 4 val. vonioje" the
 * kitchen item read as 5 h of COOKING while the bathroom item inherited
 * tiling — the place noun's trade beat the header that named the work.
 */
describe("an item that says only WHERE describes the header's work (#1689)", () => {
  const act = (text: string) =>
    extractJournalSuggestions(text).fragments.map((f) => [
      f.rawPhrase,
      f.time?.value ?? null,
      f.activitySlug ?? f.activityLabel,
    ]);

  it("the tiler's kitchen is tiling, not cooking — both items inherit the header", () => {
    expect(act("9 val. klijavau plyteles: 5 val. virtuvėje, 4 val. vonioje")).toEqual([
      ["5 val. virtuvėje", 5, "tiler"],
      ["4 val. vonioje", 4, "tiler"],
    ]);
  });

  it("place-noun trades of every kind yield to the header: warehouse, roof, till, salon, client's flat", () => {
    expect(
      act(
        "10 val. klijavau plyteles: 2 val. sandėlyje, 2 val. ant stogo, 2 val. prie kasos, 2 val. sporto salėje, 2 val. kliento bute",
      ).map((f) => f[2]),
    ).toEqual(["tiler", "tiler", "tiler", "tiler", "tiler"]);
  });

  it("the same day in Russian", () => {
    expect(act("9 ч клал плитку: 5 ч на кухне, 4 ч в ванной").map((f) => f[2])).toEqual([
      "tiler",
      "tiler",
    ]);
  });

  it("an item that names its OWN work keeps it — a verb is never a place", () => {
    expect(act("9 val. klijavau plyteles: 5 val. virtuvėje, 4 val. gaminau maistą")).toEqual([
      ["5 val. virtuvėje", 5, "tiler"],
      ["4 val. gaminau maistą", 4, "cook"],
    ]);
  });

  it("NEGATIVE CONTROL: a header that names no work passes nothing — the place is then the only signal", () => {
    expect(act("Dirbau 9 val.: 5 val. virtuvėje, 4 val. sandėlyje").map((f) => f[2])).toEqual([
      "cook",
      "warehouse_worker",
    ]);
  });

  it("NEGATIVE CONTROL: without a header a bare place item reads as it always did", () => {
    expect(act("Dirbau virtuvėje 5 val.").map((f) => f[2])).toEqual(["cook"]);
    expect(act("5 val. virtuvėje").map((f) => f[2])).toEqual(["cook"]);
  });
});

describe("describesWhereOnly — the shape of a place phrase, not a list of place words", () => {
  const yes = [
    "5 val. virtuvėje",
    "5 val. ant stogo",
    "5 val. prie kasos",
    "5 val. pas klientą",
    "5 val. sporto salėje",
    "5 val. mokyklos virtuvėje",
    "5 val. name",
    "5 val. kieme",
    "virtuvėje 5 val.",
    "penkias valandas virtuvėje",
    "5 val. dirbau virtuvėje",
    "5 h in the kitchen",
    "5 h worked in the office",
    "5 h at the till",
    "5 h on site",
    "5 ч на складе",
    "5 ч в ванной",
    "5 uur in de keuken",
    "5 uur achter de kassa",
    "5 Std. im Lager",
    "5 Std. in der Küche",
    "5 Std. auf dem Dach",
  ];
  const no = [
    "5 val.",
    "5 val. glaisčiau",
    "5 val. programavau",
    "5 val. klijavome",
    "5 val. dirbome",
    "5 val. dažėme",
    "5 val. glaisčiau virtuvėje",
    "5 val. klijavome virtuvėje",
    "5 val. LabourMarket.ai",
    "5 val. virtuvėje ir vonioje",
    "5 val. ieškojau partnerių",
    "5 h laid tiles",
    "5 h in charge of the whole crew",
    "2 val. testavau",
  ];
  it.each(yes)("%s → where only", (p) => expect(describesWhereOnly(p)).toBe(true));
  it.each(no)("%s → not a bare place", (p) => expect(describesWhereOnly(p)).toBe(false));
});
