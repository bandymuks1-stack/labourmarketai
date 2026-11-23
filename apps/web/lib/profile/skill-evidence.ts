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

import { cvSkillTier } from "@/lib/cv-export/skill-tiers";

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

/** True when a worker skill has real backing — read from THE canonical CV
 *  tier (`cvSkillTier`, built on lib/evidence/evidence-tier.ts), never a
 *  second interpretation of the row (duplication finding G-8): a skill is
 *  supported exactly when the Living CV does not print it as "declared".
 *  `verified` must be the STANDING confirmation (withStandingConfirmation),
 *  never the stored flag. Not a verification claim — only "work backs this". */
export function isSkillSupportedByWork(s: SkillEvidenceInput): boolean {
  return (
    cvSkillTier({
      slug: "",
      verified: s.verified,
      source: s.source,
      journalSupported: s.journalSupported,
    }) !== "declared"
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

/**
 * systemic-ux-skills-v1 — ONE deterministic evidence status, never two
 * contradictory lines. The old UI showed "Paremta darbo įrašais: 6 iš 21" AND
 * "Dar nėra darbo įrašų..." at the same time (the second fired whenever any
 * skill was unsupported, even when 6 already were). This collapses the state
 * to a single honest key derived only from the counts:
 *   • none      → 0 supported            ("Dar nėra darbo įrašų...")
 *   • some      → 1..declared-1 supported ("Kai kuriuos įgūdžius jau paremia...")
 *   • all       → declared supported      ("Visi šie įgūdžiai turi pagrindimą.")
 * Returns `null` when there is nothing declared (caller renders no block).
 */
export type SkillEvidenceStatus = "none" | "some" | "all";

export function skillEvidenceStatus(
  summary: Pick<SkillEvidenceSummary, "declared" | "supported">,
): SkillEvidenceStatus | null {
  if (summary.declared <= 0) return null;
  if (summary.supported <= 0) return "none";
  if (summary.supported >= summary.declared) return "all";
  return "some";
}
