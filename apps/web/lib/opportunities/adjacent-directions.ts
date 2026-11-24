/**
 * Adjacent professional directions — a THIN deterministic composition over the
 * SINGLE canonical skill/adjacency map (`lib/taxonomy/profession-skills.ts`).
 *
 * NOT a new engine and NOT a second skills map: it reuses `professionsForSkill`
 * (reverse index), `skillsForProfession` and `professionRelatedness` to answer
 * one product question — "given the worker's real held skills, which OTHER
 * professional directions do those skills already apply to?" (Opportunity
 * Discovery Wave 2). Guarded by `lib/guards/opportunity-directions.test.ts` and
 * the canonical-module guard (no duplicate adjacency map / matching engine).
 *
 * Honesty: no LLM, no hardcoded profession list, no sector or industry
 * prioritisation, no fabricated salaries/courses/market predictions. Insufficient data yields an
 * honest limitation state, never a fake list. Deterministic: same inputs →
 * same output (pure; unknown professions/skills honestly contribute nothing).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  skillsForProfession,
  professionsForSkill,
  professionRelatedness,
} from "@/lib/taxonomy/profession-skills";

export type AdjacentDirectionLimitation =
  | "ok"
  | "insufficient_skills"
  | "no_reliable_directions";

export interface AdjacentDirection {
  /** Canonical profession slug (localized in the view layer). */
  readonly professionId: string;
  /** Canonical skill slugs the worker already holds that fit this direction. */
  readonly sharedSkills: readonly string[];
  /** Canonical skill slugs this direction wants that the worker lacks (capped). */
  readonly missingSkills: readonly string[];
  /** How many held skills back this direction (the real explainability basis). */
  readonly sharedCount: number;
  /** Shared-skill relatedness to the worker's primary profession (0..1; 0 if none). */
  readonly relatedness: number;
}

export interface AdjacentDirectionsResult {
  readonly directions: readonly AdjacentDirection[];
  readonly limitationState: AdjacentDirectionLimitation;
  /** The real evidence source of the held skills used (never fabricated). */
  readonly evidenceSource: "worker_skills";
}

/** A direction must be backed by at least this many held skills to be shown
 *  (avoids weak single-skill noise). */
const MIN_SHARED = 2;
/** Below this many held skills we cannot compute reliable directions. */
const MIN_SKILLS = 2;
const MAX_DIRECTIONS = 5;
const MAX_MISSING = 4;

const EMPTY = (
  state: AdjacentDirectionLimitation,
): AdjacentDirectionsResult => ({
  directions: [],
  limitationState: state,
  evidenceSource: "worker_skills",
});

/**
 * Pure derivation. `workerSkillSlugs` are canonical skill slugs the worker
 * really holds (from `worker_skills`); `primaryProfessionSlug` is their current
 * primary profession (excluded from the results — it is not an *adjacent*
 * direction). No IO.
 */
export function computeAdjacentDirections(input: {
  readonly workerSkillSlugs: readonly string[];
  readonly primaryProfessionSlug: string | null;
}): AdjacentDirectionsResult {
  const held = new Set(input.workerSkillSlugs.filter((s) => Boolean(s)));
  if (held.size < MIN_SKILLS) return EMPTY("insufficient_skills");

  const primary = input.primaryProfessionSlug || null;

  // Candidate directions = every profession that carries at least one held
  // skill (the canonical reverse index), minus the worker's own profession.
  const candidates = new Set<string>();
  for (const skill of held) {
    for (const prof of professionsForSkill(skill)) candidates.add(prof);
  }
  if (primary) candidates.delete(primary);

  const scored = Array.from(candidates)
    .map((prof) => {
      const profSkills = skillsForProfession(prof);
      const shared = profSkills.filter((s) => held.has(s));
      const missing = profSkills.filter((s) => !held.has(s));
      const coverage = profSkills.length ? shared.length / profSkills.length : 0;
      return {
        professionId: prof,
        sharedSkills: shared,
        missingSkills: missing.slice(0, MAX_MISSING),
        sharedCount: shared.length,
        coverage,
        relatedness: primary ? professionRelatedness(primary, prof) : 0,
      };
    })
    .filter((d) => d.sharedCount >= MIN_SHARED);

  if (scored.length === 0) return EMPTY("no_reliable_directions");

  // Deterministic ranking — real coverage only, no sector or industry
  // prioritisation, no whitelist: shared-skill count, then coverage, then relatedness, then a
  // stable slug tiebreak so the output never depends on Set/Map order.
  scored.sort(
    (a, b) =>
      b.sharedCount - a.sharedCount ||
      b.coverage - a.coverage ||
      b.relatedness - a.relatedness ||
      a.professionId.localeCompare(b.professionId),
  );

  return {
    directions: scored.slice(0, MAX_DIRECTIONS).map((d) => ({
      professionId: d.professionId,
      sharedSkills: d.sharedSkills,
      missingSkills: d.missingSkills,
      sharedCount: d.sharedCount,
      relatedness: d.relatedness,
    })),
    limitationState: "ok",
    evidenceSource: "worker_skills",
  };
}

