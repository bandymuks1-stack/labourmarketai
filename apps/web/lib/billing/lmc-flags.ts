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
/**
 * Compensation kill-switch: while false, a spend cannot be given back.
 *
 * Class `admin`, not `owner_only`, and the distinction is deliberate.
 * Compensation returns a user's OWN credit after an action this platform
 * charged for and failed to deliver. It moves no external money and creates no
 * financial commitment, so putting it behind the owner-only class would make
 * the remedy for our own outage harder to reach than the outage itself.
 */
export const LMC_COMPENSATION_ENABLED = false as const;

/**
 * Canonical flag authorization classes — the TS mirror of
 * `public.lmc_flag_policy_v1` in the ledger migration (guard-pinned to stay
 * identical):
 * - `admin`: flippable through `lmc_set_flag_v1` by a dual-signal admin.
 * - `owner_only`: owner-only commercial activation. The shared DB setter
 *   refuses EVERY caller (admin, superadmin, service_role, caller-supplied
 *   UUID) with the canonical `lmc_owner_only_flag` error; no owner
 *   activation mechanism exists in this wagon (train doc §14a).
 * - `system_locked`: not changeable by anyone; also the fail-closed default
 *   for any key missing from this map — never `admin`.
 */
export const LMC_FLAG_POLICY = {
  lmc_purchases_enabled: "admin",
  lmc_promotional_grants_enabled: "admin",
  lmc_referrals_enabled: "admin",
  lmc_spending_enabled: "admin",
  lmc_compensation_enabled: "admin",
  stripe_lmc_topups_enabled: "owner_only",
  live_payments_enabled: "owner_only",
} as const satisfies Record<string, "admin" | "owner_only" | "system_locked">;

export type LmcFlagPolicyClass = "admin" | "owner_only" | "system_locked";

/** Fail-closed policy lookup: an unknown key is system_locked, never admin. */
export function lmcFlagPolicy(key: string): LmcFlagPolicyClass {
  return (LMC_FLAG_POLICY as Record<string, LmcFlagPolicyClass>)[key] ?? "system_locked";
}

/** True only when some commercial LMC behaviour is enabled — never in Wagon 1. */
export function lmcCommerceEnabled(): boolean {
  return (
    LMC_PURCHASES_ENABLED ||
    LMC_PROMOTIONAL_GRANTS_ENABLED ||
    LMC_REFERRALS_ENABLED ||
    STRIPE_LMC_TOPUPS_ENABLED ||
    LIVE_PAYMENTS_ENABLED ||
    LMC_SPENDING_ENABLED ||
    LMC_COMPENSATION_ENABLED
  );
}
