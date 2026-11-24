/**
 * Explicit per-skill evidence STATE (universal, sector-neutral).
 *
 * Extends the declared/supported summary (skill-evidence.ts) with a single,
 * honest state per skill that the UI and the dry-run report share. It NEVER
 * over-states: a skill is only "verified" / "manager_confirmed" when the
 * stored provenance says so; a skill the system could not map to the
 * taxonomy is "unclassified" (needs review), never silently treated as
 * classified.
 *
 * PURE: no fs / net / env. Safe to import anywhere + unit-test.
 */
import type { SkillEvidenceInput } from "./skill-evidence";

export type SkillEvidenceState =
  | "verified" // strongest — real registry / admin verification
  | "manager_confirmed" // a manager confirmed it on a work-journal entry
  | "work_supported" // backed by ≥1 work-journal entry (evidence, not verification)
  | "self_declared" // worker's own statement, not yet supported
  | "unclassified"; // system could not map it to the taxonomy — needs review

export interface SkillEvidenceStateInput extends SkillEvidenceInput {
  /** False when the system could not map the skill/entry to a known
   *  sector/skill (free-text the recogniser didn't classify). Defaults to
   *  true (a catalogued worker_skill is classified by definition). */
  classified?: boolean;
}

/** Derive the single honest state for one skill. Order = strongest first. */
export function deriveSkillEvidenceState(
  s: SkillEvidenceStateInput,
): SkillEvidenceState {
  if (s.classified === false) return "unclassified";
  if (s.verified === true) return "verified";
  if ((s.source ?? "") === "manager_confirmed") return "manager_confirmed";
  if (s.journalSupported === true || (s.source ?? "") === "work_journal") {
    return "work_supported";
  }
  return "self_declared";
}

export type SkillEvidenceStateBreakdown = Record<SkillEvidenceState, number>;

const EMPTY_BREAKDOWN: () => SkillEvidenceStateBreakdown = () => ({
  verified: 0,
  manager_confirmed: 0,
  work_supported: 0,
  self_declared: 0,
  unclassified: 0,
});

/** Aggregate states across a worker's skills — for the honest UI summary
 *  ("N self-declared, M need review") and the dry-run report. */
export function aggregateSkillEvidenceStates(
  skills: ReadonlyArray<SkillEvidenceStateInput>,
): SkillEvidenceStateBreakdown {
  const out = EMPTY_BREAKDOWN();
  for (const s of skills) out[deriveSkillEvidenceState(s)] += 1;
  return out;
}

/** True when at least one skill still needs attention (self-declared or
 *  unclassified) — drives the honest "not everything is confirmed yet" note. */
export function hasUnreviewedSkills(
  breakdown: SkillEvidenceStateBreakdown,
): boolean {
  return breakdown.self_declared > 0 || breakdown.unclassified > 0;
}
