/**
 * Pure Development & Performance Reviews model (v1) — shared by the server
 * read service, the server actions, the guard test and the UI section. No
 * server-only imports, no IO.
 *
 * Codes against the contract the SEPARATE, human-gated migration
 * 20260817231000_performance_reviews_v1 proposes. Until the lead applies it
 * the read/action layers degrade honestly — nothing here fakes a review.
 *
 * BINDING DOCTRINE, pinned by lib/guards/development-reviews.test.ts:
 *   * NO star rating, NO 1-5 scale, NO universal worker score, NO AI
 *     ranking, NO competence score. This file exports no rating vocabulary
 *     of any kind, and the guard parses the SQL to prove the schema has no
 *     rating/score/grade/rank column either.
 *   * The three classes stay apart:
 *       FACT       — recorded events (who, what, when);
 *       EVIDENCE   — links to REAL rows elsewhere (four closed kinds);
 *       SUBJECTIVE OBSERVATION — free text by ONE named person, always
 *                    rendered under an explicit author label.
 * No AI anywhere.
 */

export const REVIEW_CYCLE_STATUSES = ["draft", "open", "closed"] as const;
export type ReviewCycleStatus = (typeof REVIEW_CYCLE_STATUSES)[number];

export const REVIEW_STATUSES = ["draft", "open", "closed"] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

/** The four kinds of evidence a review may point at. Each one is a pointer
 *  to a row that already exists elsewhere; the RPC re-checks that it exists
 *  AND belongs to this review's subject / organization. */
export const REVIEW_EVIDENCE_KINDS = [
  "journal_entry",
  "skill",
  "project",
  "training_assignment",
] as const;
export type ReviewEvidenceKind = (typeof REVIEW_EVIDENCE_KINDS)[number];

export const REVIEW_EVENT_TYPES = [
  "created",
  "opened",
  "worker_input_saved",
  "manager_input_saved",
  "evidence_linked",
  "closed",
] as const;
export type ReviewEventType = (typeof REVIEW_EVENT_TYPES)[number];

/** Bounded lengths — mirrored by the gated RPC validation (one contract). */
export const REVIEW_CYCLE_NAME_MIN = 3;
export const REVIEW_CYCLE_NAME_MAX = 120;
export const REVIEW_INPUT_MAX = 4000;
export const REVIEW_EVIDENCE_NOTE_MAX = 500;
export const REVIEW_READ_LIMIT = 100;

export const REVIEW_MIGRATION_MISSING_ERROR_CODES = [
  "42P01",
  "42703",
  "42883",
  "PGRST202",
] as const;

export function isReviewMigrationMissingCode(code: string | undefined): boolean {
  return (REVIEW_MIGRATION_MISSING_ERROR_CODES as readonly string[]).includes(
    code ?? "",
  );
}

export function isValidReviewStatus(v: string): v is ReviewStatus {
  return (REVIEW_STATUSES as readonly string[]).includes(v);
}

export function isValidReviewCycleStatus(v: string): v is ReviewCycleStatus {
  return (REVIEW_CYCLE_STATUSES as readonly string[]).includes(v);
}

export function isValidReviewEvidenceKind(v: string): v is ReviewEvidenceKind {
  return (REVIEW_EVIDENCE_KINDS as readonly string[]).includes(v);
}

export type ReviewCycleRow = {
  readonly id: string;
  readonly organizationId: string;
  readonly name: string;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly status: ReviewCycleStatus;
};

export type PerformanceReviewRow = {
  readonly id: string;
  readonly cycleId: string;
  readonly cycleName: string;
  readonly organizationId: string;
  readonly subjectProfileId: string;
  readonly reviewerProfileId: string;
  readonly status: ReviewStatus;
  /** SUBJECTIVE OBSERVATION by the subject. Always rendered under an
   *  explicit author label — never presented as a fact or a measure. */
  readonly workerInput: string | null;
  readonly workerInputAt: string | null;
  /** SUBJECTIVE OBSERVATION by the reviewer, with the author id the server
   *  stamped so the UI can always name who wrote it. */
  readonly managerInput: string | null;
  readonly managerInputAt: string | null;
  readonly managerInputBy: string | null;
  readonly developmentPlan: string | null;
  readonly followUpDate: string | null;
  readonly closedAt: string | null;
  readonly createdAt: string;
};

export type ReviewEvidenceLinkRow = {
  readonly id: string;
  readonly reviewId: string;
  readonly kind: ReviewEvidenceKind;
  readonly refId: string;
  readonly note: string | null;
  readonly createdAt: string;
};

/** The honest `?rev=` outcomes the actions can navigate back with. */
export const REVIEW_NOTICES = [
  "created",
  "updated",
  "unchanged",
  "saved",
  "linked",
  "already_linked",
  "closed",
  "already_closed",
  "already_exists",
  "inputs_missing",
  "invalid",
  "invalid_state",
  "invalid_subject",
  "invalid_reviewer",
  "invalid_reference",
  "needs_migration",
  "not_authorized",
  "not_found",
  "limit_reached",
  "error",
] as const;
export type ReviewNotice = (typeof REVIEW_NOTICES)[number];

export const REVIEW_SUCCESS_NOTICES: readonly ReviewNotice[] = [
  "created",
  "updated",
  "saved",
  "linked",
  "closed",
];

export function isReviewNotice(v: string): v is ReviewNotice {
  return (REVIEW_NOTICES as readonly string[]).includes(v);
}

export function noticeForReviewOutcome(outcome: string): ReviewNotice {
  return isReviewNotice(outcome) ? outcome : "error";
}

/**
 * Pure progress derivation for the UI: a recorded conversation is complete
 * when BOTH named people have written their own observation. It returns
 * counts and booleans only — deliberately never a percentage, a grade or a
 * quality judgement of any kind.
 */
export function deriveReviewCompleteness(review: {
  readonly workerInput: string | null;
  readonly managerInput: string | null;
  readonly developmentPlan: string | null;
}): {
  readonly hasWorkerVoice: boolean;
  readonly hasManagerVoice: boolean;
  readonly hasPlan: boolean;
  readonly readyToClose: boolean;
} {
  const hasWorkerVoice = (review.workerInput ?? "").trim().length > 0;
  const hasManagerVoice = (review.managerInput ?? "").trim().length > 0;
  return {
    hasWorkerVoice,
    hasManagerVoice,
    hasPlan: (review.developmentPlan ?? "").trim().length > 0,
    readyToClose: hasWorkerVoice && hasManagerVoice,
  };
}
