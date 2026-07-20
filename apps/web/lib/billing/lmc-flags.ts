/**
 * LMC commercial kill-switches — Wagon 1 of the LMC Commercial System Train
 * (docs/product/lmc-commercial-system-train-v1.md).
 *
 * LMC is the internal LabourMarket.ai platform credit (1 LMC = 1 EUR of
 * internal credit). LMC is usable only for LabourMarket.ai plans, tools and
 * eligible internal services. It is not a cryptocurrency, not an investment,
 * not an electronic-money claim, not a withdrawable balance and not a promise
 * of future cash redemption.
 *
 * Same canonical kill-switch-constant pattern as PAYMENTS_ENABLED in
 * lib/billing/plans.ts: literal `false as const`, pinned by
 * lib/guards/lmc-ledger-foundation.test.ts. The database mirrors these in
 * public.lmc_settings (all seeded false; a missing row reads as false).
 *
 * Flipping ANY of these is an owner-only production gate (train doc §14).
 * No referral reward rate exists anywhere; zero reward is issued without an
 * explicit owner-approved active configuration.
 */

export const LMC_PURCHASES_ENABLED = false as const;
export const LMC_PROMOTIONAL_GRANTS_ENABLED = false as const;
export const LMC_REFERRALS_ENABLED = false as const;
export const STRIPE_LMC_TOPUPS_ENABLED = false as const;
export const LIVE_PAYMENTS_ENABLED = false as const;
/** Spend kill-switch: while false, even already-issued LMC is frozen. */
export const LMC_SPENDING_ENABLED = false as const;

/** True only when some commercial LMC behaviour is enabled — never in Wagon 1. */
export function lmcCommerceEnabled(): boolean {
  return (
    LMC_PURCHASES_ENABLED ||
    LMC_PROMOTIONAL_GRANTS_ENABLED ||
    LMC_REFERRALS_ENABLED ||
    STRIPE_LMC_TOPUPS_ENABLED ||
    LIVE_PAYMENTS_ENABLED ||
    LMC_SPENDING_ENABLED
  );
}
