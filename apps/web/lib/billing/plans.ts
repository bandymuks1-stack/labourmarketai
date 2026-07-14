/**
 * Pre-payment PLAN BOUNDARY — source of truth (Stage 8).
 *
 * Describes what each plan WILL include when payments are later switched on.
 * This sprint connects NO Stripe and collects NO money: every paid plan is in
 * a `payment_not_enabled` state and access is granted MANUALLY by an admin
 * (pilot access). The catalogue is the contract the later Stripe sprint wires.
 *
 * Honesty (guarded by lib/guards/no-live-payments.test.ts):
 *   - PAYMENTS_ENABLED is false; nothing here implies an active subscription;
 *   - no plan auto-grants itself — `accessState` is explicit;
 *   - feature entitlements are limits/booleans only, never a charge.
 *
 * Pure data + types. No IO.
 */

/** Global kill-switch. Stays false for the entire pre-payment sprint. */
export const PAYMENTS_ENABLED = false as const;

export type PlanAudience = "worker" | "company" | "agency" | "admin";

/** How a user obtains the plan today (no checkout exists). */
export type PlanAccessState =
  | "free" // always available, no payment
  | "payment_not_enabled" // a future paid tier; today only manual pilot access
  | "internal"; // staff only

/** The CTA a premium surface should render today. */
export type PlanCta = "use" | "request_pilot_access" | "contact";

/** Feature entitlement: a boolean capability or a numeric limit (null = none). */
export type Entitlement = boolean | number;

export type FeatureKey =
  // worker
  | "worker_profile"
  | "worker_journal"
  | "worker_basic_skills"
  | "readiness_checklist_countries" // numeric: how many target countries
  | "document_expiry_reminders"
  | "expanded_cv"
  | "priority_visibility"
  // company
  | "company_create_needs" // numeric: concurrent open needs
  | "candidate_readiness_summaries"
  | "booking_requests"
  | "communication"
  | "team_matching"
  // agency
  | "agency_multi_company"
  | "worker_pool"
  | "doc_readiness_tracking"
  | "booking_pipeline"
  // admin
  | "verify_documents"
  | "manage_country_rules"
  | "manage_pilots";

export interface PrePaymentPlan {
  readonly slug: string;
  readonly audience: PlanAudience;
  readonly accessState: PlanAccessState;
  readonly cta: PlanCta;
  /** i18n key suffix under namespace `plans.<slug>`. */
  readonly labelKey: string;
  readonly entitlements: Readonly<Partial<Record<FeatureKey, Entitlement>>>;
}

export const PRE_PAYMENT_PLANS: readonly PrePaymentPlan[] = [
  {
    slug: "free_worker",
    audience: "worker",
    accessState: "free",
    cta: "use",
    labelKey: "free_worker",
    entitlements: {
      worker_profile: true,
      worker_journal: true,
      worker_basic_skills: true,
      readiness_checklist_countries: 1,
    },
  },
  {
    slug: "worker_plus",
    audience: "worker",
    accessState: "payment_not_enabled",
    cta: "request_pilot_access",
    labelKey: "worker_plus",
    entitlements: {
      worker_profile: true,
      worker_journal: true,
      worker_basic_skills: true,
      expanded_cv: true,
      readiness_checklist_countries: 10,
      document_expiry_reminders: true,
      priority_visibility: false, // later — never claimed active now
    },
  },
  {
    slug: "company_pilot",
    audience: "company",
    accessState: "payment_not_enabled",
    cta: "request_pilot_access",
    labelKey: "company_pilot",
    entitlements: {
      company_create_needs: 5,
      candidate_readiness_summaries: true,
      booking_requests: true,
      communication: true,
      team_matching: true,
    },
  },
  {
    slug: "agency_pilot",
    audience: "agency",
    accessState: "payment_not_enabled",
    cta: "request_pilot_access",
    labelKey: "agency_pilot",
    entitlements: {
      agency_multi_company: true,
      worker_pool: true,
      doc_readiness_tracking: true,
      booking_pipeline: true,
      company_create_needs: 25,
      candidate_readiness_summaries: true,
      booking_requests: true,
      communication: true,
    },
  },
  {
    slug: "admin_internal",
    audience: "admin",
    accessState: "internal",
    cta: "use",
    labelKey: "admin_internal",
    entitlements: {
      verify_documents: true,
      manage_country_rules: true,
      manage_pilots: true,
    },
  },
] as const;

export function getPlan(slug: string): PrePaymentPlan | null {
  return PRE_PAYMENT_PLANS.find((p) => p.slug === slug) ?? null;
}

