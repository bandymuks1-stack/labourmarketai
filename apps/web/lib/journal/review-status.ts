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

import { correctedOriginalIds as correctedOriginalIdsOf } from "@/lib/journal/counted-once";

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
  /** The reviewer's engagement role (manager / owner / external_manager). */
  readonly confirmer_role?: string | null;
  /**
   * WHO decided — `journal_entry_confirmations.confirmer_id`.
   *
   * Optional because most readers do not need it and did not select it. A
   * reader that wants to know whether a decision was INDEPENDENT must select
   * it and use `deriveIndependentReviewResult`; absent, this module cannot
   * tell a self-confirmation from a supervisor's and says so by leaving the
   * independence question unanswerable rather than assuming an answer.
   */
  readonly confirmer_id?: string | null;
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

/**
 * IS THIS DECISION THE SUBJECT'S OWN? (owner P0, 2026-09-07.)
 *
 * `review_journal_entry` authorises on `manages_organization` and never checks
 * that the reviewer is not the worker. Measured on production 2026-09-07: of
 * 13 real confirmations, **3 are self-confirmations** — one person, holding an
 * `owner` engagement, approving their own entries on 2026-06-16 and 2026-07-05.
 *
 * That is not necessarily abuse: a sole trader legitimately has nobody above
 * them, and deleting the rows would destroy real evidence. What is wrong is
 * that a self-approved entry currently READS exactly like one a supervisor
 * confirmed, and confirmed work is the platform's trust currency (doctrine §9,
 * ARCHITECTURE I-4: participation ≠ leadership, and here: submitting ≠ being
 * confirmed).
 *
 * So this module answers the two questions separately and never conflates them:
 *
 *   `deriveReviewResult`             what was DECIDED (a self-confirmation is
 *                                    still a real decision — unchanged)
 *   `deriveIndependentReviewResult`  what someone OTHER THAN THE SUBJECT
 *                                    decided (the trust question)
 *
 * Blocking the write is a `SECURITY DEFINER` authorization change and an open
 * product decision (owner-gated). Classifying the read is neither, needs no
 * migration, and destroys nothing.
 */
export function isSelfConfirmation(
  row: ConfirmationRow,
  subjectProfileId: string | null | undefined,
): boolean {
  if (!subjectProfileId) return false;
  return Boolean(row.confirmer_id) && row.confirmer_id === subjectProfileId;
}

/**
 * The review result counting ONLY decisions made by someone other than the
 * subject. Same latest-wins rule, one row set narrower.
 *
 * With no `subjectProfileId`, or on rows that never selected `confirmer_id`,
 * this equals `deriveReviewResult` — a reader that did not ask the question
 * gets the behaviour it had before, never a silently weakened one.
 */
export function deriveIndependentReviewResult(
  confirmations: readonly ConfirmationRow[] | null | undefined,
  subjectProfileId: string | null | undefined,
): ReviewResult {
  if (!confirmations || confirmations.length === 0) return "submitted";
  return deriveReviewResult(
    confirmations.filter((r) => !isSelfConfirmation(r, subjectProfileId)),
  );
}

/** True when the entry reads as approved, but every approving row was written
 *  by the subject themselves — the state that must never render as employer
 *  confirmation. */
export function isSelfConfirmedOnly(
  confirmations: readonly ConfirmationRow[] | null | undefined,
  subjectProfileId: string | null | undefined,
): boolean {
  return (
    deriveReviewResult(confirmations) === "approved" &&
    deriveIndependentReviewResult(confirmations, subjectProfileId) !== "approved"
  );
}

/** The latest review decision's ORIGIN — who (engagement role) + when.
 *  Returns null while the entry is still `submitted` (no decision yet). */
export interface ReviewOrigin {
  readonly result: ReviewDecision;
  readonly role: string | null;
  readonly at: string | null;
}

export function deriveReviewOrigin(
  confirmations: readonly ConfirmationRow[] | null | undefined,
): ReviewOrigin | null {
  if (!confirmations || confirmations.length === 0) return null;
  const ordered = [...confirmations].sort((a, b) => {
    const ta = a.created_at ? Date.parse(a.created_at) : 0;
    const tb = b.created_at ? Date.parse(b.created_at) : 0;
    return ta - tb;
  });
  for (let i = ordered.length - 1; i >= 0; i--) {
    const decision = rowDecision(ordered[i]);
    if (decision)
      return {
        result: decision,
        role: ordered[i].confirmer_role ?? null,
        at: ordered[i].created_at ?? null,
      };
  }
  return null;
}

/** One human decision in an entry's review history (Evidence Decision Timeline
 *  v1). Ordered oldest→newest by the caller. `note` is the manager's REAL
 *  reason text stored in confirmation_scope.note — null when none was given,
 *  never a fabricated default. */
export interface ReviewTimelineEvent {
  readonly result: ReviewDecision;
  readonly role: string | null;
  readonly at: string | null;
  readonly note: string | null;
  /** W6 slice 1: true when the row was written by the policy-gated
   *  auto-confirm RPC (confirmation_scope.action === 'auto_confirm').
   *  Rendered as a small qualifier — an automatic confirmation must never
   *  look identical to a hand confirmation. */
  readonly automatic: boolean;
}

/** True when a confirmation row was produced by the auto-confirm policy RPC.
 *  Never invents: anything but the exact marker reads as manual. */
export function rowIsAutomatic(row: ConfirmationRow): boolean {
  const scope = row.confirmation_scope as { action?: unknown } | null;
  return scope?.action === "auto_confirm";
}

