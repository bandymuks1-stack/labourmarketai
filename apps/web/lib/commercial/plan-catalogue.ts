/**
 * CANONICAL TYPED COMMERCIAL PLAN CATALOGUE (owner-ratified architecture,
 * 2026-10-03).
 *
 *   ONE catalogue (this file)
 *     -> entitlement resolver      lib/billing/entitlements-v1.ts (unchanged, shared)
 *     -> DB / display adapter      lib/commercial/plan-adapters.ts (DbDisplayAdapter)
 *     -> Stripe / payment adapter  lib/commercial/plan-adapters.ts (StripePaymentAdapter)
 *     -> future mobile payment     lib/commercial/plan-adapters.ts (MobilePaymentAdapter, seam only)
 *
 * SUPERSET of the former `PRE_PAYMENT_PLANS`. Every boundary field (slug,
 * audience, accessState, cta, labelKey, entitlements, launch) is carried with
 * IDENTICAL values; `lib/billing/plans.ts` now DERIVES its exports from here
 * and `lib/commercial/plan-catalogue.test.ts` proves they are byte-equal to a
 * snapshot taken before this change. Adding the `commercial` block changes no
 * behaviour: nothing reads it yet.
 *
 * Rules (owner constraints, pinned by guards):
 *   - NO money figure lives in code. The approved organization price stays in
 *     `public.plans.price_eur_monthly` until the owner moves it; the catalogue
 *     only REFERENCES it (`source: "db"`). Moving it is a RED price-source change.
 *   - A Stripe price is never inferred from the DB figure. The Stripe amount,
 *     currency, interval and tax behaviour of the live price are
 *     EXTERNAL_CONFIGURATION_NOT_VERIFIED.
 *   - Anything undecided is an explicit `open` marker with a decision id,
 *     never null-as-unlimited and never a guess.
 *   - Deferred plans stay deferred; retired DB rows are carried as retired,
 *     never active. The live organization limit stays as already enforced.
 *   - 1 LMC = EUR 1 is an invariant of the LMC ledger; LMC is NOT a plan
 *     field that grants entitlements. The `lmc` block records only the open
 *     commercial questions (plan-included LMC, top-up discount).
 *   - The rejected W1 launch offer is not represented here.
 *
 * Pure data + types. No IO, no env, no server-only.
 */

// ---------------------------------------------------------------------------
// Boundary types (moved verbatim from lib/billing/plans.ts; re-exported there)
// ---------------------------------------------------------------------------

export type PlanAudience = "worker" | "company" | "agency" | "admin";

/** How a user obtains the plan today (no checkout exists for deferred plans). */
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
  /**
   * On-demand rendering of a foreign-language advertisement into the reader's
   * language (owner decision 2026-09-22). Declared `false` on every plan:
   * the model is approved, the quantities are NOT, so nothing is invented and
   * nothing is unlimited. Setting an allowance later is one edit per plan.
   * See lib/vacancy-store/vacancy-translation-entitlement.ts.
   */
  | "vacancy_translations"
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

// ---------------------------------------------------------------------------
// Commercial block types
// ---------------------------------------------------------------------------

/** An undecided commercial value. Never a guess, never "unlimited". */
export interface OpenMarker {
  readonly status: "open";
  /** Stable owner-decision id (or a short reason when the plan is free/deferred). */
  readonly decision: string;
}

/** A value the owner has decided; `provenance` names the decision artefact. */
export interface DecidedValue<T extends string> {
  readonly status: "decided";
  readonly value: T;
  readonly provenance: string;
}

/** The plan is free or internal; the field does not apply. */
export interface NotApplicable {
  readonly status: "not_applicable";
  readonly reason: "free" | "internal";
}

/**
 * Where the monthly figure lives. `db` is a REFERENCE to the one home of the
 * figure (`public.plans.<column>` row `dbSlug`); the number is deliberately not
 * copied into code.
 */
export type PriceSource =
  | { readonly source: "db"; readonly dbSlug: string; readonly column: "price_eur_monthly" }
  | NotApplicable
  | OpenMarker;