/** The default free plan for an audience (the one a new user starts on). */
export function defaultPlanFor(audience: PlanAudience): PrePaymentPlan {
  if (audience === "admin") return getPlan("admin_internal")!;
  if (audience === "company") return getPlan("company_pilot")!;
  if (audience === "agency") return getPlan("agency_pilot")!;
  return getPlan("free_worker")!;
}

// ═════════════════════════════════════════════════════════════════════════════
// PLAN CATALOGUE V2 — owner-confirmed pricing (Sprint v2 §9, 2026-07-14).
//
// Owner-set monthly prices (exact, pinned by lib/billing/plans-v2.test.ts):
//   Persons:   FREE 0 € · AI PLUS 9.99 € · VIP MEDIA 24.99 €
//   Companies: FREE 0 € · PROJECT LAUNCH OFFER 99 € (valid until 2026-10-31;
//              unlimited job ads + LabourMarket.ai internal promotion; earns
//              a 15% first-annual discount — see lib/billing/offers.ts)
//   Agencies:  START 99.99 € · GROWTH 249.99 € · SCALE 499.99 €
//
// The kill-switch above (PAYMENTS_ENABLED=false) governs this catalogue too:
// every paid V2 plan stays `payment_not_enabled` until the owner activates
// billing (test-mode first; live keys remain hard-blocked in config-core.ts).
//
// The legacy PRE_PAYMENT_PLANS catalogue above is UNCHANGED — every existing
// entitlement check keeps working. Legacy slugs resolve into V2 via
// LEGACY_PLAN_ALIASES + getPlanV2().
//
// V2 entitlements are ARCHITECTURE, not UI claims: numbers/flags the
// enforcement seam will read once billing activates. Job-ad allowances encode
// the owner rule that normal company subscriptions do NOT include unlimited
// ads — the Launch Offer is the only unlimited exception (plus agency SCALE
// by owner-approved tiering). Extra ads come from ad products / ad credits
// (lib/billing/ad-products.ts).
// ═════════════════════════════════════════════════════════════════════════════

export type PlanV2Audience = "person" | "company" | "agency";

export const PLAN_V2_SLUGS = [
  "free_person",
  "ai_plus",
  "vip_media",
  "free_company",
  "launch_offer_99",
  "agency_start",
  "agency_growth",
  "agency_scale",
] as const;
export type PlanV2Slug = (typeof PLAN_V2_SLUGS)[number];

/** Typed V2 entitlement shape (numeric limits + honest capability flags). */
export interface PlanV2Entitlements {
  /** Concurrent ACTIVE job advertisements included in the plan. */
  readonly activeAdLimit: number | "unlimited";
  /** LabourMarket.ai internal promotion of the customer's ads/profile. */
  readonly internalPromotion: boolean;
  /** AI-assist runs per month routed through the shared AI layer. */
  readonly aiAssistMonthlyRuns: number;
  /** Media/gallery items (photos, documents in the public gallery). */
  readonly mediaGalleryItems: number;
  /** Visibility boost in search/matching (architecture flag; no UI claims it yet). */
  readonly visibilityBoost: boolean;
  /** Agency: managed client companies. Non-agency plans: 0. */
  readonly managedCompanies: number | "unlimited";
}

export interface PlanV2 {
  readonly slug: PlanV2Slug;
  readonly audience: PlanV2Audience;
  readonly accessState: Extract<PlanAccessState, "free" | "payment_not_enabled">;
  readonly cta: PlanCta;
  /** Owner-confirmed monthly price in euro cents. 0 = free. */
  readonly priceMonthlyCents: number;
  readonly currency: "EUR";
  readonly entitlements: PlanV2Entitlements;
  /** Marked on the time-boxed Launch Offer (window logic in offers.ts). */
  readonly launchOffer: boolean;
}

