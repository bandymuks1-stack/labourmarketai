import { describe, expect, it } from "vitest";

import { mentionsStartTime, parseStartDate } from "./time-window";

/**
 * "FROM NEXT MONDAY" IS A START DATE (lane A, 2026-11-22): in the chat and the
 * need intake the start stayed empty. `parseStartDate` now reads a weekday
 * named with a "next" word, in all seven active languages, with the
 * availability reader's weekday stems. A bare "from Monday" stays unread:
 * "nuo pirmadienio iki penktadienio" is a working week, not a first day
 * (time-window.test.ts).
 */
// Sunday 2026-11-22: next Monday is the 23rd, next Friday the 27th.
const SUNDAY = "2026-11-22";
// Monday 2026-11-23: "from next Monday" is the 30th, never today.
const MONDAY = "2026-11-23";

describe("parseStartDate — a weekday start", () => {
  const cases: ReadonlyArray<[string, string, string]> = [
    ["en", "We need two welders from next Monday", "2026-11-23"],
    ["en", "Starting next Friday", "2026-11-27"],
    ["lt", "Reikia dviejų suvirintojų nuo kito pirmadienio", "2026-11-23"],
    ["lt", "Pradedam kitą pirmadienį", "2026-11-23"],
    ["lt", "nuo kito penktadienio", "2026-11-27"],
    ["ru", "Нужны два сварщика со следующего понедельника", "2026-11-23"],
    ["ru", "со следующей пятницы", "2026-11-27"],
    ["pl", "Potrzebujemy dwóch spawaczy od przyszłego poniedziałku", "2026-11-23"],
    ["pl", "od następnego piątku", "2026-11-27"],
    ["de", "Wir brauchen zwei Schweißer ab nächstem Montag", "2026-11-23"],
    ["de", "ab kommendem Freitag", "2026-11-27"],
    ["nl", "We zoeken twee lassers vanaf volgende maandag", "2026-11-23"],
    ["nl", "vanaf aanstaande vrijdag", "2026-11-27"],
    ["sv", "Vi behöver två svetsare från nästa måndag", "2026-11-23"],
    ["sv", "Vi behöver en snickare från och med nästa fredag", "2026-11-27"],
  ];
  for (const [lang, text, day] of cases) {
    it(`${lang}: "${text}" starts ${day}`, () => {
      expect(parseStartDate(text, SUNDAY)).toBe(day);
      expect(mentionsStartTime(text), "the recognizer sees a stated start").toBe(true);
    });
  }

  it("said on that weekday: 'from next Monday' is a week later, never today", () => {
    expect(parseStartDate("from next Monday", MONDAY)).toBe("2026-11-30");
    expect(parseStartDate("nuo kito pirmadienio", MONDAY)).toBe("2026-11-30");
  });

  it("a weekday with no next-word is not a start; other dates still win", () => {
    expect(parseStartDate("I worked on Monday", SUNDAY)).toBeNull();
    expect(parseStartDate("nuo pirmadienio", SUNDAY)).toBeNull();
    expect(parseStartDate("nuo pirmadienio iki penktadienio", SUNDAY)).toBeNull();
    expect(parseStartDate("ab Montag", SUNDAY)).toBeNull();
    expect(parseStartDate("next week", SUNDAY)).toBeNull();
    expect(parseStartDate("from 5 December", SUNDAY)).toBe("2026-12-05");
    expect(parseStartDate("nuo rytojaus", SUNDAY)).toBe("2026-11-23");
  });
});
