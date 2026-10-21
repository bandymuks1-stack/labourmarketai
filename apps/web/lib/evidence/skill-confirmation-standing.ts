/**
 * A SKILL CONFIRMATION STANDS ONLY WHILE THE WORK IT CONFIRMED STANDS.
 *
 * ── THE DEFECT ────────────────────────────────────────────────────────────
 * `worker_skills.verified` is flipped to true by the employer-only SECURITY
 * DEFINER paths `confirm_entry_and_verify_skills` and
 * `apply_learning_auto_confirmation` (latest bodies:
 * 20260720150000_journal_photo_continuity_v1.sql), and NOTHING ever sets it
 * back. So a skill read as "confirmed" on the Living CV, the EU CV, the
 * profile trust block, the player card and MCP `cv.verified.get` after:
 *   * a LATER rejection / changes-request of the entry that confirmed it
 *     (latest decision wins — lib/journal/review-status.ts);
 *   * a CORRECTION of that entry (counted once — the corrected original is
 *     replaced by its live correction, which carries no approval of its own);
 *   * a DELETION of that entry.
 * And the 2 historical self-verified rows (verified_by = the subject, noted in
 * 20261003150500 as "classified at read time") were never classified: no
 * reader selected verified_by, so they read as manager-confirmed.
 *
 * ── THE RULE (read time; nothing is written, nothing is deleted) ──────────
 * A skill reads as CONFIRMED only when ALL hold:
 *   1. the confirmation act happened: `verified === true` (the flag is the
 *      historical record of the act and stays in the row untouched, with
 *      verified_by / verified_at — history kept);
 *   2. it is backed by someone other than the subject: an own flag
 *      (`verified_by` = the subject) stands only through rule 3, i.e. once
 *      an independent approval later backs the skill;
 *   3. it still STANDS: at least one LIVE, counted-once entry whose latest
 *      INDEPENDENT employer-basis decision is `approved`
 *      (`confirmedEntriesOf` — the ONE definition of a confirmed entry) either
 *        a. is linked to the skill (`journal_entry_skills`), or
 *        b. carries an approving, independent, employer-basis decision that
 *           NAMED the skill (`confirmation_scope.skills_confirmed`).
 *      (b) keeps an explicit per-skill confirmation of an entry that had no
 *      link; (a) keeps the skill standing when a LATER entry showing it is
 *      approved — the quick-confirm tap no longer re-names an already-flagged
 *      skill (quick-confirm-model.ts), so (b) alone would withdraw it wrongly.
 *
 * Nothing here creates a confirmation: rule 1 is necessary, so an approval of
 * work never certifies a skill that no reviewer ever confirmed (approval ≠
 * skill certification — evidence-tier.ts, confirmed-work-read.ts). A client /
 * counterparty acceptance never counts (decision 0018). AI output is not an
 * input at all.
 *
 * Evidence states stay apart (decision 0023): a withdrawn confirmation is NOT
 * re-labelled as some other proof — the row simply stops reading as
 * confirmed, and falls to what its OTHER evidence still supports (a live
 * journal link → "evidence"; nothing → "declared"). Its recorded source
 * `manager_confirmed` is not evidence of anything once the confirmation is
 * withdrawn, so it is not allowed to lift the row either.
 *
 * Pure + deterministic: no IO. The DB feeding is
 * `skill-confirmation-standing-read.ts`.
 */

import {
  actionToDecision,
  confirmedEntriesOf,
  isCounterpartyScopeRow,
  isReviewDecision,
  isSelfConfirmation,
  type ConfirmableEntryRow,
  type ConfirmationRow,
} from "@/lib/journal/review-status";

/** A LIVE journal entry with its decisions and the skills it is linked to. */
export interface StandingEntryRow extends ConfirmableEntryRow {
  readonly journal_entry_skills?: readonly { readonly skill_id: string | null }[] | null;
}

/** What a skill's recorded confirmation is worth NOW. */
export type SkillConfirmationState =
  /** never confirmed (verified !== true) */
  | "none"
  /** confirmed by someone else, and the confirmed work still stands */
  | "standing"
  /** confirmed once, but the work behind it was rejected, corrected or deleted */
  | "withdrawn"
  /** the "confirmation" was the subject's own act (verified_by = subject) */
  | "self_confirmed"
  /** the journal behind it could not be read — never assumed to stand */
  | "unknown";

/** Only `standing` reads as confirmed. */
export function confirmationStands(state: SkillConfirmationState): boolean {
  return state === "standing";
}

function rowIsApproval(row: ConfirmationRow): boolean {
  const scope = row.confirmation_scope as { action?: unknown; decision?: unknown } | null;
  if (!scope) return false;
  if (isReviewDecision(scope.decision)) return scope.decision === "approved";
  return actionToDecision(scope.action) === "approved";
}

