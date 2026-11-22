import { describe, expect, it } from "vitest";

import { classifyIntent } from "../conversation/intent-router";
import { structureNeed } from "./structure-need";
import { structureValueStatement } from "./value-statement";
import { parseWordNumber } from "./word-numbers";

/**
 * HEADCOUNT AS WORDS, IN EVERY ACTIVE LOCALE (2026-11-22).
 *
 * "мне нужны пять рабочих" opened the need intake with NO quantity: the
 * generic headcount reader knew "работников" but not "рабочих", not the
 * collective "пятеро", not the Polish numbers at all, not "darbininkų" or the
 * accusative "penkis". The fix is in the shared readers (word-numbers.ts, the
 * person nouns of value-statement.ts, the digit reader of structure-need.ts),
 * so every surface that reads a headcount reads the same one.
 */
const TODAY = "2026-11-22";
const headcount = (s: string) => structureValueStatement(s, TODAY).headcount;

/** [locale, sentence] — each must read 5 people and route to the need intake. */
const FIVE: ReadonlyArray<readonly [string, string]> = [
  // ru
  ["ru", "мне нужны пять рабочих"],
  ["ru", "Мне нужны пять рабочих"],
  ["ru", "требуются пять рабочие"],
  ["ru", "нужны пять работника"],
  ["ru", "Мне нужно пять работников"],
  ["ru", "нужны пять человек"],
  ["ru", "нужно пятеро рабочих"],
  ["ru", "нужны пятеро людей"],
  ["ru", "нужны 5 рабочих"],
  ["ru", "нужны 5 людей"],
  // lt
  ["lt", "Man reikia penkių darbuotojų"],
  ["lt", "reikia penki darbininkai"],
  ["lt", "reikia penkis darbuotojus"],
  ["lt", "reikia penkių darbininkų"],
  ["lt", "reikia penkių žmonių"],
  ["lt", "reikia penkiu darbininku"],
  ["lt", "reikia 5 žmonių"],
  ["lt", "reikia 5 darbininkų"],
  // en
  ["en", "I need five workers"],
  ["en", "need five people"],
  ["en", "we need five hands"],
  ["en", "I need 5 people"],
  // de
  ["de", "Wir brauchen fünf Arbeiter"],
  ["de", "Wir brauchen fünf Mitarbeiter"],
  ["de", "Wir brauchen fünf Leute"],
  ["de", "Wir brauchen funf Arbeiter"],
  ["de", "Ich brauche 5 Arbeiter"],
  // nl
  ["nl", "We hebben vijf werknemers nodig"],
  ["nl", "Ik zoek vijf medewerkers"],
  ["nl", "We zoeken vijf mensen"],
  ["nl", "We zoeken 5 medewerkers"],
  // pl
  ["pl", "Potrzebuję pięciu pracowników"],
  ["pl", "Potrzebujemy pięć osób"],
  ["pl", "Szukamy pięciu robotników"],
  ["pl", "Potrzebujemy pieciu pracownikow"],
  ["pl", "Potrzebujemy 5 pracowników"],
  // sv
  ["sv", "Vi behöver fem arbetare"],
  ["sv", "Vi behöver fem personer"],
  ["sv", "Jag behöver fem medarbetare"],
  ["sv", "Vi behöver 5 arbetare"],
];

describe("five people, said in words or digits, in every active locale", () => {
  for (const [locale, sentence] of FIVE) {
    it(`${locale}: "${sentence}" → headcount 5, a workforce need, the need intake`, () => {
      const v = structureValueStatement(sentence, TODAY);
      expect(v.headcount, "the headcount").toBe(5);
      expect(v.axis).toBe("seek");
      expect(v.subject).toBe("workforce");
      expect(classifyIntent(sentence).intent, "routes to the need intake").toBe("need-workers");
    });
  }
});

/** 1–12 as words: [locale, number word → sentence]. */
const ONE_TO_TWELVE: Record<string, readonly string[]> = {
  lt: ["vieno darbuotojo", "dviejų darbuotojų", "trijų darbuotojų", "keturių darbuotojų", "penkių darbuotojų", "šešių darbuotojų", "septynių darbuotojų", "aštuonių darbuotojų", "devynių darbuotojų", "dešimties darbuotojų", "vienuolikos darbuotojų", "dvylikos darbuotojų"].map((x) => `Reikia ${x}`),
  en: ["one worker", "two workers", "three workers", "four workers", "five workers", "six workers", "seven workers", "eight workers", "nine workers", "ten workers", "eleven workers", "twelve workers"].map((x) => `We need ${x}`),
  ru: ["один рабочий", "два рабочих", "три рабочих", "четыре рабочих", "пять рабочих", "шесть рабочих", "семь рабочих", "восемь рабочих", "девять рабочих", "десять рабочих", "одиннадцать рабочих", "двенадцать рабочих"].map((x) => `Нужны ${x}`),
  pl: ["jednego pracownika", "dwóch pracowników", "trzech pracowników", "czterech pracowników", "pięciu pracowników", "sześciu pracowników", "siedmiu pracowników", "ośmiu pracowników", "dziewięciu pracowników", "dziesięciu pracowników", "jedenastu pracowników", "dwunastu pracowników"].map((x) => `Potrzebujemy ${x}`),
};
/** 2–12 (the article "ein" / "een" / "en" is never read as the number one). */
const TWO_TO_TWELVE: Record<string, readonly string[]> = {
  de: ["zwei", "drei", "vier", "fünf", "sechs", "sieben", "acht", "neun", "zehn", "elf", "zwölf"].map((n) => `Wir brauchen ${n} Arbeiter`),
  nl: ["twee", "drie", "vier", "vijf", "zes", "zeven", "acht", "negen", "tien", "elf", "twaalf"].map((n) => `We zoeken ${n} medewerkers`),
};

