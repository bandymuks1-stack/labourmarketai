/**
 * Quick-confirm scope (pure) — which skills ONE manager tap will verify.
 *
 * Honesty rule (window 6, orchestrator decision on COUNTERPARTY_CONFIRMED):
 * a confirmation is evidence about ONE entry, so the tap verifies only the
 * skills that entry is linked to (`journal_entry_skills`), never the
 * worker's whole declared list. The rule, in order:
 *
 *   entry_links        — the entry has ≥1 link → confirm ONLY the linked
 *                        skills that are still declared-unverified. All
 *                        linked skills already verified → nothing to
 *                        confirm; the tap approves the entry itself.
 *   worker_declared    — the entry has ZERO links (historic entries, or the
 *                        link read failed → links unknown) → the previous
 *                        behaviour: every declared-unverified skill of the
 *                        worker. Still listed in full on the card, so the
 *                        manager sees exactly what the tap does.
 *   skills_unavailable — the worker_skills read itself failed → NOTHING can
 *                        be listed, so nothing is confirmed; the card names
 *                        the failure and the tap approves the entry only.
 *
 * The RPC `confirm_entry_and_verify_skills(p_entry_id, p_skill_ids, p_note)`
 * flips exactly the ids it is given, so passing the scoped list is the whole
 * fix — no migration.
 */

export type QuickQueueSkill = { id: string; slug: string };

export type QuickConfirmScope =
  | "entry_links"
  | "worker_declared"
  | "skills_unavailable";

export type ScopedSkillsToConfirm = {
  scope: QuickConfirmScope;
  skills: QuickQueueSkill[];
};

export function scopeSkillsToConfirm({
  linkedSkillIds,
  workerUnverified,
}: {
  /** Skill ids linked to THIS entry; `null` = the link read failed (unknown). */
  linkedSkillIds: ReadonlySet<string> | null;
  /** The worker's declared-unverified skills; `null` = that read failed. */
  workerUnverified: readonly QuickQueueSkill[] | null;
}): ScopedSkillsToConfirm {
  if (workerUnverified === null) {
    return { scope: "skills_unavailable", skills: [] };
  }
  if (linkedSkillIds !== null && linkedSkillIds.size > 0) {
    return {
      scope: "entry_links",
      skills: workerUnverified.filter((s) => linkedSkillIds.has(s.id)),
    };
  }
  return { scope: "worker_declared", skills: [...workerUnverified] };
}

/** The receipt line's entry title: the entry's own first non-empty line,
 *  capped — never invented text (mirrors the timesheet title rule). */
export const RECEIPT_TITLE_MAX = 80;

export function receiptTitle(originalText: string): string {
  const first =
    originalText
      .replace(/\r/g, "")
      .split("\n")
      .map((l) => l.trim())
      .find((l) => l !== "") ?? "";
  if (first.length <= RECEIPT_TITLE_MAX) return first;
  return `${first.slice(0, RECEIPT_TITLE_MAX - 1).trimEnd()}…`;
}
