/**
 * Country work-readiness — public API (Stage 3).
 *
 * The ONLY module other features import from. Exposes the matrix, lookups, and
 * a provenance validator used by the guard. Pure; no IO.
 */

import { COUNTRY_READINESS } from "./requirements";
import { READINESS_SOURCES, isKnownReadinessSource } from "./sources";
import {
  READINESS_COUNTRIES,
  READINESS_SCOPES,
  type CountryReadiness,
  type ReadinessConfidence,
  type ReadinessCountry,
  type ReadinessRequirement,
  type ReadinessScope,
} from "./types";

export * from "./types";
export { READINESS_SOURCES, getReadinessSource } from "./sources";
export { COUNTRY_READINESS } from "./requirements";

export function isReadinessCountry(code: string): code is ReadinessCountry {
  return (READINESS_COUNTRIES as readonly string[]).includes(code);
}

export function getCountryReadiness(
  country: ReadinessCountry,
): CountryReadiness {
  return COUNTRY_READINESS[country];
}

/**
 * Global-safe lookup (PR-G): accepts ANY ISO country code and returns null
 * where no researched readiness content exists (e.g. GE, US today). Callers
 * must render null as an honest "no researched guidance yet" state — never
 * fall back to another country's data and never invent content.
 */
export function getCountryReadinessOrNull(
  country: string,
): CountryReadiness | null {
  return isReadinessCountry(country) ? COUNTRY_READINESS[country] : null;
}

/** Requirements for a country narrowed to one scope. */
export function getRequirements(
  country: ReadinessCountry,
  scope: ReadinessScope,
): ReadinessRequirement[] {
  return COUNTRY_READINESS[country].requirements.filter((r) => r.scope === scope);
}

/** Distinct document-type slugs a worker would need for a country+scope. */
export function requiredDocumentSlugs(
  country: ReadinessCountry,
  scope: ReadinessScope,
): string[] {
  const slugs = new Set<string>();
  for (const r of getRequirements(country, scope)) {
    if (r.level === "required" && r.documentTypeSlug) slugs.add(r.documentTypeSlug);
  }
  return [...slugs];
}

/** True if any requirement for the country+scope still needs legal review. */
export function hasUnreviewedRequirements(
  country: ReadinessCountry,
  scope: ReadinessScope,
): boolean {
  return getRequirements(country, scope).some(
    (r) => r.confidence === "needs_legal_review",
  );
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const CONFIDENCES: readonly ReadinessConfidence[] = [
  "official",
  "strong",
  "needs_legal_review",
];

export interface ProvenanceProblem {
  country: ReadinessCountry;
  scope: ReadinessScope;
  requirementKey: string;
  problem: string;
}

/**
 * Validates the whole matrix. Returns [] when clean. The guard test asserts
 * this is empty so no readiness statement can ship without a real official
 * source + review date + a valid confidence.
 */
export function findReadinessProvenanceProblems(): ProvenanceProblem[] {
  const problems: ProvenanceProblem[] = [];
  const push = (
    c: ReadinessCountry,
    s: ReadinessScope,
    k: string,
    problem: string,
  ) => problems.push({ country: c, scope: s, requirementKey: k, problem });

  for (const country of READINESS_COUNTRIES) {
    const cr = COUNTRY_READINESS[country];
    // Every scope must be represented.
    for (const scope of READINESS_SCOPES) {
      if (!cr.requirements.some((r) => r.scope === scope)) {
        push(country, scope, "(scope)", "scope has no requirements");
      }
    }
    for (const r of cr.requirements) {
      const at = (p: string) => push(country, r.scope, r.key, p);
      if (!r.key) at("missing key");
      if (!isKnownReadinessSource(r.sourceId)) at(`unknown sourceId ${r.sourceId}`);
      if (!r.sourceUrl || !r.sourceUrl.startsWith("https://"))
        at("sourceUrl must be an https URL");
      if (!r.sourceTitle) at("missing sourceTitle");
      if (!ISO_DATE.test(r.lastReviewedAt)) at("lastReviewedAt must be ISO date");
      if (r.reviewedBySystem !== true) at("reviewedBySystem must be true");
      if (!CONFIDENCES.includes(r.confidence)) at(`invalid confidence ${r.confidence}`);
      if (!r.explanationKey) at("missing explanationKey");
      // The source URL must match the registry entry for that id (no drift).
      const registry = isKnownReadinessSource(r.sourceId)
        ? READINESS_SOURCES[r.sourceId]
        : null;
      if (registry && r.sourceUrl !== registry.url)
        at("sourceUrl does not match its registry source");
    }
  }
  return problems;
}
