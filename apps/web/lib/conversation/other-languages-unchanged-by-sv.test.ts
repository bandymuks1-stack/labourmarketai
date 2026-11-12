import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import * as worldState from "@/lib/ai-workspace/world-state-language";
import * as personName from "@/lib/communication/person-name-match";
import * as availabilityDay from "@/lib/conversation/availability-day";
import * as conversationGoal from "@/lib/conversation/conversation-goal";
import * as correctWork from "@/lib/conversation/correct-work-model";
import * as documentType from "@/lib/conversation/document-type-guess";
import * as educationQuestion from "@/lib/conversation/education-question";
import * as evidenceGoal from "@/lib/conversation/evidence-goal";
import * as fileSubject from "@/lib/conversation/file-subject";
import * as intentRouter from "@/lib/conversation/intent-router";
import * as journalPeriod from "@/lib/conversation/journal-period-phrase";
import * as languageStatement from "@/lib/conversation/language-statement";
import * as renamePhrase from "@/lib/conversation/organization-rename-phrase";
import { makeReaders } from "@/lib/conversation/other-languages-unchanged-by-sv.readers";
import * as pastWork from "@/lib/conversation/past-work-period";
import * as payStatement from "@/lib/conversation/pay-statement";
import * as productHelp from "@/lib/conversation/product-help";
import * as progressStatus from "@/lib/conversation/progress-status-phrase";
import * as projectTitle from "@/lib/conversation/project-title-from-sentence";
import * as skillStatement from "@/lib/conversation/skill-statement";
import * as statedProfessions from "@/lib/conversation/stated-professions";
import * as utterance from "@/lib/conversation/utterance-understanding";
import * as worklog from "@/lib/conversation/worklog-extract";
import * as workspaceReference from "@/lib/conversation/workspace-reference";
import * as weekQuestion from "@/lib/planning/week-question";
import * as cardMode from "@/lib/player-card/card-mode-from-text";
import * as journalSuggestions from "@/lib/structuring/extract-journal-suggestions";
import { looksSwedish } from "@/lib/structuring/looks-swedish";
import * as needHeadcount from "@/lib/structuring/need-headcount";
import * as roleLabel from "@/lib/structuring/role-label";
import * as structureNeed from "@/lib/structuring/structure-need";
import * as timeWindow from "@/lib/structuring/time-window";
import * as valueStatement from "@/lib/structuring/value-statement";

/**
 * SWEDISH MAY NOT CHANGE HOW ANOTHER LANGUAGE IS ROUTED OR READ.
 *
 * Swedish was activated on 2026-11-12 and its vocabulary was added to the
 * SHARED chat router and the shared readers. Those patterns run on every
 * sentence in every language, and an independent review of PR 3261 showed
 * them changing Lithuanian, English, German, Dutch and Polish sentences:
 * `\d+ st` caught "the 31st"; `visa` caught the Lithuanian "visą" and the
 * English "visa"; `kontakta` caught "kontaktą"; `klar` inside "erklär" marked
 * a stage done; `lag` changed headcounts; `timm` caught the Dutch
 * "timmerman"; `till` matched inside "still"; `i` swallowed the English "I";
 * " min " read as "my"; `logi` matched "logistics".
 *
 * THE RULE: a Swedish addition must never change how a non-Swedish sentence
 * is routed or read. It holds by construction — Swedish vocabulary applies
 * only to a sentence `looksSwedish` reads as Swedish (`sv()` patterns in the
 * router, `SV_…` twins in the readers) — and THIS TEST PINS IT: for every
 * sentence below, today's tree must say exactly what origin/main said before
 * Swedish existed.
 *
 * THE FIXTURE (`other-languages-unchanged-by-sv.fixture.json`) holds, for
 * 2 000+ non-Swedish sentences, what ORIGIN/MAIN answers: the router's intent
 * and score and 38 reader outputs (see `…-by-sv.readers.ts` for the exact
 * calls). A reader's commonest answer is stored once (`defaults`); a row holds
 * only what differs. The sentences are: every example quoted in the review;
 * adversarial sentences for each Swedish token that is a word or a substring
 * in another language (st, visa / visą, kontaktą, klar / erklär, lag / Lager,
 * timmerman, till / still / Till, i / I, min, eleven / geleverd, logistics,
 * pass, Tack, ledig, privat, NY, "į ar", Medina, chef, semester, personal …);
 * sentences from the lt / en / ru / de / nl / pl test suites; and lines of the
 * product's own text in those six languages.
 *
 * HOW IT WAS RECORDED — on origin/main @ the commit named in the fixture's
 * `recordedOn`, by `apps/web/scripts/sv-other-languages-fixture.mts` run
 * inside a checkout of main (the script's header has the commands). The script
 * and this test call the readers through ONE table (`makeReaders`), so the two
 * sides cannot differ in how they ask. Re-record only when main's behaviour
 * for another language changes ON PURPOSE, in a change that says so.
 *
 * THE ONLY DIFFERENCES ALLOWED are listed below, each with its reason. A
 * difference that is not listed fails the test; a listed one that no longer
 * differs fails it too (the list may not rot).
 */

