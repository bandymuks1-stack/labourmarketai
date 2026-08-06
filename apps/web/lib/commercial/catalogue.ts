/**
 * CANONICAL COMMERCIAL CATALOGUE v1 — the machine-readable half of the single
 * source of truth.
 *
 * Human half: `docs/product/commercial-system-v1.md`.
 * The two are pinned to each other by `lib/guards/commercial-single-source.test.ts`:
 * every plan key, micro-feature code, top-up slot and owner-decision id here
 * must appear there, and no commercial price may exist anywhere else.
 *
 * ── THE ONE RULE ───────────────────────────────────────────────────────────
 * A value is present here ONLY if an artefact in this repository records the
 * decision. Everything else is `null` with an `ownerDecision` id. Nothing is
 * inferred, averaged, rounded or "reasonably assumed".
 *
 * That is why most price fields below are `null`: the reconstruction audit
 * (`docs/product/lmc-canonical-commercial-catalogue-v1.md`, PR #894) proved
 * that no final subscription price, no top-up denomination and no LMC price
 * for any feature exists anywhere in the repository, in any branch, in any
 * document, or in the database.
 *
 * Pure data + pure functions. No IO, no env, no server-only — safe to import
 * from a guard, a script, a route or a component.
 */

// ═══════════════════════════════════════════════════════════════════════════
// 0. Provenance + owner-decision primitives
// ═══════════════════════════════════════════════════════════════════════════

/** Where a recorded value comes from, and how binding it is. */
export type ProvenanceStatus =
  /** Recorded as an owner decision and never superseded. */
  | "binding"
  /** Was decided, then explicitly replaced/rejected by a later artefact. */
  | "superseded"
  /** Exists in a closed/unmerged branch — input, not decision. */
  | "prior_art"
  /** Live in the product but never decided (drifted in). */
  | "live_undecided";

export interface Provenance {
  readonly status: ProvenanceStatus;
  /** Exact artefact: file path, commit, PR number. */
  readonly source: string;
}

/** A value the owner has not decided. Never guessed, never defaulted. */
export const MISSING: unique symbol = Symbol("MISSING_OWNER_DECISION");

/**
 * An owner decision that is still open. The id is stable and quoted in
 * `docs/product/commercial-system-v1.md` and in the PR description.
 */
export interface OwnerDecision {
  readonly id: string;
  readonly question: string;
  readonly blocks: string;
  /** Everything already known that the owner needs to decide it. */
  readonly inputs: readonly string[];
}

/** A monetary amount in minor units, or an explicit open decision. */
export type Amount =
  | { readonly cents: number; readonly currency: "EUR"; readonly provenance: Provenance }
  | { readonly cents: null; readonly ownerDecision: string };

export function isDecided(a: Amount): a is Extract<Amount, { cents: number }> {
  return a.cents !== null;
}

/** A numeric limit, a boolean capability, "unlimited", or an open decision. */
export type Allowance =
  | { readonly value: number | "unlimited" | boolean; readonly provenance: Provenance }
  | { readonly value: null; readonly ownerDecision: string };

const open = (ownerDecision: string): { value: null; ownerDecision: string } => ({
  value: null,
  ownerDecision,
});
const openAmount = (ownerDecision: string): Amount => ({ cents: null, ownerDecision });
const known = (
  value: number | "unlimited" | boolean,
  status: ProvenanceStatus,
  source: string,
): Allowance => ({ value, provenance: { status, source } });

// ═══════════════════════════════════════════════════════════════════════════
// I. SUBSCRIPTION PLANS
// ═══════════════════════════════════════════════════════════════════════════

export type PlanAudience = "worker" | "company" | "agency" | "admin";

/**
 * The commercial axes a plan is defined on. Every axis exists for every plan;
 * an axis with no recorded decision carries an owner-decision id, so a missing
 * dimension can never be mistaken for "unlimited" or "not applicable".
 */
export interface PlanEntitlements {
  /** LMC included with the plan each period (privileges expressed in credit). */
  readonly lmcIncludedPerPeriod: Allowance;
  /** Discount on LMC top-ups for this plan, in percent. */
  readonly lmcTopupDiscountPercent: Allowance;
  /** AI assistant runs per month. */
  readonly aiMonthlyRuns: Allowance;
  /** CV / profile exports per month. */
  readonly cvExportsPerMonth: Allowance;
  /** Expanded CV surfaces. */
  readonly expandedCv: Allowance;
  /** Concurrent ACTIVE job advertisements. */
  readonly activeJobAds: Allowance;
  /** Concurrent open demands / needs. */
  readonly openDemands: Allowance;
  /** Worker/company search access. */
  readonly counterpartySearch: Allowance;
  /** Saved searches / candidate pools. */
  readonly workerPool: Allowance;
  /** API calls per month. */
  readonly apiCallsPerMonth: Allowance;
  /** Workspace projects. */
  readonly workspaceProjects: Allowance;
  /** Team seats. */
  readonly teamSeats: Allowance;
  /** Managed client companies (agency). */
  readonly managedCompanies: Allowance;
  /** Chat / messaging with counterparties. */
  readonly chat: Allowance;
  /** Analytics surfaces. */
  readonly analytics: Allowance;
  /** Data export. */
  readonly dataExport: Allowance;
  /** Internal LabourMarket.ai promotion of the customer's ads/profile. */
  readonly internalPromotion: Allowance;
  /** Visibility boost in search/matching. */
  readonly visibilityBoost: Allowance;
  /** Media/gallery items. */
  readonly mediaGalleryItems: Allowance;
  /** Readiness-checklist target countries. */
  readonly readinessChecklistCountries: Allowance;
  /** Support tier. */
  readonly support: Allowance;
}

