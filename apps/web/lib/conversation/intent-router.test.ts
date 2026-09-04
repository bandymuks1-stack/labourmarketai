import { describe, it, expect } from "vitest";
import { classifyIntent, isExplicitJournalRequest } from "./intent-router";
import type { RoutedIntent } from "./intent-registry";

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

/**
 * G8 (chat-first audit 2026-08-30): the chip surfaces, reachable by SENTENCE.
 *
 * `startEmployerCandidates` and `startProjects` were reachable ONLY via chips:
 * typing "show my candidates" ran `find-workers` — a different engine for the
 * same request — and "mano projektai" ran `open-project`, whose nameless
 * branch answers with a text list while the chip opened the real panel. Both
 * requests now route to the SAME handler their chip runs.
 */
describe("G8 — candidates and projects route to the chip handlers", () => {
  const cases: Array<[string, string]> = [
    // candidates — all five locales
    ["parodyk kandidatus", "candidates"],
    ["mano kandidatai", "candidates"],
    ["show my candidates", "candidates"],
    ["покажи кандидатов", "candidates"],
    ["toon de kandidaten", "candidates"],
    ["zeig die Kandidaten", "candidates"],
    ["wer wartet auf eine Antwort?", "candidates"],
    ["wie wacht er nog?", "candidates"],
    // projects — all five locales
    ["parodyk mano projektus", "projects"],
    ["mano projektai", "projects"],
    ["show my projects", "projects"],
    ["покажи мои проекты", "projects"],
    ["mijn projecten", "projects"],
    ["meine Projekte", "projects"],
    ["kur mano projektai?", "projects"],
  ];
  for (const [text, expected] of cases) {
    it(`"${text}" → ${expected}`, () => {
      expect(classifyIntent(text).intent).toBe(expected);
    });
  }

  it("candidate phrasing NEVER falls through to find-workers (negative control)", () => {
    for (const s of [
      "show my candidates",
      "parodyk kandidatus",
      "покажи кандидатов",
      "toon de kandidaten",
      "zeig die Kandidaten",
      "compare these candidates",
    ]) {
      expect(classifyIntent(s).intent, s).not.toBe("find-workers");
      expect(classifyIntent(s).intent, s).toBe("candidates");
    }
  });

  it("scouting and targeted project-open keep their own doors", () => {
    // The SEARCH-FOR-PEOPLE framing is still scouting…
    expect(classifyIntent("surask darbuotojų").intent).toBe("find-workers");
    expect(classifyIntent("find workers").intent).toBe("find-workers");
    expect(classifyIntent("finde passende Leute").intent).toBe("find-workers");
    expect(classifyIntent("vind geschikte mensen").intent).toBe("find-workers");
    // …and naming ONE project is still the targeted open.
    expect(classifyIntent("atidaryk šį projektą").intent).toBe("open-project");
    expect(classifyIntent("Open this project").intent).toBe("open-project");
    expect(classifyIntent("Open dit project").intent).toBe("open-project");
    expect(classifyIntent("Öffne dieses Projekt").intent).toBe("open-project");
    expect(classifyIntent("kas vyksta mano objekte?").intent).toBe("open-project");
  });
});

/**
 * G3 — FIVE-LOCALE PARITY RATCHET (chat-first audit 2026-08-30).
 *
 * nl/de are fully routed locales (complete UI catalogues), yet the router
 * understood only ~12 of the intents in German or Dutch — two-thirds of the
 * product answered fluent UI users with the generic fallback. This matrix is
 * the ratchet that keeps that from regressing: ONE natural sentence per
 * routed intent per ACTIVE locale, every one asserted against the classifier.
 *
 * `Record<RoutedIntent, …>` makes it exhaustive at COMPILE time: a future
 * intent added to the union without a five-locale row here refuses to build —
 * a new capability can never ship reachable in three languages and silently
 * unreachable in the other two.
 */
const ACTIVE_LOCALES = ["lt", "en", "ru", "nl", "de"] as const;
type ActiveLocale = (typeof ACTIVE_LOCALES)[number];

