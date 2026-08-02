/**
 * THE ONE canonical evidence-tier ladder (W6 slice 1).
 *
 * DB truth for a worker_skills row:
 *   verified === true            → manager_confirmed
 *   source === 'work_journal'    → work_journal
 *   anything else                → self_declared (never inflated)
 *
 * Every surface vocabulary — the CV's confirmed/evidence/declared, the player
 * card chart's verified/journal/declared, the person page's chips, scouting's
 * tier words — is a RENDER TOKEN derived from this module, never a second
 * interpretation of the row. The tier WORDS come from the one i18n namespace
 * `evidenceTier` (guard: evidence-tier-lexicon.test.ts).
 *
 * This is an evidence ladder, NOT reputation: no tier is ever a person score,
 * a star, or a trust rating (fit-not-rating guard).
 */

export type EvidenceTier = "manager_confirmed" | "work_journal" | "self_declared";

/** Strongest-real-tier-wins comparisons use this rank. */
export const EVIDENCE_TIER_RANK: Record<EvidenceTier, number> = {
  self_declared: 0,
  work_journal: 1,
  manager_confirmed: 2,
};

/** Map a stored `worker_skills.source` value to its tier. Pure; unknown or
 *  missing sources fall to the weakest — never inflated. */
export function sourceToEvidence(source: string | null | undefined): EvidenceTier {
  if (source === "manager_confirmed") return "manager_confirmed";
  if (source === "work_journal") return "work_journal";
  return "self_declared";
}

/** The one derivation from a worker_skills row. `verified === true` is the
 *  ONLY path to the top rung. An inconsistent row (manager_confirmed source
 *  WITHOUT the verified flag) never inflates: it reads as self_declared here
 *  — the CV additionally under-states such rows as "evidence" via its own
 *  explicit journalSupported/source rule. */
export function deriveEvidenceTier(row: {
  verified?: boolean | null;
  source?: string | null;
}): EvidenceTier {
  if (row.verified === true) return "manager_confirmed";
  if (row.source === "work_journal") return "work_journal";
  return "self_declared";
}

/** The one i18n namespace + key per tier. Surfaces needing the tier WORD read
 *  these keys (namespace `evidenceTier`); per-surface sentences may add
 *  context but never rename the fact. */
export const EVIDENCE_TIER_MESSAGE_KEY: Record<EvidenceTier, string> = {
  manager_confirmed: "managerConfirmed",
  work_journal: "workJournal",
  self_declared: "selfDeclared",
};
