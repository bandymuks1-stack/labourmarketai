import { describe, expect, it } from "vitest";

import { classifyIntent, isBareContactRequest, isExplicitJournalRequest, withoutJournalRequest } from "./intent-router";
import { INTENT_REGISTRY } from "./intent-registry";
import { extractWorkLog, journalDraftReadiness } from "./worklog-extract";
import { logWorkNotesRefusal } from "./worker-schemas";
import { structureValueStatement } from "@/lib/structuring/value-statement";

/**
 * AI ASSISTANT INTENT → REAL ACTION (owner P1, 2026-11-21).
 *
 * The confirmed defect: a person typed "noriu užpildyti darbo ataskaitas"
 * ("I want to fill in work reports") and the assistant answered with the
 * organisation's project figures and CSV exports. On origin/main that
 * sentence scored 4 on `figures` (the bare `\bataskait` noun) and 0 on
 * `log-work`: no rule knew the verb FILL. The Russian twin went the same way
 * through `отчёт`; the English one reached `find-work` (10, "I want … work").
 *
 * The fix is in the deterministic router, the always-on floor that works with
 * AI_PROVIDER_MODE=disabled (doctrine §7): a FILL verb bound to a WORK-RECORD
 * noun is the journal action and outranks every read that shares the noun.
 * These cases pin each acceptance phrase in LT, EN and RU to the ONE existing
 * handler it must reach, and pin the reads that must stay reads.
 *
 * What each handler then does is the existing canonical flow, not new code:
 *   find-work    → the job search panel (startFindWork)
 *   need-workers → the `company.create-demand` intake, prefilled with the
 *                  headcount the sentence stated (demandPrefill → teamSize)
 *   log-work     → WorkerWorkLogFlow: the person's own writable contexts,
 *                  the date, the missing fields, the confirm step, and only
 *                  then `worker.log-work` → createJournalEntry.
 */

const TODAY = "2026-11-21";
const YESTERDAY = "2026-11-20";

const ACCEPTANCE: ReadonlyArray<{ goal: string; intent: string; phrases: Readonly<Record<string, string>> }> = [
  {
    goal: "job search",
    intent: "find-work",
    phrases: { lt: "Ieškau darbo", en: "I'm looking for a job", ru: "Ищу работу" },
  },
  {
    goal: "need intake, quantity 5",
    intent: "need-workers",
    phrases: { lt: "Man reikia penkių darbuotojų", en: "I need five workers", ru: "Мне нужно пять работников" },
  },
  {
    goal: "journal draft dated yesterday",
    intent: "log-work",
    phrases: {
      lt: "Užpildyk vakarykštį darbo žurnalą",
      en: "Fill in yesterday's work journal",
      ru: "Заполни вчерашний рабочий журнал",
    },
  },
  {
    goal: "the journal flow (the confirmed defect)",
    intent: "log-work",
    phrases: {
      lt: "noriu užpildyti darbo ataskaitas",
      en: "I want to fill in work reports",
      ru: "Хочу заполнить рабочие отчёты",
    },
  },
];

describe("every acceptance phrase reaches its real action, in LT, EN and RU", () => {
  for (const { goal, intent, phrases } of ACCEPTANCE) {
    for (const [lang, phrase] of Object.entries(phrases)) {
      it(`${lang} "${phrase}" → ${intent} (${goal})`, () => {
        expect(classifyIntent(phrase).intent).toBe(intent);
      });
    }
  }

  it("the three handlers are the existing registry entries, and only the journal one writes", () => {
    expect(INTENT_REGISTRY["find-work"].handler).toBe("findWork");
    expect(INTENT_REGISTRY["need-workers"]).toMatchObject({ handler: "needWorkers", access: "write" });
    expect(INTENT_REGISTRY["log-work"]).toMatchObject({ handler: "logWork", access: "write", domain: "journal" });
    expect(INTENT_REGISTRY.figures.access).toBe("read");
  });
});

describe("the need intake carries the stated quantity, never a guessed one", () => {
  it.each(["Man reikia penkių darbuotojų", "I need five workers", "Мне нужно пять работников"])(
    '"%s" → headcount 5',
    (phrase) => {
      expect(structureValueStatement(phrase).headcount).toBe(5);
    },
  );

  it("no number in the sentence → no headcount (asked for, never invented)", () => {
    expect(structureValueStatement("Man reikia darbuotojų").headcount).toBeNull();
    expect(structureValueStatement("I need workers").headcount).toBeNull();
  });
});

