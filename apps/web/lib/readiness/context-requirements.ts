/**
 * Requirement SET for a context, derived from data that already exists:
 * the curated country-readiness matrix (jurisdiction + scope). Nothing is a
 * universal list. Where the matrix has no researched content for the
 * country/scope the answer is `null` - "not known" - and callers must render
 * `unknown`, never `missing` or "nothing required".
 */
import {
  matrixRequirementRows,
  unmatchableRequirementRows,
} from "@/lib/country-readiness/requirement-rows";
import type { ReadinessScope } from "@/lib/country-readiness";
import type { ReadinessRequirement, ReadinessStage } from "./readiness-model";

/**
 * The stage at which a requirement TYPE genuinely applies. Classification, not
 * a requirement list: an unlisted type defaults to `mobilisation` (before the
 * person travels/starts), the latest stage that is still a real pre-start check.
 */
const STAGE_BY_TYPE: Readonly<Record<string, ReadinessStage>> = {
  id_document: "contract",
  employment_contract: "contract",
  residence_permit: "contract",
  a1_certificate: "mobilisation",
  posted_worker_package: "mobilisation",
  posting_notification: "mobilisation",
  prior_posting_notification: "mobilisation",
  professional_certificate: "work_start",
  health_safety_card: "work_start",
};

export function stageForRequirementType(type: string): ReadinessStage {
  return STAGE_BY_TYPE[type] ?? "mobilisation";
}

/**
 * Scope from jurisdiction facts: same country as the work -> local hire;
 * a different country -> posted. Either side unstated -> null (not derivable).
 */
export function readinessScopeFor(
  workCountry: string | null | undefined,
  personCountry: string | null | undefined,
): ReadinessScope | null {
  const w = (workCountry ?? "").trim().toUpperCase();
  const p = (personCountry ?? "").trim().toUpperCase();
  if (!w || !p) return null;
  return w === p ? "worker_solo" : "worker_posted";
}

export function requirementsForContext(args: {
  readonly workCountry: string | null | undefined;
  readonly personCountry: string | null | undefined;
}): ReadinessRequirement[] | null {
  const scope = readinessScopeFor(args.workCountry, args.personCountry);
  const country = (args.workCountry ?? "").trim().toUpperCase();
  if (!scope || !country) return null;
  const context = { country, scope };
  const rows: ReadinessRequirement[] = matrixRequirementRows(country, scope).map((m) => ({
    requirementType: m.documentTypeSlug,
    level: m.requirementLevel,
    stage: stageForRequirementType(m.documentTypeSlug),
    context,
    provenance: "country_matrix",
    sourceUrl: m.sourceUrl,
  }));
  const unmatchable: ReadinessRequirement[] = unmatchableRequirementRows(country, scope).map((m) => ({
    requirementType: m.requirementKey,
    level: m.requirementLevel,
    stage: "mobilisation",
    context,
    provenance: "country_matrix",
    sourceUrl: m.sourceUrl,
    notMachineCheckable: true,
  }));
  const all = [...rows, ...unmatchable];
  return all.length > 0 ? all : null;
}
