import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import {
  dedupeByConcept,
  type EscoConceptLabels,
  type EscoConceptType,
  type EscoLabelMatch,
  type EscoLabelType,
  type EscoOccupationSkillLink,
  type EscoRead,
  type EscoRelationType,
} from "./esco-semantics";

/**
 * THE ESCO READ LAYER — deterministic lookups over the imported catalogue.
 *
 * 1,045,186 labels across 28 locales, 13,939 skills, 3,039 occupations and
 * 126,051 occupation↔skill relations are already in production. Until now the
 * only thing that read any of it was the skill-clarify typeahead. This module
 * is the seam through which the rest of the product can use it.
 *
 * Every function here is a READ. Nothing writes, nothing caches to a table,
 * nothing mints a concept. A resolution is recomputed from the catalogue each
 * time, which is slower than storing it and much harder to get silently wrong:
 * there is no second copy to go stale, and no row that says a person means
 * something they no longer mean.
 *
 * ── LOCALE IS REQUIRED, AND THAT IS A PERFORMANCE CONTRACT ────────────────
 *
 * `esco_labels_typeahead_idx` is `(locale, lower(label) text_pattern_ops)`.
 * Its LEADING column is the locale, so a search that does not pin one cannot
 * use it. Measured on production 2026-09-08, same query, same rows:
 *
 *   with `locale = 'en'`     1.5 ms
 *   without a locale       10 076 ms
 *
 * A 6 500× difference. So `locales` is a required argument and the functions
 * fan out one indexed query per locale rather than letting Postgres scan the
 * table once. Cross-language search is therefore a LOOP over cheap lookups,
 * never one expensive scan — and asking for all 28 is a deliberate, visible
 * act rather than an accident of leaving an argument off.
 *
 * ── HONEST DEGRADATION ────────────────────────────────────────────────────
 *
 * `42P01` (tables absent — the catalogue was never imported in this
 * environment) is `unavailable: not_imported`, never an empty list. "ESCO has
 * nothing for this phrase" and "we could not ask ESCO" are different answers
 * and the caller must be able to act on the difference.
 */

const RELATION_NOT_FOUND = "42P01";

/** Default breadth of one lookup. Small: this feeds suggestions a human reads. */
export const ESCO_LOOKUP_LIMIT = 10;

/** Hard ceiling per locale, so a caller cannot turn a lookup into an export. */
const MAX_PER_LOCALE = 50;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

function isMissingTable(error: { code?: string } | null): boolean {
  return error?.code === RELATION_NOT_FOUND;
}

export interface EscoLookupInput {
  readonly text: string;
  /**
   * REQUIRED, and never defaulted. See the performance contract above: a
   * missing locale is not a convenience, it is a 10-second query.
   */
  readonly locales: readonly string[];
  readonly conceptType: EscoConceptType;
  readonly limit?: number;
}

/**
 * Resolve a human phrase to ESCO concepts, in the languages asked for.
 *
 * The phrase is matched as a PREFIX, which is what ESCO labels support cheaply
 * and what a person's own words usually are ("pastolių montuotojas" begins the
 * label). An exact equality is reported as such because it is the stronger
 * statement of meaning.
 *
 * Returns at most `limit` concepts overall, strongest first, one entry per
 * concept even when several of its labels matched.
 */
export async function lookupEscoConcepts(
  input: EscoLookupInput,
  client?: SupabaseClient,
): Promise<EscoRead<readonly EscoLabelMatch[]>> {
  const q = input.text.trim().toLowerCase();
  if (q.length < 2 || input.locales.length === 0) {
    return { status: "ok", value: [] };
  }
  const limit = Math.max(1, Math.min(input.limit ?? ESCO_LOOKUP_LIMIT, MAX_PER_LOCALE));
  const supabase = client ?? (await createClient());

  const all: EscoLabelMatch[] = [];
  for (const locale of input.locales) {
    // ONE INDEXED QUERY PER LOCALE — see the performance contract.
    const { data, error } = await asAny(supabase)
      .from("esco_labels")
      .select("concept_id, locale, label, label_type")
      .eq("locale", locale)
      .eq("concept_type", input.conceptType)
      .ilike("label", `${q}%`)
      .limit(MAX_PER_LOCALE);

    if (error) {
      if (isMissingTable(error)) return { status: "unavailable", reason: "not_imported" };
      return { status: "unavailable", reason: "error" };
    }
    for (const row of (data ?? []) as Record<string, unknown>[]) {
      const label = String(row.label);
      all.push({
        conceptId: String(row.concept_id),
        conceptType: input.conceptType,
        matchedLabel: label,
        matchedLocale: String(row.locale).trim(),
        labelType: String(row.label_type) as EscoLabelType,
        method: label.toLowerCase() === q ? "exact_label" : "prefix_label",
      });
    }
  }
  return { status: "ok", value: dedupeByConcept(all).slice(0, limit) };
}