describe("the journal phrases open the flow with the right date, and the request is never the record", () => {
  const yesterday = ["Užpildyk vakarykštį darbo žurnalą", "Fill in yesterday's work journal", "Заполни вчерашний рабочий журнал"];
  const undated = ["noriu užpildyti darbo ataskaitas", "I want to fill in work reports", "Хочу заполнить рабочие отчёты"];

  it.each(yesterday)('"%s" → a draft dated yesterday', (phrase) => {
    const draft = extractWorkLog(phrase, TODAY);
    expect(draft.date).toBe(YESTERDAY);
  });

  it.each(undated)('"%s" names no day → the draft offers today, the person may change it', (phrase) => {
    expect(extractWorkLog(phrase, TODAY).date).toBe(TODAY);
  });

  it.each([...yesterday, ...undated])('"%s" is an explicit request: the flow opens (no clarify loop)', (phrase) => {
    expect(isExplicitJournalRequest(phrase)).toBe(true);
  });

  // Report writing is a real catalogue skill, so "…ataskaitas" read as WORK
  // CONTENT before the request's own words were set aside, and the request
  // would have been prefilled — and saved — as the entry's evidence.
  it.each([...yesterday, ...undated])('"%s" carries no work: the flow asks what was done', (phrase) => {
    expect(journalDraftReadiness(phrase)).toBe("meta-request");
    // The server floor refuses it too, whatever the client sends.
    expect(logWorkNotesRefusal(phrase)).toBe("meta-request");
  });

  it("work said beside the request stays the person's evidence", () => {
    expect(journalDraftReadiness("Užpildyk ataskaitą: šiandien montavau langus 8 valandas")).toBe("ok");
    expect(journalDraftReadiness("Fill in my timesheet, I installed windows for 8 hours")).toBe("ok");
    expect(withoutJournalRequest("Užpildyk ataskaitą: montavau langus")).toContain("montavau langus");
  });
});

describe("FILL is matched by stem, so inflections and word order route the same way", () => {
  it.each([
    // lt — infinitive, imperative, present, future, past; no diacritics
    "užpildyti ataskaitą",
    "užpildyk šiandienos ataskaitą",
    "pildau darbo ataskaitas",
    "užpildysiu vakarykštę ataskaitą",
    "uzpildyti darbo ataskaitas",
    "reikia užpildyti tabelį",
    "darbo ataskaitas užpildyti",
    // en
    "fill out my timesheet",
    "I need to fill in the daily report",
    "filling in my work log",
    // ru
    "заполнить отчёт",
    "заполняю рабочий отчет",
    "нужно заполнить табель",
    // de / nl / pl — the verb-last orders
    "Bericht ausfüllen",
    "Ich fülle den Stundenzettel aus",
    "urenbriefje invullen",
    "vul het rapport in",
    "wypełnij raport pracy",
  ])('"%s" → log-work', (phrase) => {
    expect(classifyIntent(phrase).intent).toBe("log-work");
  });
});

describe("reads stay reads: the report and statistics questions keep their own door", () => {
  it.each([
    "show project stats",
    "parodyk projekto statistiką",
    "Покажи статистику проекта",
    "Paruošk ataskaitą",
    "prepare a report",
    "Подготовь отчёт",
    "Show my approved hours",
  ])('"%s" → figures', (phrase) => {
    expect(classifyIntent(phrase).intent).toBe("figures");
  });

  it.each(["Mano projektai", "Show my projects", "Покажи мои проекты"])('"%s" → projects (no statistics word)', (phrase) => {
    expect(classifyIntent(phrase).intent).toBe("projects");
  });

  // A FILL verb without a work-record noun is not the journal.
  it.each(["We need to fill the position with five welders", "papildyk mano profilį", "Ищу работу, хочу заполнить анкету"])(
    '"%s" is not log-work',
    (phrase) => {
      expect(classifyIntent(phrase).intent).not.toBe("log-work");
    },
  );
});

/**
 * THE SECOND OWNER LIST (2026-11-22): four more goals with AI off. Each
 * reaches an existing door; none of them writes or sends from the sentence.
 *   find-partners     → the services others publish (service_offering.discover's read), then the doors
 *   offer-team        → the ONE team-offer form (TeamDemandOfferForm, kind "organization")
 *   candidates        → the candidates of the company's own needs (server-scoped)
 *   open-conversation → asks WHICH of the person's own counterparts; the thread's
 *                       Send is the only thing that sends
 */
