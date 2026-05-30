/**
 * Manager review → evidence result — pure derivation (slice
 * manager-review-evidence-result-v1). Turns the append-only
 * journal_entry_confirmations rows into one honest, latest-wins review result.
 * No DB, no IO, no fake approvals.
 *
 * The evidence rows carry `confirmation_scope.decision` (migration 0034:
 * 'approved' | 'rejected' | 'changes_requested') and, for backward
 * compatibility, `confirmation_scope.action` (migration 0013:
 * 'confirm' | 'reject' | 'request_changes'). Decision wins when present; the
 * legacy action is mapped otherwise.
 */

export const REVIEW_DECISIONS = [
  "approved",
  "rejected",
  "changes_requested",
] as const;

export type ReviewDecision = (typeof REVIEW_DECISIONS)[number];

/** A worker entry's review result. `submitted` = no evidence row yet. */
export type ReviewResult = "submitted" | ReviewDecision;

export interface ConfirmationRow {
  /** The jsonb confirmation_scope; shape `{ action?, decision?, note? }`. */
  readonly confirmation_scope: unknown;
  /** ISO timestamp; used for latest-wins ordering when present. */
  readonly created_at?: string | null;
}

export function isReviewDecision(value: unknown): value is ReviewDecision {
  return (
    typeof value === "string" &&
    (REVIEW_DECISIONS as readonly string[]).includes(value)
  );
}

/** Map the legacy confirmation_scope.action to a decision. */
export function actionToDecision(action: unknown): ReviewDecision | null {
  switch (action) {
    case "confirm":
      return "approved";
    case "reject":
      return "rejected";
    case "request_changes":
      return "changes_requested";
    default:
      return null;
  }
}

function rowDecision(row: ConfirmationRow): ReviewDecision | null {
  const scope = row.confirmation_scope as
    | { action?: unknown; decision?: unknown }
    | null;
  if (!scope) return null;
  if (isReviewDecision(scope.decision)) return scope.decision;
  return actionToDecision(scope.action);
}

/**
 * Derive the current review result from an entry's evidence rows. Latest-wins
 * (a manager may approve after requesting changes); `submitted` when there is
 * no evidence yet. Rows with an unrecognised scope are ignored.
 */
export function deriveReviewResult(
  confirmations: readonly ConfirmationRow[] | null | undefined,
): ReviewResult {
  if (!confirmations || confirmations.length === 0) return "submitted";
  const ordered = [...confirmations].sort((a, b) => {
    const ta = a.created_at ? Date.parse(a.created_at) : 0;
    const tb = b.created_at ? Date.parse(b.created_at) : 0;
    return ta - tb;
  });
  for (let i = ordered.length - 1; i >= 0; i--) {
    const decision = rowDecision(ordered[i]);
    if (decision) return decision;
  }
  return "submitted";
}