export interface SubscriptionPlan {
  /** The runtime key. Every entitlement check and Stripe env var uses this. */
  readonly planKey: string;
  readonly audience: PlanAudience;
  /** Display name. `null` = the naming decision is open (MOD-02). */
  readonly displayName: string | null;
  readonly monthlyPrice: Amount;
  readonly annualPrice: Amount;
  /** Stripe Product — created by the owner; the catalogue only names the slot. */
  readonly stripeProductSlot: string;
  /** Env var carrying the Stripe Price id for this plan. */
  readonly stripePriceEnvVar: string | null;
  readonly entitlements: PlanEntitlements;
  /** Recovered inputs that are NOT decisions (kept so they are not re-derived). */
  readonly inputs: readonly string[];
}

const PLANS_DOC = "docs/product/lmc-canonical-commercial-catalogue-v1.md";
const CODE_B = "lib/billing/plans.ts (PRE_PAYMENT_PLANS — live runtime contract)";
const V2 = "PR #754 dc051b45 lib/billing/plans.ts PLAN_CATALOGUE_V2 (CLOSED — input only)";

/**
 * The canonical plan rows are keyed on the LIVE runtime contract
 * (`PRE_PAYMENT_PLANS`), because that is what entitlement checks and the
 * Stripe price env map already use. Which catalogue ultimately survives is
 * itself an open decision (MOD-02) — recorded, not pre-empted.
 */
