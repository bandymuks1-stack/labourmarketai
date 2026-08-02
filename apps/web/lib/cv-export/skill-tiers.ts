/**
 * Verified CV — honest skill tiers (S3.5).
 *
 * Three tiers, strictly under-stated (doctrine §7 — never over-claim):
 *   - "confirmed"  ONLY when `verified === true` (a manager flipped the skill
 *     through the gated confirm RPC). Nothing else — not even
 *     `source === 'manager_confirmed'` alone — may render as confirmed.
 *   - "evidence"   real work-journal backing without a manager confirmation
 *     (durable journal link or work_journal provenance).
 *   - "declared"   everything else: the person's own claim, unverified.
 *
 * Pure + deterministic so the honesty guard can pin it with fixtures.
 */

import { deriveEvidenceTier } from "@/lib/evidence/evidence-tier";

export type CvSkillTier = "confirmed" | "evidence" | "declared";

export type CvSkillTierInput = {
  slug: string;
  verified?: boolean | null;
  source?: string | null;
  /** Durable journal→skill link (journal_entry_skills). Evidence, not proof. */
  journalSupported?: boolean;
};

export function cvSkillTier(s: CvSkillTierInput): CvSkillTier {
  // W6 slice 1: derived from the ONE canonical tier. The CV's deliberate
  // extra rule stays: an inconsistent row (manager_confirmed source WITHOUT
  // the verified flag) is UNDER-stated as evidence, never as confirmed —
  // deriveEvidenceTier only awards the top rung on verified===true, so that
  // rule is now enforced by the canonical derivation itself.
  const tier = deriveEvidenceTier(s);
  if (tier === "manager_confirmed") return "confirmed";
  if (tier === "work_journal" || s.journalSupported === true || s.source === "manager_confirmed") {
    return "evidence";
  }
  return "declared";
}

export type CvSkillTiers = {
  confirmed: string[];
  evidence: string[];
  declared: string[];
};

export function groupCvSkillTiers(
  rows: ReadonlyArray<CvSkillTierInput>,
): CvSkillTiers {
  const out: CvSkillTiers = { confirmed: [], evidence: [], declared: [] };
  for (const r of rows) out[cvSkillTier(r)].push(r.slug);
  return out;
}
