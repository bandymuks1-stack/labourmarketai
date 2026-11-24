import { describe, expect, it } from "vitest";

import { classifyIntent } from "../conversation/intent-router";
import { extractWorkLog } from "../conversation/worklog-extract";
import { structureValueStatement } from "./value-statement";

/**
 * DETERMINISTIC ENTITY RECOGNITION IN THE 7 ACTIVE LOCALES (2026-11-22).
 *
 * One representative phrase set per locale (lt, en, ru, de, nl, pl, sv) for
 * the entities the assistant turns into a draft without any model: NUMBERS
 * (hours as digits and as words, a headcount), DATES (today, yesterday, the
 * day before, a weekday, "last <weekday>", dd.mm and dd/mm), PROFESSIONS (the
 * shared work-type lexicon) and COUNTRIES (the market's name in the person's
 * own language). Every reader is the existing one — `extractWorkLog` for the
 * journal draft, `structureValueStatement` for the need draft, the chat
 * router for which of the two opens.
 *
 * Today is fixed: Wednesday 2026-11-18 (Monday = 11-16).
 */
const TODAY = "2026-11-18";
const YESTERDAY = "2026-11-17";
const DAY_BEFORE = "2026-11-16";
const MONDAY = "2026-11-16";
const NOV_15 = "2026-11-15";

type Locale = "lt" | "en" | "ru" | "de" | "nl" | "pl" | "sv";
interface JournalCase {
  readonly today: string;
  readonly yesterday: string;
  readonly dayBefore: string;
  readonly weekday: string;
  readonly lastWeekday: string;
  readonly dotted: string;
  readonly slashed: string;
  readonly hoursAsWord: string;
}

/** Each sentence is a work log: the date it names, 8 hours. */
const JOURNAL: Record<Locale, JournalCase> = {
  lt: {
    today: "Šiandien dirbau 8 val.",
    yesterday: "Vakar dirbau 8 val.",
    dayBefore: "Užvakar dirbau 8 val.",
    weekday: "Pirmadienį dirbau 8 val.",
    lastWeekday: "Praėjusį pirmadienį dirbau 8 val.",
    dotted: "15.11 dirbau 8 val.",
    slashed: "15/11 dirbau 8 val.",
    hoursAsWord: "Vakar dirbau aštuonias valandas",
  },
  en: {
    today: "Today I worked 8 hours",
    yesterday: "Yesterday I worked 8 hours",
    dayBefore: "The day before yesterday I worked 8 hours",
    weekday: "On Monday I worked 8 hours",
    lastWeekday: "Last Monday I worked 8 hours",
    dotted: "On 15.11 I worked 8 hours",
    slashed: "On 15/11 I worked 8 hours",
    hoursAsWord: "Yesterday I worked eight hours",
  },
  ru: {
    today: "Сегодня работал 8 часов",
    yesterday: "Вчера работал 8 часов",
    dayBefore: "Позавчера работал 8 часов",
    weekday: "В понедельник работал 8 часов",
    lastWeekday: "В прошлый понедельник работал 8 часов",
    dotted: "15.11 работал 8 часов",
    slashed: "15/11 работал 8 часов",
    hoursAsWord: "Вчера работал восемь часов",
  },
  de: {
    today: "Heute habe ich 8 Stunden gearbeitet",
    yesterday: "Gestern habe ich 8 Stunden gearbeitet",
    dayBefore: "Vorgestern habe ich 8 Stunden gearbeitet",
    weekday: "Am Montag habe ich 8 Stunden gearbeitet",
    lastWeekday: "Letzten Montag habe ich 8 Stunden gearbeitet",
    dotted: "Am 15.11. habe ich 8 Stunden gearbeitet",
    slashed: "Am 15/11 habe ich 8 Stunden gearbeitet",
    hoursAsWord: "Gestern habe ich acht Stunden gearbeitet",
  },
  nl: {
    today: "Vandaag heb ik 8 uur gewerkt",
    yesterday: "Gisteren heb ik 8 uur gewerkt",
    dayBefore: "Eergisteren heb ik 8 uur gewerkt",
    weekday: "Maandag heb ik 8 uur gewerkt",
    lastWeekday: "Afgelopen maandag heb ik 8 uur gewerkt",
    dotted: "Op 15.11 heb ik 8 uur gewerkt",
    slashed: "Op 15/11 heb ik 8 uur gewerkt",
    hoursAsWord: "Gisteren heb ik acht uur gewerkt",
  },
  pl: {
    today: "Dzisiaj pracowałem 8 godzin",
    yesterday: "Wczoraj pracowałem 8 godzin",
    dayBefore: "Przedwczoraj pracowałem 8 godzin",
    weekday: "W poniedziałek pracowałem 8 godzin",
    lastWeekday: "W zeszły poniedziałek pracowałem 8 godzin",
    dotted: "15.11 pracowałem 8 godzin",
    slashed: "15/11 pracowałem 8 godzin",
    hoursAsWord: "Wczoraj pracowałem osiem godzin",
  },
  sv: {
    today: "Idag jobbade jag 8 timmar",
    yesterday: "Igår jobbade jag 8 timmar",
    dayBefore: "I förrgår jobbade jag 8 timmar",
    weekday: "I måndags jobbade jag 8 timmar",
    lastWeekday: "Förra måndagen jobbade jag 8 timmar",
    dotted: "Den 15.11 jobbade jag 8 timmar",
    slashed: "Den 15/11 jobbade jag 8 timmar",
    hoursAsWord: "Igår jobbade jag åtta timmar",
  },
};

