/**
 * LMC TOP-UP PACKAGES — the ONE configuration source for what a Stripe top-up
 * may sell (LMC Commercial System Train, Wagon 4).
 *
 * OWNER DECISION OPEN — MDD-03 (denominations), MDD-04 (min/max), MDD-05
 * (volume bonus), MDD-06 (VAT), MDD-08 (refund policy); owner decision
 * 2026-10-21 item 6 (issue #2628): "top-up package sizes are NOT approved".
 *
 * So the list below is EMPTY, and nothing is sellable. No denomination exists
 * anywhere in this repository: not here, not in a route, not in a default.
 * The owner fills this list (and the guard
 * lib/guards/lmc-topup-test-only.test.ts, which pins it empty, changes in the
 * same reviewed PR). Tests inject their own lists; they never edit this one.
 *
 * Every package names BOTH figures separately: the LMC credited and the money
 * charged. The 1 LMC = 1 EUR peg says what a credit is worth inside the
 * platform; whether a package charges exactly that (bonus, VAT) is MDD-05/06,
 * so the code never derives one figure from the other.
 */

export type LmcTopupApproval =
  | {
      readonly state: "owner_approved";
      /** Where the owner decided it (issue / decision id). */
      readonly decisionRef: string;
      readonly approvedOnIso: string;
    }
  | { readonly state: "owner_unapproved" };

export interface LmcTopupPackage {
  /** Stable slug carried in the session metadata. */
  readonly key: string;
  /** LMC-cents credited on settlement (100 = 1 LMC). */
  readonly creditCents: number;
  /** Amount charged, in the currency's minor unit. */
  readonly chargeMinor: number;
  readonly currency: "eur";
  readonly approval: LmcTopupApproval;
}

/** OWNER-FILLED. Empty by decision (MDD-03 open) — nothing is sellable. */
export const OWNER_APPROVED_LMC_TOPUP_PACKAGES: readonly LmcTopupPackage[] = [];

const KEY_RE = /^[a-z0-9][a-z0-9_-]{1,39}$/;
/** The ledger RPC's own amount ceiling (`p_amount_cents > 100000000` refused). */
const MAX_CENTS = 100_000_000;

/** Structurally valid AND owner-approved — the only packages that may be sold or credited. */
export function isSellableTopupPackage(p: LmcTopupPackage): boolean {
  return (
    p.approval.state === "owner_approved" &&
    p.approval.decisionRef.trim().length > 0 &&
    KEY_RE.test(p.key) &&
    p.currency === "eur" &&
    Number.isSafeInteger(p.creditCents) &&
    p.creditCents > 0 &&
    p.creditCents <= MAX_CENTS &&
    Number.isSafeInteger(p.chargeMinor) &&
    p.chargeMinor > 0 &&
    p.chargeMinor <= MAX_CENTS
  );
}

/**
 * Resolve a package key to a SELLABLE package, or null (unknown, unapproved,
 * malformed, or ambiguous — a duplicated key is refused, never "first wins").
 */
export function findSellableTopupPackage(
  key: unknown,
  packages: readonly LmcTopupPackage[] = OWNER_APPROVED_LMC_TOPUP_PACKAGES,
): LmcTopupPackage | null {
  if (typeof key !== "string" || !KEY_RE.test(key)) return null;
  const matches = packages.filter((p) => p.key === key);
  if (matches.length !== 1) return null;
  return isSellableTopupPackage(matches[0]) ? matches[0] : null;
}
