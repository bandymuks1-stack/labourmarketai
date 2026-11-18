/**
 * THE READERS THE "other languages unchanged by Swedish" PIN RUNS — one table,
 * used twice:
 *
 *   • by `scripts/sv-other-languages-fixture.mts`, run inside a checkout of
 *     origin/main, to RECORD what main says for every pinned sentence;
 *   • by `other-languages-unchanged-by-sv.test.ts`, to ask today's tree the
 *     same questions and compare.
 *
 * Sharing the table is the point: the two sides cannot drift apart in how a
 * reader is called. The modules are handed in (`ReaderModules`) because the
 * recorder loads them from another checkout.
 *
 * Three readers did not exist as functions on origin/main — the logic lived
 * inline in the chat component. `MAIN_INLINE` is that logic, copied verbatim
 * from `components/app/conversation/chat/conversation-chat.tsx` at the recorded
 * main commit, and is used ONLY when the function is absent (i.e. when
 * recording on main). Test code; never imported by the product.
 */

// The recorder passes modules loaded with a dynamic import from another tree.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseModule = Record<string, any>;

export interface ReaderModules {
  readonly intentRouter: LooseModule;
  readonly productHelp: LooseModule;
  readonly availabilityDay: LooseModule;
  readonly conversationGoal: LooseModule;
  readonly correctWork: LooseModule;
  readonly documentType: LooseModule;
  readonly educationQuestion: LooseModule;
  readonly evidenceGoal: LooseModule;
  readonly fileSubject: LooseModule;
  readonly journalPeriod: LooseModule;
  readonly languageStatement: LooseModule;
  readonly renamePhrase: LooseModule;
  readonly pastWork: LooseModule;
  readonly payStatement: LooseModule;
  /** Absent on origin/main. */
  readonly progressStatus: LooseModule;
  readonly projectTitle: LooseModule;
  readonly skillStatement: LooseModule;
  readonly statedProfessions: LooseModule;
  readonly utterance: LooseModule;
  readonly worklog: LooseModule;
  readonly workspaceReference: LooseModule;
  readonly weekQuestion: LooseModule;
  readonly cardMode: LooseModule;
  readonly personName: LooseModule;
  readonly journalSuggestions: LooseModule;
  readonly needHeadcount: LooseModule;
  readonly roleLabel: LooseModule;
  readonly structureNeed: LooseModule;
  readonly timeWindow: LooseModule;
  readonly valueStatement: LooseModule;
  readonly worldState: LooseModule;
}

/** Module path (relative to apps/web) for each key — the recorder's import map. */
export const READER_MODULE_PATHS: Readonly<Record<keyof ReaderModules, string>> = {
  intentRouter: "lib/conversation/intent-router.ts",
  productHelp: "lib/conversation/product-help.ts",
  availabilityDay: "lib/conversation/availability-day.ts",
  conversationGoal: "lib/conversation/conversation-goal.ts",
  correctWork: "lib/conversation/correct-work-model.ts",
  documentType: "lib/conversation/document-type-guess.ts",
  educationQuestion: "lib/conversation/education-question.ts",
  evidenceGoal: "lib/conversation/evidence-goal.ts",
  fileSubject: "lib/conversation/file-subject.ts",
  journalPeriod: "lib/conversation/journal-period-phrase.ts",
  languageStatement: "lib/conversation/language-statement.ts",
  renamePhrase: "lib/conversation/organization-rename-phrase.ts",
  pastWork: "lib/conversation/past-work-period.ts",
  payStatement: "lib/conversation/pay-statement.ts",
  progressStatus: "lib/conversation/progress-status-phrase.ts",
  projectTitle: "lib/conversation/project-title-from-sentence.ts",
  skillStatement: "lib/conversation/skill-statement.ts",
  statedProfessions: "lib/conversation/stated-professions.ts",
  utterance: "lib/conversation/utterance-understanding.ts",
  worklog: "lib/conversation/worklog-extract.ts",
  workspaceReference: "lib/conversation/workspace-reference.ts",
  weekQuestion: "lib/planning/week-question.ts",
  cardMode: "lib/player-card/card-mode-from-text.ts",
  personName: "lib/communication/person-name-match.ts",
  journalSuggestions: "lib/structuring/extract-journal-suggestions.ts",
  needHeadcount: "lib/structuring/need-headcount.ts",
  roleLabel: "lib/structuring/role-label.ts",
  structureNeed: "lib/structuring/structure-need.ts",
  timeWindow: "lib/structuring/time-window.ts",
  valueStatement: "lib/structuring/value-statement.ts",
  worldState: "lib/ai-workspace/world-state-language.ts",
};

