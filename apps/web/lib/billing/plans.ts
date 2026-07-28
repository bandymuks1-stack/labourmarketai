/**
 * REFERENCE ONLY — the canonical commercial source is
 * `docs/product/commercial-system-v1.md` + `lib/commercial/catalogue.ts`.
 *
 * Runtime MIRROR: the entitlement SHAPE stays executable here (every gate imports it). Plan meaning, prices and names are canonical in the source above; nothing commercial may be added here.
 *
 * Guarded by lib/guards/commercial-single-source.test.ts.
 */
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