describe("1–12 as words", () => {
  for (const [locale, sentences] of Object.entries(ONE_TO_TWELVE)) {
    sentences.forEach((sentence, i) => {
      it(`${locale}: "${sentence}" → ${i + 1}`, () => expect(headcount(sentence)).toBe(i + 1));
    });
  }
  for (const [locale, sentences] of Object.entries(TWO_TO_TWELVE)) {
    sentences.forEach((sentence, i) => {
      it(`${locale}: "${sentence}" → ${i + 2}`, () => expect(headcount(sentence)).toBe(i + 2));
    });
  }
  // sv: "sex" (6) is deliberately not a number word (the English word), and
  // "en" / "ett" are the articles; every other word 2–12 is read.
  const SV: ReadonlyArray<readonly [string, number]> = [
    ["två", 2], ["tre", 3], ["fyra", 4], ["fem", 5], ["sju", 7], ["åtta", 8],
    ["nio", 9], ["tio", 10], ["elva", 11], ["tolv", 12],
  ];
  for (const [word, n] of SV) {
    it(`sv: "Vi behöver ${word} arbetare" → ${n}`, () => expect(headcount(`Vi behöver ${word} arbetare`)).toBe(n));
  }
  it("digits 1–12 with a person noun in every locale", () => {
    for (let n = 1; n <= 12; n++) {
      expect(headcount(`reikia ${n} darbuotojų`)).toBe(n);
      expect(headcount(`need ${n} workers`)).toBe(n);
      expect(headcount(`нужны ${n} рабочих`)).toBe(n);
      expect(headcount(`Wir brauchen ${n} Arbeiter`)).toBe(n);
      expect(headcount(`We zoeken ${n} medewerkers`)).toBe(n);
      expect(headcount(`Potrzebujemy ${n} pracowników`)).toBe(n);
      expect(headcount(`Vi behöver ${n} arbetare`)).toBe(n);
    }
  });
});

describe("number words — the new forms parse, the ambiguous ones do not", () => {
  it("ru collective and lt accusative and pl counted forms", () => {
    expect(parseWordNumber("пятеро")).toBe(5);
    expect(parseWordNumber("двое")).toBe(2);
    expect(parseWordNumber("пятерых")).toBe(5);
    expect(parseWordNumber("одной")).toBe(1);
    expect(parseWordNumber("penkis")).toBe(5);
    expect(parseWordNumber("tris")).toBe(3);
    expect(parseWordNumber("pięć")).toBe(5);
    expect(parseWordNumber("pięciu")).toBe(5);
    expect(parseWordNumber("ośmiu")).toBe(8);
    expect(parseWordNumber("dwunastu")).toBe(12);
  });
  it("articles and 'every' are not numbers", () => {
    expect(parseWordNumber("jeden")).toBeNull(); // de "jeden Tag" — every day
    expect(parseWordNumber("een")).toBeNull();
    expect(parseWordNumber("ein")).toBeNull();
  });
});

describe("what is NOT a headcount stays null", () => {
  for (const s of [
    "нужно пять рабочих дней",
    "нужны 5 рабочих часов",
    "мне нужен рабочий журнал",
    "need five hours",
    "Wir brauchen jeden Tag Leute",
    "reikia 3 metų patirties",
  ]) {
    it(`"${s}" → no headcount`, () => expect(headcount(s)).toBeNull());
  }
  it('"мне нужен рабочий журнал" is not a need for workers', () => {
    expect(classifyIntent("мне нужен рабочий журнал").intent).not.toBe("need-workers");
  });
});

describe("the digit reader of structureNeed counts the same person nouns", () => {
  for (const [s, n] of [
    ["5 рабочих", 5],
    ["5 людей", 5],
    ["5 darbininkų", 5],
    ["5 hands", 5],
    ["5 Arbeiter", 5],
    ["5 Leute", 5],
    ["5 medewerkers", 5],
    ["5 mensen", 5],
    ["5 osób", 5],
    ["5 robotników", 5],
    ["5 рабочих дней", null],
  ] as const) {
    it(`"${s}" → ${n}`, () => expect(structureNeed({ description: s }).teamSize).toBe(n));
  }
});
