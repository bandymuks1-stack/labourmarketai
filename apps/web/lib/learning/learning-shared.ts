/**
 * W6 — Human-in-loop learning model (Phase 1) — shared constants and types.
 *
 * These live OUTSIDE the `"use server"` action module because a server-action
 * file may only export async functions. Runtime values (status lists) and the
 * row/result types belong here so both the server actions and the client UI can
 * import them.
 *
 * Honesty note: these are plain shape definitions. A learning SIGNAL and a
 * review-queue SUGGESTION are never a confirmation — the only confirmation path
 * is the existing spine, reused by the one server-side RPC.
 */

export const REVIEW_STATUSES = [
  "pending",
  "approved",
  "rejected",
  "superseded",
  "auto_actioned",
] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

/** Statuses a manager may set directly from the UI (NOT auto_actioned, which is
 *  only produced by the audited RPC, and NOT superseded, which is systemic). */
export const MANAGER_SETTABLE_STATUSES = ["approved", "rejected"] as const;
export type ManagerSettableStatus = (typeof MANAGER_SETTABLE_STATUSES)[number];

export const SUGGESTION_KINDS = ["confirm_skill", "review_skill", "dismiss"] as const;
export type SuggestionKind = (typeof SUGGESTION_KINDS)[number];

export const CONFIDENCE_BINS = ["red", "yellow", "green"] as const;
export type ConfidenceBin = (typeof CONFIDENCE_BINS)[number];

export const POLICY_KINDS = ["auto_confirm_journal_skill"] as const;
export type PolicyKind = (typeof POLICY_KINDS)[number];

export interface ReviewItemRow {
  readonly id: string;
  readonly subjectWorkerId: string;
  /** Display name of the subject worker (joined via RLS; null when not readable). */
  readonly subjectWorkerName: string | null;
  readonly subjectSkillId: string | null;
  /** Canonical skill slug (joined from skills.slug) — rendered via the skillNames catalogue. */
  readonly subjectSkillSlug: string | null;
  readonly organizationId: string;
  readonly journalEntryId: string | null;
  readonly suggestionKind: SuggestionKind;
  readonly status: ReviewStatus;
  readonly reviewedBy: string | null;
  readonly reviewedAt: string | null;
  readonly reviewNote: string | null;
  readonly producedConfirmationId: string | null;
  readonly policyId: string | null;
  readonly createdAt: string;
}

export interface LearningPolicyRow {
  readonly id: string;
  readonly organizationId: string;
  readonly policyKind: PolicyKind;
  /** DEFAULT OFF — a policy is inert unless a manager explicitly enables it. */
  readonly enabled: boolean;
  readonly scope: Record<string, unknown>;
  readonly rule: Record<string, unknown>;
  readonly enabledBy: string | null;
  readonly enabledAt: string | null;
  readonly disabledBy: string | null;
  readonly disabledAt: string | null;
}

export type ReviewQueueListResult =
  | { kind: "ok"; rows: ReviewItemRow[] }
  | { kind: "needs-migration" }
  | { kind: "not-authed" };

export type LearningPolicyListResult =
  | { kind: "ok"; rows: LearningPolicyRow[] }
  | { kind: "needs-migration" }
  | { kind: "not-authed" };

export type LearningMutateResult =
  | { kind: "ok"; id?: string; detail?: string }
  | { kind: "needs-migration" }
  | { kind: "not-authed" }
  | { kind: "invalid"; field: string }
  | { kind: "error"; message: string };