/**
 * One concept, expressed in every language ESCO has a preferred label for.
 *
 * This is the cross-language bridge itself. A Lithuanian worker's phrase and a
 * Norwegian employer's phrase become comparable here — not by translating
 * either of them, but by both naming the same concept. The original words of
 * each side are never replaced; they are only explained.
 */
export async function escoConceptLabels(
  conceptId: string,
  conceptType: EscoConceptType,
  client?: SupabaseClient,
): Promise<EscoRead<EscoConceptLabels>> {
  const supabase = client ?? (await createClient());
  const { data, error } = await asAny(supabase)
    .from("esco_labels")
    .select("locale, label")
    .eq("concept_type", conceptType)
    .eq("concept_id", conceptId)
    .eq("label_type", "preferred");

  if (error) {
    if (isMissingTable(error)) return { status: "unavailable", reason: "not_imported" };
    return { status: "unavailable", reason: "error" };
  }
  const preferredByLocale: Record<string, string> = {};
  for (const row of (data ?? []) as Record<string, unknown>[]) {
    const locale = String(row.locale).trim();
    // First one wins: ESCO may carry more than one preferred row per locale,
    // and picking deterministically beats picking whichever arrived first.
    const label = String(row.label);
    if (!(locale in preferredByLocale) || label < preferredByLocale[locale]) {
      preferredByLocale[locale] = label;
    }
  }
  return { status: "ok", value: { conceptId, conceptType, preferredByLocale } };
}

/**
 * The occupations ESCO relates a skill to, with ITS OWN relation vocabulary.
 *
 * `essential` and `optional` are ESCO's words, carried through unchanged. The
 * caller is given the relation and left to decide; this function will not
 * collapse the two, because "a scaffolder essentially needs this" and "a
 * scaffolder may also do this" are different facts about the labour market.
 *
 * IT DOES NOT SAY THE PERSON IS THAT OCCUPATION. One skill in common is one
 * skill in common. A person is not an occupation, and the product must never
 * derive an identity from a single relation row.
 */
export async function occupationsForEscoSkill(
  skillId: string,
  client?: SupabaseClient,
): Promise<EscoRead<readonly EscoOccupationSkillLink[]>> {
  const supabase = client ?? (await createClient());
  const { data, error } = await asAny(supabase)
    .from("esco_occupation_skills")
    .select("occupation_id, skill_id, relation_type")
    .eq("skill_id", skillId)
    .limit(200);

  if (error) {
    if (isMissingTable(error)) return { status: "unavailable", reason: "not_imported" };
    return { status: "unavailable", reason: "error" };
  }
  return {
    status: "ok",
    value: ((data ?? []) as Record<string, unknown>[]).map((r) => ({
      occupationId: String(r.occupation_id),
      skillId: String(r.skill_id),
      relationType: String(r.relation_type) as EscoRelationType,
    })),
  };
}

/** The skills ESCO relates an occupation to. The mirror of the above. */
export async function skillsForEscoOccupation(
  occupationId: string,
  client?: SupabaseClient,
): Promise<EscoRead<readonly EscoOccupationSkillLink[]>> {
  const supabase = client ?? (await createClient());
  const { data, error } = await asAny(supabase)
    .from("esco_occupation_skills")
    .select("occupation_id, skill_id, relation_type")
    .eq("occupation_id", occupationId)
    .limit(200);

  if (error) {
    if (isMissingTable(error)) return { status: "unavailable", reason: "not_imported" };
    return { status: "unavailable", reason: "error" };
  }
  return {
    status: "ok",
    value: ((data ?? []) as Record<string, unknown>[]).map((r) => ({
      occupationId: String(r.occupation_id),
      skillId: String(r.skill_id),
      relationType: String(r.relation_type) as EscoRelationType,
    })),
  };
}

/**
 * The ISCO-08 group an ESCO occupation belongs to — the ONE key the Work
 * Journal's archetype model resolves on (`lib/journal/work-evidence-
 * archetypes.ts`). Every active occupation carries a 4-digit code (measured
 * 2026-09-11: 3,039 of 3,039). Unknown id → `null` value, never a guessed
 * family. Read-only; the caller's own client and RLS.
 */
export async function iscoGroupForEscoOccupation(
  occupationId: string,
  client?: SupabaseClient,
): Promise<EscoRead<string | null>> {
  const supabase = client ?? (await createClient());
  const { data, error } = await asAny(supabase)
    .from("esco_occupations")
    .select("isco_group")
    .eq("id", occupationId)
    .maybeSingle();

  if (error) {
    if (isMissingTable(error)) return { status: "unavailable", reason: "not_imported" };
    return { status: "unavailable", reason: "error" };
  }
  const code = (data as { isco_group?: string | null } | null)?.isco_group ?? null;
  return { status: "ok", value: typeof code === "string" && code.trim() ? code.trim() : null };
}