export const PLAN_CATALOGUE_V2: readonly PlanV2[] = [
  // ── Persons ────────────────────────────────────────────────────────────────
  {
    slug: "free_person",
    audience: "person",
    accessState: "free",
    cta: "use",
    priceMonthlyCents: 0,
    currency: "EUR",
    launchOffer: false,
    entitlements: {
      activeAdLimit: 0,
      internalPromotion: false,
      aiAssistMonthlyRuns: 10,
      mediaGalleryItems: 10,
      visibilityBoost: false,
      managedCompanies: 0,
    },
  },
  {
    slug: "ai_plus",
    audience: "person",
    accessState: "payment_not_enabled",
    cta: "request_pilot_access",
    priceMonthlyCents: 999, // 9.99 €
    currency: "EUR",
    launchOffer: false,
    entitlements: {
      activeAdLimit: 0,
      internalPromotion: false,
      aiAssistMonthlyRuns: 200,
      mediaGalleryItems: 50,
      visibilityBoost: false,
      managedCompanies: 0,
    },
  },
  {
    slug: "vip_media",
    audience: "person",
    accessState: "payment_not_enabled",
    cta: "request_pilot_access",
    priceMonthlyCents: 2499, // 24.99 €
    currency: "EUR",
    launchOffer: false,
    entitlements: {
      activeAdLimit: 0,
      internalPromotion: true,
      aiAssistMonthlyRuns: 500,
      mediaGalleryItems: 500,
      visibilityBoost: true,
      managedCompanies: 0,
    },
  },
  // ── Companies ──────────────────────────────────────────────────────────────
  {
    slug: "free_company",
    audience: "company",
    accessState: "free",
    cta: "use",
    priceMonthlyCents: 0,
    currency: "EUR",
    launchOffer: false,
    entitlements: {
      // Owner rule: normal company tiers get a FINITE ad allowance.
      activeAdLimit: 1,
      internalPromotion: false,
      aiAssistMonthlyRuns: 10,
      mediaGalleryItems: 20,
      visibilityBoost: false,
      managedCompanies: 0,
    },
  },
  {
    slug: "launch_offer_99",
    audience: "company",
    accessState: "payment_not_enabled",
    cta: "request_pilot_access",
    priceMonthlyCents: 9900, // 99 €
    currency: "EUR",
    launchOffer: true, // valid until 2026-10-31 — window in offers.ts
    entitlements: {
      // The ONLY unlimited-ads company plan (owner exception).
      activeAdLimit: "unlimited",
      internalPromotion: true,
      aiAssistMonthlyRuns: 300,
      mediaGalleryItems: 200,
      visibilityBoost: true,
      managedCompanies: 0,
    },
  },
  // ── Agencies ───────────────────────────────────────────────────────────────
  {
    slug: "agency_start",
    audience: "agency",
    accessState: "payment_not_enabled",
    cta: "request_pilot_access",
    priceMonthlyCents: 9999, // 99.99 €
    currency: "EUR",
    launchOffer: false,
    entitlements: {
      activeAdLimit: 10,
      internalPromotion: false,
      aiAssistMonthlyRuns: 300,
      mediaGalleryItems: 100,
      visibilityBoost: false,
      managedCompanies: 3,
    },
  },
  {
    slug: "agency_growth",
    audience: "agency",
    accessState: "payment_not_enabled",
    cta: "request_pilot_access",
    priceMonthlyCents: 24999, // 249.99 €
    currency: "EUR",
    launchOffer: false,
    entitlements: {
      activeAdLimit: 50,
      internalPromotion: true,
      aiAssistMonthlyRuns: 1000,
      mediaGalleryItems: 300,
      visibilityBoost: true,
      managedCompanies: 10,
    },
  },
  {
    slug: "agency_scale",
    audience: "agency",
    accessState: "payment_not_enabled",
    cta: "request_pilot_access",
    priceMonthlyCents: 49999, // 499.99 €
    currency: "EUR",
    launchOffer: false,
    entitlements: {
      activeAdLimit: "unlimited",
      internalPromotion: true,
      aiAssistMonthlyRuns: 3000,
      mediaGalleryItems: 1000,
      visibilityBoost: true,
      managedCompanies: "unlimited",
    },
  },
] as const;

/**
 * Legacy slug → V2 slug. Existing rows/checks that carry an old plan key keep
 * resolving (admin_internal has no V2 tier — it stays a legacy internal plan).
 */
export const LEGACY_PLAN_ALIASES: Readonly<Record<string, PlanV2Slug>> = {
  free_worker: "free_person",
  worker_plus: "ai_plus",
  company_pilot: "launch_offer_99",
  agency_pilot: "agency_start",
};

/** Resolve any plan key (V2 slug or legacy alias) to its V2 slug, or null. */
export function resolvePlanV2Slug(key: string): PlanV2Slug | null {
  if ((PLAN_V2_SLUGS as readonly string[]).includes(key)) {
    return key as PlanV2Slug;
  }
  return LEGACY_PLAN_ALIASES[key] ?? null;
}

/** V2 plan lookup accepting both V2 slugs and legacy aliases. */
export function getPlanV2(key: string): PlanV2 | null {
  const slug = resolvePlanV2Slug(key);
  if (!slug) return null;
  return PLAN_CATALOGUE_V2.find((p) => p.slug === slug) ?? null;
}

export function plansV2For(audience: PlanV2Audience): PlanV2[] {
  return PLAN_CATALOGUE_V2.filter((p) => p.audience === audience);
}

/** "999" cents → "9,99 €" (lt-style comma, non-breaking space before €). */
export function formatEurMonthlyCents(cents: number): string {
  const whole = Math.floor(cents / 100);
  const frac = cents % 100;
  return frac === 0
    ? `${whole} €`
    : `${whole},${String(frac).padStart(2, "0")} €`;
}
