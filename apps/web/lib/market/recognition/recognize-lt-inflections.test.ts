import { describe, expect, it } from "vitest";

import { detectJobDemandFields, recognizeIntent } from "./index";
import {
  mentionsStartTime,
  parseDurationDays,
  parseStartDate,
  parseTimeWindow,
} from "@/lib/structuring/time-window";
import {
  countPeopleInNeed,
  resolveCountryAndCity,
  structureNeed,
} from "@/lib/structuring/structure-need";
import { foldText } from "@/lib/structuring/normalize";

/**
 * Production 2026-10-23, /lt/dashboard/market/recognize, "Ieškau darbuotojų":
 * the sentence below recognised only the role and the experience. Place,
 * start and scope were listed as MISSING although the sentence states all of
 * them — in the Lithuanian cases an employer actually writes (locative city,
 * genitive month, dative duration, genitive plural headcount).
 */
const REPRO = "Reikia 2 mūrininkų Vilniuje nuo lapkričio, 3 mėnesiams, patirtis su blokeliais";

const recognizedKeys = (text: string) =>
  detectJobDemandFields(text).recognized.map((r) => r.key);

describe("the exact production sentence", () => {
  it("recognises role, place, start, scope and experience", () => {
    const card = recognizeIntent("need_workers", { rawText: REPRO });
    const keys = card.recognized.map((r) => r.key);
    for (const key of ["role", "location", "startDate", "scope", "experience"] as const) {
      expect(keys, key).toContain(key);
      expect(card.missing.map((m) => m.key), key).not.toContain(key);
    }
  });

  it("reads each fact with the canonical reader, not a second parser", () => {
    const s = structureNeed({ description: REPRO });
    expect(s.workType).toBe("mason");
    expect(s.country).toBe("LT");
    expect(s.teamSize).toBe(2);
    expect(resolveCountryAndCity(foldText(REPRO))).toEqual({ country: "LT", city: "Vilnius" });
    expect(parseStartDate(REPRO, "2026-10-23")).toBe("2026-11-01");
    expect(parseDurationDays(REPRO)).toBe(90);
  });

  it("the identity is complete, so the card is no longer 'needs basics'", () => {
    expect(recognizeIntent("need_workers", { rawText: REPRO }).readiness.label).not.toBe("needs_basics");
  });
});

describe("Lithuanian locative city forms", () => {
  it.each([
    ["Vilniuje", "LT", "Vilnius"],
    ["Kaune", "LT", "Kaunas"],
    ["Klaipėdoje", "LT", "Klaipėda"],
    ["Šiauliuose", "LT", "Šiauliai"],
    ["Panevėžyje", "LT", "Panevėžys"],
    ["Alytuje", "LT", "Alytus"],
    ["Marijampolėje", "LT", "Marijampolė"],
    ["Utenoje", "LT", "Utena"],
    ["Osle", "NO", "Oslo"],
    ["Stokholme", "SE", "Stockholm"],
  ])("reikia suvirintojo %s → %s / %s", (place, country, city) => {
    const text = `Reikia suvirintojo ${place}`;
    expect(recognizedKeys(text)).toContain("location");
    expect(structureNeed({ description: text }).country).toBe(country);
    expect(resolveCountryAndCity(foldText(text))).toEqual({ country, city });
  });

  it("a word that merely contains a short city stem is not a place", () => {
    expect(structureNeed({ description: "analytical work, without experience (uten erfaring)" }).country).toBeNull();
  });
});

describe("month phrases as a stated start", () => {
  it.each(["nuo lapkričio", "nuo lapkričio 1 d.", "lapkričio mėn.", "nuo 11-01", "Pradžia lapkričio mėn., Kaune"])(
    "%s states a start",
    (phrase) => {
      expect(mentionsStartTime(phrase)).toBe(true);
      expect(recognizedKeys(`Reikia mūrininko ${phrase}`)).toContain("startDate");
    },
  );

  it("nuo lapkričio 1 d. resolves to 1 November", () => {
    expect(parseStartDate("nuo lapkričio 1 d.", "2026-10-23")).toBe("2026-11-01");
  });

  // Negative controls: a month STEM at the start of an ordinary word.
  it.each([
    "darbas 20 km nuo Marijampolės",
    "dažymas nuo spalvos parinkimo",
    "darbai nuo vasaros pabaigos neplanuojami",
    "darbas nuo 08-17 val.",
    "darbas nuo 8 iki 17",
    "Marijampolėje, kova su drėgme",
  ])("no start is read from %s", (text) => {
    expect(parseStartDate(text, "2026-10-23")).toBeNull();
    expect(mentionsStartTime(text)).toBe(false);
  });
});

