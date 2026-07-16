/**
 * Canonical customer_requests row → MatchNeed builder (Wagon 4 extraction).
 *
 * ONE derivation path for every matching surface (company scouting AND the
 * admin workbench): the requirement set comes from deriveNeedSkills (human
 * slugs > bridged ESCO > offline text recognition > profession expansion) and
 * the typed structured_v2 cluster rides along for the contract-v2 criteria.
 * Extracted verbatim from lib/scouting/scouting.ts so the admin workbench
 * could consolidate onto the canonical engine WITHOUT growing a second
 * need-assembly path.
 *
 * Pure: no DB, no fetch — callers pass the row fields and the (optional)
 * curated esco_uri→slug bridge.
 */

import { readStructuredDemandV2 } from "@/lib/demand/structured-demand-v2";
import { deriveNeedSkills, type NeedSkillSource } from "@/lib/market/need-skills";
import type { MatchNeed } from "@/lib/market/match-v1";

export interface NeedSourceRow {
  readonly title: string | null;
  readonly need_summary: string | null;
  readonly role_or_work_type: string | null;
  readonly notes: string | null;
  readonly country: string | null;
  readonly location: string | null;
  readonly language_requirement: string | null;
  readonly payload: unknown;
}

/** Canonical demand → MatchNeed. The requirement set comes from
 *  deriveNeedSkills — one contract, no second matching input path. */
export function buildNeedFromRequestRow(
  row: NeedSourceRow,
  escoUriToSlug: ReadonlyMap<string, string>,
): { need: MatchNeed; source: NeedSkillSource | null } {
  const derived = deriveNeedSkills({
    title: row.title,
    needSummary: row.need_summary,
    roleOrWorkType: row.role_or_work_type,
    notes: row.notes,
    payload: row.payload,
    escoUriToSlug,
  });
  const languages = (row.language_requirement ?? "")
    .split(/[,;/]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return {
    need: {
      skillIds: derived.skillSlugs,
      // Unbridged human-picked ESCO URIs stay in the need so a legacy
      // URI-keyed subject skill can still match them (never dropped).
      escoSkillUris: derived.escoUnmappedUris,
      needSource: derived.source,
      professionSlug: derived.professionSlug,
      country: row.country,
      city: row.location,
      languages: languages.length > 0 ? languages : undefined,
      // Contract v2: the demand's typed structured_v2 cluster feeds the
      // compensation / start-date / engagement-form / licence criteria. Old
      // records without it stay on the exact pre-v2 checks (honest null).
      structuredV2: readStructuredDemandV2(row.payload),
    },
    source: derived.source,
  };
}