export const SUBSCRIPTION_PLANS: readonly SubscriptionPlan[] = [
  {
    planKey: "free_worker",
    audience: "worker",
    displayName: null,
    monthlyPrice: { cents: 0, currency: "EUR", provenance: { status: "binding", source: `${CODE_B}: accessState "free"` } },
    annualPrice: { cents: 0, currency: "EUR", provenance: { status: "binding", source: `${CODE_B}: accessState "free"` } },
    stripeProductSlot: "none (free tier needs no Stripe product)",
    stripePriceEnvVar: null,
    entitlements: {
      lmcIncludedPerPeriod: open("MOD-07"),
      lmcTopupDiscountPercent: open("MOD-08"),
      aiMonthlyRuns: known(10, "prior_art", `${V2} free_person.aiAssistMonthlyRuns`),
      cvExportsPerMonth: open("MOD-04"),
      expandedCv: known(false, "binding", `${CODE_B}: expanded_cv absent from free_worker`),
      activeJobAds: known(0, "prior_art", `${V2} free_person.activeAdLimit`),
      openDemands: open("MOD-04"),
      counterpartySearch: open("MOD-04"),
      workerPool: open("MOD-04"),
      apiCallsPerMonth: open("MOD-05"),
      workspaceProjects: open("MOD-04"),
      teamSeats: open("MOD-04"),
      managedCompanies: known(0, "prior_art", `${V2} free_person.managedCompanies`),
      chat: open("MOD-04"),
      analytics: open("MOD-04"),
      dataExport: open("MOD-04"),
      internalPromotion: known(false, "prior_art", `${V2} free_person.internalPromotion`),
      visibilityBoost: known(false, "prior_art", `${V2} free_person.visibilityBoost`),
      mediaGalleryItems: known(10, "prior_art", `${V2} free_person.mediaGalleryItems`),
      readinessChecklistCountries: known(1, "binding", `${CODE_B}: readiness_checklist_countries`),
      support: open("MOD-04"),
    },
    inputs: [`${V2}: free_person = 0 €`],
  },
  {
    planKey: "worker_plus",
    audience: "worker",
    displayName: null,
    monthlyPrice: openAmount("MOD-01"),
    annualPrice: openAmount("MOD-03"),
    stripeProductSlot: "STRIPE_PRODUCT_WORKER_PLUS (owner-created)",
    stripePriceEnvVar: "STRIPE_PRICE_WORKER_PLUS",
    entitlements: {
      lmcIncludedPerPeriod: open("MOD-07"),
      lmcTopupDiscountPercent: open("MOD-08"),
      aiMonthlyRuns: known(200, "prior_art", `${V2} ai_plus.aiAssistMonthlyRuns (alias worker_plus→ai_plus)`),
      cvExportsPerMonth: open("MOD-04"),
      expandedCv: known(true, "binding", `${CODE_B}: expanded_cv`),
      activeJobAds: known(0, "prior_art", `${V2} ai_plus.activeAdLimit`),
      openDemands: open("MOD-04"),
      counterpartySearch: open("MOD-04"),
      workerPool: open("MOD-04"),
      apiCallsPerMonth: open("MOD-05"),
      workspaceProjects: open("MOD-04"),
      teamSeats: open("MOD-04"),
      managedCompanies: known(0, "prior_art", `${V2} ai_plus.managedCompanies`),
      chat: open("MOD-04"),
      analytics: open("MOD-04"),
      dataExport: open("MOD-04"),
      internalPromotion: known(false, "prior_art", `${V2} ai_plus.internalPromotion`),
      // Declared FALSE on purpose: never claimed as active.
      visibilityBoost: known(false, "binding", `${CODE_B}: priority_visibility declared false`),
      mediaGalleryItems: known(50, "prior_art", `${V2} ai_plus.mediaGalleryItems`),
      readinessChecklistCountries: known(10, "binding", `${CODE_B}: readiness_checklist_countries`),
      support: open("MOD-04"),
    },
    inputs: [
      `${V2}: ai_plus = 9.99 €/mo (owner-confirmed 2026-07-14, then marked REPLACE-input-only)`,
      "Train doc §6: personal multiplier ×2 → 19.98 €; proposed rounding 19.99 € is NOT FINAL",
      "Train doc §6: 24.99×2 = 49.98 € belongs to vip_media, NOT to worker_plus",
    ],
  },
  {
    planKey: "company_pilot",
    audience: "company",
    displayName: null,
    monthlyPrice: openAmount("MOD-01"),
    annualPrice: openAmount("MOD-03"),
    stripeProductSlot: "STRIPE_PRODUCT_COMPANY_PILOT (owner-created)",
    stripePriceEnvVar: "STRIPE_PRICE_COMPANY_PILOT",
    entitlements: {
      lmcIncludedPerPeriod: open("MOD-07"),
      lmcTopupDiscountPercent: open("MOD-08"),
      aiMonthlyRuns: known(300, "prior_art", `${V2} launch_offer_99.aiAssistMonthlyRuns (alias company_pilot→launch_offer_99)`),
      cvExportsPerMonth: open("MOD-04"),
      expandedCv: open("MOD-04"),
      // The V2 "unlimited" came with the REJECTED Launch Offer; not carried over.
      activeJobAds: open("MOD-06"),
      openDemands: known(5, "binding", `${CODE_B}: company_create_needs`),
      counterpartySearch: open("MOD-04"),
      workerPool: open("MOD-04"),
      apiCallsPerMonth: open("MOD-05"),
      workspaceProjects: open("MOD-04"),
      teamSeats: open("MOD-04"),
      managedCompanies: known(0, "prior_art", `${V2} launch_offer_99.managedCompanies`),
      chat: known(true, "binding", `${CODE_B}: communication`),
      analytics: open("MOD-04"),
      dataExport: open("MOD-04"),
      internalPromotion: known(true, "prior_art", `${V2} launch_offer_99.internalPromotion`),
      visibilityBoost: known(true, "prior_art", `${V2} launch_offer_99.visibilityBoost`),
      mediaGalleryItems: known(200, "prior_art", `${V2} launch_offer_99.mediaGalleryItems`),
      readinessChecklistCountries: open("MOD-04"),
      support: open("MOD-04"),
    },
    inputs: [
      `${V2}: launch_offer_99 = 99.00 €/mo with UNLIMITED ads, valid until 2026-10-31`,
      "Train doc §3.1 row 11: the Launch Offer + its 15% first-annual discount are REJECTED (stale)",
      "Train doc §6: company multiplier ×3 → 297.00 €; proposed rounding 299 € is NOT FINAL",
      "Train doc §6 warning: unlimited entitlements at any price are the largest margin risk",
    ],
  },
  {
    planKey: "agency_pilot",
    audience: "agency",
    displayName: null,
    monthlyPrice: openAmount("MOD-01"),
    annualPrice: openAmount("MOD-03"),
    stripeProductSlot: "STRIPE_PRODUCT_AGENCY_PILOT (owner-created)",
    stripePriceEnvVar: "STRIPE_PRICE_AGENCY_PILOT",
    entitlements: {
      lmcIncludedPerPeriod: open("MOD-07"),
      lmcTopupDiscountPercent: open("MOD-08"),
      aiMonthlyRuns: known(300, "prior_art", `${V2} agency_start.aiAssistMonthlyRuns (alias agency_pilot→agency_start)`),
      cvExportsPerMonth: open("MOD-04"),
      expandedCv: open("MOD-04"),
      activeJobAds: known(10, "prior_art", `${V2} agency_start.activeAdLimit`),
      openDemands: known(25, "binding", `${CODE_B}: company_create_needs`),
      counterpartySearch: open("MOD-04"),
      workerPool: known(true, "binding", `${CODE_B}: worker_pool`),
      apiCallsPerMonth: open("MOD-05"),
      workspaceProjects: open("MOD-04"),
      teamSeats: open("MOD-04"),
      managedCompanies: known(3, "prior_art", `${V2} agency_start.managedCompanies`),
      chat: known(true, "binding", `${CODE_B}: communication`),
      analytics: open("MOD-04"),
      dataExport: open("MOD-04"),
      internalPromotion: known(false, "prior_art", `${V2} agency_start.internalPromotion`),
      visibilityBoost: known(false, "prior_art", `${V2} agency_start.visibilityBoost`),
      mediaGalleryItems: known(100, "prior_art", `${V2} agency_start.mediaGalleryItems`),
      readinessChecklistCountries: open("MOD-04"),
      support: open("MOD-04"),
    },
    inputs: [
      `${V2}: agency tiers START 99.99 / GROWTH 249.99 / SCALE 499.99 €`,
      "Train doc §6: agency treated as company class ×3 unless the owner declares a separate class",
      "Train doc §6: whether 3 agency tiers survive as one pilot tier is undecided (MOD-02)",
    ],
  },
  {
    planKey: "admin_internal",
    audience: "admin",
    displayName: null,
    monthlyPrice: { cents: 0, currency: "EUR", provenance: { status: "binding", source: `${CODE_B}: accessState "internal"` } },
    annualPrice: { cents: 0, currency: "EUR", provenance: { status: "binding", source: `${CODE_B}: accessState "internal"` } },
    stripeProductSlot: "none (never sold)",
    stripePriceEnvVar: null,
    entitlements: {
      lmcIncludedPerPeriod: open("MOD-07"),
      lmcTopupDiscountPercent: open("MOD-08"),
      aiMonthlyRuns: open("MOD-04"),
      cvExportsPerMonth: open("MOD-04"),
      expandedCv: open("MOD-04"),
      activeJobAds: open("MOD-04"),
      openDemands: open("MOD-04"),
      counterpartySearch: open("MOD-04"),
      workerPool: open("MOD-04"),
      apiCallsPerMonth: open("MOD-05"),
      workspaceProjects: open("MOD-04"),
      teamSeats: open("MOD-04"),
      managedCompanies: open("MOD-04"),
      chat: open("MOD-04"),
      analytics: open("MOD-04"),
      dataExport: open("MOD-04"),
      internalPromotion: open("MOD-04"),
      visibilityBoost: open("MOD-04"),
      mediaGalleryItems: open("MOD-04"),
      readinessChecklistCountries: open("MOD-04"),
      support: open("MOD-04"),
    },
    inputs: ["Staff-only tier; never sold, never priced."],
  },
] as const;

// ═══════════════════════════════════════════════════════════════════════════
// II. LMC — the unit (all binding, all recovered)
// ═══════════════════════════════════════════════════════════════════════════

