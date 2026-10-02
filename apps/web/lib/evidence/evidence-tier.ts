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

/**
 * CONFIRMED WORK, PER SKILL — evidence that a manager confirmed REAL WORK in
 * which this skill appears (entry-level confirmation), counted by query from
 * `journal_entry_skills` ⨝ live `journal_entries` ⨝ `journal_entry_confirmations`
 * (scope.action === 'confirm'). It is NOT a skill confirmation: only
 * `worker_skills.verified` (the per-skill action) reaches the top tier above.
 * No score, no star — an occurrence count with its day spread, so a single
 * confirmed entry is never presented as certified competence.
 *
 *   none               no manager-confirmed work mentions this skill
 *   confirmed_work     >= 1 confirmed entry
 *   repeated_confirmed >= REPEATED_CONFIRMED_MIN_ENTRIES entries on
 *                      >= REPEATED_CONFIRMED_MIN_DAYS distinct days
 */
export const REPEATED_CONFIRMED_MIN_ENTRIES = 3;
export const REPEATED_CONFIRMED_MIN_DAYS = 2;

export type ConfirmedWorkTier = "none" | "confirmed_work" | "repeated_confirmed";

export interface ConfirmedWorkCounts {
  readonly confirmedWorkEntries?: number | null;
  readonly confirmedDays?: number | null;
}

/** Unknown / missing counts read as "none" (never a penalty — see matching). */
export function deriveConfirmedWorkTier(counts: ConfirmedWorkCounts | null | undefined): ConfirmedWorkTier {
  const entries = Math.max(0, counts?.confirmedWorkEntries ?? 0);
  const days = Math.max(0, counts?.confirmedDays ?? 0);
  if (entries >= REPEATED_CONFIRMED_MIN_ENTRIES && days >= REPEATED_CONFIRMED_MIN_DAYS) {
    return "repeated_confirmed";
  }
  return entries >= 1 ? "confirmed_work" : "none";
}

/** The stored row tier plus the confirmed-work spread, side by side. */
export interface SkillEvidenceDetail {
  readonly tier: EvidenceTier;
  readonly confirmedWork: ConfirmedWorkTier;
  readonly confirmedWorkEntries: number;
  readonly confirmedDays: number;
}

export function deriveSkillEvidenceDetail(
  row: { verified?: boolean | null; source?: string | null },
  counts?: ConfirmedWorkCounts | null,
): SkillEvidenceDetail {
  return {
    tier: deriveEvidenceTier(row),
    confirmedWork: deriveConfirmedWorkTier(counts),
    confirmedWorkEntries: Math.max(0, counts?.confirmedWorkEntries ?? 0),
    confirmedDays: Math.max(0, counts?.confirmedDays ?? 0),
  };
}

/** The one i18n namespace + key per tier. Surfaces needing the tier WORD read
 *  these keys (namespace `evidenceTier`); per-surface sentences may add
 *  context but never rename the fact. */
export const EVIDENCE_TIER_MESSAGE_KEY: Record<EvidenceTier, string> = {
  manager_confirmed: "managerConfirmed",
  work_journal: "workJournal",
  self_declared: "selfDeclared",
};