/**
 * THE PROFESSION THE WORKER'S WORK ALREADY SHOWS, when they never named one.
 *
 * Owner directive, and the product's own principle: a person does not have to
 * declare a profession to be understood. Matching already honours that —
 * `match-v1` treats `professionSlug` as a weighted criterion that fires only
 * when BOTH sides state it, never a gate. One surface did not: the market
 * panel on the opportunities board renders nothing at all without a declared
 * profession, and that panel is the host of the product's only user-visible AI
 * surface. In production 32 of 36 workers have no `worker_professions` row, so
 * for them the panel — and the AI with it — did not exist. One of them
 * (`8af3e334`) holds 12 skills and 12 journal entries: the plumber who never
 * typed "plumber".
 *
 * This is deliberately NOT a new inference engine. It is the EXISTING
 * `computeAdjacentDirections` asked with no primary profession, which makes
 * every profession a candidate and ranks them on real held-skill evidence
 * (shared count, then coverage, then a stable slug tiebreak). The strongest is
 * the answer. Same map, same ranking, same MIN_SHARED floor — so a worker with
 * one stray skill still gets `null` rather than a guess, and the caller shows
 * nothing instead of something invented.
 *
 * Returns null when a profession IS declared: a derived reading must never
 * override what the person actually said about themselves.
 *
 * The caller must label the result as derived from recorded work rather than
 * stated — see the market panel. Pure; no IO.
 */
export function bestEvidencedProfession(input: {
  readonly workerSkillSlugs: readonly string[];
  readonly declaredProfessionSlug: string | null;
}): string | null {
  if (input.declaredProfessionSlug) return null;
  const result = computeAdjacentDirections({
    workerSkillSlugs: input.workerSkillSlugs,
    primaryProfessionSlug: null,
  });
  if (result.limitationState !== "ok") return null;
  return result.directions[0]?.professionId ?? null;
}

/** Read the worker's real held skill slugs from `worker_skills` (canonical
 *  `skills.slug`). Returns [] on any missing worker / read error — honest, never
 *  throws. */
export async function loadWorkerSkillSlugs(
  supabase: SupabaseClient,
  workerId: string | null,
): Promise<string[]> {
  if (!workerId) return [];
  const { data, error } = await supabase
    .from("worker_skills")
    .select("skills ( slug )")
    .eq("worker_id", workerId);
  if (error || !Array.isArray(data)) return [];
  const slugs: string[] = [];
  for (const row of data as Array<{ skills?: { slug?: string | null } | null }>) {
    const slug = row.skills?.slug;
    if (typeof slug === "string" && slug) slugs.push(slug);
  }
  return slugs;
}

/** Server helper: load held skills + compute directions for one worker. */
export async function loadAdjacentDirectionsForWorker(
  supabase: SupabaseClient,
  workerId: string | null,
  primaryProfessionSlug: string | null,
): Promise<AdjacentDirectionsResult> {
  const workerSkillSlugs = await loadWorkerSkillSlugs(supabase, workerId);
  return computeAdjacentDirections({ workerSkillSlugs, primaryProfessionSlug });
}
