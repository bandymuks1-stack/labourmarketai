import { describe, expect, it } from "vitest";

import { classifyIntent } from "@/lib/conversation/intent-router";
import { countPeopleInNeed, structureNeed } from "./structure-need";
import { digitizeWordNumbers } from "./word-numbers";

/**
 * A HEADCOUNT WRITTEN IN WORDS (owner P1 2026-11-22: "мне нужны пять рабочих"
 * must read as five workers). The headcount reader knew digits only; the same
 * need written in words came back with no count, in every language.
 */
const FIVE: ReadonlyArray<readonly [string, string]> = [
  ["ru", "мне нужны пять рабочих"],
  ["ru", "Нужны пять строителей с понедельника"],
  ["lt", "Man reikia penkių darbuotojų"],
  ["en", "I need five workers"],
  ["pl", "Potrzebuję pięciu pracowników"],
  ["nl", "Ik heb vijf werknemers nodig"],
  ["de", "Ich brauche fünf Arbeiter"],
  ["sv", "Jag behöver fem arbetare"],
];

describe("a headcount written in words is the same headcount", () => {
  it.each(FIVE)("%s — %s → 5 people, an employer need", (_locale, text) => {
    expect(structureNeed({ description: text }).teamSize).toBe(5);
    expect(classifyIntent(text).intent).toBe("need-workers");
  });

  it("digits and words agree", () => {
    expect(structureNeed({ description: "мне нужны 5 рабочих" }).teamSize).toBe(5);
    expect(countPeopleInNeed({ description: "мне нужны пять рабочих" })).toBe(5);
    expect(countPeopleInNeed({ description: "We need three welders" })).toBe(3);
    expect(countPeopleInNeed({ description: "Reikia trijų suvirintojų" })).toBe(3);
  });

  it("a measure in words is still never a headcount", () => {
    for (const text of ["Need five years experience", "Reikia penkerių metų patirties", "нужно пять лет опыта", "I need work for five days"]) {
      expect(structureNeed({ description: text }).teamSize, text).toBeNull();
    }
    expect(classifyIntent("I need work for five days").intent).not.toBe("need-workers");
  });

  it("only whole number words change; every other word is kept", () => {
    expect(digitizeWordNumbers("мне нужны пять рабочих")).toBe("мне нужны 5 рабочих");
    expect(digitizeWordNumbers("someone needs nineteen tones")).toBe("someone needs 19 tones");
    expect(digitizeWordNumbers("Potrzebuję pięciu pracowników")).toBe("Potrzebuję 5 pracowników");
  });
});
