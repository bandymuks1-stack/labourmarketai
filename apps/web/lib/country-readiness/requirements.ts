/**
 * Country work-readiness — the REQUIREMENTS matrix (Stage 3, v1).
 *
 * Conservative by design. We encode the genuinely-official EU framework that
 * applies across the target markets (free movement of workers; the Posting of
 * Workers Directive 96/71/EC + enforcement 2014/67/EU; social-security
 * coordination / the A1 portable document) with `official` / `strong`
 * confidence and stable europa.eu sources. Everything country-SPECIFIC beyond
 * that framework (exact national notification portals, sector cards, tax /
 * social-security registration specifics, subcontractor chain-liability) is
 * marked `needs_legal_review` and points the user to the official national
 * site via the European Labour Authority hub — we never invent a specific
 * national requirement.
 *
 * Last reviewed against sources: 2026-06-13.
 */

import type {
  CountryReadiness,
  ReadinessCountry,
  ReadinessRequirement,
  ReadinessScope,
} from "./types";
import { READINESS_COUNTRIES } from "./types";
import { READINESS_SOURCES } from "./sources";

const REVIEWED = "2026-06-13";

type Req = Omit<ReadinessRequirement, "scope">;

// ── Shared EU-framework requirement builders ───────────────────────────────
// Each returns the requirement body (scope is attached per scope below).

const validIdDocument: Req = {
  key: "valid_id_document",
  documentTypeSlug: "id_document",
  level: "required",
  confidence: "official",
  riskLevel: "high",
  sourceId: "eu_your_europe_citizens",
  sourceUrl: READINESS_SOURCES.eu_your_europe_citizens.url,
  sourceTitle: READINESS_SOURCES.eu_your_europe_citizens.title,
  lastReviewedAt: REVIEWED,
  reviewedBySystem: true,
  explanationKey: "valid_id_document",
};

const rightToWorkEu: Req = {
  key: "right_to_work",
  documentTypeSlug: "residence_permit",
  level: "conditional",
  confidence: "official",
  riskLevel: "high",
  sourceId: "eu_your_europe_citizens",
  sourceUrl: READINESS_SOURCES.eu_your_europe_citizens.url,
  sourceTitle: READINESS_SOURCES.eu_your_europe_citizens.title,
  lastReviewedAt: REVIEWED,
  reviewedBySystem: true,
  explanationKey: "right_to_work",
  applicabilityNote:
    "EU/EEA citizens may work without a work permit. Non-EU/EEA nationals need a work and/or residence permit — confirm with the national authority.",
};

const a1Certificate: Req = {
  key: "a1_certificate",
  documentTypeSlug: "a1_certificate",
  level: "required",
  confidence: "official",
  riskLevel: "high",
  sourceId: "eu_social_security_a1",
  sourceUrl: READINESS_SOURCES.eu_social_security_a1.url,
  sourceTitle: READINESS_SOURCES.eu_social_security_a1.title,
  lastReviewedAt: REVIEWED,
  reviewedBySystem: true,
  explanationKey: "a1_certificate",
  applicabilityNote:
    "For posted workers staying insured in their home country, the A1 portable document proves the applicable social-security legislation.",
};

const priorPostingNotification: Req = {
  key: "prior_posting_notification",
  documentTypeSlug: "posting_notification",
  level: "required",
  confidence: "official",
  riskLevel: "high",
  sourceId: "eu_your_europe_business",
  sourceUrl: READINESS_SOURCES.eu_your_europe_business.url,
  sourceTitle: READINESS_SOURCES.eu_your_europe_business.title,
  lastReviewedAt: REVIEWED,
  reviewedBySystem: true,
  explanationKey: "prior_posting_notification",
  applicabilityNote:
    "Most host countries require a prior declaration/notification before posting starts. The exact portal is national — see the country link.",
};

const employmentContract: Req = {
  key: "employment_contract",
  documentTypeSlug: "employment_contract",
  level: "recommended",
  confidence: "strong",
  riskLevel: "medium",
  sourceId: "eu_your_europe_business",
  sourceUrl: READINESS_SOURCES.eu_your_europe_business.url,
  sourceTitle: READINESS_SOURCES.eu_your_europe_business.title,
  lastReviewedAt: REVIEWED,
  reviewedBySystem: true,
  explanationKey: "employment_contract",
};

const hostMinimumConditions: Req = {
  key: "host_minimum_conditions",
  documentTypeSlug: null,
  level: "conditional",
  confidence: "needs_legal_review",
  riskLevel: "medium",
  sourceId: "eu_your_europe_business",
  sourceUrl: READINESS_SOURCES.eu_your_europe_business.url,
  sourceTitle: READINESS_SOURCES.eu_your_europe_business.title,
  lastReviewedAt: REVIEWED,
  reviewedBySystem: true,
  explanationKey: "host_minimum_conditions",
  applicabilityNote:
    "The host country's minimum pay and core working conditions apply to posted workers; exact rates/rules are national — confirm before starting.",
};

const postedWorkerPackage: Req = {
  key: "posted_worker_package",
  documentTypeSlug: "posted_worker_package",
  level: "required",
  confidence: "strong",
  riskLevel: "high",
  sourceId: "eu_posting_ela",
  sourceUrl: READINESS_SOURCES.eu_posting_ela.url,
  sourceTitle: READINESS_SOURCES.eu_posting_ela.title,
  lastReviewedAt: REVIEWED,
  reviewedBySystem: true,
  explanationKey: "posted_worker_package",
  applicabilityNote:
    "For a team, each posted worker typically needs their own A1 + notification + contract documentation.",
};

