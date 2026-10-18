/**
 * Bridge: country-readiness matrix → the RequirementRow shape consumed by the
 * live documents flow (lib/documents/readiness.ts). This is what turns the
 * worker's per-country checklist from "not yet curated" (empty DB table) into a
 * real, sourced checklist NOW, without waiting for an admin to seed the DB.
 *
 * Pure. No IO. The DB `country_document_requirements` table remains the admin
 * OVERRIDE surface; app callers merge matrix rows with any DB rows.
 */

import {
  getRequirements,
  isReadinessCountry,
  type ReadinessConfidence,
  type ReadinessScope,
} from "./index";

/** The (extended) row shape — superset of documents/readiness RequirementRow. */
export interface MatrixRequirementRow {
  readonly country: string;
  readonly documentTypeSlug: string;
  readonly requirementLevel: "required" | "recommended" | "conditional";
  readonly conditionNote: string | null;
  readonly sourceStatus: "needs_legal_source" | "sourced" | "reviewed";
  readonly sourceUrl: string;
  readonly sourceTitle: string;
  readonly confidence: ReadinessConfidence;
  readonly lastReviewedAt: string;
  readonly requirementKey: string;
}

/** Confidence → the existing 3-state source status used by the documents UI. */
function confidenceToSourceStatus(
  c: ReadinessConfidence,
): MatrixRequirementRow["sourceStatus"] {
  switch (c) {
    case "official":
      return "reviewed";
    case "strong":
      return "sourced";
    case "needs_legal_review":
    default:
      return "needs_legal_source";
  }
}

/**
 * Requirement rows for a country+scope, derived from the matrix. Only items
 * with a real document type become checklist rows (a "national_specifics"
 * pointer has no documentTypeSlug and is surfaced separately by the UI).
 */
/**
 * The requirements `matrixRequirementRows` DROPS, and why they must be shown.
 *
 * `matrixRequirementRows` filters to `documentTypeSlug !== null`, because the
 * documents pipeline is keyed on a document type and cannot join anything
 * else. That filter is correct for that pipeline and wrong as a description
 * of the law: on the curated set, THREE of eleven requirement archetypes
 * carry no document slug — `host_minimum_conditions`,
 * `subcontractor_liability` and `national_specifics` — and they vanished
 * from every surface. A worker read their readiness and saw no trace of a
 * requirement that genuinely applies to them.
 *
 * That is SEP-7 on a live surface: "we cannot machine-check this" was being
 * rendered as "this does not exist". The honest answer is UNKNOWN — the
 * requirement is real, sourced and applicable, and the platform simply has
 * nothing to check it against.
 *
 * Deliberately a SEPARATE read rather than a widened `MatrixRequirementRow`:
 * the document-keyed contract has four consumers and a non-null slug in its
 * type, and loosening that to carry rows no consumer can join would push the
 * same silent drop one layer down. These rows are for DISPLAY, and they carry
 * their source so the person can go and check with the authority themselves.
 */
export interface UnmatchableRequirementRow {
  readonly country: string;
  readonly requirementKey: string;
  readonly requirementLevel: "required" | "recommended" | "conditional";
  readonly conditionNote: string | null;
  readonly sourceStatus: "needs_legal_source" | "sourced" | "reviewed";
  readonly sourceUrl: string;
  readonly sourceTitle: string;
  readonly confidence: ReadinessConfidence;
  readonly lastReviewedAt: string;
  /** i18n key suffix for the human explanation (namespace countryReadiness). */
  readonly explanationKey: string;
}

/** The sourced requirements that exist and cannot be checked from documents. */
export function unmatchableRequirementRows(
  country: string,
  scope: ReadinessScope,
): UnmatchableRequirementRow[] {
  if (!isReadinessCountry(country)) return [];
  return getRequirements(country, scope)
    .filter((r) => r.documentTypeSlug === null)
    .map((r) => ({
      country,
      requirementKey: r.key,
      requirementLevel: r.level,
      conditionNote: r.applicabilityNote ?? null,
      sourceStatus: confidenceToSourceStatus(r.confidence),
      sourceUrl: r.sourceUrl,
      sourceTitle: r.sourceTitle,
      confidence: r.confidence,
      lastReviewedAt: r.lastReviewedAt,
      explanationKey: r.explanationKey,
    }));
}

export function matrixRequirementRows(
  country: string,
  scope: ReadinessScope,
): MatrixRequirementRow[] {
  if (!isReadinessCountry(country)) return [];
  return getRequirements(country, scope)
    .filter((r) => r.documentTypeSlug !== null)
    .map((r) => ({
      country,
      documentTypeSlug: r.documentTypeSlug as string,
      requirementLevel: r.level,
      conditionNote: r.applicabilityNote ?? null,
      sourceStatus: confidenceToSourceStatus(r.confidence),
      sourceUrl: r.sourceUrl,
      sourceTitle: r.sourceTitle,
      confidence: r.confidence,
      lastReviewedAt: r.lastReviewedAt,
      requirementKey: r.key,
    }));
}
