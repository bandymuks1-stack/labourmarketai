/**
 * EDU-5 — the PURE half of the one signal → manager review-queue producer.
 *
 * A learning SIGNAL is an observation a worker wrote about themselves
 * (`skill-feedback-signal.ts`). A review-queue ITEM is a SUGGESTION for the
 * manager of the organisation whose work the entry belongs to. This file
 * decides, without touching the database, which signals may become items:
 *
 *   - only a worker's ACCEPTANCE of a recognised skill (`skill_candidate`);
 *     a rejection corrects the recogniser, it is nobody else's business;
 *   - only when the signal names a skill (a `confirm_skill` item without a
 *     skill is unconfirmable);
 *   - only when the signal's own claims AGREE with the entry it points at:
 *     the entry exists and is live (not superseded / deleted), belongs to the
 *     same worker, sits in an engagement context of the SAME organisation the
 *     signal names, and that context has `journal_review_enabled`. A signal
 *     is written by the worker, so `organization_id` on it is a CLAIM that is
 *     re-derived here from the entry, never trusted;
 *   - at most once per (entry, skill): an existing queue item for the pair —
 *     in ANY status, so a manager's rejection is never re-asked — and a
 *     duplicate signal in the same batch both collapse to nothing.
 *
 * It confirms nothing. The item is created `pending`; the only things that
 * can change it are a human manager's decision or the audited
 * `apply_learning_auto_confirmation` RPC, which stays gated behind a
 * policy that defaults OFF.
 */

export interface QueueSignalRow {
  readonly id: string;
  readonly subject_worker_id: string;
  readonly subject_skill_id: string | null;
  readonly organization_id: string | null;
  readonly source: string;
  readonly source_object_type: string | null;
  readonly source_object_id: string | null;
  readonly signal_kind: string;
  readonly proposed_outcome: { readonly slug?: unknown } | null;
}

export interface QueueEntryFacts {
  readonly workerId: string;
  readonly organizationId: string | null;
  readonly reviewEnabled: boolean;
  readonly stale: boolean;
}

export interface ReviewQueueInsert {
  readonly signal_id: string;
  readonly subject_worker_id: string;
  readonly subject_skill_id: string;
  readonly organization_id: string;
  readonly journal_entry_id: string;
  readonly suggestion_kind: "confirm_skill";
  readonly proposed_action: {
    readonly origin: "worker_accepted_recognised_skill";
    readonly slug: string | null;
  };
  readonly status: "pending";
}

export const entrySkillKey = (entryId: string, skillId: string) => `${entryId}|${skillId}`;

export function planReviewQueueInserts(
  signals: readonly QueueSignalRow[],
  entries: ReadonlyMap<string, QueueEntryFacts>,
  alreadyQueued: ReadonlySet<string>,
): ReviewQueueInsert[] {
  const seen = new Set(alreadyQueued);
  const out: ReviewQueueInsert[] = [];
  for (const s of signals) {
    if (s.source !== "skill_claim" || s.signal_kind !== "skill_candidate") continue;
    if (s.source_object_type !== "journal_entry" || !s.source_object_id) continue;
    if (!s.subject_skill_id || !s.organization_id) continue;
    const entry = entries.get(s.source_object_id);
    if (!entry || entry.stale || !entry.reviewEnabled) continue;
    if (entry.workerId !== s.subject_worker_id) continue;
    if (!entry.organizationId || entry.organizationId !== s.organization_id) continue;
    const key = entrySkillKey(s.source_object_id, s.subject_skill_id);
    if (seen.has(key)) continue;
    seen.add(key);
    const slug = s.proposed_outcome?.slug;
    out.push({
      signal_id: s.id,
      subject_worker_id: s.subject_worker_id,
      subject_skill_id: s.subject_skill_id,
      organization_id: s.organization_id,
      journal_entry_id: s.source_object_id,
      suggestion_kind: "confirm_skill",
      proposed_action: {
        origin: "worker_accepted_recognised_skill",
        slug: typeof slug === "string" ? slug : null,
      },
      status: "pending",
    });
  }
  return out;
}
