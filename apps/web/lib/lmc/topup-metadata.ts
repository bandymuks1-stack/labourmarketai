import type { LmcWalletSubject } from "@/lib/lmc/wallet";

export type { LmcWalletSubject };

/**
 * The shape a TEST top-up Checkout Session carries (LMC train Wagon 4). Pure:
 * no I/O, shared by the checkout route (writer) and the settlement handler
 * (reader), so the two can never disagree about what a top-up looks like.
 *
 * The metadata is written by OUR server when it creates the session; a
 * customer cannot edit it. It still is never trusted for an AMOUNT — the
 * settlement reads the credit from the server's package list.
 */

/** Marks a session as an LMC top-up (anything else is ignored by settlement). */
export const LMC_TOPUP_PURPOSE = "lmc_topup_v1";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Ledger subject → metadata (person = profiles.id, company = companies.id). */
export function topupMetadata(input: {
  readonly subject: LmcWalletSubject;
  readonly packageKey: string;
  readonly checkoutKey: string;
}): Record<string, string> {
  return {
    purpose: LMC_TOPUP_PURPOSE,
    package_key: input.packageKey,
    subject_type: input.subject.type,
    subject_id: input.subject.type === "person" ? input.subject.profileId : input.subject.companyId,
    environment: "test",
    checkout_idempotency_key: input.checkoutKey,
  };
}

/** Metadata → ledger subject, or null when it is not exactly one valid subject. */
export function parseTopupSubject(type: unknown, id: unknown): LmcWalletSubject | null {
  if (typeof id !== "string" || !UUID_RE.test(id)) return null;
  if (type === "person") return { type: "person", profileId: id };
  if (type === "company") return { type: "company", companyId: id };
  return null;
}

/** Ten-minute window: a double click replays the SAME Stripe session. */
export const TOPUP_CHECKOUT_WINDOW_MS = 10 * 60 * 1000;

/**
 * The Stripe request idempotency key for CREATING a session (not the credit
 * key — that one is derived from the payment intent at settlement).
 */
export function topupCheckoutKey(
  subject: LmcWalletSubject,
  packageKey: string,
  nowMs: number,
): string {
  const id = subject.type === "person" ? subject.profileId : subject.companyId;
  const bucket = Math.floor(nowMs / TOPUP_CHECKOUT_WINDOW_MS);
  return `lmc_topup_v1_${subject.type}_${id}_${packageKey}_${bucket}`;
}
