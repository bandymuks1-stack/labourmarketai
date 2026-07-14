/**
 * Launch Offer window + first-annual discount eligibility — PURE core
 * (Pricing & Payments slice, Sprint v2 §9–§10). No IO.
 *
 * Owner rules encoded here (exact, pinned by offers.test.ts):
 *   - PROJECT LAUNCH OFFER (companies, 99 €/mo) is valid UNTIL 2026-10-31
 *     (inclusive, UTC day) — visible on the pricing page with that date.
 *   - A company that ACTIVATES the Launch Offer inside that window
 *     automatically becomes eligible for a 15% discount on its FIRST annual
 *     subscription, IF that annual subscription is activated BEFORE
 *     2027-01-01 (exclusive, UTC). The system remembers eligibility
 *     automatically: the server-only webhook chain writes a
 *     billing_offer_eligibility row (offer-store.ts) — no manual step.
 *
 * Timezone decision (documented): all window boundaries are UTC. "Until
 * 2026-10-31" = activation_at <= 2026-10-31T23:59:59.999Z. "Before
 * 2027-01-01" = activation_at < 2027-01-01T00:00:00.000Z.
 *
 * Payments stay OFF (kill-switch in plans.ts): this logic runs only inside
 * the Stripe TEST chain until the owner activates billing.
 */

export const LAUNCH_OFFER_PLAN_SLUG = "launch_offer_99" as const;
export const LAUNCH_OFFER_ELIGIBILITY_SLUG = "launch_offer_15pct_annual" as const;

/** Last UTC day (inclusive) the Launch Offer can be activated. */
export const LAUNCH_OFFER_VALID_UNTIL_ISO = "2026-10-31" as const;
/** UTC day (exclusive) before which the discounted FIRST annual must activate. */
export const FIRST_ANNUAL_DISCOUNT_DEADLINE_ISO = "2027-01-01" as const;
export const FIRST_ANNUAL_DISCOUNT_PERCENT = 15 as const;

const LAUNCH_OFFER_WINDOW_END_MS = Date.parse(
  `${LAUNCH_OFFER_VALID_UNTIL_ISO}T23:59:59.999Z`,
);
const DISCOUNT_DEADLINE_MS = Date.parse(
  `${FIRST_ANNUAL_DISCOUNT_DEADLINE_ISO}T00:00:00.000Z`,
);

function toMs(at: Date | string): number | null {
  const ms = at instanceof Date ? at.getTime() : Date.parse(at);
  return Number.isFinite(ms) ? ms : null;
}

/** Is the Launch Offer activation window still open at `at` (UTC)? */
export function launchOfferWindowOpen(at: Date | string): boolean {
  const ms = toMs(at);
  return ms !== null && ms <= LAUNCH_OFFER_WINDOW_END_MS;
}

/**
 * Does a Launch Offer activation at `activationAt` EARN the 15% first-annual
 * discount eligibility? (Same window as the offer itself.)
 */
export function earnsFirstAnnualDiscount(activationAt: Date | string): boolean {
  return launchOfferWindowOpen(activationAt);
}

/**
 * Can an earned eligibility be CONSUMED by an annual subscription activation?
 * All conditions honest and explicit — no partial credit:
 *   - eligibility exists and is not already consumed;
 *   - the annual subscription is the customer's FIRST annual one;
 *   - its activation happens before 2027-01-01 (UTC, exclusive).
 */
export function firstAnnualDiscountApplies(input: {
  eligibilityEarned: boolean;
  consumedAt: string | null;
  annualActivationAt: Date | string;
  isFirstAnnual: boolean;
}): boolean {
  if (!input.eligibilityEarned) return false;
  if (input.consumedAt !== null) return false;
  if (!input.isFirstAnnual) return false;
  const ms = toMs(input.annualActivationAt);
  return ms !== null && ms < DISCOUNT_DEADLINE_MS;
}

/** 15% off, rounded to the nearest cent (banker-free simple rounding). */
export function applyFirstAnnualDiscountCents(annualPriceCents: number): number {
  if (!Number.isFinite(annualPriceCents) || annualPriceCents < 0) return 0;
  return Math.round(
    annualPriceCents * (1 - FIRST_ANNUAL_DISCOUNT_PERCENT / 100),
  );
}

export interface LaunchOfferEligibilityRow {
  readonly profile_id: string;
  readonly offer_slug: typeof LAUNCH_OFFER_ELIGIBILITY_SLUG;
  readonly activation_at: string;
  readonly earned_from_plan: string;
  readonly apply_before: string;
  readonly discount_percent: typeof FIRST_ANNUAL_DISCOUNT_PERCENT;
  readonly test_mode: boolean;
}

/**
 * Build the eligibility row the system writes automatically when a company
 * activates the Launch Offer inside the window. Returns null (nothing to
 * remember) when the plan is not the Launch Offer or the activation falls
 * outside the window — never a fabricated eligibility.
 */
export function buildLaunchOfferEligibilityRow(input: {
  profileId: string;
  /** V2-resolved plan slug of the activated subscription. */
  planV2Slug: string | null;
  activationAtIso: string;
  testMode: boolean;
}): LaunchOfferEligibilityRow | null {
  if (input.planV2Slug !== LAUNCH_OFFER_PLAN_SLUG) return null;
  if (!input.profileId) return null;
  if (!earnsFirstAnnualDiscount(input.activationAtIso)) return null;
  return {
    profile_id: input.profileId,
    offer_slug: LAUNCH_OFFER_ELIGIBILITY_SLUG,
    activation_at: input.activationAtIso,
    earned_from_plan: LAUNCH_OFFER_PLAN_SLUG,
    apply_before: `${FIRST_ANNUAL_DISCOUNT_DEADLINE_ISO}T00:00:00.000Z`,
    discount_percent: FIRST_ANNUAL_DISCOUNT_PERCENT,
    test_mode: input.testMode,
  };
}