/** Pull the real reason note off a confirmation row, or null. Never invents. */
function rowNote(row: ConfirmationRow): string | null {
  const scope = row.confirmation_scope as { note?: unknown } | null;
  if (!scope || typeof scope.note !== "string") return null;
  const trimmed = scope.note.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Derive the ordered (oldest→newest) list of REAL human decisions on an entry,
 * straight from the append-only evidence rows. Rows without a recognised
 * decision are ignored. Returns [] while the entry is still `submitted` — the
 * UI shows "record created → waiting" from this emptiness, never a fake step.
 */
export function deriveReviewTimeline(
  confirmations: readonly ConfirmationRow[] | null | undefined,
): ReviewTimelineEvent[] {
  if (!confirmations || confirmations.length === 0) return [];
  const ordered = [...confirmations].sort((a, b) => {
    const ta = a.created_at ? Date.parse(a.created_at) : 0;
    const tb = b.created_at ? Date.parse(b.created_at) : 0;
    return ta - tb;
  });
  const events: ReviewTimelineEvent[] = [];
  for (const row of ordered) {
    const decision = rowDecision(row);
    if (!decision) continue;
    events.push({
      result: decision,
      role: row.confirmer_role ?? null,
      at: row.created_at ?? null,
      note: rowNote(row),
      automatic: rowIsAutomatic(row),
    });
  }
  return events;
}

/* ────────────────────────────────────────────────────────────────────────
 * WHAT A USER-VISIBLE "CONFIRMED" NUMBER MEANS — ONE DEFINITION.
 *
 * Before this block four unrelated bases sat behind the word:
 *   · profile trust block / CV "confirmations"  — a ROW count of every
 *     decision, rejected and self-made ones included, not counted-once;
 *   · confirmed-work read (matching, professional history) — independent
 *     approved entries;
 *   · work-intelligence "confirmed hours"        — latest-wins, the subject's
 *     own decision included;
 *   · the window report                          — latest-wins, ditto.
 * The CV printed two of them side by side, and the reports hub showed the row
 * count as "confirmations". The same person read 12 on one page and 4 on the
 * next with no word to say why.
 *
 * THE RULES (every reader routes through the functions below):
 *
 *   CONFIRMED ENTRY   a LIVE entry (not deleted, not superseded), counted once
 *                     per correction chain (`counted-once.ts`), whose latest
 *                     decision is `approved` AND was made by someone other
 *                     than the entry's subject (`deriveIndependentReviewResult`).
 *                     A rejected or changes-requested decision, a decision the
 *                     subject made on their own work, and the approval that
 *                     belonged to a corrected original never count.
 *   CONFIRMATION      the count of APPROVING decisions, one per entry, on the
 *   (independent)     same set — i.e. a confirmation is always a confirmed
 *                     entry, never a row. There is no "row count" figure.
 *
 * What is deliberately NOT mixed in:
 *   · a CLIENT / counterparty acceptance of an entry is a SEPARATE figure
 *     (decision 0018, counterparty-review authority) and is never added to,
 *     or presented as, a confirmed entry;
 *   · `worker_skills.verified` (skill certification) is its own number;
 *   · a *reviewed* entry (any decision) is not a *confirmed* entry.
 *
 * Where two surfaces legitimately differ, the difference is stated in the UI
 * copy (i18n `confirmedMeaning.*`) and not left for a reader to discover.
 * ──────────────────────────────────────────────────────────────────────── */

/** An entry row carrying what the definition needs. */
export interface ConfirmableEntryRow {
  readonly id: string;
  /** The confirmed original this live row corrects (counted-once chain). */
  readonly correction_of?: string | null;
  readonly journal_entry_confirmations?: readonly ConfirmationRow[] | null;
}

/** Is THIS entry's current review result a confirmation (the single test)? */
export function isConfirmedEntry(
  confirmations: readonly ConfirmationRow[] | null | undefined,
  subjectProfileId: string | null | undefined,
): boolean {
  return deriveIndependentReviewResult(confirmations, subjectProfileId) === "approved";
}

/**
 * The CONFIRMED ENTRIES among LIVE rows: counted-once first (a corrected
 * original is replaced by its correction, whose own confirmation is none until
 * a reviewer approves it), then the independent-approved test.
 *
 * `liveRows` must already exclude deleted / superseded rows. When the rows
 * given are only the confirmed ones (an inner join), pass the ids of live
 * corrections via `correctedOriginalIds` so a corrected original is still
 * dropped.
 */
export function confirmedEntriesOf<T extends ConfirmableEntryRow>(
  liveRows: readonly T[],
  subjectProfileId: string | null | undefined,
  correctedOriginalIds?: ReadonlySet<string>,
): T[] {
  const dropped = new Set<string>(correctedOriginalIds ?? []);
  for (const id of correctedOriginalIdsOf(liveRows)) dropped.add(id);
  return liveRows.filter(
    (r) =>
      !dropped.has(r.id) &&
      isConfirmedEntry(r.journal_entry_confirmations, subjectProfileId),
  );
}

/** Number of CONFIRMED ENTRIES — the one figure called "confirmed" / "confirmations". */
export function countConfirmedEntries(
  liveRows: readonly ConfirmableEntryRow[],
  subjectProfileId: string | null | undefined,
  correctedOriginalIds?: ReadonlySet<string>,
): number {
  return confirmedEntriesOf(liveRows, subjectProfileId, correctedOriginalIds).length;
}

