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

import { deriveEvidenceTier, sourceToEvidence, type EvidenceTier } from "@/lib/evidence/evidence-tier";
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
  const approvals = standingConfirmedSkillApprovals(liveRows, subjectProfileId, correctedOriginalIds);
  return approvals === null ? null : new Set(approvals.keys());
}

/** The later of two ISO times ("" = unknown, never later than anything). */
function laterOf(a: string | undefined, b: string): string {
  if (a === undefined) return b;
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  if (Number.isNaN(tb)) return a;
  if (Number.isNaN(ta)) return b;
  return tb > ta ? b : a;
}

/**
 * The same standing set (rule 3) WITH WHEN each skill was last independently
 * approved: skill id -> the latest independent, employer-basis approval
 * backing it. A person's OWN flag stands only through an approval that
 * POSTDATES it (skillConfirmationState) — an older approval of the same work
 * is not someone else confirming what the person asserted afterwards. An
 * approval without a readable time is "" and never postdates anything.
 */
export function standingConfirmedSkillApprovals(
  liveRows: readonly StandingEntryRow[],
  subjectProfileId: string | null | undefined,
  correctedOriginalIds?: ReadonlySet<string>,
): ReadonlyMap<string, string> | null {
  if (subjectProfileId === undefined) return null;
  const out = new Map<string, string>();
  for (const entry of confirmedEntriesOf(liveRows, subjectProfileId, correctedOriginalIds)) {
    let entryApprovedAt = "";
    const named: [string, string][] = [];
    for (const row of entry.journal_entry_confirmations ?? []) {
      if (isCounterpartyScopeRow(row)) continue;
      if (isSelfConfirmation(row, subjectProfileId)) continue;
      if (!rowIsApproval(row)) continue;
      const at = typeof row.created_at === "string" ? row.created_at : "";
      entryApprovedAt = laterOf(entryApprovedAt, at);
      for (const id of namedSkillIds(row)) named.push([id, at]);
    }
    for (const link of entry.journal_entry_skills ?? []) {
      if (link.skill_id) out.set(link.skill_id, laterOf(out.get(link.skill_id), entryApprovedAt));
    }
    for (const [id, at] of named) out.set(id, laterOf(out.get(id), at));
  }
  return out;
}

/** The fields of a worker_skills row the rule reads. */
export interface FlaggedSkillRow {
  readonly skill_id: string | null;
  readonly verified?: boolean | null;
  readonly verified_by?: string | null;
  /** When the flag was set — only read to date a person's OWN flag. */
  readonly verified_at?: string | null;
}

/** The standing read for ONE worker: the standing set + whose skills they are. */
export interface StandingSkillRead {
  readonly ids: ReadonlySet<string>;
  readonly subjectProfileId: string | null;
  /** skill id -> latest independent approval time (standingConfirmedSkillApprovals).
   *  Absent: no own flag can stand (nothing proves an approval came after it). */
  readonly approvedAt?: ReadonlyMap<string, string>;
}