describe("durations and headcount as the scope of the work", () => {
  it.each([
    ["3 mėnesiams", 90],
    ["3 mėn.", 90],
    ["2 savaitėms", 14],
    ["metams", 365],
    ["2 metams", 730],
    ["vieneriems metams", 365],
    ["dvejiems metams", 730],
    ["trejiems metams", 1095],
    ["ketveriems metams", 1460],
    ["penkeriems metams", 1825],
    ["kitiems metams", 365],
  ])("%s → %d days", (phrase, days) => {
    expect(parseDurationDays(`Reikia mūrininko ${phrase}`)).toBe(days);
    expect(recognizedKeys(`Reikia mūrininko ${phrase}`)).toContain("scope");
  });

  it("a bare 'metams' at the start of the text is one year", () => {
    expect(parseDurationDays("metams, Vilniuje")).toBe(365);
  });

  // Review finding (PR #2690): an unread count before "metams" stays
  // unresolved — never a silent one year, never an invented end date.
  it.each(["dvejems metams", "trejems metams", "50 metams"])("%s → unresolved", (phrase) => {
    expect(parseDurationDays(`Reikia mūrininko ${phrase}`)).toBeNull();
    const w = parseTimeWindow(`Reikia mūrininko ${phrase}, nuo lapkričio`, "2026-10-23");
    expect(w.startIso).toBe("2026-11-01");
    expect(w.endIso).toBeUndefined();
  });

  it("dvejiems metams from 1 November spans 730 days, not 365", () => {
    const w = parseTimeWindow("Reikia mūrininko nuo lapkričio dvejiems metams", "2026-10-23");
    expect(w.startIso).toBe("2026-11-01");
    // 730 calendar days counted inclusively (2028 is a leap year).
    expect(w.endIso).toBe("2028-10-30");
  });

  it.each([
    ["Reikia 2 mūrininkų", 2],
    ["reikia 3 darbuotojų", 3],
    ["Ieškome 4 mūrininkų", 4],
  ])("%s → headcount %d", (text, n) => {
    expect(structureNeed({ description: text }).teamSize).toBe(n);
    expect(recognizedKeys(text)).toContain("scope");
  });

  // Negative control: a number that is NOT a headcount and NOT a duration.
  it.each([
    "Reikia mūrininko, 3 metų patirtis",
    "Reikia mūrininko, atlyginimas 15 eur/val., 40 val. per savaitę",
  ])("no scope is read from %s", (text) => {
    expect(structureNeed({ description: text }).teamSize).toBeNull();
    expect(parseDurationDays(text)).toBeNull();
    expect(recognizedKeys(text)).not.toContain("scope");
  });

  // Review finding (PR #2690): a number after a demand verb is not a
  // headcount when a unit follows it.
  it.each([
    "Need 3 years experience",
    "Reikia 3 metų patirties",
    "Reikia 3 m. patirties",
    "Reikia 2 mėn. darbo",
    "Need 40 hours per week",
    "Reikia 15 eur per valandą",
  ])("%s → no headcount, no people-count scope", (text) => {
    expect(structureNeed({ description: text }).teamSize).toBeNull();
    expect(countPeopleInNeed({ description: text })).toBeNull();
  });

  it.each(["Need 3 years experience", "Reikia 3 metų patirties"])(
    "%s does not mark the scope recognised",
    (text) => {
      expect(recognizedKeys(text)).not.toContain("scope");
      expect(recognizedKeys(text)).toContain("experience");
    },
  );

  it("a bare number after a demand verb is still a team size, but not a people count", () => {
    expect(structureNeed({ description: "reikia 3, pradžia rytoj" }).teamSize).toBe(3);
    expect(countPeopleInNeed({ description: "reikia 3, pradžia rytoj" })).toBeNull();
  });

  it("'3 metų patirtis' stays experience, never a duration", () => {
    const keys = recognizedKeys("Reikia mūrininko, 3 metų patirtis");
    expect(keys).toContain("experience");
    expect(keys).not.toContain("startDate");
  });
});

describe("the same sentence in the other active locales does not regress", () => {
  it.each([
    ["en", "Need 2 masons in Vilnius from November, for 3 months, experience with blocks"],
    ["ru", "Нужны 2 каменщика в Вильнюсе с ноября, на 3 месяца, опыт работы с блоками"],
    ["de", "Wir brauchen 2 Maurer in Vilnius ab November für 3 Monate, Erfahrung mit Blöcken"],
    ["pl", "Potrzebujemy 2 murarzy w Wilnie od listopada na 3 miesiące, doświadczenie z bloczkami"],
    ["nl", "We zoeken 2 metselaars in Vilnius vanaf november voor 3 maanden, ervaring met blokken"],
  ])("%s", (_locale, text) => {
    const keys = recognizeIntent("need_workers", { rawText: text }).recognized.map((r) => r.key);
    for (const key of ["role", "location", "startDate", "scope", "experience"] as const) {
      expect(keys, key).toContain(key);
    }
  });
});

/**
 * The Cyrillic patterns in the field table sat behind JS `\b`, which is
 * ASCII-only: a space followed by a Cyrillic letter is no boundary, so every
 * Russian pattern there ("опыт", "зарплат", "часов в недел", "документ" …)
 * never matched. They are compiled with Unicode boundaries now.
 */
describe("Russian field patterns match", () => {
  it.each([
    ["Нужен сварщик, опыт работы 5 лет", "experience"],
    ["Нужен сварщик, зарплата 2000 евро", "salary"],
    ["Нужен сварщик, зарплата 2000 евро", "currency"],
    ["Нужен сварщик, 40 часов в неделю", "weeklyHours"],
    ["Нужен сварщик, нужны документы и паспорт", "requiredDocuments"],
    ["Нужен сварщик, жильё: общежитие", "accommodationType"],
    ["Нужен сварщик, договор на 6 месяцев", "contractType"],
    ["Нужен сварщик, английский язык", "language"],
  ])("%s → %s", (text, key) => {
    expect(detectJobDemandFields(text).recognized.map((r) => r.key)).toContain(key);
  });

  it("a Cyrillic stem in the middle of another word is still no match", () => {
    // "опыт" (experience) inside "неопытный" (inexperienced): the boundary
    // before the stem is real, not dropped.
    expect(detectJobDemandFields("Нужен сварщик, можно неопытный").recognized.map((r) => r.key)).not.toContain("experience");
  });

  it("a year count after a duration preposition is the duration, not experience", () => {
    for (const text of ["Нужен сварщик на 2 года", "We need a welder for 2 years", "Szukamy spawacza na 2 lata"]) {
      expect(detectJobDemandFields(text).recognized.map((r) => r.key), text).not.toContain("experience");
    }
    expect(detectJobDemandFields("Нужен сварщик, опыт 3 года").recognized.map((r) => r.key)).toContain("experience");
  });
});