interface Fixture {
  readonly recordedOn: string;
  readonly readers: readonly string[];
  readonly defaults: Readonly<Record<string, unknown>>;
  readonly rows: ReadonlyArray<readonly [string, Readonly<Record<string, unknown>>]>;
}

const FIXTURE: Fixture = JSON.parse(
  readFileSync(join(process.cwd(), "lib/conversation/other-languages-unchanged-by-sv.fixture.json"), "utf8"),
);

const READERS = makeReaders({
  intentRouter,
  productHelp,
  availabilityDay,
  conversationGoal,
  correctWork,
  documentType,
  educationQuestion,
  evidenceGoal,
  fileSubject,
  journalPeriod,
  languageStatement,
  renamePhrase,
  pastWork,
  payStatement,
  progressStatus,
  projectTitle,
  skillStatement,
  statedProfessions,
  utterance,
  worklog,
  workspaceReference,
  weekQuestion,
  cardMode,
  personName,
  journalSuggestions,
  needHeadcount,
  roleLabel,
  structureNeed,
  timeWindow,
  valueStatement,
  worldState,
});

/* ── THE INTENDED DIFFERENCES — complete, explicit, each with its reason ──── */

interface Intended {
  readonly sentence: string;
  readonly reader: string;
  /** What today's tree says instead of what main said. */
  readonly now: unknown;
}

/**
 * (a) A BLOCKED TASK OR STAGE IS NO LONGER RECORDED AS DONE.
 *
 * main's stage handler had drifted from the task handler: it did not know the
 * Polish `zablok…`, so "Etap fundamenty zablokowany" was written down as a
 * FINISHED stage. One reader now serves both handlers. (For a task, main
 * already read these as blocked — no difference there.)
 */
const BLOCKED_IS_NOT_DONE: readonly Intended[] = [
  { sentence: "Zadanie zablokowane", reader: "stageProgress", now: "blocked" },
  { sentence: "Etap fundamenty zablokowany", reader: "stageProgress", now: "blocked" },
];

/**
 * (b) A SALARY IN A CURRENCY THAT IS NOT THE EURO IS NO LONGER PREFILLED INTO
 * THE EURO FIELD.
 *
 * The work card holds `salary_min_eur` / `salary_max_eur`. main copied any
 * figure into it: "Chcę 6000 zł miesięcznie" became a 6 000 EUR expectation.
 * The figure is now read as `other-currency` and nothing is prefilled.
 */
const otherCurrency = (sentence: string, currency: string): Intended[] => [
  { sentence, reader: "pay", now: { kind: "other-currency", currency } },
  { sentence, reader: "payPrefill", now: {} },
];
const NOT_EUROS_IS_NOT_PREFILLED: readonly Intended[] = [
  ...otherCurrency("Salary 25000 kr per month", "kr"),
  ...otherCurrency("Atlyginimas 3000 zł", "zł"),
  ...otherCurrency("Wynagrodzenie 5000 PLN", "pln"),
  ...otherCurrency("Lohn 30000 NOK", "nok"),
  ...otherCurrency("Pay is 4000 USD", "usd"),
  ...otherCurrency("Chcę 6000 zł miesięcznie", "zł"),
  ...otherCurrency("Salary 3000 CHF", "chf"),
];

