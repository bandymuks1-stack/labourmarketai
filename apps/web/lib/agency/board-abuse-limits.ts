/**
 * AGENCY BOARD AND OFFERS: ABUSE LIMITS (owner decision 2026-11-22, item 1).
 *
 * The board stays open to every registered agency, and an agency may offer
 * through LabourMarket.ai without prior approval. What is limited is volume:
 * bulk reading of the board, and floods of offers or fake offers.
 *
 *   - burst: per account AND per IP, for board reads and for offers
 *     (`lib/security/rate-limit.ts`; in-memory per instance, a brake on naive
 *     abuse, not a distributed quota — its own header says so);
 *   - caps counted from REAL rows (`agency_candidate_offers`, read with the
 *     caller's own session): open candidates per need, and offers per
 *     account per rolling 24 hours. A count that could not be read refuses
 *     the offer (fail closed), as `lib/limits/request-rate-limits.ts` does.
 *
 * Verification is not a condition here: an unverified agency reads and
 * offers under the same limits.
 *
 * Pure: no IO. The server actions pass counts and the burst decision in.
 */

export const AGENCY_BOARD_LIMITS = {
  /** Board reads per account / per IP in 10 minutes. */
  readPerAccount: { limit: 60, windowMs: 10 * 60 * 1000 },
  readPerIp: { limit: 120, windowMs: 10 * 60 * 1000 },
  /** Offers (candidate offers and "can offer" marks) per account / per IP in 10 minutes. */
  offerPerAccount: { limit: 20, windowMs: 10 * 60 * 1000 },
  offerPerIp: { limit: 40, windowMs: 10 * 60 * 1000 },
  /** Open candidates one agency may have on one need at a time. */
  openOffersPerNeed: 10,
  /** Offers one account may make in a rolling 24 hours. */
  offersPerDay: 50,
} as const;

export type OfferCapDecision =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly reason: "burst" | "need_cap" | "daily_cap" | "counts_unavailable" };

export function decideAgencyOffer(input: {
  readonly burstLimited: boolean;
  /** Open offers of this agency on this need, other than this worker (null = unread). */
  readonly openOnNeed: number | null;
  /** Offers this account made in the last 24 hours (null = unread). */
  readonly last24h: number | null;
}): OfferCapDecision {
  if (input.burstLimited) return { allowed: false, reason: "burst" };
  if (input.openOnNeed === null || input.last24h === null) return { allowed: false, reason: "counts_unavailable" };
  if (input.openOnNeed >= AGENCY_BOARD_LIMITS.openOffersPerNeed) return { allowed: false, reason: "need_cap" };
  if (input.last24h >= AGENCY_BOARD_LIMITS.offersPerDay) return { allowed: false, reason: "daily_cap" };
  return { allowed: true };
}
