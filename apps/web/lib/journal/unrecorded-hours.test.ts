import { describe, expect, it } from "vitest";

import {
  detectUnrecordedHours,
  findHourMentions,
  hasRecordedTime,
} from "./unrecorded-hours";

const KEPT = [{ metric_slug: "quantity", value_numeric: 8, unit_slug: "hours" }];

describe("it finds the hours a real worker actually wrote", () => {
  // Every string here is taken verbatim from a production entry whose hours
  // were lost, so the detector is measured against reality, not invention.
  it.each([
    ["Kasiau smėli 9h", "9h"],
    ["3h staliaus darbai", "3h"],
    ["6,5h betonavimas", "6,5h"],
    ["2,25h nešti smėli", "2,25h"],
    ["3.5h dažiau", "3.5h"],
    ["Montavau langa 2h", "2h"],
    ["Kasiau žemes su ekskavatoriumi 10h", "10h"],
    ["9h viniojau grindinio šildymo vamzdukus", "9h"],
  ])("finds a duration in %j", (text, expected) => {
    expect(findHourMentions(text)).toContain(expected);
  });

  it("finds several in one multi-line entry", () => {
    const mentions = findHourMentions("10h\r\n3h dažiau sienas\r\n4h tapetavau");
    expect(mentions).toEqual(expect.arrayContaining(["10h", "3h", "4h"]));
  });

  it("handles the spelled-out Lithuanian forms too", () => {
    expect(findHourMentions("dirbau 4 val")).toContain("4 val");
    expect(findHourMentions("5 valandas kroviau")).toContain("5 valandas");
  });

  it("caps the list — a hint, not a transcript", () => {
    const many = Array.from({ length: 20 }, (_, i) => `${i + 1}h`).join(" ");
    expect(findHourMentions(many).length).toBeLessThanOrEqual(6);
  });
});

describe("it does not invent durations out of prose", () => {
  it.each([
    "vedžiojau šunį",
    "Kodavimas platformos",
    "dirbau su svetainės dizainu",
    "3 langai ir 2 durys",       // counts, no unit
    "objektas Nr. 12",
    "2026-08-10",                // a date is not a duration
  ])("no duration in %j", (text) => {
    expect(findHourMentions(text)).toEqual([]);
  });

  it("a unit glued into a word is not a duration", () => {
    // "5 hala", "3 hektarai" — the unit must not swallow the next word.
    expect(findHourMentions("3 hektarai")).toEqual([]);
    expect(findHourMentions("12 valgykla")).toEqual([]);
  });

  it("empty and null text are safe", () => {
    expect(findHourMentions("")).toEqual([]);
    expect(findHourMentions(null)).toEqual([]);
    expect(findHourMentions(undefined)).toEqual([]);
  });
});

describe("an entry that KEPT its hours is never flagged", () => {
  it("a positive time metric silences the hint", () => {
    expect(detectUnrecordedHours("Kasiau smėli 9h", KEPT).hasUnrecordedHours).toBe(false);
  });

  it("recognises fragment_time as well as quantity", () => {
    expect(
      hasRecordedTime([{ metric_slug: "fragment_time", value_numeric: 2, unit_slug: "hours" }]),
    ).toBe(true);
  });

  it("minutes and days count as recorded time", () => {
    for (const unit_slug of ["minutes", "days"]) {
      expect(hasRecordedTime([{ metric_slug: "quantity", value_numeric: 30, unit_slug }])).toBe(true);
    }
  });

  it("a NON-time quantity does not count — square metres are not hours", () => {
    expect(
      hasRecordedTime([{ metric_slug: "quantity", value_numeric: 50, unit_slug: "square_meters" }]),
    ).toBe(false);
    // ...so such an entry is still flagged if it also mentioned hours.
    expect(
      detectUnrecordedHours("50 m2 ir 4h darbo", [
        { metric_slug: "quantity", value_numeric: 50, unit_slug: "square_meters" },
      ]).hasUnrecordedHours,
    ).toBe(true);
  });

  it("a zero or null duration is not recorded time", () => {
    for (const value_numeric of [0, null, undefined]) {
      expect(hasRecordedTime([{ metric_slug: "quantity", value_numeric, unit_slug: "hours" }])).toBe(false);
    }
  });

  it("numeric strings from the wire are read, not rejected", () => {
    expect(hasRecordedTime([{ metric_slug: "quantity", value_numeric: "8", unit_slug: "hours" }])).toBe(true);
  });
});

describe("what it returns is evidence for a human, not a value to submit", () => {
  it("returns the worker's own words alongside the flag", () => {
    const r = detectUnrecordedHours("3h staliaus darbai\r\n6,5h betonavimas", []);
    expect(r.hasUnrecordedHours).toBe(true);
    expect(r.mentions).toEqual(expect.arrayContaining(["3h", "6,5h"]));
  });

  it("an entry with neither hours nor metrics is silent", () => {
    expect(detectUnrecordedHours("vedžiojau šunį", []).hasUnrecordedHours).toBe(false);
    expect(detectUnrecordedHours(null, null).hasUnrecordedHours).toBe(false);
  });
});