export type PlanCurrency = DecidedValue<"EUR"> | NotApplicable | OpenMarker;
export type PlanInterval = DecidedValue<"month"> | NotApplicable | OpenMarker;
export type PlanTaxBasis = DecidedValue<"exclusive"> | NotApplicable | OpenMarker;

export interface PlanCommercial {
  readonly price: PriceSource;
  readonly currency: PlanCurrency;
  readonly interval: PlanInterval;
  readonly taxBasis: PlanTaxBasis;
  /** Annual billing is DEFERRED for every plan. */
  readonly annual: OpenMarker;
  /** `public.plans.slug` this plan renders as; null = no DB row. */
  readonly dbSlug: string | null;
  /** Payment slot id (the plan key whose provider price id prices.ts resolves from env; the env var NAME stays in prices.ts only, guard-pinned); null = no slot. */
  readonly stripeSlot: string | null;
  /** Open commercial questions about LMC; NOT entitlements. */
  readonly lmc: { readonly includedPerPeriod: OpenMarker; readonly topupDiscount: OpenMarker };
}

export type PlanCatalogueEntry = PrePaymentPlan & { readonly commercial: PlanCommercial };

/** A DB row that is carried as retired/deferred; must never be active or priced. */
export interface RetiredDbRow {
  readonly dbSlug: string;
  readonly state: "retired";
  readonly mustBeActive: false;
  readonly mustBePriced: false;
  /** Historical capability text from the seed, kept as provenance only. */
  readonly historicalCapabilities: string;
}

// ---------------------------------------------------------------------------
// Keys (plans.ts holds guard-pinned literal copies; a test proves equality)
// ---------------------------------------------------------------------------

export const CATALOGUE_FREE_ORGANIZATION_KEY = "free_organization" as const;
export const CATALOGUE_ORGANIZATION_KEY = "company_pilot" as const;
export const CATALOGUE_DEFERRED_KEYS = ["worker_plus", "agency_pilot"] as const;

const GATE = "docs/human-gates/payments-price-table-gate.md (owner launch pricing 2026-09-05)";
const free: NotApplicable = { status: "not_applicable", reason: "free" };
const internal: NotApplicable = { status: "not_applicable", reason: "internal" };
const deferred = (what: string): OpenMarker => ({ status: "open", decision: `deferred: ${what}` });
const lmcOpen = {
  includedPerPeriod: { status: "open", decision: "MDD: plan-included LMC undecided (none today)" },
  topupDiscount: { status: "open", decision: "MDD: per-plan top-up discount undecided" },
} as const;
const annualDeferred: OpenMarker = deferred("annual pricing");

// ---------------------------------------------------------------------------
// The catalogue
// ---------------------------------------------------------------------------

