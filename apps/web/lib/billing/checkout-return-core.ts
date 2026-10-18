import type { SubStatus } from "@/lib/billing/webhook-core";

/**
 * Checkout RETURN classification — PURE core (payments production calm v1,
 * owner §6, 2026-09-22). No IO, no server-only, no env read.
 *
 * The checkout route sends the browser back with ONE query flag:
 *
 *   success_url  →  /dashboard/account?billing=test_success | success
 *   cancel_url   →  /pricing?billing=test_cancelled | cancelled
 *
 * (test-checkout/route.ts picks the `test_` prefix from the adapter's mode.)
 * MEASURED defect: the pricing page rendered the cancelled notice ONLY for
 * `test_cancelled`, so a person backing out of a LIVE checkout landed with no
 * acknowledgement. Both surfaces now classify the flag through this one
 * module — the words differ per mode only where the copy says so, never the
 * recognition.
 *
 * The flag is a redirect, never authority: nothing here grants, reads or
 * writes a subscription (P7 guard — entitlement comes only from the row).
 */

export type CheckoutReturnKind = "success" | "cancelled" | "portal" | null;

export function classifyCheckoutReturn(
  value: string | null | undefined,
): CheckoutReturnKind {
  switch (value) {
    case "success":
    case "test_success":
      return "success";
    case "cancelled":
    case "test_cancelled":
      return "cancelled";
    case "portal_return":
      return "portal";
    default:
      return null;
  }
}

export function isCheckoutSuccessReturn(value: string | null | undefined): boolean {
  return classifyCheckoutReturn(value) === "success";
}

export function isCheckoutCancelledReturn(value: string | null | undefined): boolean {
  return classifyCheckoutReturn(value) === "cancelled";
}

/**
 * After a PAID return the row that proves the plan is written by the
 * provider's signature-verified webhook, which may still be in flight when
 * the browser lands. MEASURED defect: with no row yet the account section
 * showed "No subscription" AND offered the Order button again — a second
 * order on the same organization is refused `subscription_exists` by the
 * route (or, worse, reads as a failed purchase). While the return says
 * success and NO subscription row exists (status null — not even an
 * incomplete one), the section withholds the button and says the state is
 * syncing. This is UI withholding only: the redirect activates nothing, and
 * the next request without the flag reads the row like any other.
 */
export function awaitingProviderSync(input: {
  readonly billingOn: boolean;
  readonly billingReturn: string | null | undefined;
  readonly subscriptionStatus: SubStatus | null;
}): boolean {
  return (
    input.billingOn &&
    isCheckoutSuccessReturn(input.billingReturn) &&
    input.subscriptionStatus === null
  );
}
