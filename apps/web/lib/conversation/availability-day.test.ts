import { describe, expect, it } from "vitest";

import { readAvailabilityDay } from "./availability-day";

// 2026-10-01 is a Thursday.
const TODAY = "2026-10-01";

describe("the day a who-is-free question names", () => {
  it.each([
    ["Kas iš komandos laisvas pirmadienį?", "2026-10-05"],
    ["Kas laisvas antradienį?", "2026-10-06"],
    ["Kas laisvas ketvirtadienį?", "2026-10-01"],
    ["Kas laisvas kitą ketvirtadienį?", "2026-10-08"],
    ["Who is free on Monday?", "2026-10-05"],
    ["Who is free next Thursday?", "2026-10-08"],
    ["Кто свободен в понедельник?", "2026-10-05"],
    ["Wie is vrij op maandag?", "2026-10-05"],
    ["Wer ist am Montag frei?", "2026-10-05"],
    ["Kto jest wolny w poniedziałek?", "2026-10-05"],
    ["Kas laisvas rytoj?", "2026-10-02"],
    ["Kas laisvas poryt?", "2026-10-03"],
    ["Kas laisvas šiandien?", "2026-10-01"],
    ["Kas laisvas 2026-10-12?", "2026-10-12"],
  ])("%s -> %s", (sentence, day) => {
    expect(readAvailabilityDay(sentence, TODAY)).toBe(day);
  });

  it("no day named, or a week phrase, keeps the default window", () => {
    for (const s of ["Kas laisvas?", "Kas laisvas kitą savaitę?", "Kas laisvas šią savaitę?", "Who is free?"]) {
      expect(readAvailabilityDay(s, TODAY), s).toBeNull();
    }
  });

  it("an impossible ISO date is not a day", () => {
    expect(readAvailabilityDay("Kas laisvas 2026-02-30?", TODAY)).toBeNull();
  });
});