const EXPECTED_DAY: Record<keyof JournalCase, string> = {
  today: TODAY,
  yesterday: YESTERDAY,
  dayBefore: DAY_BEFORE,
  weekday: MONDAY,
  lastWeekday: MONDAY,
  dotted: NOV_15,
  slashed: NOV_15,
  hoursAsWord: YESTERDAY,
};

describe("journal draft: the day and the hours, in every active locale", () => {
  for (const [locale, cases] of Object.entries(JOURNAL) as [Locale, JournalCase][]) {
    for (const [kind, sentence] of Object.entries(cases) as [keyof JournalCase, string][]) {
      it(`${locale} · ${kind}: "${sentence}" → ${EXPECTED_DAY[kind]}, 8 h, the journal`, () => {
        const w = extractWorkLog(sentence, TODAY);
        expect(w.date, "the day").toBe(EXPECTED_DAY[kind]);
        expect(w.workedMinutes, "8 hours").toBe(480);
        expect(classifyIntent(sentence).intent, "the journal opens").toBe("log-work");
      });
    }
  }
});

describe("dates: what is not a day stays the default", () => {
  const notADay: ReadonlyArray<readonly [string, string]> = [
    ["a clock span", "dirbau nuo 8.30 iki 17"],
    ["a clock time after a from-word", "started at 7.30, worked 8 hours"],
    ["a decimal of hours", "dirbau 7.5 val."],
    ["an area", "suklojau 3.5 m2 plytelių"],
    ["a price", "15.50 eur per hour"],
    ["a fraction of a day", "dirbau 1/2 dienos"],
    ["a NEXT weekday (the future)", "kitą pirmadienį dirbsiu 8 val."],
    ["a weekday range", "nuo pirmadienio iki penktadienio dirbau 8 val."],
    ["a habitual plural", "dirbu pirmadieniais 8 val."],
    ["a false friend of Wednesday (ru)", "среди коллег работал 8 часов"],
    ["a false friend of Wednesday (pl)", "w środku dnia pracowałem 8 godzin"],
  ];
  for (const [what, sentence] of notADay) {
    it(`${what}: "${sentence}" keeps today`, () => expect(extractWorkLog(sentence, TODAY).date).toBe(TODAY));
  }
  it("a relative day word outranks a dd.mm figure in the same sentence", () => {
    expect(extractWorkLog("Vakar 12.10 pradėjau", TODAY).date).toBe(YESTERDAY);
  });
  it("a dd.mm still ahead this year is last year's day (a journal day has happened)", () => {
    expect(extractWorkLog("24.12 dirbau 8 val.", TODAY).date).toBe("2025-12-24");
  });
  it("a stated year is kept", () => {
    expect(extractWorkLog("15.11.2025 dirbau 8 val.", TODAY).date).toBe("2025-11-15");
    expect(extractWorkLog("15/11/25 dirbau 8 val.", TODAY).date).toBe("2025-11-15");
  });
  it("last <weekday> said ON that weekday is a week ago; the bare weekday is today", () => {
    expect(extractWorkLog("Pirmadienį dirbau 8 val.", MONDAY).date).toBe(MONDAY);
    expect(extractWorkLog("Last Monday I worked 8 hours", MONDAY).date).toBe("2026-11-09");
  });
  it("an impossible calendar day is not a day", () => {
    expect(extractWorkLog("31.11 dirbau 8 val.", TODAY).date).toBe(TODAY);
  });
});

describe("hours: half a day is NOT turned into a number of hours", () => {
  // How long the person's day is, the sentence does not say: the draft asks.
  for (const sentence of ["Vakar dirbau pusę dienos", "Yesterday I worked half a day", "Вчера работал полдня", "Gestern habe ich einen halben Tag gearbeitet", "Gisteren heb ik een halve dag gewerkt", "Wczoraj pracowałem pół dnia", "Igår jobbade jag en halv dag"]) {
    it(`"${sentence}" → no invented hours`, () => expect(extractWorkLog(sentence, TODAY).workedMinutes).toBeNull());
  }
});