const INTENDED: readonly Intended[] = [...BLOCKED_IS_NOT_DONE, ...NOT_EUROS_IS_NOT_PREFILLED];

/**
 * (c) A SENTENCE THAT STATES NO STATE WRITES NONE (review finding 4).
 *
 * main's two status handlers ended in `: "done"` — whatever was not "blocked"
 * or "started" was recorded as finished, so a QUESTION that reached a handler
 * marked the stage done. The reader now returns `null` for a sentence with no
 * state word and the handler writes nothing. This is a rule, not a list: it
 * covers every sentence in which main's "done" was only the fallback — that
 * is, a sentence carrying none of the completion words below (the router's
 * own `task-status` / `stage-status` vocabulary, spelled out independently of
 * the reader). A sentence that DOES carry one must still read "done".
 */
const COMPLETION_WORD_RE =
  /baigt|baigiau|atlikt|atlikau|u[zž]baig|padaryt|padariau|done|finished|complet|fertig|abgeschlossen|erledigt|klaar|afgerond|заверш|готов|сделан|сделал|выполн|wykonan|wykonał|zako[nń]cz|uko[nń]cz|skończył|skonczyl|gotow/u;
const PROGRESS_READERS: ReadonlySet<string> = new Set(["taskProgress", "stageProgress"]);
const doneWasOnlyTheFallback = (sentence: string, reader: string, main: unknown, now: unknown): boolean =>
  PROGRESS_READERS.has(reader) && main === "done" && now === null && !COMPLETION_WORD_RE.test(sentence.toLowerCase());

/* ── the examples the independent review quoted, by finding ───────────────── */
const REVIEW_EXAMPLES: readonly string[] = [
  // 1 — `\d+ st`
  "My contract ends on the 31st",
  "I want to request leave from the 21st",
  "Remind me on the 1st",
  // 2 — `visa`
  "Vakar visą dieną dirbau projekte Vilnius, 8 val.",
  "Įkelk visą CV",
  "Add my visa to my CV",
  // 3 — `kontakta`
  "Kas gali matyti mano kontaktą profilyje?",
  // 4 — `klar` inside "erklär"
  "Erkläre die Etappe Fundament",
  // 5 — `lag`
  "We need 5 welders, there is a lag of 2 weeks",
  "Wij zoeken 3 stukadoors voor stucwerk in 2 lagen van 10 mm",
  // 6 — `timm…`
  "Wij zoeken 8 timmerlieden",
  "Ik heb 3 timmermannen nodig",
  // 7 — `till` inside "still"
  "My salary expectation is still 3000 euro",
  // 8 — `i` after the place word
  "Today on site I built a wall, 8 hours",
  "Byłem na budowie i Marek mi pomagał, 8 godzin",
  // 9 — " min ", `elever`
  "Hierbij het cv van Jan, min of meer compleet",
  "Here is John's certificate, a 5 min scan",
  "Dit is het certificaat van Piet, opgeleverd gisteren",
  // 10 — `logi`
  "Looking for logistics jobs",
  "Suche Logistik Job",
  "Ieškau logistikos darbo",
  "Login problems",
  // 11 — the smaller collisions
  "Schreib Till Schmidt",
  "Here is my pass",
  "Rename the company to Nordic Tack",
  "Ich bin ledig",
  "Wechsle zu Privat Bau GmbH",
  "We have eleven students",
  "Create programme NY welders",
  "Kiek dirbau į ar iš Vilniaus?",
];

const expectedOnMain = (said: Readonly<Record<string, unknown>>, reader: string): unknown =>
  reader in said ? said[reader] : FIXTURE.defaults[reader];

