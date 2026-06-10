"use server";

import {
  searchEscoLabels,
  type EscoSuggestion,
} from "@/lib/taxonomy/esco-autocomplete";

/** Server action wrapper for the deterministic ESCO typeahead. Tagged result,
 *  never throws; empty list when the flag is off or tables are absent. */
export async function searchEscoLabelsAction(input: {
  query: string;
  locale: string;
  conceptType: "occupation" | "skill";
}): Promise<{ ok: true; suggestions: readonly EscoSuggestion[] }> {
  const suggestions = await searchEscoLabels(
    String(input.query ?? ""),
    String(input.locale ?? "en"),
    input.conceptType === "occupation" ? "occupation" : "skill",
  );
  return { ok: true, suggestions };
}
