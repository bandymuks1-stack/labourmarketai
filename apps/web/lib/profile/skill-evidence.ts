/**
 * Journal → Skill evidence-support derivation (v1).
 *
 * This is an EVIDENCE-SUPPORT layer, NOT verification. It answers one honest
 * question per declared worker skill: "do real work-journal entries back this
 * skill yet?" — derived purely from the already-stored per-skill provenance
 * (`worker_skills.source` ∈ self_declared | work_journal | manager_confirmed,
 * plus `verified`). No new table, no count of entries (a per-entry count is not
 * safely available without a schema change), no AI, no automatic certification.
 *
 * A skill is "supported by work entries" when its provenance shows real
 * work-journal backing: `work_journal` (journal-derived) or `manager_confirmed`
 * / `verified` (a manager confirmed it on a journal entry — the only real human
 * flow, surfaced as such elsewhere). Plain `self_declared` worker skills and
 * free-label self-declared claims are NOT supported yet. We deliberately
 * UNDER-state here (a verified skill is at least "supported"), never over-state.
 */

export type SkillEvidenceInput = {
  source?: string | null;
  verified?: boolean;
  /** v1 DURABLE journal→skill link: the worker has marked ≥1 work-journal entry
   *  as supporting this skill (`journal_entry_skills`). A real, queryable
   *  relation — preferred over the loose `source` provenance assumption. Still
   *  evidence-support, NOT verification. */
  journalSupported?: boolean;
};

export type SkillEvidenceSummary = {
  /** Total self-declared skills (catalogued worker skills + free-label claims). */
  declared: number;
  /** How many declared worker skills are backed by real work-journal evidence. */
  supported: number;
  /** Declared skills with no work-journal backing yet. */
  unsupported: number;
};

const SUPPORTED_SOURCES = new Set(["work_journal", "manager_confirmed"]);

/** True when a worker skill's stored provenance shows real work-journal
 *  backing. Not a verification claim — only "work entries back this". */
export function isSkillSupportedByWork(s: SkillEvidenceInput): boolean {
  return (
    s.journalSupported === true ||
    s.verified === true ||
    SUPPORTED_SOURCES.has(s.source ?? "self_declared")
  );
}

/**
 * Summarise a worker's skill evidence support.
 *
 * @param workerSkills catalogued worker_skills carrying source/verified.
 * @param selfDeclaredClaimCount free-label self-declared claims — always
 *   unsupported (they have no journal-evidence path), counted into `declared`.
 */
export function deriveSkillEvidence(
  workerSkills: ReadonlyArray<SkillEvidenceInput>,
  selfDeclaredClaimCount = 0,
): SkillEvidenceSummary {
  const supported = workerSkills.filter(isSkillSupportedByWork).length;
  const declared = workerSkills.length + Math.max(0, selfDeclaredClaimCount);
  return { declared, supported, unsupported: declared - supported };
}
