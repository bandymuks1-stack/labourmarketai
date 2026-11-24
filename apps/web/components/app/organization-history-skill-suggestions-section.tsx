import { getTranslations } from "next-intl/server";

import { createClient } from "@/lib/supabase/server";
import { readSubjectCompetencySignals } from "@/lib/organization-evidence/competency-signals-read";
import type { EvidenceRecordView } from "@/lib/organization-evidence/import-core";
import {
  OrganizationHistorySkillSuggestions,
  type OrganizationHistorySkillSuggestion,
} from "@/components/app/organization-history-skill-suggestions";

/** Suggestions shown at once — the most-evidenced first; a long tail of
 *  weak readings is not a better list. */
const SUGGESTIONS_SHOWN = 8;

/**
 * Server half: the bounded signals read over the records the profile
 * already holds, dropping skills the person already declared and any slug
 * the catalogue has no name for in this locale (a raw slug never reaches
 * the person). Renders nothing when there is nothing to suggest — and
 * nothing on a failed read too: a suggestion list is an OFFER, and an
 * absent offer claims nothing about the person (unlike a history figure,
 * which must say when it could not be read).
 */
export async function OrganizationHistorySkillSuggestionsSection({
  records,
  declaredSlugs,
}: {
  records: readonly EvidenceRecordView[];
  declaredSlugs: readonly string[];
}) {
  const ids = records.filter((r) => !r.withdrawn).map((r) => r.id);
  if (ids.length === 0) return null;
  const supabase = await createClient();
  const read = await readSubjectCompetencySignals(supabase, ids);
  if (read.kind !== "ok" || read.signals.length === 0) return null;

  const tSkill = await getTranslations("skillNames");
  const declared = new Set(declaredSlugs);
  const suggestions: OrganizationHistorySkillSuggestion[] = [];
  for (const s of read.signals) {
    if (declared.has(s.slug) || !tSkill.has(s.slug as never)) continue;
    suggestions.push({
      slug: s.slug,
      name: tSkill(s.slug as never),
      terms: s.terms,
      records: s.records,
    });
    if (suggestions.length >= SUGGESTIONS_SHOWN) break;
  }
  if (suggestions.length === 0) return null;
  return <OrganizationHistorySkillSuggestions suggestions={suggestions} />;
}