const PARITY_MATRIX: Readonly<Record<RoutedIntent, Record<ActiveLocale, string>>> = {
  "log-work": {
    lt: "Šiandien dirbau nuo 8 iki 17",
    en: "Today I worked from 8 to 17",
    ru: "Сегодня работал с 8 до 17",
    nl: "Vandaag heb ik 8 uur gewerkt",
    de: "Heute habe ich von 8 bis 17 gearbeitet",
  },
  "find-work": {
    lt: "Rask man darbą Nyderlanduose",
    en: "Find me a job",
    ru: "Найди мне работу",
    nl: "Ik zoek werk in Nederland",
    de: "Ich suche Arbeit in Deutschland",
  },
  "write-employer": {
    lt: "Parašyk šiai įmonei",
    en: "Write to this employer",
    ru: "Напиши работодателю",
    nl: "Schrijf naar deze werkgever",
    de: "Schreib dem Arbeitgeber",
  },
  translate: {
    lt: "Išversk žinutę į olandų kalbą",
    en: "Translate this message",
    ru: "Переведи сообщение",
    nl: "Vertaal dit bericht",
    de: "Übersetze diese Nachricht",
  },
  "calendar-view": {
    lt: "Kada turiu kitą susitikimą?",
    en: "When is my next meeting?",
    ru: "Что у меня сегодня",
    nl: "Wanneer is mijn volgende afspraak?",
    de: "Wann ist mein nächster Termin?",
  },
  reminder: {
    lt: "Primink rytoj 8 valandą paskambinti",
    en: "Remind me tomorrow",
    ru: "Напомни мне завтра",
    nl: "Herinner me er morgen aan",
    de: "Erinnere mich morgen daran",
  },
  cv: {
    lt: "Parodyk mano CV",
    en: "Show my resume",
    ru: "Покажи моё резюме",
    nl: "Toon mijn cv",
    de: "Zeig meinen Lebenslauf",
  },
  profile: {
    lt: "Pridėk kalbą",
    en: "Update my profile",
    ru: "Покажи мой профиль",
    nl: "Voeg een taal toe aan mijn profiel",
    de: "Zeig mein Profil",
  },
  offers: {
    lt: "Ką man siūlo?",
    en: "Show my offers",
    ru: "Какие предложения у меня есть",
    nl: "Welke aanbiedingen heb ik?",
    de: "Zeig meine Angebote",
  },
  "need-workers": {
    lt: "Reikia darbuotojų",
    en: "We need workers next month",
    ru: "Нужны сварщики",
    nl: "Wij zoeken personeel",
    de: "Wir brauchen Mitarbeiter",
  },
  criteria: {
    lt: "Kokie kriterijai pas mane nurodyti?",
    en: "What are my search criteria?",
    ru: "Какие критерии у меня указаны",
    nl: "Wat zijn mijn zoekcriteria?",
    de: "Meine Suchkriterien",
  },
  "next-action": {
    lt: "Ką dar turiu padaryti?",
    en: "What should I do next?",
    ru: "Что дальше?",
    nl: "Wat moet ik nog doen?",
    de: "Was soll ich als Nächstes tun?",
  },
  resume: {
    lt: "Kur sustojau?",
    en: "Where did I stop?",
    ru: "На чём я остановился?",
    nl: "Waar was ik gebleven?",
    de: "Wo war ich stehengeblieben?",
  },
  "skill-gap": {
    lt: "Kokių įgūdžių man trūksta?",
    en: "What skills am I missing?",
    ru: "Каких навыков мне не хватает?",
    nl: "Welke vaardigheden mis ik?",
    de: "Welche Fähigkeiten fehlen mir?",
  },
  "journal-recent": {
    lt: "Parodyk paskutinius žurnalo įrašus",
    en: "Show my latest journal entries",
    ru: "Покажи мой дневник",
    nl: "Toon mijn dagboek",
    de: "Zeig mein Tagebuch",
  },
  figures: {
    lt: "Paruošk ataskaitą",
    en: "Show my approved hours",
    ru: "Подготовь отчёт",
    nl: "Toon mijn bevestigde uren",
    de: "Zeig meine bestätigten Stunden",
  },
  "open-project": {
    lt: "Atidaryk šį projektą",
    en: "Open this project",
    ru: "Открой этот проект",
    nl: "Open dit project",
    de: "Öffne dieses Projekt",
  },
  projects: {
    lt: "Mano projektai",
    en: "Show my projects",
    ru: "Покажи мои проекты",
    nl: "Mijn projecten",
    de: "Meine Projekte",
  },
  candidates: {
    lt: "Parodyk kandidatus",
    en: "Show my candidates",
    ru: "Покажи кандидатов",
    nl: "Toon de kandidaten",
    de: "Zeig die Kandidaten",
  },
  "find-workers": {
    lt: "Surask darbuotojų",
    en: "Find workers",
    ru: "Найди работников",
    nl: "Vind geschikte mensen",
    de: "Finde passende Leute",
  },
  "need-service": {
    lt: "Reikia, kad kas nors sutaisytų stogą",
    en: "Need someone to repair the roof",
    ru: "Нужен кто-нибудь, чтобы починить кран",
    nl: "Iemand nodig om het dak te repareren",
    de: "Jemand, der das Dach repariert",
  },
  context: {
    lt: "Ką tu apie mane žinai?",
    en: "What do you know about me?",
    ru: "Что ты знаешь обо мне?",
    nl: "Wat weet je over mij?",
    de: "Was weißt du über mich?",
  },
  "switch-context": {
    lt: "Perjunk į įmonę",
    en: "Switch to my company",
    ru: "Переключи меня на компанию",
    nl: "Schakel over naar mijn bedrijf",
    de: "Wechsle zu meiner Firma",
  },
  opportunities: {
    lt: "Kokias galimybes man gali pasiūlyti?",
    en: "What opportunities do I have?",
    ru: "Какие возможности у меня есть?",
    nl: "Welke mogelijkheden heb ik?",
    de: "Welche Möglichkeiten habe ich?",
  },
  "interest-inbox": {
    lt: "Kas susidomėjo mano poreikiu?",
    en: "Who showed interest in my demand?",
    ru: "Кто заинтересовался?",
    nl: "Wie heeft interesse in mijn aanvraag?",
    de: "Wer hat Interesse gezeigt?",
  },
  "admin-approvals": {
    lt: "Ką turiu patvirtinti?",
    en: "What do I need to approve?",
    ru: "Что мне нужно утвердить?",
    nl: "Wat wacht op mijn goedkeuring?",
    de: "Was muss ich genehmigen?",
  },
  "admin-requests": {
    lt: "Noriu pateikti atostogų prašymą",
    en: "Leave request",
    ru: "Хочу подать заявление на отпуск",
    nl: "Ik wil verlof aanvragen",
    de: "Ich möchte Urlaub beantragen",
  },
  timesheets: {
    lt: "Parodyk mano tabelį",
    en: "Open my timesheet",
    ru: "Покажи мой табель",
    nl: "Open mijn urenstaat",
    de: "Zeig meinen Stundenzettel",
  },
  "hours-import": {
    lt: "Įkelk tabelį",
    en: "Import a timesheet",
    ru: "Загрузи табель",
    nl: "Urenstaat importeren",
    de: "Stundenzettel importieren",
  },
  "work-hours": {
    lt: "Atidaryk darbo valandas",
    en: "Open work hours",
    ru: "Открой рабочие часы",
    nl: "Open de werkuren",
    de: "Öffne die Arbeitsstunden",
  },
  absences: {
    lt: "Kiek atostogų dienų man liko?",
    en: "How many holiday days do I have left?",
    ru: "Сколько дней отпуска у меня осталось?",
    nl: "Hoeveel verlofdagen heb ik nog?",
    de: "Wie viele Urlaubstage habe ich noch?",
  },
  documents: {
    lt: "Parodyk mano dokumentus",
    en: "Show my documents",
    ru: "Покажи мои документы",
    nl: "Toon mijn documenten",
    de: "Zeig meine Dokumente",
  },
  "market-map": {
    lt: "Parodyk rinkos žemėlapį",
    en: "Show me the market map",
    ru: "Покажи карту рынка труда",
    nl: "Toon de arbeidsmarktkaart",
    de: "Öffne die Arbeitsmarktkarte",
  },
  activity: {
    lt: "Parodyk pranešimus",
    en: "Show my notifications",
    ru: "Покажи уведомления",
    nl: "Toon mijn meldingen",
    de: "Zeig meine Benachrichtigungen",
  },
  "messages-view": {
    lt: "Parodyk žinutes",
    en: "Show my messages",
    ru: "Покажи мои сообщения",
    nl: "Toon mijn berichten",
    de: "Zeig meine Nachrichten",
  },
  "player-card": {
    lt: "Parodyk mano kortelę",
    en: "Show my card",
    ru: "Покажи мою карточку",
    nl: "Toon mijn kaart",
    de: "Zeig meine Karte",
  },
  experiences: {
    lt: "Patirtys apie mane",
    en: "I want to leave an experience",
    ru: "Оставить отзыв о взаимодействии",
    nl: "Ik wil een ervaring achterlaten",
    de: "Eine Erfahrung hinterlassen",
  },
  engagements: {
    lt: "Su kuo aš dirbu?",
    en: "Who do I work with?",
    ru: "Рабочие отношения",
    nl: "Met wie werk ik?",
    de: "Mit wem arbeite ich?",
  },
  "company-overview": {
    lt: "Kas vyksta mano įmonėje?",
    en: "What is happening in my company?",
    ru: "Что происходит в моей компании?",
    nl: "Wat gebeurt er in mijn bedrijf?",
    de: "Was passiert in meiner Firma?",
  },
  "create-organization": {
    lt: "Sukurk įmonės profilį",
    en: "Create a company",
    ru: "Создать компанию",
    nl: "Bedrijf aanmaken",
    de: "Firma anlegen",
  },
  lmc: {
    lt: "Kiek turiu LMC?",
    en: "How much LMC do I have?",
    ru: "Сколько у меня LMC?",
    nl: "Hoeveel LMC heb ik?",
    de: "Wie viel LMC habe ich?",
  },
  "offer-value": {
    lt: "Turiu 30 kg agurkų ir noriu parduoti",
    en: "I want to sell 500 wooden pallets",
    ru: "Продам огурцы",
    nl: "Ik wil 30 kg komkommers verkopen",
    de: "Ich möchte 500 Paletten verkaufen",
  },
  // ── AGENCY (real recruiter pilot, 2026-09-04) — the first row is the exact
  //    sentence the first real recruiter typed and the product did not
  //    understand. ────────────────────────────────────────────────────────────
  "invite-client": {
    lt: "Noriu pakviesti klientą",
    en: "Invite a client",
    ru: "Пригласить клиента",
    nl: "Klant uitnodigen",
    de: "Kunden einladen",
  },
  "invite-candidate": {
    lt: "Pakviesk darbuotoją į komandą",
    en: "Invite a worker to my roster",
    ru: "Пригласить работника",
    nl: "Medewerker uitnodigen",
    de: "Mitarbeiter einladen",
  },
  "client-demand": {
    lt: "Parodyk kliento poreikį",
    en: "Show me the client requests",
    ru: "Запрос клиента",
    nl: "Aanvraag van de klant",
    de: "Kundenanfrage anzeigen",
  },
  "propose-candidate": {
    lt: "Pasiūlyk kandidatą",
    en: "Propose a candidate",
    ru: "Предложить кандидата",
    nl: "Kandidaat voorstellen",
    de: "Kandidaten vorschlagen",
  },
  "proposal-status": {
    lt: "Pasiūlymų būsena",
    en: "Proposal status",
    ru: "Статус предложений",
    nl: "Status van mijn voorstellen",
    de: "Stand der Vorschläge",
  },
  // ── STUDENT / INSTITUTION (route-class) ──────────────────────────────────
  "learning-compass": {
    lt: "Parodyk mano mokymosi kompasą",
    en: "Show my learning compass",
    ru: "Покажи мой учебный компас",
    nl: "Toon mijn leerkompas",
    de: "Zeig meinen Lernkompass",
  },
  "invite-student": {
    lt: "Pakviesk studentą",
    en: "Invite a learner",
    ru: "Пригласить студента",
    nl: "Leerling uitnodigen",
    de: "Schüler einladen",
  },
  programmes: {
    lt: "Sukurk programą",
    en: "Create a cohort",
    ru: "Создать программу",
    nl: "Nieuwe opleiding aanmaken",
    de: "Programm anlegen",
  },
  "create-project": {
    lt: "Sukurk projektą Roterdame",
    en: "Create a new project in Rotterdam",
    ru: "Создай проект в Роттердаме",
    nl: "Nieuw project aanmaken",
    de: "Neues Projekt anlegen",
  },
  "agency-offers": {
    lt: "Kokius kandidatus pasiūlė agentūra?",
    en: "Which candidates did the agency offer?",
    ru: "Каких кандидатов предложило агентство?",
    nl: "Welke kandidaten heeft het bureau aangeboden?",
    de: "Welche Kandidaten hat die Agentur vorgeschlagen?",
  },
};

