import { describe, it, expect } from "vitest";
import { classifyIntent, isExplicitJournalRequest } from "./intent-router";

/**
 * The deterministic intent router is the always-on floor of the conversation
 * layer (LLM off). These cases pin the brief's example sentences (§2) to their
 * intents so a keyword refactor can't silently reroute them.
 */
describe("classifyIntent — brief example sentences", () => {
  const cases: Array<[string, string]> = [
    ["Šiandien dirbau nuo 8 iki 17.", "log-work"],
    ["Šiandien objekte Roterdame dirbau nuo 8 iki 17, 45 min pietūs, montavau langus.", "log-work"],
    ["Сегодня работал с 8 до 17.", "log-work"],
    ["Rask man darbą Nyderlanduose.", "find-work"],
    ["Ieškau darbo", "find-work"],
    ["find me a job", "find-work"],
    ["Parašyk šiai įmonei.", "write-employer"],
    ["Išversk žinutę į olandų kalbą.", "translate"],
    ["Kada turiu kitą susitikimą?", "calendar-view"],
    ["Primink rytoj 8 valandą paskambinti.", "reminder"],
    ["Įkelk šį CV.", "cv"],
    ["Ką dar turiu padaryti?", "next-action"],
    ["Kur sustojau?", "resume"],
  ];

  for (const [text, expected] of cases) {
    it(`"${text}" → ${expected}`, () => {
      expect(classifyIntent(text).intent).toBe(expected);
    });
  }

  it("empty / gibberish → unknown (honest fallback)", () => {
    expect(classifyIntent("").intent).toBe("unknown");
    expect(classifyIntent("   ").intent).toBe("unknown");
    expect(classifyIntent("qwerty zxcv").intent).toBe("unknown");
  });

  it("criteria readback beats find-work even when the sentence mentions search", () => {
    expect(classifyIntent("kokie kriterijai pas mane nurodyti?").intent).toBe("criteria");
    expect(classifyIntent("kokie mano paieškos kriterijai").intent).toBe("criteria");
    expect(classifyIntent("what criteria are set for my job search").intent).toBe("criteria");
    expect(classifyIntent("какие критерии у меня указаны").intent).toBe("criteria");
  });

  it("distinguishes logging work from seeking work", () => {
    // Past-tense + time span tips to log-work even though 'darbo' appears.
    expect(classifyIntent("vakar dirbau 8 valandas").intent).toBe("log-work");
    // Seeking verb tips to find-work.
    expect(classifyIntent("noriu rasti darbą Vokietijoje").intent).toBe("find-work");
  });
});

/**
 * DIACRITIC-FREE TYPING (owner-acceptance §16 production finding A-12).
 * Lithuanian typed without diacritics must reach the SAME intent — on most
 * keyboards that is how people actually write.
 */
describe("diacritic folding — LT without diacritics reaches the same intent", () => {
  const pairs: ReadonlyArray<readonly [string, string]> = [
    ["Parodyk žinutes", "Parodyk zinutes"],
    ["Parodyk mano kortelę", "Parodyk mano kortele"],
    ["Kiek valandų dirbau šiandien?", "Kiek valandu dirbau siandien?"],
    ["Šiandien dirbau nuo 8 iki 17", "Siandien dirbau nuo 8 iki 17"],
    ["Kokių įgūdžių man trūksta?", "Kokiu igudziu man truksta?"],
    ["Parodyk paskutinius žurnalo įrašus", "Parodyk paskutinius zurnalo irasus"],
    ["Kokie kriterijai pas mane nurodyti?", "Kokie kriterijai pas mane nurodyti?"],
    ["Ieškau darbo", "Ieskau darbo"],
  ];
  for (const [withD, withoutD] of pairs) {
    it(`"${withoutD}" classifies like "${withD}"`, () => {
      const a = classifyIntent(withD);
      const b = classifyIntent(withoutD);
      expect(b.intent).toBe(a.intent);
      expect(a.intent).not.toBe("unknown");
    });
  }

  it("folding never turns an unrelated sentence into a false match", () => {
    expect(classifyIntent("labas").intent).toBe("unknown");
  });
});

/**
 * `isExplicitJournalRequest` — the predicate that decides whether the chat
 * OPENS the work-log flow or answers with the clarify question.
 *
 * WHY IT IS PINNED. A real tester could not fill the Work Journal: every
 * request ("O žurnalo neužpildysi?") carries no date and no hours, so the chat
 * answered "which day and how long did you work?" — and rephrasing returned
 * the identical sentence. Chat is the journal's ONLY intake (owner audit
 * §6.1), so the journal was unreachable. These cases keep a request separated
 * from a vague mention.
 */
describe("isExplicitJournalRequest — a request opens the flow", () => {
  const requests = [
    "O žurnalo neužpildysi?", // the tester's own words
    "Užpildyk darbo žurnalą",
    "Įrašyk vakarykštį darbą į žurnalą",
    "Šiandien dirbau nuo 8 iki 17, įrašyk į žurnalą",
    "užpildyk žurnalą",
    "gal gali užpildyti darbo žurnalą?",
    "noriu užpildyti darbo žurnalą",
    "pildyk žurnalą",
    "reikia užpildyti žurnalą",
    "darbo žurnalas",
    "uzpildyk zurnala", // typed without diacritics
    "fill in my work journal",
    "запиши работу в журнал",
  ];
  for (const t of requests) {
    it(`"${t}" is an explicit journal request`, () => {
      expect(isExplicitJournalRequest(t)).toBe(true);
    });
  }

  // A vague work mention is genuinely ambiguous — the product does not know
  // what is being asked, so the ONE clarify question stays correct there.
  const notRequests = [
    "dirbau",
    "šiandien dirbau",
    "Ieškau darbo",
    "labas",
    "",
    "Rask man darbą Nyderlanduose.",
  ];
  for (const t of notRequests) {
    it(`"${t}" is NOT an explicit journal request`, () => {
      expect(isExplicitJournalRequest(t)).toBe(false);
    });
  }

  // The two halves must agree: everything the predicate calls a request must
  // still ROUTE to log-work, otherwise the flow would never be reached.
  it("every explicit journal request also classifies as log-work", () => {
    for (const t of requests) {
      expect(classifyIntent(t).intent).toBe("log-work");
    }
  });
});