/** [sentence, headcount, workType, country] — the need draft. */
const NEED: Record<Locale, ReadonlyArray<readonly [string, number, string, string]>> = {
  lt: [
    ["Reikia 5 suvirintojų Vokietijoje", 5, "welder", "DE"],
    ["Reikia 3 elektrikų Nyderlanduose", 3, "electrician", "NL"],
    ["Reikia 2 virėjų Lenkijoje", 2, "cook", "PL"],
    ["Reikia 2 mūrininkų Švedijoje", 2, "mason", "SE"],
  ],
  en: [
    ["We need 5 welders in Germany", 5, "welder", "DE"],
    ["We need 3 electricians in the Netherlands", 3, "electrician", "NL"],
    ["We need 2 cooks in Poland", 2, "cook", "PL"],
    ["We need 2 welders in Lithuania", 2, "welder", "LT"],
  ],
  ru: [
    ["Нужны 5 сварщиков в Германии", 5, "welder", "DE"],
    ["Нужны 3 электрика в Нидерландах", 3, "electrician", "NL"],
    ["Нужны 2 повара в Польше", 2, "cook", "PL"],
    ["Нужны 2 сварщика в Литве", 2, "welder", "LT"],
  ],
  de: [
    ["Wir brauchen 5 Schweißer in Deutschland", 5, "welder", "DE"],
    ["Wir brauchen 3 Elektriker in den Niederlanden", 3, "electrician", "NL"],
    ["Wir brauchen 2 Köche in Polen", 2, "cook", "PL"],
    ["Wir brauchen 2 Maurer in Schweden", 2, "mason", "SE"],
    ["Wir brauchen 2 Schweißer in Litauen", 2, "welder", "LT"],
    ["Wir brauchen 2 Schweißer in Österreich", 2, "welder", "AT"],
  ],
  nl: [
    ["We zoeken 5 lassers in Duitsland", 5, "welder", "DE"],
    ["We zoeken 3 elektriciens in Nederland", 3, "electrician", "NL"],
    ["We zoeken 2 metselaars in Zweden", 2, "mason", "SE"],
    ["We zoeken 2 lassers in Litouwen", 2, "welder", "LT"],
    ["We zoeken 2 lassers in België", 2, "welder", "BE"],
  ],
  pl: [
    ["Potrzebujemy 5 spawaczy w Niemczech", 5, "welder", "DE"],
    ["Potrzebujemy 3 elektryków w Holandii", 3, "electrician", "NL"],
    ["Potrzebujemy 2 kucharzy w Polsce", 2, "cook", "PL"],
    ["Potrzebujemy 2 murarzy w Szwecji", 2, "mason", "SE"],
    ["Potrzebujemy 2 spawaczy na Litwie", 2, "welder", "LT"],
    ["Potrzebujemy 2 spawaczy w Norwegii", 2, "welder", "NO"],
  ],
  sv: [
    ["Vi behöver 5 svetsare i Tyskland", 5, "welder", "DE"],
    ["Vi behöver 3 elektriker i Nederländerna", 3, "electrician", "NL"],
    ["Vi behöver 2 kockar i Polen", 2, "cook", "PL"],
    ["Vi behöver 2 murare i Sverige", 2, "mason", "SE"],
    ["Vi behöver 2 svetsare i Litauen", 2, "welder", "LT"],
    ["Vi behöver 2 svetsare i Danmark", 2, "welder", "DK"],
  ],
};

describe("need draft: headcount, profession and country, in every active locale", () => {
  for (const [locale, rows] of Object.entries(NEED) as [Locale, (typeof NEED)[Locale]][]) {
    for (const [sentence, headcount, workType, country] of rows) {
      it(`${locale}: "${sentence}" → ${headcount} × ${workType} in ${country}, the need intake`, () => {
        const v = structureValueStatement(sentence, TODAY);
        expect(v.headcount, "headcount").toBe(headcount);
        expect(v.workType, "profession").toBe(workType);
        expect(v.country, "country").toBe(country);
        expect(classifyIntent(sentence).intent, "the need intake opens").toBe("need-workers");
      });
    }
  }
});

describe("countries: a nationality or a language is not a location", () => {
  for (const sentence of [
    "German company needs welders",
    "Vokiečių įmonei reikia suvirintojų",
    "Немецкой компании нужны сварщики",
    "Deutsche Firma sucht Schweißer",
    "Duits bedrijf zoekt lassers",
    "Niemiecka firma szuka spawaczy",
    "Tyskt företag söker svetsare",
    "Ich spreche Deutsch",
    "Ik spreek Nederlands",
  ]) {
    it(`"${sentence}" → no country`, () => expect(structureValueStatement(sentence, TODAY).country).toBeNull());
  }
});