/** "Today" for every date reader — Thursday. */
export const PIN_TODAY = "2026-11-12";

/** People the name matcher chooses among — "Till" and "Med…" are real names. */
const PEOPLE = ["Till Schmidt", "Jonas Petraitis", "Min Lee", "Anna Kowalska", "Medina Ali", "Hans Klar"].map(
  (name) => ({ name, item: name }),
);

/** The person's organizations when the chat asks which workspace was meant. */
const ORGANIZATION_NAMES = ["Privat Bau GmbH", "Personal Service UAB", "Statyba UAB"];

/**
 * A board vocabulary as `buildWorkspaceVocabulary` builds it today: the shared
 * names in `terms`, what only Swedish contributes in `svTerms`. origin/main
 * knows no `svTerms` and so reads the shared names only — which is exactly the
 * vocabulary main had before Swedish was activated.
 */
const VOCABULARY = [
  {
    dimension: "accommodation",
    value: "provided_free",
    terms: ["su būstu", "with accommodation", "housing", "mit unterkunft", "huisvesting", "zakwaterowanie"],
    svTerms: ["med boende", "boende", "bostad", "logi"],
    available: true,
  },
  {
    dimension: "opportunityType",
    value: "internship",
    terms: ["praktika", "internship", "стажировка", "stage", "praktikum"],
    svTerms: ["praktik", "praktikplats"],
    available: true,
  },
  {
    dimension: "country",
    value: "SE",
    terms: ["Švedija", "Sweden", "Швеция", "Zweden", "Schweden", "Szwecja"],
    svTerms: ["Sverige"],
    available: true,
  },
];

/* ── origin/main's inline chat logic, for the three readers extracted since ── */
export const MAIN_INLINE = {
  taskStatus(sentence: string): string {
    const lower = sentence.toLowerCase();
    return /u[zž]strig|blokuot|sustoj|blocked|stuck|blockiert|geblokkeerd|vastgelopen|заблок|застрял|zablok/.test(lower)
      ? "blocked"
      : /prad[eė]|prasid[eė]|start|begonnen|angefangen|начал|rozpocz/.test(lower)
        ? "in_progress"
        : "done";
  },
  stageStatus(sentence: string): string {
    const lower = sentence.toLowerCase();
    return /u[zž]strig|blokuot|sustoj|blocked|stuck|blockiert|geblokkeerd|vastgelopen|заблок|застрял/.test(lower)
      ? "blocked"
      : /prad[eė]|prasid[eė]|start|begonnen|angefangen|начал/.test(lower)
        ? "in_progress"
        : "done";
  },
  educationMode(text: string, educationQuestionKind: (q: string) => string | null): string {
    const q = (text ?? "").toLowerCase();
    const question = educationQuestionKind(q);
    if (question) return question;
    if (/priskir|assign|zuweis|toewijz|назнач|zapisz/.test(q)) return "assign";
    const creates = /sukur|kurti|prid[eė]|nauj|create|new|add|erstell|anleg|maak|nieuw|создать|создай|нов/.test(q);
    if (creates && /grup|kohort|cohort|groep|gruppe|групп|поток|когорт/.test(q)) return "cohort";
    if (creates) return "create";
    return "list";
  },
  wantsPersonal(text: string, fold: (s: string) => string): boolean {
    const folded = fold(text);
    return ["asmenin", "personal", "личн", "persoonlijk", "personlich"].some((hint) => folded.includes(hint));
  },
};

export type Reader = (sentence: string) => unknown;

