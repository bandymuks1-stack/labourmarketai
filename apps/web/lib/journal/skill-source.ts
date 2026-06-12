/**
 * Journal Evidence Auto-Recompute v1 — deterministic `worker_skills.source`
 * tier from REAL evidence. Pure (no DB, no I/O), so it is unit-testable and
 * carries the honesty rules:
 *
 *   - manager_confirmed — ONLY when the row is really confirmed (verified=true,
 *     set exclusively through the explicit manager/client confirmation path).
 *     Never set or downgraded by worker-side reconciliation.
 *   - work_journal     — when the worker has linked ≥1 real Work Journal entry
 *     to the skill (a journal_entry_skills row). Stronger than self-declared.
 *   - self_declared    — the floor: declared but neither journal-supported nor
 *     confirmed. Never inflated.
 *
 * The worker can only ever move their OWN skills between self_declared and
 * work_journal (owns_worker RLS). Promotion to manager_confirmed is a separate,
 * owner-gated SECURITY DEFINER path — see the Slice B migration.
 */

export type SkillSource = "self_declared" | "work_journal" | "manager_confirmed";

/** The deterministic tier for one skill from its real evidence. */
export function computeSkillSource(input: {
  /** worker_skills.verified — the manager/client-confirmed truth. */
  readonly verified: boolean;
  /** Does the skill have ≥1 journal_entry_skills support row? */
  readonly journalSupported: boolean;
}): SkillSource {
  if (input.verified) return "manager_confirmed";
  if (input.journalSupported) return "work_journal";
  return "self_declared";
}

export interface WorkerSkillRow {
  readonly skill_id: string;
  readonly source: SkillSource | string;
  readonly verified: boolean;
}

export interface SourceUpdate {
  readonly skill_id: string;
  readonly source: SkillSource;
}

/**
 * Worker-side reconciliation: given the worker's current skill rows and the set
 * of skill_ids that currently have journal support, return ONLY the rows whose
 * `source` must change. Pure + deterministic + idempotent.
 *
 * Invariants:
 *   - verified (manager_confirmed) rows are NEVER touched — the worker cannot
 *     create or revoke a confirmation.
 *   - a non-verified skill is `work_journal` iff it has journal support, else
 *     `self_declared` (so unlinking the last entry demotes it back honestly).
 *   - returns only the diff (no-op when nothing changed).
 */
export function reconcileWorkerSkillSources(
  rows: readonly WorkerSkillRow[],
  journalSupportedSkillIds: ReadonlySet<string>,
): SourceUpdate[] {
  const updates: SourceUpdate[] = [];
  for (const r of rows) {
    if (r.verified) continue; // manager_confirmed is owner-gated, never worker-set
    const next = computeSkillSource({
      verified: false,
      journalSupported: journalSupportedSkillIds.has(r.skill_id),
    });
    if (r.source !== next) updates.push({ skill_id: r.skill_id, source: next });
  }
  return updates;
}