const SECOND: ReadonlyArray<{ intent: string; phrases: readonly string[] }> = [
  { intent: "find-partners", phrases: ["Ieškau subrangovų", "I'm looking for subcontractors", "Ищу субподрядчиков"] },
  { intent: "offer-team", phrases: ["Noriu pasiūlyti savo komandą", "I want to offer my team", "Хочу предложить свою команду"] },
  { intent: "candidates", phrases: ["Surask kandidatus", "Find candidates", "Найди кандидатов"] },
  { intent: "open-conversation", phrases: ["Padėk susisiekti", "Help me get in touch", "Помоги связаться"] },
];

describe("the second owner list reaches its real action, in LT, EN and RU", () => {
  for (const { intent, phrases } of SECOND) {
    for (const phrase of phrases) {
      it(`"${phrase}" → ${intent}`, () => {
        expect(classifyIntent(phrase).intent).toBe(intent);
      });
    }
  }

  it("a contact request naming nobody is read as such, so the chat asks whom", () => {
    for (const phrase of SECOND[3].phrases) expect(isBareContactRequest(phrase)).toBe(true);
    // A named person is searched for by name, never listed as a choice.
    expect(isBareContactRequest("Susisiek su Jonu")).toBe(false);
    expect(classifyIntent("Susisiek su Jonu").intent).toBe("open-conversation");
  });

  it("offer-team writes only through its form; the registry says so", () => {
    expect(INTENT_REGISTRY["offer-team"]).toMatchObject({ handler: "offerTeam", access: "write", domain: "company" });
    expect(INTENT_REGISTRY["find-partners"].access).toBe("route");
    expect(INTENT_REGISTRY.candidates.access).not.toBe("write");
  });

  it("an offer of a PERSON, a roster read and a job search keep their doors", () => {
    expect(classifyIntent("pasiūlyk kandidatą komandai").intent).toBe("propose-candidate");
    expect(classifyIntent("parodyk mano komandą").intent).toBe("my-team");
    expect(classifyIntent("Show my team").intent).toBe("my-team");
    expect(classifyIntent("Ищу работу").intent).toBe("find-work");
  });
});

/**
 * CLOSE VARIANTS (2026-11-22). The acceptance phrases are not the only way
 * people say them: singular / plural, a digit for the number, "me", another
 * verb. Each still reaches the SAME door, with AI off.
 */
describe("close LT/EN/RU variants reach the same doors", () => {
  it.each([
    ["ieškau subrangovo", "find-partners"],
    ["reikia subrangovų", "find-partners"],
    ["looking for a subcontractor", "find-partners"],
    ["find me subcontractors", "find-partners"],
    ["ищу субподрядчика", "find-partners"],
    ["нужны субподрядчики", "find-partners"],
    ["reikia 5 darbuotojų", "need-workers"],
    ["I need 5 workers", "need-workers"],
    ["нужно 5 работников", "need-workers"],
    ["find me candidates", "candidates"],
    ["surask man kandidatų", "candidates"],
    ["show candidates", "candidates"],
    ["найди мне кандидатов", "candidates"],
    ["noriu pasiūlyti komandą", "offer-team"],
    ["offer my team", "offer-team"],
    ["padėk man susisiekti", "open-conversation"],
    ["help me contact someone", "open-conversation"],
    ["помоги мне связаться", "open-conversation"],
    ["noriu rasti darbą", "find-work"],
    ["find me a job", "find-work"],
    ["найди мне работу", "find-work"],
    ["užpildyk vakar dienos žurnalą", "log-work"],
    ["fill yesterday's journal", "log-work"],
    ["заполни журнал за вчера", "log-work"],
  ])('"%s" → %s', (phrase, intent) => {
    expect(classifyIntent(phrase).intent).toBe(intent);
  });

  it.each(["reikia 5 darbuotojų", "I need 5 workers", "нужно 5 работников"])('"%s" → headcount 5 (a digit, as said)', (phrase) => {
    expect(structureValueStatement(phrase).headcount).toBe(5);
  });

  it.each(["užpildyk vakar dienos žurnalą", "fill yesterday's journal", "заполни журнал за вчера"])(
    '"%s" → a draft dated yesterday',
    (phrase) => {
      expect(extractWorkLog(phrase, TODAY).date).toBe(YESTERDAY);
    },
  );
});