const subcontractorLiability: Req = {
  key: "subcontractor_liability",
  documentTypeSlug: null,
  level: "conditional",
  confidence: "needs_legal_review",
  riskLevel: "medium",
  sourceId: "eu_posting_ela",
  sourceUrl: READINESS_SOURCES.eu_posting_ela.url,
  sourceTitle: READINESS_SOURCES.eu_posting_ela.title,
  lastReviewedAt: REVIEWED,
  reviewedBySystem: true,
  explanationKey: "subcontractor_liability",
  applicabilityNote:
    "Chain/subcontractor liability rules vary by country — confirm the host country's rules with a legal advisor.",
};

const companyPostingRegistration: Req = {
  key: "company_posting_registration",
  documentTypeSlug: "posting_notification",
  level: "required",
  confidence: "official",
  riskLevel: "high",
  sourceId: "eu_your_europe_business",
  sourceUrl: READINESS_SOURCES.eu_your_europe_business.url,
  sourceTitle: READINESS_SOURCES.eu_your_europe_business.title,
  lastReviewedAt: REVIEWED,
  reviewedBySystem: true,
  explanationKey: "company_posting_registration",
};

const companyTaxVat: Req = {
  key: "company_tax_vat",
  documentTypeSlug: "tax_registration",
  level: "conditional",
  confidence: "needs_legal_review",
  riskLevel: "medium",
  sourceId: "eu_your_europe_business",
  sourceUrl: READINESS_SOURCES.eu_your_europe_business.url,
  sourceTitle: READINESS_SOURCES.eu_your_europe_business.title,
  lastReviewedAt: REVIEWED,
  reviewedBySystem: true,
  explanationKey: "company_tax_vat",
  applicabilityNote:
    "VAT / tax / social-security registration obligations depend on the activity and country — confirm with an accountant or the tax authority.",
};

// A per-country pointer for the specifics we deliberately do NOT assert.
function nationalSpecifics(scope: ReadinessScope): ReadinessRequirement {
  return {
    key: "national_specifics",
    documentTypeSlug: null,
    scope,
    level: "conditional",
    confidence: "needs_legal_review",
    riskLevel: "medium",
    sourceId: "eu_posting_ela",
    sourceUrl: READINESS_SOURCES.eu_posting_ela.url,
    sourceTitle: READINESS_SOURCES.eu_posting_ela.title,
    lastReviewedAt: REVIEWED,
    reviewedBySystem: true,
    explanationKey: "national_specifics",
    applicabilityNote:
      "Country-specific documents (e.g. construction/ID cards, sector registration, local tax/social-security steps) must be confirmed on the official national site.",
  };
}

function withScope(scope: ReadinessScope, ...reqs: Req[]): ReadinessRequirement[] {
  return reqs.map((r) => ({ ...r, scope }));
}

/** The EU-framework matrix applied to every target country. */
function buildRequirements(): ReadinessRequirement[] {
  return [
    ...withScope("worker_solo", validIdDocument, rightToWorkEu),
    nationalSpecifics("worker_solo"),
    ...withScope(
      "worker_posted",
      validIdDocument,
      a1Certificate,
      priorPostingNotification,
      employmentContract,
      hostMinimumConditions,
    ),
    nationalSpecifics("worker_posted"),
    ...withScope(
      "team_subcontracting",
      postedWorkerPackage,
      priorPostingNotification,
      a1Certificate,
      subcontractorLiability,
    ),
    nationalSpecifics("team_subcontracting"),
    ...withScope(
      "company_hiring",
      companyPostingRegistration,
      companyTaxVat,
      hostMinimumConditions,
    ),
    nationalSpecifics("company_hiring"),
  ];
}

/**
 * Official national posting-info entry points (the ELA hub links each of these
 * country pages). Where we are not certain of a stable national URL we leave
 * null and the UI falls back to the ELA hub — never a guessed link.
 */
const NATIONAL_POSTING_INFO: Record<ReadinessCountry, string | null> = {
  LT: "https://www.ela.europa.eu/en/posting-workers",
  LV: "https://www.ela.europa.eu/en/posting-workers",
  EE: "https://www.ela.europa.eu/en/posting-workers",
  PL: "https://www.ela.europa.eu/en/posting-workers",
  DE: "https://www.ela.europa.eu/en/posting-workers",
  NL: "https://www.ela.europa.eu/en/posting-workers",
  DK: "https://www.ela.europa.eu/en/posting-workers",
  NO: "https://www.ela.europa.eu/en/posting-workers",
  SE: "https://www.ela.europa.eu/en/posting-workers",
  FI: "https://www.ela.europa.eu/en/posting-workers",
};

export const COUNTRY_READINESS: Readonly<Record<ReadinessCountry, CountryReadiness>> =
  Object.fromEntries(
    READINESS_COUNTRIES.map((country) => [
      country,
      {
        country,
        nationalPostingInfoUrl: NATIONAL_POSTING_INFO[country],
        requirements: buildRequirements(),
      } satisfies CountryReadiness,
    ]),
  ) as unknown as Record<ReadinessCountry, CountryReadiness>;