/** Every pinned question, by name. The names are the fixture's keys. */
export function makeReaders(m: ReaderModules): Record<string, Reader> {
  const fold = m.intentRouter.fold as (s: string) => string;
  return {
    // ── the router ────────────────────────────────────────────────────────
    route: (t) => {
      const r = m.intentRouter.classifyIntent(t);
      return [r.intent, r.score];
    },
    availabilityChange: (t) => m.intentRouter.isAvailabilityChangeRequest(t),
    journalRequest: (t) => m.intentRouter.isExplicitJournalRequest(t),
    helpTopic: (t) => m.productHelp.readHelpTopic(t)?.id ?? null,
    reference: (t) => m.utterance.looksLikeReference(t),
    turn: (t) =>
      m.conversationGoal.classifyTurn({
        text: t,
        goal: { ...m.conversationGoal.emptyGoal("log-work"), said: ["Vakar dirbau 8 val."] },
        routedIntent: m.intentRouter.classifyIntent(t).intent,
      }),
    affirmation: (t) => m.conversationGoal.isPlainAffirmation(t),
    // ── the readers behind the intents ────────────────────────────────────
    pay: (t) => m.payStatement.readPayStatement(t),
    payPrefill: (t) => m.payStatement.payPrefill(m.payStatement.readPayStatement(t)),
    file: (t) => m.fileSubject.readFileIntent(t),
    document: (t) => m.documentType.guessDocumentType(t),
    worklog: (t) => {
      const w = m.worklog.extractWorkLog(t, PIN_TODAY);
      return [w.date, w.start, w.end, w.breakMinutes, w.workedMinutes, w.site];
    },
    journalTime: (t) => m.journalSuggestions.extractJournalSuggestions(t).time ?? null,
    headcount: (t) => m.needHeadcount.readNeedHeadcount(t),
    teams: (t) => m.structureNeed.readTeamComposition(t),
    need: (t) => {
      const n = m.structureNeed.structureNeed({ description: t });
      return [n.workType, n.country, n.teamSize, n.startPeriod ?? null, n.accommodation ?? null];
    },
    value: (t) => {
      const v = m.valueStatement.structureValueStatement(t, PIN_TODAY);
      return [v.axis, v.subject, v.headcount, v.workType, v.professionSlug, v.roleLabel, v.offerMode, v.quantity?.raw ?? null];
    },
    roleLabel: (t) => m.roleLabel.readRoleLabel(t)?.label ?? null,
    profession: (t) => {
      const p = m.roleLabel.readProfessionStatement(t);
      return p ? [p.label, p.years, p.tense] : null;
    },
    professions: (t) =>
      (m.statedProfessions.readStatedProfessions(t) as Array<{ label: string }>).map((p) => p.label),
    languages: (t) => m.languageStatement.readStatedLanguages(t),
    period: (t) => m.journalPeriod.parseJournalPeriodPhrase(t),
    week: (t) => m.weekQuestion.asksAboutAWeek(t),
    window: (t) => m.timeWindow.parseTimeWindow(t, PIN_TODAY),
    availabilityDay: (t) => m.availabilityDay.readAvailabilityDay(t, PIN_TODAY),
    rename: (t) => m.renamePhrase.readRenameTarget(t),
    pastWork: (t) => m.pastWork.readPastWorkPeriod(t, 2026),
    // What the reader took OUT of the sentence; `null` when it left it whole
    // (most sentences) so the fixture does not carry every sentence twice.
    pastWorkWords: (t) => {
      const words = m.pastWork.pastWorkOwnWords(t) as string;
      return words === t.trim() ? null : words;
    },
    correction: (t) => m.correctWork.readCorrectionAsk(t),
    evidenceRole: (t) => m.evidenceGoal.readRole(t),
    skill: (t) => m.skillStatement.readSkillStatement(t)?.phrase ?? null,
    projectTitle: (t) => m.projectTitle.projectTitleFromSentence(t),
    cardMode: (t) => m.cardMode.cardModeFromText(t),
    people: (t) => m.personName.matchPeopleByName(t, PEOPLE),
    worldState: (t) =>
      (m.worldState.readWorldState(t, VOCABULARY).matches as Array<{ dimension: string; value: string }>).map(
        (x) => `${x.dimension}=${x.value}`,
      ),
    // ── extracted from the chat component since main ──────────────────────
    personalSpace: (t) =>
      m.workspaceReference.asksForPersonalWorkspace
        ? m.workspaceReference.asksForPersonalWorkspace(t, fold, ORGANIZATION_NAMES)
        : MAIN_INLINE.wantsPersonal(t, fold),
    educationMode: (t) =>
      m.educationQuestion.educationModeFromText
        ? m.educationQuestion.educationModeFromText(t)
        : MAIN_INLINE.educationMode(t, m.educationQuestion.educationQuestionKind),
    taskProgress: (t) =>
      m.progressStatus.readStatedProgress ? m.progressStatus.readStatedProgress(t, "task") : MAIN_INLINE.taskStatus(t),
    stageProgress: (t) =>
      m.progressStatus.readStatedProgress ? m.progressStatus.readStatedProgress(t, "stage") : MAIN_INLINE.stageStatus(t),
  };
}
