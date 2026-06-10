import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { ESCO_AUTOCOMPLETE_ENABLED } from "@/lib/config/esco";

/**
 * Deterministic ESCO typeahead (Etapas 1D — design doc §5). NO LLM, NO
 * ranking model: a prefix match on esco_labels in the viewer's locale,
 * alphabetical, limit 10. The human picks; the pick is Level 0 self-declared
 * input — recognition NEVER raises a verification level (design doc §1).
 *
 * Degrades honestly: flag off OR tables absent (42P01 — draft migrations not
 * applied yet) → empty list, never an error surface.
 */

const RELATION_NOT_FOUND_CODE = "42P01";
const MAX_RESULTS = 10;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(supabase: SupabaseClient): any {
  return supabase;
}

export interface EscoSuggestion {
  /** Canonical ESCO concept id (esco_occupations.id / esco_skills.id). */
  readonly conceptId: string;
  readonly conceptType: "occupation" | "skill";
  /** The label in the viewer's locale — the human's words stay theirs. */
  readonly label: string;
}

export async function searchEscoLabels(
  query: string,
  locale: string,
  conceptType: "occupation" | "skill",
): Promise<readonly EscoSuggestion[]> {
  if (!ESCO_AUTOCOMPLETE_ENABLED) return [];
  const q = query.trim();
  if (q.length < 2) return [];

  const supabase = await createClient();
  const { data, error } = await asAny(supabase)
    .from("esco_labels")
    .select("concept_id, concept_type, label")
    .eq("locale", locale)
    .eq("concept_type", conceptType)
    .ilike("label", `${escapeLike(q)}%`)
    .order("label", { ascending: true })
    .limit(MAX_RESULTS);
  if (error) {
    if (error.code === RELATION_NOT_FOUND_CODE) return [];
    return [];
  }
  const seen = new Set<string>();
  const out: EscoSuggestion[] = [];
  for (const r of (data ?? []) as {
    concept_id: string;
    concept_type: "occupation" | "skill";
    label: string;
  }[]) {
    if (seen.has(r.concept_id)) continue;
    seen.add(r.concept_id);
    out.push({ conceptId: r.concept_id, conceptType: r.concept_type, label: r.label });
  }
  return out;
}

function escapeLike(s: string): string {
  return s.replace(/[%_\\]/g, (m) => `\\${m}`);
}