describe("other languages are routed and read exactly as on origin/main — Swedish changed nothing", () => {
  it("the fixture is the recorded one: main's commit, 1 500+ sentences, every reader of the table", () => {
    expect(FIXTURE.recordedOn).toMatch(/^origin\/main @ [0-9a-f]{40}$/);
    expect(FIXTURE.rows.length).toBeGreaterThanOrEqual(1500);
    expect([...FIXTURE.readers].sort()).toEqual(Object.keys(READERS).sort());
    expect(new Set(FIXTURE.rows.map((row) => row[0])).size).toBe(FIXTURE.rows.length);
  });

  it("every example quoted in the review is pinned", () => {
    const pinned = new Set(FIXTURE.rows.map((row) => row[0]));
    expect(REVIEW_EXAMPLES.filter((sentence) => !pinned.has(sentence))).toEqual([]);
  });

  it("none of the pinned sentences is taken for Swedish", () => {
    // The gate itself: a false hit here is the defect this whole file is about.
    expect(FIXTURE.rows.map((row) => row[0]).filter((sentence) => looksSwedish(sentence))).toEqual([]);
  });

  it("every reader says what origin/main said — except the listed, intended differences", () => {
    const intended = new Map(INTENDED.map((entry) => [`${entry.reader}\u0000${entry.sentence}`, entry]));
    const used = new Set<string>();
    const unexpected: string[] = [];
    for (const [sentence, said] of FIXTURE.rows) {
      for (const reader of FIXTURE.readers) {
        const main = expectedOnMain(said, reader);
        const now = READERS[reader](sentence) ?? null;
        const mainJson = JSON.stringify(main);
        const nowJson = JSON.stringify(now);
        if (mainJson === nowJson) continue;
        const key = `${reader}\u0000${sentence}`;
        const allowed = intended.get(key);
        if (allowed && JSON.stringify(allowed.now) === nowJson) {
          used.add(key);
          continue;
        }
        if (doneWasOnlyTheFallback(sentence, reader, main, now)) continue;
        unexpected.push(`${reader} · ${JSON.stringify(sentence)} · main ${mainJson} · now ${nowJson}`);
      }
    }
    expect(unexpected).toEqual([]);
    // No stale allowance: every listed difference is still a real difference.
    expect([...intended.keys()].filter((key) => !used.has(key))).toEqual([]);
    // ~80 000 reader calls and the router's cold start: well past the default.
  }, 120_000);

  it("(c) is narrow: a sentence WITH a completion word still reads done, as on main", () => {
    const stillDone = FIXTURE.rows.filter(
      ([sentence, said]) =>
        expectedOnMain(said, "taskProgress") === "done" && COMPLETION_WORD_RE.test(sentence.toLowerCase()),
    );
    expect(stillDone.length).toBeGreaterThan(20);
    for (const [sentence] of stillDone) {
      expect(READERS.taskProgress(sentence), sentence).toBe("done");
    }
  });
});

describe("…and Swedish is still read, behind the gate", () => {
  it("the same words open for a Swedish sentence", () => {
    // The Swedish twin of each collision: read when the sentence is Swedish.
    expect(intentRouter.classifyIntent("Visa mina projekt").intent).toBe("projects");
    expect(intentRouter.classifyIntent("Idag jobbade jag 8 timmar").intent).toBe("log-work");
    expect(payStatement.readPayStatement("Min löneförväntan är från 3000 till 3500 euro")).toEqual({
      kind: "range",
      min: 3000,
      max: 3500,
    });
    expect(structureNeed.readTeamComposition("Vi behöver 3 lag om 4 personer")).toMatchObject({ total: 12 });
    expect(fileSubject.readFileIntent("Här är mitt CV")).toMatchObject({ subject: "self", kind: "cv" });
    expect(documentType.guessDocumentType("Här är mitt pass")).toBe("id_document");
    expect(personName.matchPeopleByName("Öppna en konversation med Medina", [{ name: "Medina Ali", item: "m" }])).toEqual(["m"]);
    expect(progressStatus.readStatedProgress("Etappen tak är klar", "stage")).toBe("done");
  });

  it("a Swedish word alone, with nothing that says Swedish, keeps the neutral reading", () => {
    // "Kontakta Jonas" carries no marker: `kontakta` is also the Lithuanian
    // "kontaktą" typed without its ogonek. A miss is safe; a false hit is not.
    expect(looksSwedish("Kontakta Jonas")).toBe(false);
    expect(looksSwedish("Okej")).toBe(false);
    expect(looksSwedish("Message Håkan")).toBe(false);
    expect(looksSwedish("I worked in Luleå for 2 years")).toBe(false);
    expect(looksSwedish("Jeg har arbejdet 8 timer på byggepladsen")).toBe(false);
  });
});