const LEDGER = "supabase/migrations/20260720190000_lmc_ledger_foundation_v1.sql (APPLIED)";
const TRAIN = "docs/product/lmc-commercial-system-train-v1.md";

export const LMC = {
  /** 1 LMC = 1 EUR of internal platform credit. */
  eurPerLmc: 1,
  centsPerLmc: 100,
  provenance: { status: "binding", source: `${TRAIN} §1` } as Provenance,

  /** What LMC is NOT — binding legal positioning, quotable verbatim. */
  positioning:
    "Internal platform credit, usable only for LabourMarket.ai plans, tools and " +
    "eligible internal services. Not a cryptocurrency, not an investment, not an " +
    "electronic-money claim, not a withdrawable balance, not a promise of future " +
    "cash redemption.",

  /** Ways LMC can be created. Nothing else may mint credit. */
  sourceKinds: [
    "purchased",
    "promotional_signup",
    "promotional_activity",
    "admin_grant",
    "referral_reward",
  ] as const,

  grants: {
    signup: {
      lmc: 50,
      condition: "verified signup (auth.users.email_confirmed_at)",
      expiryDays: 60,
      onceEver: true,
      provenance: { status: "binding", source: `${TRAIN} §9` } as Provenance,
    },
    activity: {
      lmc: 50,
      condition: "7 meaningful active days within the first 30 days",
      expiryDays: 60,
      onceEver: true,
      /** The DEFINITION of a meaningful active day does not exist. */
      ownerDecision: "MOD-12",
      provenance: { status: "binding", source: `${TRAIN} §9` } as Provenance,
    },
    perUserPromotionalCeilingLmc: 100,
    adminGrantMaxLmc: 1000,
    adminGrantMaxExpiryDays: 365,
    dailyRewardForbidden: true,
  },

  referral: {
    /** No rate exists anywhere; none may default in. */
    rate: null,
    ownerDecision: "MOD-13",
    expiryPolicy: null,
    expiryOwnerDecision: "MOD-14",
    singleLevelOnly: true,
    structurallyEnforced: false, // documentary only — MOD-16
    provenance: { status: "binding", source: `${TRAIN} §1, §7` } as Provenance,
  },

  spendOrder: [
    "promotional / expiring lots first, earliest expires_at (tie: lot id)",
    "then purchased lots, oldest first (tie: lot id)",
    "expired remainders are never spendable",
    "purchased lots never expire by promotional rules",
  ] as const,

  reversal: {
    rule: "every reversal references its original entry; exactly one per original",
    purchasedOnly: ["refund_reversal", "chargeback_reversal"],
    otherKinds: ["reversal"],
    recoverySpentValue: null, // Wagon 6 fraud tooling — MOD-15
    provenance: { status: "binding", source: `${TRAIN} §10` } as Provenance,
  },

  expiry: {
    promotionalDays: 60,
    runner: "pnpm -C apps/web lmc:expire-lots",
    provenance: { status: "binding", source: `${TRAIN} §9 + ${LEDGER}` } as Provenance,
  },

  /** Kill-switches, with the authority required to flip each. */
  flags: {
    lmc_purchases_enabled: "admin",
    lmc_promotional_grants_enabled: "admin",
    lmc_referrals_enabled: "admin",
    lmc_spending_enabled: "admin",
    stripe_lmc_topups_enabled: "owner_only",
    live_payments_enabled: "owner_only",
  },
} as const;

// ═══════════════════════════════════════════════════════════════════════════
// III. LMC TOP-UP PACKAGES
// ═══════════════════════════════════════════════════════════════════════════

export interface TopUpPackage {
  /** Stable slot code. */
  readonly code: string;
  /** LMC delivered. `null` = the denomination itself is undecided. */
  readonly lmc: number | null;
  /** What the buyer pays. */
  readonly price: Amount;
  /** Bonus LMC on top (promotional-class value → carries expiry consequences). */
  readonly bonusLmc: number | null;
  readonly stripeProductSlot: string;
  readonly stripePriceEnvVar: string | null;
  readonly ownerDecision: string;
}

/**
 * NO top-up package exists. "top-up" occurs 54 times across docs, code and
 * migrations and NOT ONE occurrence carries an amount (verified 2026-07-28).
 *
 * The denominations the owner sketched in the task prompt (50 / 100 / 250 /
 * 500 / 1000 / 2500 / 5000 LMC) are recorded below as SLOTS so the structure
 * is ready to generate — with `lmc: null` and no price, because a sketch in a
 * prompt is not a recorded decision and this file may not contain a number
 * the owner has not set.
 */
export const TOPUP_PACKAGE_SLOTS: readonly TopUpPackage[] = (
  ["t1", "t2", "t3", "t4", "t5", "t6", "t7"] as const
).map((code) => ({
  code: `topup_${code}`,
  lmc: null,
  price: openAmount("MOD-09"),
  bonusLmc: null,
  stripeProductSlot: `STRIPE_PRODUCT_LMC_TOPUP_${code.toUpperCase()} (owner-created)`,
  stripePriceEnvVar: null,
  ownerDecision: "MOD-09",
}));

export const TOPUP_RULES = {
  /** Binding: a top-up may be bought without any subscription. */
  subscriptionNotRequired: true,
  /** Binding: purchased LMC never expires by promotional rules. */
  purchasedNeverExpires: true,
  /** Binding: Stripe sells only subscriptions and LMC top-ups. */
  soldVia: "stripe",
  minimumTopUp: null, // MOD-10
  maximumTopUp: null, // MOD-10
  vatTreatment: null, // MOD-11
  refundPolicyUnspent: null, // MOD-11
  provenance: { status: "binding", source: `${TRAIN} §8` } as Provenance,
} as const;

// ═══════════════════════════════════════════════════════════════════════════
// IV. MICRO-FEATURES (purchasable with LMC)
// ═══════════════════════════════════════════════════════════════════════════

export type MicroFeatureAudience = "worker" | "company" | "agency" | "any";

