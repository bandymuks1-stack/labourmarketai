/**
 * Internal AI Process Brain v0 — deterministic, read-only process assistant.
 *
 * Stage 0 of the internal "process brain" (see
 * docs/agent-skills/internal-ai-process-brain-v0.md). This is NOT AI, NOT a
 * network call, NOT verification. It is a PURE function over signals the
 * profile page already fetched: given what the system can see about a worker's
 * profile (CV/about, self-declared skills, work-journal evidence), it returns a
 * STRUCTURED, explained set of next-step SUGGESTIONS.
 *
 * Hard contract (mirrors the Agent OS read-only operator model,
 * docs/agent-os/labourmarket-agent-os-v1.md):
 *   - suggestion-only, never an action;
 *   - mutates nothing, verifies nothing, confirms nothing;
 *   - no external AI / API / network — pure data → data;
 *   - every suggestion carries a `reasonKey` ("why this is suggested");
 *   - returns i18n KEYS (+ numeric params), never localized strings, so it
 *     stays pure and the UI owns all copy + LT/EN parity.
 *
 * Future stages (deferred — see the skill pack): Stage 1 journal→skill evidence
 * linkage, Stage 2 reviewed AI suggestions / CV extraction, Stage 3 role-aware
 * automation with human approvals.
 */

/** Signals the brain reads — all already available on the profile page. */
export type ProfileProcessSignals = {
  /** A saved profile description / CV text exists. */
  hasCv: boolean;
  /** Count of self-declared skills (catalogued + free-label claims). */
  selfDeclaredSkillCount: number;
  /** Skills already backed by work-journal evidence (provenance-derived). */
  supportedSkillCount: number;
  /** Count of the worker's own work-journal entries. */
  journalEntryCount: number;
  /** Whether this profile has a worker row (work journal is reachable). */
  hasWorker: boolean;
};

export type ProcessSignal = {
  /** Stable signal id. */
  key: "cv" | "skills" | "journal";
  /** i18n key (under `processAssistant`) for the signal's label. */
  labelKey: string;
  /** Optional numeric params for the label (e.g. counts). */
  params?: Record<string, number>;
};

export type ProcessSuggestion = {
  /** Stable suggestion id. */
  id: "add-cv" | "add-skills" | "add-journal";
  /** i18n key for the action label. */
  labelKey: string;
  /** i18n key explaining WHY this is suggested (mandatory). */
  reasonKey: string;
  /** Where the user goes to act — an existing canonical destination only. */
  href: string;
};

export type ProcessEvidenceLink = {
  /** i18n key for the link label. */
  labelKey: string;
  /** Existing canonical destination (in-page anchor or dashboard route). */
  href: string;
};

export type ProfileProcessBrainOutput = {
  knownSignals: ProcessSignal[];
  missingSignals: ProcessSignal[];
  suggestedNextActions: ProcessSuggestion[];
  evidenceLinks: ProcessEvidenceLink[];
  /** i18n keys for the safety disclaimers the UI must always render. */
  safetyDisclaimers: string[];
};

const PROFILE_EDIT_ANCHOR = "#profile-edit";
const JOURNAL_ROUTE = "/dashboard/journal";

/**
 * Derive the deterministic process-brain output from profile signals.
 * Pure: same input → same output. No I/O, no Date/random, no mutation.
 */
export function deriveProfileProcessBrain(
  s: ProfileProcessSignals,
): ProfileProcessBrainOutput {
  const knownSignals: ProcessSignal[] = [];
  const missingSignals: ProcessSignal[] = [];
  const suggestedNextActions: ProcessSuggestion[] = [];

  // CV / about
  if (s.hasCv) {
    knownSignals.push({ key: "cv", labelKey: "signals.cv.known" });
  } else {
    missingSignals.push({ key: "cv", labelKey: "signals.cv.missing" });
    suggestedNextActions.push({
      id: "add-cv",
      labelKey: "actions.addCv.label",
      reasonKey: "actions.addCv.reason",
      href: PROFILE_EDIT_ANCHOR,
    });
  }

  // Self-declared skills
  if (s.selfDeclaredSkillCount > 0) {
    knownSignals.push({
      key: "skills",
      labelKey: "signals.skills.known",
      params: { n: s.selfDeclaredSkillCount },
    });
  } else {
    missingSignals.push({ key: "skills", labelKey: "signals.skills.missing" });
    suggestedNextActions.push({
      id: "add-skills",
      labelKey: "actions.addSkills.label",
      reasonKey: "actions.addSkills.reason",
      href: PROFILE_EDIT_ANCHOR,
    });
  }

  // Work-journal evidence (only meaningful when the journal is reachable)
  if (s.journalEntryCount > 0) {
    knownSignals.push({
      key: "journal",
      labelKey: "signals.journal.known",
      params: { n: s.journalEntryCount },
    });
  } else if (s.hasWorker) {
    missingSignals.push({ key: "journal", labelKey: "signals.journal.missing" });
    suggestedNextActions.push({
      id: "add-journal",
      labelKey: "actions.addJournal.label",
      reasonKey: "actions.addJournal.reason",
      href: JOURNAL_ROUTE,
    });
  }

  // Evidence source link — the work journal is where real operational evidence
  // is created. Surface it whenever the journal is reachable.
  const evidenceLinks: ProcessEvidenceLink[] = s.hasWorker
    ? [{ labelKey: "evidence.journalLabel", href: JOURNAL_ROUTE }]
    : [];

  // Always-on safety disclaimers — this layer suggests, never verifies.
  const safetyDisclaimers = [
    "safety.notAutomaticVerification",
    "safety.suggestionOnly",
  ];

  return {
    knownSignals,
    missingSignals,
    suggestedNextActions,
    evidenceLinks,
    safetyDisclaimers,
  };
}