function namedSkillIds(row: ConfirmationRow): string[] {
  const scope = row.confirmation_scope as { skills_confirmed?: unknown } | null;
  if (!scope || !Array.isArray(scope.skills_confirmed)) return [];
  return scope.skills_confirmed.filter(
    (v): v is string => typeof v === "string" && v.length > 0,
  );
}

/**
 * The skill ids whose confirmation STANDS (rule 3 above), from the subject's
 * LIVE entries. `liveRows` must already exclude deleted / superseded rows;
 * pass the ids of originals that live corrections replace when `liveRows`
 * holds only decided entries (an inner join cannot see a fresh correction).
 *
 * `subjectProfileId === undefined` means the subject could not be read, so
 * independence is unanswerable → `null` (UNKNOWN), never a set that silently
 * counts the subject's own approvals. `null` (a worker row with no profile)
 * keeps the canonical meaning of review-status.ts: nobody is the subject.
 */
export function standingConfirmedSkillIds(
  liveRows: readonly StandingEntryRow[],
  subjectProfileId: string | null | undefined,
  correctedOriginalIds?: ReadonlySet<string>,
): ReadonlySet<string> | null {
  if (subjectProfileId === undefined) return null;
  const out = new Set<string>();
  for (const entry of confirmedEntriesOf(liveRows, subjectProfileId, correctedOriginalIds)) {
    for (const link of entry.journal_entry_skills ?? []) {
      if (link.skill_id) out.add(link.skill_id);
    }
    for (const row of entry.journal_entry_confirmations ?? []) {
      if (isCounterpartyScopeRow(row)) continue;
      if (isSelfConfirmation(row, subjectProfileId)) continue;
      if (!rowIsApproval(row)) continue;
      for (const id of namedSkillIds(row)) out.add(id);
    }
  }
  return out;
}

/** The fields of a worker_skills row the rule reads. */
export interface FlaggedSkillRow {
  readonly skill_id: string | null;
  readonly verified?: boolean | null;
  readonly verified_by?: string | null;
}

/** The standing read for ONE worker: the standing set + whose skills they are. */
export interface StandingSkillRead {
  readonly ids: ReadonlySet<string>;
  readonly subjectProfileId: string | null;
}

export function skillConfirmationState(
  row: FlaggedSkillRow,
  read: StandingSkillRead | null,
): SkillConfirmationState {
  if (row.verified !== true) return "none";
  if (read === null) return "unknown";
  // The standing set holds ONLY independent approvals (the subject's own are
  // excluded in standingConfirmedSkillIds), so it decides first: a skill the
  // person once flagged themselves STANDS once someone else later confirmed
  // the work behind it. verified_by is written only on the false -> true flip,
  // so it never moves off the subject — it cannot be a permanent veto.
  if (row.skill_id && read.ids.has(row.skill_id)) return "standing";
  if (
    read.subjectProfileId &&
    typeof row.verified_by === "string" &&
    row.verified_by === read.subjectProfileId
  ) {
    return "self_confirmed";
  }
  return "withdrawn";
}

/**
 * The rows as every tier reader must see them: `verified` is true ONLY when
 * the confirmation stands. The stored flag is carried, untouched, as
 * `verifiedRecorded` (history kept — a reader that needs the act itself, e.g.
 * an audit view, reads that and `confirmation`).
 *
 * A row whose confirmation does not stand loses the `manager_confirmed`
 * source too (it would otherwise lift the row to "evidence" on the CV without
 * any evidence standing behind it); a live journal link still does that
 * honestly through `journalSupported`. An UNKNOWN read keeps the source, so
 * the CV under-states the row as "evidence" instead of erasing it.
 */
export function withStandingConfirmation<
  T extends FlaggedSkillRow & { readonly source?: string | null },
>(
  rows: readonly T[],
  read: StandingSkillRead | null,
): (T & {
  verified: boolean;
  verifiedRecorded: boolean;
  confirmation: SkillConfirmationState;
})[] {
  return rows.map((r) => {
    const confirmation = skillConfirmationState(r, read);
    const stands = confirmationStands(confirmation);
    const dropSource =
      !stands &&
      confirmation !== "unknown" &&
      confirmation !== "none" &&
      r.source === "manager_confirmed";
    return {
      ...r,
      ...(dropSource ? { source: null } : {}),
      verified: stands,
      verifiedRecorded: r.verified === true,
      confirmation,
    } as T & {
      verified: boolean;
      verifiedRecorded: boolean;
      confirmation: SkillConfirmationState;
    };
  });
}

/** True when any row carries the stored flag — the standing read is skipped
 *  otherwise (most people have no confirmed skill; no extra round trips). */
export function anyRecordedConfirmation(rows: readonly FlaggedSkillRow[]): boolean {
  return rows.some((r) => r.verified === true);
}
