/**
 * Service / pricing model (Staffing Operating Model v1, PR11).
 *
 * The HONEST staffing service model — not an abstract SaaS price grid. Worker
 * acquisition is free (the top of the funnel); value is captured on the employer
 * / agency side. Because no prices are confirmed and live payments are OFF this
 * sprint, every paid tier surfaces as **"Pilot access / request a quote"** — there
 * are NO fake prices, no numbers, no currency. A future, owner-gated pricing slice
 * fills real amounts behind the billing test-mode foundation.
 *
 * Pure. No IO.
 */

export type ServiceAudience = "worker" | "company" | "agency";

/**
 * How a tier is presented today. Deliberately NOT a number — until prices are
 * confirmed and live payments are enabled (a separate sprint), paid tiers are
 * quote/pilot only.
 */
export type ServicePriceState = "free" | "pilot_access" | "request_quote";

export interface ServiceTier {
  readonly key: string;
  readonly audience: ServiceAudience;
  readonly title: string;
  readonly summary: string;
  readonly priceState: ServicePriceState;
  /** The honest call-to-action label — never a fake price. */
  readonly cta: string;
}

/** Worker side — free; value is not captured here. */
const WORKER_TIERS: ServiceTier[] = [
  {
    key: "worker_passport_free",
    audience: "worker",
    title: "Worker profile & passport",
    summary:
      "Create your profile, add your trade, availability, documents and country readiness — free.",
    priceState: "free",
    cta: "Create worker profile",
  },
  {
    key: "worker_plus_future",
    audience: "worker",
    title: "Worker Plus (later)",
    summary: "Optional enhanced visibility for workers — not enabled yet.",
    priceState: "request_quote",
    cta: "Not available yet",
  },
];

/** Company side — where value is captured (all quote/pilot until prices confirmed). */
const COMPANY_TIERS: ServiceTier[] = [
  {
    key: "company_pilot_access",
    audience: "company",
    title: "Pilot access",
    summary: "Post needs, see matched candidates, run the staffing flow during the pilot.",
    priceState: "pilot_access",
    cta: "Request pilot access",
  },
  {
    key: "pay_per_connection",
    audience: "company",
    title: "Pay per successful connection",
    summary: "Pay when a candidate connection succeeds — pricing on request.",
    priceState: "request_quote",
    cta: "Request a quote",
  },
  {
    key: "pay_per_active_booking",
    audience: "company",
    title: "Pay per active booking",
    summary: "Pay per active booking — pricing on request.",
    priceState: "request_quote",
    cta: "Request a quote",
  },
  {
    key: "monthly_company_access",
    audience: "company",
    title: "Monthly company access",
    summary: "Ongoing access to the candidate pool and matching — pricing on request.",
    priceState: "request_quote",
    cta: "Request a quote",
  },
  {
    key: "recruitment_service_fee",
    audience: "company",
    title: "Recruitment service",
    summary: "Hands-on recruitment service — scoped and quoted per engagement.",
    priceState: "request_quote",
    cta: "Request a quote",
  },
];

/** Agency side — pool management + multi-client. */
const AGENCY_TIERS: ServiceTier[] = [
  {
    key: "agency_pool_management",
    audience: "agency",
    title: "Worker pool management",
    summary:
      "Manage your worker pool, multi-client needs, team matching and document/readiness tracking.",
    priceState: "request_quote",
    cta: "Request a quote",
  },
];

export const SERVICE_TIERS: readonly ServiceTier[] = [
  ...WORKER_TIERS,
  ...COMPANY_TIERS,
  ...AGENCY_TIERS,
];

export function tiersForAudience(audience: ServiceAudience): ServiceTier[] {
  return SERVICE_TIERS.filter((t) => t.audience === audience);
}

/** True when no tier carries a fabricated price (the honesty invariant). */
export function hasNoFakePrice(): boolean {
  const PRICE = /(€|\$|£|\beur\b|\busd\b|\d+\s*(\/|per)\s*(hour|month|week)|\b\d+[.,]\d{2}\b)/i;
  return !SERVICE_TIERS.some((t) => PRICE.test(t.title) || PRICE.test(t.summary) || PRICE.test(t.cta));
}