export const PLAN_CATALOGUE: readonly PlanCatalogueEntry[] = [
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
      vacancy_translations: false, // quantities NOT set by the owner yet
    },
    commercial: {
      price: free,
      currency: free,
      interval: free,
      taxBasis: free,
      annual: annualDeferred,
      dbSlug: null,
      stripeSlot: null,
      lmc: lmcOpen,
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
      vacancy_translations: false, // quantities NOT set by the owner yet
      priority_visibility: false, // later - never claimed active now
    },
    commercial: {
      price: deferred("worker plan not sold at launch"),
      currency: deferred("worker plan not sold at launch"),
      interval: deferred("worker plan not sold at launch"),
      taxBasis: deferred("worker plan not sold at launch"),
      annual: annualDeferred,
      dbSlug: null,
      stripeSlot: "worker_plus",
      lmc: lmcOpen,
    },
  },
  {
    // ORGANIZATION FREE: every organization capability at the scale of ONE
    // concurrent active position / open workforce need, whatever the
    // organization's role (capability-based, never a role tunnel).
    slug: CATALOGUE_FREE_ORGANIZATION_KEY,
    audience: "company",
    accessState: "free",
    cta: "use",
    labelKey: "free_organization",
    entitlements: {
      company_create_needs: 1,
      vacancy_translations: false, // quantities NOT set by the owner yet
      candidate_readiness_summaries: true,
      booking_requests: true,
      communication: true,
      team_matching: true,
      agency_multi_company: true,
      worker_pool: true,
      doc_readiness_tracking: true,
      booking_pipeline: true,
    },
    commercial: {
      price: { source: "db", dbSlug: "free", column: "price_eur_monthly" },
      currency: free,
      interval: free,
      taxBasis: free,
      annual: annualDeferred,
      dbSlug: "free",
      stripeSlot: null,
      lmc: lmcOpen,
    },
  },
  {
    // ORGANIZATION (the ONE paid organization plan): NO fixed limit on
    // concurrent active positions (owner decision 2026-10-06 - the former
    // ten-position ceiling is removed and replaced by no other commercial
    // cap). `company_create_needs: true` is the plan boundary only (the
    // feature is included); there is deliberately no numeric ceiling. Abuse and
    // security protections (request rate limits, intake throttles) are separate
    // from the entitlement and are never presented as one. The monthly figure is referenced from the
    // DB (`plans.business`), never copied; the live Stripe price is
    // EXTERNAL_CONFIGURATION_NOT_VERIFIED and is never inferred from the DB.
    slug: CATALOGUE_ORGANIZATION_KEY,
    audience: "company",
    accessState: "payment_not_enabled",
    cta: "request_pilot_access",
    labelKey: "company_pilot",
    launch: "sellable",
    entitlements: {
      company_create_needs: true, // included, NO numeric ceiling (owner 2026-10-06)
      vacancy_translations: false, // quantities NOT set by the owner yet
      candidate_readiness_summaries: true,
      booking_requests: true,
      communication: true,
      team_matching: true,
      agency_multi_company: true,
      worker_pool: true,
      doc_readiness_tracking: true,
      booking_pipeline: true,
    },
    commercial: {
      price: { source: "db", dbSlug: "business", column: "price_eur_monthly" },
      currency: { status: "decided", value: "EUR", provenance: GATE },
      interval: { status: "decided", value: "month", provenance: GATE },
      taxBasis: { status: "decided", value: "exclusive", provenance: `${GATE}; Stripe Tax adds VAT` },
      annual: annualDeferred,
      dbSlug: "business",
      stripeSlot: "company_pilot",
      lmc: lmcOpen,
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
      vacancy_translations: false, // quantities NOT set by the owner yet
      candidate_readiness_summaries: true,
      booking_requests: true,
      communication: true,
    },
    commercial: {
      price: deferred("agency tiers not sold at launch"),
      currency: deferred("agency tiers not sold at launch"),
      interval: deferred("agency tiers not sold at launch"),
      taxBasis: deferred("agency tiers not sold at launch"),
      annual: annualDeferred,
      dbSlug: null, // DB `agency` / `enterprise` are RETIRED rows, not this plan
      stripeSlot: "agency_pilot",
      lmc: lmcOpen,
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
      vacancy_translations: false, // quantities NOT set by the owner yet
      manage_country_rules: true,
      manage_pilots: true,
    },
    commercial: {
      price: internal,
      currency: internal,
      interval: internal,
      taxBasis: internal,
      annual: annualDeferred,
      dbSlug: null,
      stripeSlot: null,
      lmc: lmcOpen,
    },
  },
] as const;

/**
 * DB rows retired as public tiers (applied 2026-09-05). Carried here so the
 * capability record is not lost; they must stay inactive and unpriced.
 */
export const RETIRED_DB_ROWS: readonly RetiredDbRow[] = [
  {
    dbSlug: "agency",
    state: "retired",
    mustBeActive: false,
    mustBePriced: false,
    historicalCapabilities: "managed_workers unlimited, broker_tools, worker_search, priority support",
  },
  {
    dbSlug: "enterprise",
    state: "retired",
    mustBeActive: false,
    mustBePriced: false,
    historicalCapabilities: "projects unlimited, sso, sla, dedicated support",
  },
] as const;

/** Derive the boundary view (exactly the former PRE_PAYMENT_PLANS shape). */
export function toBoundary(entry: PlanCatalogueEntry): PrePaymentPlan {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { commercial: _commercial, ...boundary } = entry;
  return boundary;
}

export function getCatalogueEntry(slug: string): PlanCatalogueEntry | null {
  return PLAN_CATALOGUE.find((p) => p.slug === slug) ?? null;
}
