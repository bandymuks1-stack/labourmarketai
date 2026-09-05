import "server-only";

import type { BillingProvider } from "@/lib/billing/provider";
import { mapStripeStatus } from "@/lib/billing/webhook-core";
import {
  decideCheckoutAdmission,
  type BillingScope,
  type CheckoutAdmission,
} from "@/lib/billing/checkout-operations-core";
import {
  applyProviderReconciledStatus,
  findScopedSubscription,
} from "@/lib/billing/subscription-store";

/**
 * Checkout ADMISSION (billing safety v1) — "ONE active subscription per
 * billing subject + plan". Before any Checkout Session is requested, the local
 * subscription row for (subject, plan, mode) is read; if it is in a billing
 * state the PROVIDER is asked (read-only) whether that subscription still
 * lives:
 *
 *   provider says dead (canceled / incomplete_expired / no such object)
 *     → the local row is healed to that status (the ONE self-healing write,
 *       which can only remove an entitlement) and checkout proceeds;
 *   provider confirms live, or cannot be reached
 *     → REFUSED (`subscription_exists`). Fail closed: a second payable
 *       subscription must be impossible to create by clicking, and the
 *       Customer Portal is the path to change or cancel the existing one.
 *
 * Nothing here charges, creates or grants. The decision itself is pure
 * (checkout-operations-core.decideCheckoutAdmission).
 */

export type AdmissionOutcome =
  | CheckoutAdmission
  /** The local state could not be read — no session without a known state. */
  | { admit: false; reason: "checkout_unavailable"; cause: "needs-migration" | "store_error" };

export async function admitCheckout(input: {
  scope: BillingScope;
  planKey: string;
  testMode: boolean;
  provider: BillingProvider;
}): Promise<AdmissionOutcome> {
  const lookup = await findScopedSubscription({
    scope: input.scope,
    planKey: input.planKey,
    testMode: input.testMode,
  });
  if (lookup.status === "needs-migration") {
    return { admit: false, reason: "checkout_unavailable", cause: "needs-migration" };
  }
  if (lookup.status === "error") {
    return { admit: false, reason: "checkout_unavailable", cause: "store_error" };
  }
  if (lookup.status === "none") return decideCheckoutAdmission({ local: null, provider: null });

  const local = lookup.row;
  // A manual admin grant or a non-billing status never needs the provider.
  const pre = decideCheckoutAdmission({ local, provider: null });
  if (pre.admit) return pre;

  // Blocking row → ask the provider (READ) before refusing.
  let providerView: { status: ReturnType<typeof mapStripeStatus> } | null = null;
  if (local.providerSubscriptionId) {
    const r = await input.provider.retrieveSubscription(local.providerSubscriptionId);
    if (r.ok) {
      // No such object in THIS mode's Stripe account = it does not bill.
      providerView = { status: r.subscription ? mapStripeStatus(r.subscription.rawStatus) : "expired" };
    }
  }
  const decision = decideCheckoutAdmission({ local, provider: providerView });
  if (decision.admit && decision.reason === "healed_from_provider" && local.providerSubscriptionId) {
    // Copy provider truth onto the row (dead statuses only — the type forbids a grant).
    await applyProviderReconciledStatus({
      providerSubscriptionId: local.providerSubscriptionId,
      status: decision.providerStatus === "cancelled" ? "cancelled" : "expired",
      source: "checkout_admission",
    });
  }
  return decision;
}