export interface MicroFeature {
  /** Unique code — the recovered registry slug (not a new invention). */
  readonly code: string;
  readonly displayNameKey: string;
  readonly description: string;
  readonly audience: MicroFeatureAudience;
  /** Price in LMC. `null` for every feature: no LMC price exists anywhere. */
  readonly lmcPrice: number | null;
  /** Is this also included in some plan? */
  readonly includedInPlans: readonly string[];
  /** Can it be bought standalone (no subscription)? Binding rule: yes. */
  readonly purchasableStandalone: boolean;
  /** What buying it grants — the entitlement delta. */
  readonly grants: Readonly<Record<string, number | string | boolean>>;
  /** How long the granted entitlement lasts. */
  readonly validity: string | null;
  readonly ownerDecision: string;
  readonly provenance: Provenance;
}

const AD_REGISTRY =
  "PR #754 dc051b45 lib/billing/ad-products.ts + supabase/migrations/20260714191000_ad_products_registry_v1.sql (never applied; every price_cents NULL, active=false)";

/**
 * The ONLY candidate micro-feature list any artefact records: the 8 job-ad
 * products from PR #754. The train doc (§3.1 row 12) REPLACED the registry as
 * a purchase path while keeping the concept — "internal tools purchasable with
 * LMC" — so this list is a candidate set, not a decided catalogue (MOD-17).
 *
 * Every `lmcPrice` is null. Not one LMC price for any feature exists in the
 * repository, in any branch, in any document, or in the database.
 */
export const MICRO_FEATURES: readonly MicroFeature[] = [
  {
    code: "single_ad",
    displayNameKey: "pricingV2.adProducts.items.single_ad",
    description: "One job advertisement.",
    audience: "company",
    lmcPrice: null,
    includedInPlans: [],
    purchasableStandalone: true,
    grants: { adCredits: 1, promotion: "none", international: false },
    validity: null,
    ownerDecision: "MOD-18",
    provenance: { status: "prior_art", source: AD_REGISTRY },
  },
  {
    code: "ai_promoted_ad",
    displayNameKey: "pricingV2.adProducts.items.ai_promoted_ad",
    description: "One job advertisement with AI promotion.",
    audience: "company",
    lmcPrice: null,
    includedInPlans: [],
    purchasableStandalone: true,
    grants: { adCredits: 1, promotion: "ai", international: false },
    validity: null,
    ownerDecision: "MOD-18",
    provenance: { status: "prior_art", source: AD_REGISTRY },
  },
  {
    code: "premium_promoted_ad",
    displayNameKey: "pricingV2.adProducts.items.premium_promoted_ad",
    description: "One job advertisement with premium promotion.",
    audience: "company",
    lmcPrice: null,
    includedInPlans: [],
    purchasableStandalone: true,
    grants: { adCredits: 1, promotion: "premium", international: false },
    validity: null,
    ownerDecision: "MOD-18",
    provenance: { status: "prior_art", source: AD_REGISTRY },
  },
  {
    code: "international_ad",
    displayNameKey: "pricingV2.adProducts.items.international_ad",
    description: "One job advertisement with cross-market reach.",
    audience: "company",
    lmcPrice: null,
    includedInPlans: [],
    purchasableStandalone: true,
    grants: { adCredits: 1, promotion: "none", international: true },
    validity: null,
    ownerDecision: "MOD-18",
    provenance: { status: "prior_art", source: AD_REGISTRY },
  },
  {
    code: "package_5",
    displayNameKey: "pricingV2.adProducts.items.package_5",
    description: "Five job advertisements.",
    audience: "company",
    lmcPrice: null,
    includedInPlans: [],
    purchasableStandalone: true,
    grants: { adCredits: 5, promotion: "none", international: false },
    validity: null,
    ownerDecision: "MOD-18",
    provenance: { status: "prior_art", source: AD_REGISTRY },
  },
  {
    code: "package_20",
    displayNameKey: "pricingV2.adProducts.items.package_20",
    description: "Twenty job advertisements.",
    audience: "company",
    lmcPrice: null,
    includedInPlans: [],
    purchasableStandalone: true,
    grants: { adCredits: 20, promotion: "none", international: false },
    validity: null,
    ownerDecision: "MOD-18",
    provenance: { status: "prior_art", source: AD_REGISTRY },
  },
  {
    code: "agency_package",
    displayNameKey: "pricingV2.adProducts.items.agency_package",
    description: "Twenty job advertisements with standard promotion, for agencies.",
    audience: "agency",
    lmcPrice: null,
    includedInPlans: [],
    purchasableStandalone: true,
    grants: { adCredits: 20, promotion: "standard", international: false },
    validity: null,
    ownerDecision: "MOD-18",
    provenance: { status: "prior_art", source: AD_REGISTRY },
  },
  {
    code: "extra_promotion",
    displayNameKey: "pricingV2.adProducts.items.extra_promotion",
    description: "Additional promotion boost; grants no ad credit.",
    audience: "any",
    lmcPrice: null,
    includedInPlans: [],
    purchasableStandalone: true,
    grants: { adCredits: 0, promotion: "boost", international: false },
    validity: null,
    ownerDecision: "MOD-18",
    provenance: { status: "prior_art", source: AD_REGISTRY },
  },
] as const;

