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
  /** True when the source journal entry is superseded or deleted — the item
   *  is no longer actionable (owner-hold v5 P2-1). */
  readonly entryStale: boolean;
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

/** Terminal stale outcomes shared by the journal review surfaces and the
 *  learning queue: the source entry was edited (superseded) or removed after
 *  the surface rendered. Both are TERMINAL — never a retryable error. */
export const TERMINAL_STALE_OUTCOMES = ["entry_superseded", "entry_deleted"] as const;
export type TerminalStaleOutcome = (typeof TERMINAL_STALE_OUTCOMES)[number];

export function isTerminalStaleOutcome(code: unknown): code is TerminalStaleOutcome {
  return (
    typeof code === "string" &&
    (TERMINAL_STALE_OUTCOMES as readonly string[]).includes(code)
  );
}

/**
 * Recover a terminal stale outcome from a DATABASE ERROR message.
 *
 * The confirmation guard trigger (20260720150000) and the learning queue guard
 * trigger (20260720170000) RAISE when an entry goes stale between an RPC's own
 * pre-check and its write. That surfaces as an error rather than a tagged
 * return value, and mapping it to a generic `error` code leaves the card
 * actionable and invites retries of an impossible action. Every wrapper around
 * a guarded RPC routes its error through here first.
 *
 * Order matters: 'entry_deleted' is checked first because a deleted entry is
 * the stronger statement when both markers somehow appear.
 */
export function terminalStaleFromError(
  message: string | null | undefined,
): TerminalStaleOutcome | null {
  if (!message) return null;
  if (message.includes("entry_deleted")) return "entry_deleted";
  if (message.includes("entry_superseded")) return "entry_superseded";
  return null;
}

export type LearningMutateResult =
  | { kind: "ok"; id?: string; detail?: string }
  /** The mutation refused a decision because the source entry went stale
   *  between render and click; the queue item was closed instead (P2-2). */
  | { kind: "stale"; outcome: TerminalStaleOutcome }
  | { kind: "needs-migration" }
  | { kind: "not-authed" }
  | { kind: "invalid"; field: string }
  | { kind: "error"; message: string };
