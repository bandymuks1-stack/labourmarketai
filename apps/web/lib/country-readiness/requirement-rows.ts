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
