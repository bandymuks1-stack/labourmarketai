/**
 * NAMED-TARGET SKILL GAP — "Ką turėčiau išmokti, kad galėčiau dirbti X?"
 * (owner 2026-09-29 §13).
 *
 * The general skill-gap answer compares the person against the demand on
 * their board. A sentence that NAMES an occupation asks something narrower:
 * what does X need, and how much of it does MY evidence already hold?
 *
 * ONE SOURCE PER SIDE — nothing new is stored or derived elsewhere:
 *   · what X needs  — the canonical `profession_skills` links (the drift-
 *                     guarded static mirror `skillsForProfession`, the same
 *                     expansion matching uses for a demand that names only a
 *                     profession);
 *   · what I hold   — the person's `WorkIntelligence.skills` rows (the one
 *                     work-intelligence reader the journal section, the
 *                     growth reading and the Living CV use).
 *
 * EVIDENCE IS NOT BINARY (owner §9). Each required skill lands on the rung
 * the person's own rows support, never higher:
 *   confirmed — recorded work a manager or client approved;
 *   recorded  — the journal backs it, not confirmed yet;
 *   stated    — the person said they have it, no entry backs it yet;
 *   missing   — nothing on the person's side names it.
 * No score, no percentage, no "ready / not ready" verdict of the person.
 *
 * Pure and deterministic — no IO, no LLM.
 */

import { detectNeedProfession } from "@/lib/market/need-skills";
import { professionFromSentence } from "@/lib/onboarding/landing-handoff";
import { extractJournalSuggestions } from "@/lib/structuring/extract-journal-suggestions";
import {
  PROFESSION_SLUGS,
  professionsForSkill,
  skillsForProfession,
} from "@/lib/taxonomy/profession-skills";

/**
 * The ONE catalogue occupation a sentence names, read by the recognizers
 * that already exist — never a lexicon of its own:
 *   1. the profile flow's profession reading (one named profession);
 *   2. the demand-side profession detector (longest lexicon needle — it also
 *      reads inflected forms such as "virtuvės pagalbininku");
 *   3. the journal recognizer's kind of work, when it is a profession;
 *   4. a recognized skill that belongs to EXACTLY one profession ("welder"
 *      in English reads as `welding-blueprint`, which only `welder` holds).
 * Two candidates on a rung, or none anywhere → null (the general gap answer
 * stays; a guessed occupation would answer a question nobody asked).
 */
export function targetOccupationFromSentence(text: string): string | null {
  const named = professionFromSentence(text) ?? detectNeedProfession(text);
  if (named && PROFESSION_SLUGS.includes(named)) return named;
  const read = extractJournalSuggestions(text);
  const activities = [
    ...new Set(read.fragments.map((f) => f.activitySlug).filter((s): s is string => !!s && PROFESSION_SLUGS.includes(s))),
  ];
  if (activities.length === 1) return activities[0];
  if (activities.length > 1) return null;
  const owners = new Set(read.skillSlugs.flatMap((slug) => professionsForSkill(slug)));
  return owners.size === 1 ? [...owners][0] : null;
}

export type TargetSkillRung = "confirmed" | "recorded" | "stated" | "missing";

/** The fields of a `SkillWorkTime` row this reading needs. */
export type TargetGapSkillRow = {
  readonly slug: string;
  readonly entries: number;
  readonly confirmedHours: number;
  readonly provenance: { readonly confirmed: number };
};

export type TargetOccupationGap = {
  readonly professionSlug: string;
  /** Required skill slugs of the occupation, in catalogue order. */
  readonly required: readonly string[];
  readonly confirmed: readonly string[];
  readonly recorded: readonly string[];
  readonly stated: readonly string[];
  readonly missing: readonly string[];
};

function rungOf(row: TargetGapSkillRow | undefined): TargetSkillRung {
  if (!row) return "missing";
  if (row.entries > 0 && (row.confirmedHours > 0 || row.provenance.confirmed > 0)) return "confirmed";
  if (row.entries > 0) return "recorded";
  return "stated";
}

/** `null` when the platform does not know which skills the occupation
 *  needs — an unknown occupation is never answered as "nothing missing". */
export function readTargetOccupationGap(
  professionSlug: string,
  skills: readonly TargetGapSkillRow[],
): TargetOccupationGap | null {
  const required = skillsForProfession(professionSlug);
  if (required.length === 0) return null;
  const bySlug = new Map(skills.map((s) => [s.slug, s] as const));
  const out: Record<TargetSkillRung, string[]> = { confirmed: [], recorded: [], stated: [], missing: [] };
  for (const slug of required) out[rungOf(bySlug.get(slug))].push(slug);
  return { professionSlug, required, ...out };
}
