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

/**
 * OWNER LAUNCH PRICING (approved 2026-09-05, corrected the same day):
 *   PERSON            €0   — core person / worker / learner participation
 *   ORGANIZATION FREE €0   — 1 concurrent active position / open workforce need
 *   ORGANIZATION      €99  — up to 10 concurrent active positions
 *   more than 10           — individual plan: contact LabourMarket.ai; no
 *                            automatic public tier, no invented price.
 * Prices live ONLY in `plans.price_eur_monthly` (see lib/marketing/plans.ts);
 * this registry carries the boundary (what a plan DOES), never a figure.
 * Deferred and NOT sold: ai_plus, vip_media, agency tiers, LMC top-ups,
 * priority visibility, media upsells, annual and enterprise pricing.
 */
export const FREE_ORGANIZATION_PLAN_KEY = "free_organization" as const;
/** The ONE paid organization plan key (historical slug kept for the
 *  subscription store, env price slot and admin grants — the label says
 *  "Organization"). */
export const ORGANIZATION_PLAN_KEY = "company_pilot" as const;
/** The paid ceiling; at or above it the next step is a conversation, not a tier. */
export const OPEN_NEEDS_CONTACT_THRESHOLD = 10 as const;
/** Plans that exist in the registry but are not offered at launch. */
export const DEFERRED_PLAN_KEYS = ["worker_plus", "agency_pilot"] as const;

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
  /** Launch status of a PAID plan: only `sellable` plans reach checkout;
   *  `deferred` plans stay in the registry for historical rows / admin
   *  grants and are never offered or priced. Free/internal plans omit it. */
  readonly launch?: "sellable" | "deferred";
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
    // DEFERRED (owner 2026-09-05): PERSON stays free; nothing a person can buy
    // at launch. Kept only so historical rows / admin grants keep resolving.
    slug: "worker_plus",
    audience: "worker",
    accessState: "payment_not_enabled",
    cta: "contact",
    labelKey: "worker_plus",
    launch: "deferred",
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
    // ORGANIZATION FREE (owner launch pricing 2026-09-05): every organization
    // capability at the scale of ONE concurrent active position / open
    // workforce need — regardless of whether the organization acts as employer,
    // staffing provider, contractor or training provider (capability-based,
    // never a role tunnel).
    slug: FREE_ORGANIZATION_PLAN_KEY,
    audience: "company",
    accessState: "free",
    cta: "use",
    labelKey: "free_organization",
    entitlements: {
      company_create_needs: 1,
      candidate_readiness_summaries: true,
      booking_requests: true,
      communication: true,
      team_matching: true,
      agency_multi_company: true,
      worker_pool: true,
      doc_readiness_tracking: true,
      booking_pipeline: true,
    },
  },
  {
    // ORGANIZATION (the ONE paid organization plan — its monthly price lives
    // ONLY in `plans.price_eur_monthly`, never here): up to TEN
    // concurrent active positions / open workforce needs. Above ten there is
    // no automatic public tier — the individual plan (contact us).
    slug: ORGANIZATION_PLAN_KEY,
    audience: "company",
    accessState: "payment_not_enabled",
    cta: "request_pilot_access",
    labelKey: "company_pilot",
    launch: "sellable",
    entitlements: {
      company_create_needs: OPEN_NEEDS_CONTACT_THRESHOLD,
      candidate_readiness_summaries: true,
      booking_requests: true,
      communication: true,
      team_matching: true,
      agency_multi_company: true,
      worker_pool: true,
      doc_readiness_tracking: true,
      booking_pipeline: true,
    },
  },
  {
    // DEFERRED (owner 2026-09-05): agency-specific tiers are not sold at
    // launch; a workforce provider subscribes to the same ORGANIZATION plan.
    // Kept only so historical rows / admin grants keep resolving.
    slug: "agency_pilot",
    audience: "agency",
    accessState: "payment_not_enabled",
    cta: "contact",
    labelKey: "agency_pilot",
    launch: "deferred",
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
  // One organization plan family for every organization capability.
  if (audience === "company" || audience === "agency") return getPlan(FREE_ORGANIZATION_PLAN_KEY)!;
  return getPlan("free_worker")!;
}

/** The plans a person or organization can actually buy at launch. */
export function isSellablePlan(plan: Pick<PrePaymentPlan, "accessState" | "launch">): boolean {
  return plan.accessState === "payment_not_enabled" && plan.launch === "sellable";
}
