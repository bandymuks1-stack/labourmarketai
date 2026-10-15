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
/** Indexed prefix search (migration 20261015120000). */
export const SEARCH_RPC = "search_esco_labels_v1";
/** The function is not there yet (unapplied environment). */
export function isMissingSearchRpc(code: string | undefined): boolean {
  return code === "PGRST202" || code === "42883";
}
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
  // FAST PATH (production 2026-10-15): `search_esco_labels_v1` matches the
  // prefix as the range esco_labels_typeahead_idx (locale, lower(label))
  // serves — 0.26 ms instead of 1.3–1.9 s per keystroke for a signed-in
  // person. A filter on esco_labels itself cannot use that index: the table's
  // RLS policies are a security barrier, and lower()/LIKE/ILIKE are not
  // leakproof, so they run as a filter over every label of the locale. The
  // function applies the same visibility the policy does. The raw prefix is
  // passed (no LIKE escaping: the function does not use LIKE).
  const fast = await asAny(supabase).rpc(SEARCH_RPC, {
    p_locale: locale,
    p_concept_type: conceptType,
    p_prefix: q,
    p_limit: MAX_RESULTS,
  });
  // The ILIKE query is the same answer for an environment where the
  // function is not applied yet — slower, never different.
  const { data, error } = fast.error && isMissingSearchRpc(fast.error.code)
    ? await asAny(supabase)
        .from("esco_labels")
        .select("concept_id, concept_type, label")
        .eq("locale", locale)
        .eq("concept_type", conceptType)
        .ilike("label", `${escapeLike(q)}%`)
        .order("label", { ascending: true })
        .limit(MAX_RESULTS)
    : fast;
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
