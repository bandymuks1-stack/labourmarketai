/**
 * Country work-readiness — types (pre-payment readiness sprint, Stage 3).
 *
 * The canonical, version-controlled, guard-enforced source of truth for "which
 * documents / steps are likely required for legal work in a target country".
 * Lives in the app layer (like lib/labour-market/evidence.ts), NOT seeded into
 * the DB — the DB `country_document_requirements` table stays the admin runtime
 * override surface. Pure data + types, no IO: safe in client and server bundles.
 *
 * HARD honesty rules (enforced by lib/guards/country-readiness-provenance.test.ts):
 *   - every requirement carries a real official `sourceUrl` + `sourceTitle`;
 *   - every requirement carries `lastReviewedAt` (ISO date) and
 *     `reviewedBySystem = true`;
 *   - `confidence` is one of official | strong | needs_legal_review;
 *   - anything not 100% certain is `needs_legal_review` — never presented as
 *     final;
 *   - NOTHING here is legal advice or a guarantee of legal work (see §6 of
 *     docs/product/pre-payment-product-readiness.md). The worker/company is
 *     always directed to confirm with the competent authority.
 */

/** Target markets for country readiness v1. */
export type ReadinessCountry =
  | "LT" | "LV" | "EE" | "PL" | "DE" | "NL" | "DK" | "NO" | "SE" | "FI";

export const READINESS_COUNTRIES: readonly ReadinessCountry[] = [
  "LT", "LV", "EE", "PL", "DE", "NL", "DK", "NO", "SE", "FI",
] as const;

/**
 * The four readiness scopes the matrix must cover:
 *  - worker_solo            — an individual working in their own country / as a
 *                             local hire in the target country;
 *  - worker_posted          — a worker POSTED from another EU/EEA country to the
 *                             target country (Posting of Workers Directive);
 *  - team_subcontracting    — a team / subcontractor placed cross-border;
 *  - company_hiring          — a company / agency hiring or placing workers in
 *                             the target country.
 */
export type ReadinessScope =
  | "worker_solo"
  | "worker_posted"
  | "team_subcontracting"
  | "company_hiring";

export const READINESS_SCOPES: readonly ReadinessScope[] = [
  "worker_solo", "worker_posted", "team_subcontracting", "company_hiring",
] as const;

/** How strongly we can stand behind a requirement statement. */
export type ReadinessConfidence = "official" | "strong" | "needs_legal_review";

/** Whether the item is a hard requirement, a recommendation, or conditional. */
export type RequirementLevel = "required" | "recommended" | "conditional";

/** Coarse risk if the item is ignored (for honest UI emphasis, not legal force). */
export type RiskLevel = "high" | "medium" | "low";

/** A source in the official-source registry (see ./sources.ts). */
export type ReadinessSourceId =
  | "eu_your_europe_citizens"
  | "eu_your_europe_business"
  | "eu_posting_ela"
  | "eu_social_security_a1"
  | "eu_eures";

export interface ReadinessSource {
  readonly id: ReadinessSourceId;
  readonly title: string;
  readonly publisher: string;
  /** Canonical official landing URL. https only. */
  readonly url: string;
}

/** One requirement statement in the matrix. */
export interface ReadinessRequirement {
  /** Stable key, e.g. "a1_certificate", "prior_posting_notification". */
  readonly key: string;
  /** Optional link to a document_types.slug so worker docs can be matched. */
  readonly documentTypeSlug: string | null;
  readonly scope: ReadinessScope;
  readonly level: RequirementLevel;
  readonly confidence: ReadinessConfidence;
  readonly riskLevel: RiskLevel;
  /** Source registry id + the exact official page backing this statement. */
  readonly sourceId: ReadinessSourceId;
  readonly sourceUrl: string;
  readonly sourceTitle: string;
  /** ISO YYYY-MM-DD the statement was last reviewed against the source. */
  readonly lastReviewedAt: string;
  /** Always true — this content is system-curated, never user-authored. */
  readonly reviewedBySystem: true;
  /** i18n key suffix for the human explanation (namespace countryReadiness). */
  readonly explanationKey: string;
  /** Optional note on when/whom the requirement applies to. */
  readonly applicabilityNote?: string;
}

/** All requirements for one country (across all scopes). */
export interface CountryReadiness {
  readonly country: ReadinessCountry;
  /** The country's own official posting / labour authority page, if known. */
  readonly nationalPostingInfoUrl: string | null;
  readonly requirements: readonly ReadinessRequirement[];
}