/**
 * §9 CHAT-FIRST COVERAGE — the ambiguity proofs.
 *
 * Six route-class intents were added over vocabulary that six EXISTING rules
 * already read (the timesheet noun, the hour noun, the leave stems, the card
 * noun, the German Nachrichten substring). Adding coverage must never cost
 * coverage, so every sentence the older rule owns is asserted here to still
 * reach it. These are the tests that would fail first if a future widening
 * quietly stole a working intent.
 */
describe("§9 coverage never steals a sentence an existing intent already owned", () => {
  it("the timesheet AREA still wins without an import verb", () => {
    expect(classifyIntent("Parodyk mano tabelį").intent).toBe("timesheets");
    expect(classifyIntent("Open my timesheet").intent).toBe("timesheets");
    expect(classifyIntent("Покажи мой табель").intent).toBe("timesheets");
    expect(classifyIntent("Open mijn urenstaat").intent).toBe("timesheets");
    expect(classifyIntent("Zeig meinen Stundenzettel").intent).toBe("timesheets");
    // …and the SAME noun with an import verb is the import surface.
    expect(classifyIntent("Įkelk tabelį").intent).toBe("hours-import");
    expect(classifyIntent("Stundenzettel importieren").intent).toBe("hours-import");
    expect(classifyIntent("Urenstaat importeren").intent).toBe("hours-import");
  });

  it("a QUESTION about hours is still a journal read, not the hours screen", () => {
    expect(classifyIntent("Kiek valandų dirbau šiandien?").intent).toBe("journal-recent");
    expect(classifyIntent("How many hours did I work?").intent).toBe("journal-recent");
    // …and confirmed-hours phrasing is still the figures workflow.
    expect(classifyIntent("Show my approved hours").intent).toBe("figures");
    expect(classifyIntent("Zeig meine bestätigten Stunden").intent).toBe("figures");
    // …and recording work is still the work log.
    expect(classifyIntent("Šiandien dirbau nuo 8 iki 17").intent).toBe("log-work");
    expect(classifyIntent("Uren invoeren").intent).toBe("log-work");
  });

  it("FILING a leave request still opens the requests area, not the balance", () => {
    expect(classifyIntent("Noriu pateikti atostogų prašymą").intent).toBe("admin-requests");
    expect(classifyIntent("Leave request").intent).toBe("admin-requests");
    expect(classifyIntent("Хочу подать заявление на отпуск").intent).toBe("admin-requests");
    expect(classifyIntent("Ik wil verlof aanvragen").intent).toBe("admin-requests");
    expect(classifyIntent("Ich möchte Urlaub beantragen").intent).toBe("admin-requests");
  });

  it("a bare CARD is still the player card — only the market compound is the map", () => {
    expect(classifyIntent("Zeig meine Karte").intent).toBe("player-card");
    expect(classifyIntent("Toon mijn kaart").intent).toBe("player-card");
    expect(classifyIntent("Покажи мою карточку").intent).toBe("player-card");
    expect(classifyIntent("Show my card").intent).toBe("player-card");
  });

  it("de: Nachrichten is still the message thread, Benachrichtigungen is the activity centre", () => {
    // The measured trap: "Benachrichtigungen" CONTAINS "Nachrichten".
    expect(classifyIntent("Zeig meine Nachrichten").intent).toBe("messages-view");
    expect(classifyIntent("Zeig meine Benachrichtigungen").intent).toBe("activity");
    expect(classifyIntent("Toon mijn berichten").intent).toBe("messages-view");
    expect(classifyIntent("Toon mijn meldingen").intent).toBe("activity");
  });

  it("a 'what is new' question that NAMES its subject still reaches that subject", () => {
    expect(classifyIntent("Kas naujo mano įmonėje?").intent).toBe("company-overview");
    expect(classifyIntent("Kas vyksta mano objekte?").intent).toBe("open-project");
    // Only the unqualified form is the activity centre.
    expect(classifyIntent("Kas naujo?").intent).toBe("activity");
  });
});

describe("G3 — every routed intent is reachable in all five active locales", () => {
  for (const [intent, sentences] of Object.entries(PARITY_MATRIX) as Array<
    [RoutedIntent, Record<ActiveLocale, string>]
  >) {
    for (const locale of ACTIVE_LOCALES) {
      it(`${intent} [${locale}]: "${sentences[locale]}"`, () => {
        expect(classifyIntent(sentences[locale]).intent).toBe(intent);
      });
    }
  }
});
