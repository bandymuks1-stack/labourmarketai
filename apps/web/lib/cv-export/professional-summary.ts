/**
 * PROFESSIONAL FACTS — the deterministic part of the Living CV's professional
 * description (owner #1689 requirement 7/11: "coherent human-readable
 * professional narrative … never invent history").
 *
 * The person's own `profile_text` stays the narrative and is never replaced,
 * rewritten or "improved". Under it the CV prints a short factual paragraph
 * derived ONLY from the canonical work-intelligence reading (`WorkIntelligence`,
 * all-time focus): recorded hours, entries, the span of months, the number
 * of engagement contexts, the skills that take the largest share of the
 * person's recorded work, and completed outputs in their recorded units.
 * Every sentence is an i18n template the page fills from these facts — no
 * model writes prose here, so nothing can be invented; a journal that could
 * not be read yields `null` (the paragraph is omitted), never zeros.
 *
 * Pure: no IO, no clock, no AI.
 */

import type { WorkIntelligence } from "@/lib/journal/work-intelligence";

/** A skill only enters the "most of my work" clause above this share. */
export const TOP_SKILL_MIN_SHARE = 0.05;
export const TOP_SKILLS_LIMIT = 3;
export const OUTPUTS_LIMIT = 3;

export type ProfessionalFacts = {
  /** All-time recorded hours (the journal's own derivation). */
  readonly hours: number;
  /** Of `hours`, the part a manager approved. */
  readonly confirmedHours: number;
  readonly entries: number;
  /** Distinct engagement contexts the entries belong to (the personal
   *  context counts as one when entries were written against it). */
  readonly contexts: number;
  /** `YYYY-MM` of the oldest / newest month with an entry. */
  readonly firstMonth: string | null;
  readonly lastMonth: string | null;
  /** Skills by share of the person's ATTRIBUTED hours, desc; only those
   *  above TOP_SKILL_MIN_SHARE, at most TOP_SKILLS_LIMIT. Share is 0..1. */
  readonly topSkills: readonly { slug: string; share: number; hours: number }[];
  /** Completed outputs in their RECORDED unit, largest first. */
  readonly outputs: readonly { unit: string; value: number; activity: string | null }[];
};

/**
 * `null` when the journal was not readable (unknown ≠ zero) or when it holds
 * no timed entry at all — an empty journal has no facts to print, and the
 * CV's own "no records yet" line already says so.
 */
export function deriveProfessionalFacts(
  wi: WorkIntelligence | null | undefined,
): ProfessionalFacts | null {
  if (!wi) return null;
  const all = wi.periods.find((p) => p.key === "all");
  const hours = all?.hours ?? wi.totalHours;
  const entries = all?.entries ?? wi.totalEntries;
  if (!(hours > 0) && !(entries > 0)) return null;

  const months = wi.months;
  const topSkills = wi.skills
    .filter((s) => s.share >= TOP_SKILL_MIN_SHARE && s.attributedHours > 0)
    .slice()
    .sort((a, b) => b.share - a.share || b.attributedHours - a.attributedHours)
    .slice(0, TOP_SKILLS_LIMIT)
    .map((s) => ({ slug: s.slug, share: s.share, hours: s.attributedHours }));

  const outputs = wi.outputs
    .filter((o) => o.value > 0)
    .slice()
    .sort((a, b) => b.value - a.value)
    .slice(0, OUTPUTS_LIMIT)
    .map((o) => ({ unit: o.unit, value: o.value, activity: o.activity }));

  return {
    hours,
    confirmedHours: all?.confirmedHours ?? 0,
    entries,
    contexts: wi.contexts.filter((c) => c.entries > 0).length,
    firstMonth: months[0]?.month ?? null,
    lastMonth: months[months.length - 1]?.month ?? null,
    topSkills,
    outputs,
  };
}

/** Round to one decimal for the CV; whole numbers stay whole. */
export function roundHours(h: number): number {
  return Math.round(h * 10) / 10;
}

/** 0..1 → whole percent. */
export function percentOf(share: number): number {
  return Math.round(share * 100);
}