export function skillConfirmationState(
  row: FlaggedSkillRow,
  read: StandingSkillRead | null,
): SkillConfirmationState {
  if (row.verified !== true) return "none";
  if (read === null) return "unknown";
  const backed = Boolean(row.skill_id && read.ids.has(row.skill_id));
  const ownFlag = Boolean(
    read.subjectProfileId &&
      typeof row.verified_by === "string" &&
      row.verified_by === read.subjectProfileId,
  );
  if (!ownFlag) return backed ? "standing" : "withdrawn";
  // The person's OWN flag. verified_by is written only on the false -> true
  // flip, so it never moves off the person — it must not be a permanent veto.
  // It stands only when an independent approval backing the skill POSTDATES
  // the flag: an older approval of the same work is not someone else
  // confirming what the person asserted afterwards. Any unknown time keeps
  // it self_confirmed (under-claiming is the safe direction).
  const approvedAt = row.skill_id ? read.approvedAt?.get(row.skill_id) : undefined;
  const flaggedAt = typeof row.verified_at === "string" ? Date.parse(row.verified_at) : Number.NaN;
  const approved = approvedAt ? Date.parse(approvedAt) : Number.NaN;
  if (backed && !Number.isNaN(flaggedAt) && !Number.isNaN(approved) && approved > flaggedAt) {
    return "standing";
  }
  return "self_confirmed";
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

// ── CROSS-PARTY READERS (phase B) ──────────────────────────────────────────
//
// A viewer who is NOT the subject — an employer that finds a person through
// the discoverability consent, a manager's team view, an agency, matching,
// the admin workbench — reads `worker_skills` through `can_view_worker` but
// NOT that person's journal, so `readStandingConfirmedSkillIds` would hand
// them an empty standing set. They ask the DB door
// `worker_skill_confirmations_standing_v1` (migration 20261021090000), which
// applies THIS rule server side and answers one state per recorded
// confirmation (`readCrossPartyStandingStates`). Until the owner approves and
// applies that migration the door is absent, and a cross-party reader keeps
// TODAY's reading — the stored flag — so nothing regresses in between.

/** What the door answers for one recorded confirmation. */
export type DoorConfirmationState = "standing" | "withdrawn" | "self_confirmed";

export function isDoorConfirmationState(v: unknown): v is DoorConfirmationState {
  return v === "standing" || v === "withdrawn" || v === "self_confirmed";
}

/** The door is not installed (migration not applied): keep the stored flag. */
export const STANDING_DOOR_NOT_INSTALLED = "door_not_installed" as const;

/**
 * One cross-party read: workerId -> skillId -> state; the door is not
 * installed; or `null` = UNKNOWN (the door answered with an error) — never
 * read as confirmed, and never read as "nothing was confirmed".
 */
export type CrossPartyStandingRead =
  | ReadonlyMap<string, ReadonlyMap<string, DoorConfirmationState>>
  | typeof STANDING_DOOR_NOT_INSTALLED
  | null;

/**
 * The Phase A states plus `recorded_unjudged`: a recorded confirmation read
 * before the door exists — today's stored-flag reading, kept on purpose.
 */
export type CrossPartyConfirmationState = SkillConfirmationState | "recorded_unjudged";

export function crossPartyConfirmationState(
  row: FlaggedSkillRow,
  workerId: string | null | undefined,
  read: CrossPartyStandingRead,
): CrossPartyConfirmationState {
  if (row.verified !== true) return "none";
  if (read === STANDING_DOOR_NOT_INSTALLED) return "recorded_unjudged";
  if (read === null) return "unknown";
  if (!workerId || !row.skill_id) return "unknown";
  // A recorded row the door did not answer for (it became verified between
  // the two reads, or the door could not see it) is UNKNOWN, never "withdrawn".
  return read.get(workerId)?.get(row.skill_id) ?? "unknown";
}

/** Reads as confirmed: the confirmation stands, or the door is not installed yet. */
export function crossPartyReadsConfirmed(state: CrossPartyConfirmationState): boolean {
  return state === "standing" || state === "recorded_unjudged";
}

/**
 * The cross-party twin of `withStandingConfirmation`: `verified` is true only
 * when the confirmation reads as confirmed; the stored flag is carried as
 * `verifiedRecorded`; a confirmation that is withdrawn or the person's own
 * loses the `manager_confirmed` source; an UNKNOWN one keeps it (under-stated,
 * never erased — `standingSourceTier`). Rows carry `worker_id`, or every row
 * belongs to `workerId`.
 */
export function withCrossPartyStandingConfirmation<
  T extends FlaggedSkillRow & {
    readonly worker_id?: string | null;
    readonly source?: string | null;
  },
>(
  rows: readonly T[],
  read: CrossPartyStandingRead,
  workerId?: string | null,
): (T & {
  verified: boolean;
  verifiedRecorded: boolean;
  confirmation: CrossPartyConfirmationState;
})[] {
  return rows.map((r) => {
    const confirmation = crossPartyConfirmationState(r, r.worker_id ?? workerId ?? null, read);
    const confirmed = crossPartyReadsConfirmed(confirmation);
    const dropSource =
      !confirmed &&
      confirmation !== "unknown" &&
      confirmation !== "none" &&
      r.source === "manager_confirmed";
    return {
      ...r,
      ...(dropSource ? { source: null } : {}),
      verified: confirmed,
      verifiedRecorded: r.verified === true,
      confirmation,
    } as T & {
      verified: boolean;
      verifiedRecorded: boolean;
      confirmation: CrossPartyConfirmationState;
    };
  });
}

/**
 * Count of rows reading as confirmed, or `null` when any recorded
 * confirmation among them is UNKNOWN (a count that silently drops those would
 * read as "not confirmed"; one that keeps them would over-state).
 */
export function countCrossPartyConfirmed(
  rows: readonly { readonly verified: boolean; readonly confirmation: CrossPartyConfirmationState }[],
): number | null {
  if (rows.some((r) => r.confirmation === "unknown")) return null;
  return rows.filter((r) => r.verified).length;
}

/**
 * The workers holding at least one confirmation that reads as confirmed —
 * for aggregate "confirmed-skill workers" counts (admin market views). A
 * worker whose only recorded confirmations are UNKNOWN is not counted
 * (under-stated, never over-stated).
 */
export function confirmedSkillWorkerIds(
  rows: readonly (FlaggedSkillRow & { readonly worker_id: string | null })[],
  read: CrossPartyStandingRead,
): Set<string> {
  const out = new Set<string>();
  for (const r of withCrossPartyStandingConfirmation(rows, read)) {
    if (r.verified && r.worker_id) out.add(r.worker_id);
  }
  return out;
}

type MappedTierRow = {
  readonly verified: boolean | null;
  readonly source?: string | null;
  readonly confirmation?: CrossPartyConfirmationState;
};

/** An UNKNOWN confirmation whose source still says manager_confirmed: shown
 *  as journal-level evidence — never confirmed, never erased to "declared"
 *  (the same under-statement the CV makes for it, cv-export/skill-tiers.ts). */
function unknownConfirmationTier(row: MappedTierRow): EvidenceTier | null {
  return row.confirmation === "unknown" && row.source === "manager_confirmed"
    ? "work_journal"
    : null;
}

/**
 * The evidence tier of a row ALREADY mapped by `withStandingConfirmation` /
 * `withCrossPartyStandingConfirmation`, on the canonical ladder
 * (`deriveEvidenceTier`: only a confirmation that reads as confirmed reaches
 * the top rung), with an UNKNOWN confirmation under-stated, not erased.
 */
export function standingEvidenceTier(row: MappedTierRow): EvidenceTier {
  return unknownConfirmationTier(row) ?? deriveEvidenceTier(row);
}

/**
 * The same for readers that map the stored SOURCE (`sourceToEvidence`, the
 * match subjects), which lifts a `manager_confirmed` source to the top tier on
 * its own: an UNKNOWN confirmation (source kept) is capped at journal-level
 * evidence. Rows that were never confirmed keep that reader's reading.
 */
export function standingSourceTier(row: MappedTierRow): EvidenceTier {
  if (row.verified === true) return "manager_confirmed";
  return unknownConfirmationTier(row) ?? sourceToEvidence(row.source);
}
