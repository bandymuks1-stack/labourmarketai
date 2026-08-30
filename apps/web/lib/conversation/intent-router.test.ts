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
 * ONE ACTIVE CONTEXT by sentence (chat-first audit 2026-08-30, gap G1): the
 * switching sentences from the audit brief reach `switch-context` in all five
 * routed locales — and the "work as X" family stays ROLE-gated so a
 * profession statement never routes here.
 */
describe("switch-context — the active context is reachable by sentence", () => {
  const cases: Array<[string, string]> = [
    ["Perjunk į Nonstop Group.", "switch-context"],
    ["Perjunk į įmonę X.", "switch-context"],
    ["perjunk mane i imone", "switch-context"], // diacritic-free
    ["Grįžk į mano asmeninį profilį.", "switch-context"],
    ["Dirbu dabar kaip darbuotojas.", "switch-context"],
    ["Switch to Nonstop Group", "switch-context"],
    ["go back to my personal space", "switch-context"],
    ["change my workspace", "switch-context"],
    ["I want to act as a company now", "switch-context"],
    ["Переключи меня на компанию Nonstop", "switch-context"],
    ["вернись в личное пространство", "switch-context"],
    ["schakel over naar mijn bedrijf", "switch-context"],
    ["terug naar mijn persoonlijke ruimte", "switch-context"],
    ["wechsle zu meiner Firma", "switch-context"],
    ["zurück zu meinem persönlichen Bereich", "switch-context"],
  ];
  for (const [text, expected] of cases) {
    it(`"${text}" → ${expected}`, () => {
      expect(classifyIntent(text).intent).toBe(expected);
    });
  }

  it("a profession statement is NOT a context switch (role-noun gate)", () => {
    // "I work as a tiler" — a fact about the person, not a workspace request.
    expect(classifyIntent("dirbu kaip plytelių klojėjas").intent).not.toBe("switch-context");
    expect(classifyIntent("I work as a tiler in Oslo").intent).not.toBe("switch-context");
    expect(classifyIntent("работаю как плиточник").intent).not.toBe("switch-context");
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
 * V9 value-intent routing — the "grandmother's cucumbers" acceptance set.
 * The audit found "kitą mėnesį trūks keturių suvirintojų" landing `unknown`;
 * these cases pin the three fixtures AND the boundaries that must not move.
 */
describe("classifyIntent — V9 value statements", () => {
  it("fixture A: a goods offer routes to offer-value", () => {
    expect(
      classifyIntent("Turiu 30 kg savo darže užaugintų agurkų ir noriu parduoti").intent,
    ).toBe("offer-value");
  });

  it("fixture B: free work capacity routes to offer-value", () => {
    expect(
      classifyIntent("Esu elektrikas ir kitą savaitę turiu dvi laisvas dienas").intent,
    ).toBe("offer-value");
  });

  it("fixture C: a shortage with an occupation routes to need-workers", () => {
    expect(
      classifyIntent("Mūsų įmonei kitą mėnesį trūks keturių suvirintojų").intent,
    ).toBe("need-workers");
  });

  it("occupation + seek-verb co-occurrence works across locales", () => {
    expect(classifyIntent("ieškome suvirintojų į Norvegiją").intent).toBe("need-workers");
    expect(classifyIntent("we need welders next month").intent).toBe("need-workers");
    expect(classifyIntent("нужны сварщики").intent).toBe("need-workers");
  });

  it("boundaries: an occupation WITHOUT a seek verb is never need-workers", () => {
    expect(classifyIntent("esu suvirintojas").intent).not.toBe("need-workers");
    expect(classifyIntent("Esu elektrikas ir kitą savaitę turiu dvi laisvas dienas").intent).not.toBe(
      "need-workers",
    );
  });

  it("boundaries: the existing routes stay put", () => {
    expect(classifyIntent("Ieškau darbo").intent).toBe("find-work");
    expect(classifyIntent("ieškau darbuotojų").intent).toBe("need-workers");
    expect(classifyIntent("Rask man darbą Nyderlanduose.").intent).toBe("find-work");
    expect(classifyIntent("Šiandien dirbau nuo 8 iki 17.").intent).toBe("log-work");
  });

  it("V10 fixtures: bare-count goods and equipment availability route to offer-value", () => {
    expect(
      classifyIntent("Pagaminome 500 medinių palečių ir norime jas parduoti.").intent,
    ).toBe("offer-value");
    expect(classifyIntent("Mūsų ekskavatorius laisvas trims dienoms.").intent).toBe(
      "offer-value",
    );
    expect(classifyIntent("Galiu versti dokumentus iš lenkų į lietuvių.").intent).not.toBe(
      "need-workers",
    );
  });

  it("diacritic-free typing reaches offer-value too", () => {
    expect(
      classifyIntent("Turiu 30 kg savo darze uzaugintu agurku ir noriu parduoti").intent,
    ).toBe("offer-value");
    expect(classifyIntent("kita savaite turiu dvi laisvas dienas").intent).toBe("offer-value");
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

/**
 * The owner brief's §13 "first real workflows" — the six sentences a person is
 * expected to be able to type on day one. Three of them misrouted before this
 * suite existed:
 *
 *   "Įrašyti šiandienos darbą"   → find-work  (a JOB SEARCH for somebody
 *                                  asking to write down today's work)
 *   "Sukurk įmonės profilį"      → profile    (the person's OWN profile form
 *                                  for somebody asking to create a company)
 *   "Parodyk mano rytojaus planą"→ unknown    (nothing here read TOMORROW)
 *
 * They are pinned together because they are one defect class: the router read
 * a grammatical form nobody actually types.
 */
describe("classifyIntent — the six §13 workflow sentences", () => {
  const six: Array<[string, string]> = [
    ["Įrašyti šiandienos darbą", "log-work"],
    ["Reikia 4 suvirintojų Vokietijoje nuo rugsėjo", "need-workers"],
    ["Rask man darbą", "find-work"],
    ["Parodyk mano CV", "cv"],
    ["Sukurk įmonės profilį", "create-organization"],
    ["Parodyk mano rytojaus planą", "calendar-view"],
  ];
  for (const [text, intent] of six) {
    it(`"${text}" → ${intent}`, () => {
      expect(classifyIntent(text).intent).toBe(intent);
    });
  }
});

describe("classifyIntent — create-organization", () => {
  // Every ACTIVE locale, because a person creates their organization in the
  // language they signed up in — and once without diacritics, which is how
  // most Lithuanian keyboards are actually used.
  const yes = [
    "Sukurk įmonės profilį",
    "Noriu sukurti įmonę",
    "Sukurti organizaciją",
    "Sukurk imones profili",
    "Create a company",
    "Register my business",
    "I want to set up an organisation",
    "Создать компанию",
    "Зарегистрировать организацию",
    "Bedrijf aanmaken",
    "Firma anlegen",
    "Unternehmen gründen",
    "Start a company",
    "Noriu pradėti verslą",
  ];
  for (const t of yes) {
    it(`"${t}" → create-organization`, () => {
      expect(classifyIntent(t).intent).toBe("create-organization");
    });
  }

  // A CREATE VERB is required. Naming a company is not asking to make one:
  // these must keep reaching the intents they already reached, or this rule
  // would have swallowed the whole employer side of the product.
  const no: Array<[string, string]> = [
    ["Kas vyksta mano įmonėje?", "company-overview"],
    ["Reikia darbuotojų", "need-workers"],
    ["Parodyk mano profilį", "profile"],
    ["Pridėk kalbą", "profile"],
  ];
  for (const [t, intent] of no) {
    it(`"${t}" stays ${intent}`, () => {
      expect(classifyIntent(t).intent).toBe(intent);
    });
  }

  // A first cut of this rule accepted `open` and `add` as create-verbs, which
  // turned "Open my company" into a request to create a SECOND organization
  // and "Add a person to the company" into the same — the company hub and the
  // assignment step, both hijacked by a rule meant for people who have neither.
  // These pin the narrowing: a company noun near a broad verb is not a request
  // to found one.
  const notCreation = [
    "Atidaryk įmonės puslapį",
    "Open my company",
    "Open company page",
    "Add a person to the company",
    "Pridėk Joną prie projekto",
  ];
  for (const t of notCreation) {
    it(`"${t}" is NOT create-organization`, () => {
      expect(classifyIntent(t).intent).not.toBe("create-organization");
    });
  }
});

describe("classifyIntent — tomorrow reaches the agenda", () => {
  const yes = [
    "Parodyk mano rytojaus planą",
    "Show tomorrow's schedule",
    "Что у меня завтра по расписанию",
  ];
  for (const t of yes) {
    it(`"${t}" → calendar-view`, () => {
      expect(classifyIntent(t).intent).toBe("calendar-view");
    });
  }

  // The reminder sentence also says "rytoj" and must NOT be pulled in: a
  // reminder is blocked honestly, an agenda is answered.
  it("a reminder about tomorrow is still a reminder", () => {
    expect(classifyIntent("Primink rytoj 8 valandą paskambinti.").intent).toBe(
      "reminder",
    );
  });
});

describe("classifyIntent — recording work in its other grammatical forms", () => {
  const yes = [
    "Įrašyti šiandienos darbą",
    "Record today's work",
    "Записать работу",
    "Užfiksuoti darbą",
  ];
  for (const t of yes) {
    it(`"${t}" → log-work`, () => {
      expect(classifyIntent(t).intent).toBe("log-work");
    });
  }

  // A past-tense description with no journal word is still log-work, and a
  // job search is still a job search — the new verbs must not blur either.
  it("does not swallow a job search", () => {
    expect(classifyIntent("Rask man darbą Nyderlanduose.").intent).toBe(
      "find-work",
    );
  });
});