// ═══════════════════════════════════════════════════════════════════════════
// V. PLAN + LMC COMBINATION RULES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The only combination model any artefact describes:
 *
 *   effective allowance = plan allowance + purchased add-on
 *   ("unlimited" on the plan short-circuits; add-ons cannot exceed it)
 *
 * Recovered from `resolveActiveAdAllowance` (PR #754) and kept because the
 * train doc preserved the concept while replacing the purchase currency
 * (EUR ad-credits → LMC).
 */
export function resolveEffectiveAllowance(
  planAllowance: number | "unlimited",
  purchasedUnits: number,
): number | "unlimited" {
  if (planAllowance === "unlimited") return "unlimited";
  const extra =
    Number.isFinite(purchasedUnits) && purchasedUnits > 0 ? Math.floor(purchasedUnits) : 0;
  return planAllowance + extra;
}

export const PLAN_LMC_RULES = {
  /** Binding: internal tools are bought inside the platform with LMC. */
  toolsBoughtWithLmc: true,
  /** Binding: a free user may buy a tool by topping up, with no subscription. */
  standalonePurchaseAllowed: true,
  /** Binding: Stripe sells subscriptions and top-ups only — never a tool. */
  stripeSellsToolsDirectly: false,
  /** Open: whether plan allowances (AI runs, exports, ads) are LMC-extendable. */
  planAllowancesExtendableWithLmc: null, // MOD-19
  /** Open: how a spend becomes an entitlement (no product code, no mapping). */
  spendToEntitlementMapping: null, // MOD-20
  provenance: { status: "binding", source: `${TRAIN} §8, §3.1 row 12` } as Provenance,
} as const;

// ═══════════════════════════════════════════════════════════════════════════
// VI. ENTITLEMENT SOURCES
// ═══════════════════════════════════════════════════════════════════════════

/** The ONLY three ways a right may be obtained. Nothing else grants access. */
export type EntitlementSource = "plan" | "lmc" | "admin";

export interface EntitlementBinding {
  readonly key: string;
  readonly sources: readonly EntitlementSource[];
  /** Is the right actually enforced on the server today? */
  readonly enforcedToday: boolean;
  readonly site: string;
}

/**
 * Every entitlement key in the product, and where its authority comes from.
 * `enforcedToday` is deliberately honest: exactly one key is server-gated.
 */
export const ENTITLEMENT_BINDINGS: readonly EntitlementBinding[] = [
  { key: "worker_profile", sources: ["plan"], enforcedToday: false, site: "free surface" },
  { key: "worker_journal", sources: ["plan"], enforcedToday: false, site: "free surface" },
  { key: "worker_basic_skills", sources: ["plan"], enforcedToday: false, site: "free surface" },
  { key: "readiness_checklist_countries", sources: ["plan", "lmc"], enforcedToday: false, site: "lib/billing/entitlements-v1.ts" },
  { key: "document_expiry_reminders", sources: ["plan"], enforcedToday: false, site: "lib/billing/entitlements-v1.ts" },
  { key: "expanded_cv", sources: ["plan", "lmc"], enforcedToday: false, site: "lib/billing/entitlements-v1.ts" },
  { key: "priority_visibility", sources: ["plan", "lmc"], enforcedToday: false, site: "not built" },
  { key: "company_create_needs", sources: ["plan", "lmc"], enforcedToday: false, site: "lib/billing/entitlements-v1.ts" },
  { key: "candidate_readiness_summaries", sources: ["plan"], enforcedToday: false, site: "lib/billing/entitlements-v1.ts" },
  { key: "booking_requests", sources: ["plan"], enforcedToday: true, site: "lib/booking/booking-actions.ts" },
  { key: "communication", sources: ["plan"], enforcedToday: false, site: "lib/billing/entitlements-v1.ts" },
  { key: "team_matching", sources: ["plan"], enforcedToday: false, site: "lib/billing/entitlements-v1.ts" },
  { key: "agency_multi_company", sources: ["plan"], enforcedToday: false, site: "lib/billing/entitlements-v1.ts" },
  { key: "worker_pool", sources: ["plan"], enforcedToday: false, site: "lib/billing/entitlements-v1.ts" },
  { key: "doc_readiness_tracking", sources: ["plan"], enforcedToday: false, site: "lib/billing/entitlements-v1.ts" },
  { key: "booking_pipeline", sources: ["plan"], enforcedToday: false, site: "lib/billing/entitlements-v1.ts" },
  { key: "verify_documents", sources: ["admin"], enforcedToday: true, site: "lib/auth/superadmin.ts" },
  { key: "manage_country_rules", sources: ["admin"], enforcedToday: true, site: "lib/auth/superadmin.ts" },
  { key: "manage_pilots", sources: ["admin"], enforcedToday: true, site: "lib/auth/superadmin.ts" },
] as const;

// ═══════════════════════════════════════════════════════════════════════════
// VII. GENERATION SEAM
// ═══════════════════════════════════════════════════════════════════════════

export interface StripeProductPlan {
  readonly planKey: string;
  readonly productSlot: string;
  readonly priceEnvVar: string | null;
  readonly monthlyCents: number | null;
  readonly annualCents: number | null;
  readonly ready: boolean;
  readonly blockedBy: readonly string[];
}

/**
 * What the owner would have to create in Stripe. A plan is `ready: false`
 * while any required amount is an open decision — the generator refuses to
 * emit a product for a price nobody has set.
 */
export function stripeProductPlan(): readonly StripeProductPlan[] {
  return SUBSCRIPTION_PLANS.filter((p) => p.stripePriceEnvVar !== null).map((p) => {
    const blockedBy: string[] = [];
    if (!isDecided(p.monthlyPrice)) blockedBy.push(p.monthlyPrice.ownerDecision);
    if (!isDecided(p.annualPrice)) blockedBy.push(p.annualPrice.ownerDecision);
    if (p.displayName === null) blockedBy.push("MOD-02");
    return {
      planKey: p.planKey,
      productSlot: p.stripeProductSlot,
      priceEnvVar: p.stripePriceEnvVar,
      monthlyCents: isDecided(p.monthlyPrice) ? p.monthlyPrice.cents : null,
      annualCents: isDecided(p.annualPrice) ? p.annualPrice.cents : null,
      ready: blockedBy.length === 0,
      blockedBy: [...new Set(blockedBy)],
    };
  });
}

/** Rows the `public.plans` table would carry if generated from this catalogue. */
export function plansTableRows(): readonly {
  slug: string;
  price_eur_monthly: number | null;
}[] {
  return SUBSCRIPTION_PLANS.map((p) => ({
    slug: p.planKey,
    price_eur_monthly: isDecided(p.monthlyPrice) ? p.monthlyPrice.cents / 100 : null,
  }));
}

/**
 * The price a UI surface may render for a plan. `null` means the surface MUST
 * render the honest "not set" state — never a placeholder that looks like a
 * price, never a number from anywhere else.
 */
export function uiMonthlyPriceCents(planKey: string): number | null {
  const plan = SUBSCRIPTION_PLANS.find((p) => p.planKey === planKey);
  if (!plan) return null;
  return isDecided(plan.monthlyPrice) ? plan.monthlyPrice.cents : null;
}

/** Is the commercial system generatable end-to-end today? */
export function isCatalogueComplete(): boolean {
  return unresolvedOwnerDecisions().length === 0;
}

// ═══════════════════════════════════════════════════════════════════════════
// IX. OPEN OWNER DECISIONS
// ═══════════════════════════════════════════════════════════════════════════

export const OWNER_DECISIONS: readonly OwnerDecision[] = [
  { id: "MOD-01", question: "Final monthly price of every paid plan.", blocks: "Stripe products, /pricing, checkout, the entire paid chain.", inputs: ["PR #754 base table (owner-confirmed 2026-07-14, then marked input-only)", "Train doc §6 multipliers: personal ×2, company/agency ×3", "Exact results: 19.98 / 49.98 / 297.00 / 299.97 / 749.97 / 1499.97 €", "Proposed roundings are labelled NOT FINAL"] },
  { id: "MOD-02", question: "Which plan catalogue and which names survive (PRE_PAYMENT_PLANS vs PLAN_CATALOGUE_V2 vs public.plans).", blocks: "Everything keyed on a plan slug.", inputs: ["Three catalogues share zero slugs", "PRE_PAYMENT_PLANS is what the runtime + Stripe env vars use", "PLAN_CATALOGUE_V2 has the richer entitlement shape", "public.plans is orphaned since 2026-05-19"] },
  { id: "MOD-03", question: "Whether annual terms are sold at all, and at what price.", blocks: "Annual Stripe prices; any annual discount.", inputs: ["PR #754 mentions an annual Launch Offer price (1188 €/yr before discount) as an example only", "The 15% first-annual discount was REJECTED as stale (train doc §3.1 row 11)"] },
  { id: "MOD-04", question: "Per-plan allowances for the axes no artefact ever set: CV exports, open demands (worker side), counterparty search, workspace projects, team seats, analytics, data export, support tier.", blocks: "Plan comparison table; enforcement.", inputs: ["public.plans.features JSON holds projects/job_demands/worker_search/support for 4 orphaned slugs", "PR #754 set ads, AI runs, media, managed companies only"] },
  { id: "MOD-05", question: "API access: is there a public API product, and what are the per-plan call limits?", blocks: "API productisation.", inputs: ["No API product, no rate tier and no API entitlement exists anywhere in the repository"] },
  { id: "MOD-06", question: "Company job-ad allowance, now that the unlimited Launch Offer is rejected.", blocks: "Company tier definition; ad micro-features.", inputs: ["Owner rule: normal company plans do NOT include unlimited ads", "The only unlimited exceptions were Launch Offer (rejected) and agency SCALE", "Train doc §6: unlimited entitlements are the largest margin risk"] },
  { id: "MOD-07", question: "How much LMC (if any) each plan includes per period.", blocks: "Plan↔LMC privileges; liability model.", inputs: ["No artefact records any plan-included LMC", "Promotional ceiling is 100 LMC per user, one-off, not per period"] },
  { id: "MOD-08", question: "Whether plans grant a discount on LMC top-ups, and how much.", blocks: "Top-up pricing per plan.", inputs: ["No artefact records any top-up discount"] },
  { id: "MOD-09", question: "LMC top-up package denominations, prices and bonus structure.", blocks: "Selling any credit at all.", inputs: ["'top-up' occurs 54 times across the repo; not one occurrence carries an amount", "Owner sketched 50/100/250/500/1000/2500/5000 LMC in the task prompt (2026-07-28) — a sketch, not a recorded decision", "1 LMC = 1 EUR fixes the face value; the bonus is the open commercial lever", "A bonus lot is promotional-class value and inherits expiry consequences"] },
  { id: "MOD-10", question: "Minimum and maximum top-up per transaction.", blocks: "Abuse bounds; Stripe product shape.", inputs: ["Admin grants are capped at 1000 LMC as a comparable bound"] },
  { id: "MOD-11", question: "VAT treatment of a credit purchase, revenue recognition for LMC-settled months, and the refund policy for unspent purchased LMC.", blocks: "Legal/finance sign-off; the intercompany IP licence fee base.", inputs: ["docs/legal/intercompany-ip-licence-accounting-schedule-v1.md is silent on credit-settled transactions", "refund_reversal / chargeback_reversal RPCs exist for purchased lots; the customer-facing policy does not"] },
  { id: "MOD-12", question: "Definition of a 'meaningful active day' (gates the second 50-LMC grant).", blocks: "Promotional grant wiring.", inputs: ["Train doc §9 fixes the amount and the 7-of-30-days rule; the activity definition was deferred to Wagon 2 and never written"] },
  { id: "MOD-13", question: "Referral reward rate r.", blocks: "The referral network.", inputs: ["Every referral cell in the pricing matrix is the formula r × price, with r deliberately undefined", "Train doc §14 gate 3 requires an owner-approved rate before referrals may exist"] },
  { id: "MOD-14", question: "Referral-lot expiry policy.", blocks: "Liability model.", inputs: ["The lot-expiry CHECK exempts referral_reward, so a referral lot may be perpetual"] },
  { id: "MOD-15", question: "Recovery of already-spent value (clawback, freeze, negative balance) and the flag policy classes for referrals + promotional grants.", blocks: "Fraud tooling; governance.", inputs: ["Wagon 1 reverses only the remaining unspent value", "referrals + promotional grants are class admin, while train doc §14 requires an owner decision"] },
  { id: "MOD-16", question: "The schema shape that structurally enforces single-level referrals.", blocks: "The no-MLM guarantee.", inputs: ["No referral-relationship table, no referred_by column and no depth constraint exist", "The rule is currently documentary only"] },
  { id: "MOD-17", question: "The definitive list of LMC-purchasable micro-features.", blocks: "The LMC economy.", inputs: ["The 8 ad products are the only recovered candidates", "Train doc §3.1 row 12 REPLACED the registry while keeping the concept"] },
  { id: "MOD-18", question: "The LMC price and validity of every micro-feature.", blocks: "The LMC economy.", inputs: ["Not one LMC price for any feature exists in the repository, any branch, any document, or the database", "Every ad_products row seeds price_cents NULL, active false"] },
  { id: "MOD-19", question: "Whether plan allowances (AI runs, CV exports, ads, API calls) are extendable with LMC, and at what unit rate.", blocks: "Plan+LMC combination.", inputs: ["PR #754 priced ads only", "resolveEffectiveAllowance already models plan + purchased units"] },
  { id: "MOD-20", question: "How an LMC spend becomes an entitlement (product code, registry, conversion, duration).", blocks: "Every LMC purchase.", inputs: ["lmc_spend_v1 records a free-text reason and has no caller", "There is no product-code column and no tool registry"] },
  { id: "MOD-21", question: "Where the Stripe top-up route lives.", blocks: "Wagon 4.", inputs: ["Train doc §8 says Stripe sells top-ups", "PR #844's separation guard fails the build if a top-up surface appears under /api/billing"] },
  { id: "MOD-22", question: "Wallet / top-up / referral UI and the consumer copy explaining a non-withdrawable credit.", blocks: "Wagon 7.", inputs: ["Train doc §12 lists the surfaces, never their design", "Zero user-facing LMC strings exist in all 11 locale catalogues — the intended state until copy is reviewed"] },
  { id: "MOD-23", question: "Do the concierge fees and the AI-automation service packages belong to this catalogue, or are they a separate business line?", blocks: "Positioning; the Terms; what /pricing may show.", inputs: ["messages/*.json services.offers[] carry 600/900/1200/1500/1900 € — the only real prices on the live site — and map to no plan, no entitlement and no Stripe object", "docs/launch/concierge-worker-sourcing-pricing-addendum-v1.md records 300-700 € per worker, 1000-2000 € per brigade/company, 250-500 € coordination as DRAFT launch-partner ranges, owner-set per deal", "Neither is covered by the current Terms"] },
] as const;

/**
 * Every open owner decision. The register lists ONLY open decisions, so this
 * is the whole register until the owner closes one (closing a decision means
 * writing its value into the data above and deleting its entry here).
 */
export function unresolvedOwnerDecisions(): readonly string[] {
  return OWNER_DECISIONS.map((d) => d.id);
}

/**
 * The subset that blocks a CONCRETE catalogue field (a price, an allowance, a
 * package). The rest are policy, legal, governance or UI decisions that block
 * activation rather than a specific row.
 */
export function dataBlockedDecisions(): readonly string[] {
  const ids = new Set<string>();
  for (const p of SUBSCRIPTION_PLANS) {
    if (!isDecided(p.monthlyPrice)) ids.add(p.monthlyPrice.ownerDecision);
    if (!isDecided(p.annualPrice)) ids.add(p.annualPrice.ownerDecision);
    if (p.displayName === null) ids.add("MOD-02");
    for (const a of Object.values(p.entitlements)) {
      if (a.value === null) ids.add((a as { ownerDecision: string }).ownerDecision);
    }
  }
  for (const t of TOPUP_PACKAGE_SLOTS) ids.add(t.ownerDecision);
  for (const f of MICRO_FEATURES) {
    ids.add(f.ownerDecision);
    if (f.lmcPrice === null) ids.add("MOD-18");
  }
  ids.add(LMC.grants.activity.ownerDecision);
  ids.add(LMC.referral.ownerDecision);
  ids.add(LMC.referral.expiryOwnerDecision);
  return [...ids].sort();
}

/** Counts for the owner report (Part X). */
export function catalogueSummary() {
  const stripe = stripeProductPlan();
  return {
    plans: SUBSCRIPTION_PLANS.length,
    paidPlans: SUBSCRIPTION_PLANS.filter((p) => p.stripePriceEnvVar !== null).length,
    topUpSlots: TOPUP_PACKAGE_SLOTS.length,
    topUpPackagesDecided: TOPUP_PACKAGE_SLOTS.filter((t) => t.lmc !== null).length,
    microFeatures: MICRO_FEATURES.length,
    microFeaturesPriced: MICRO_FEATURES.filter((f) => f.lmcPrice !== null).length,
    stripeProductsRequired: stripe.length + TOPUP_PACKAGE_SLOTS.length,
    stripeProductsGeneratable: stripe.filter((s) => s.ready).length,
    stripePricesRequired: stripe.length * 2 + TOPUP_PACKAGE_SLOTS.length,
    stripePricesGeneratable: stripe.filter((s) => s.ready).length * 2,
    entitlements: ENTITLEMENT_BINDINGS.length,
    entitlementsEnforcedToday: ENTITLEMENT_BINDINGS.filter((e) => e.enforcedToday).length,
    ownerDecisionsOpen: unresolvedOwnerDecisions().length,
    ownerDecisionsBlockingData: dataBlockedDecisions().length,
  };
}

/**
 * Integrity check used by the guard: every decision id referenced by a data
 * field must be declared in the register. A dangling id would mean a value is
 * missing with no question recorded for the owner.
 */
export function danglingDecisionIds(): readonly string[] {
  const declared = new Set(OWNER_DECISIONS.map((d) => d.id));
  return dataBlockedDecisions().filter((id) => !declared.has(id));
}
