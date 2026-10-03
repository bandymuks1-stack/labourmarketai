import "server-only";

import { getBillingConfig } from "@/lib/billing/config";
import { resolveBillingSubject } from "@/lib/billing/billing-subject";
import { findBillingCustomer } from "@/lib/billing/customer-store";
import { findScopedSubscription } from "@/lib/billing/subscription-store";
import { ORGANIZATION_PLAN_KEY } from "@/lib/billing/plans";
import {
  reconcileSubscription,
  type ReconcileResult,
} from "@/lib/billing/reconcile-subscription";
import { rateLimit } from "@/lib/security/rate-limit";

/**
 * "REFRESH MY BILLING STATUS" (stage 3) - the authenticated user's narrow
 * self-service door onto the SAME recovery adapter the scheduled sweep uses.
 *
 * Narrow by construction:
 *   - the CLIENT supplies nothing. Workspace, payer, customer id and
 *     subscription id are all resolved here on the server from the session
 *     (`resolveBillingSubject`, the stored subscription row, the payer's own
 *     `findBillingCustomer`);
 *   - only a person with billing authority for the CURRENT workspace may refresh
 *     (same capability the account billing section checks);
 *   - the observed subscription's signed metadata must bind to the
 *     server-resolved subject (`expectSubject`), else nothing is written - a
 *     customer holding several subscriptions can never pull another
 *     workspace's state in;
 *   - rate-limited per person;
 *   - it only READS Stripe; it cannot create, change, cancel or refund anything;
 *   - the answer is one of FOUR words. No ids, no provider reasons, no
 *     secrets ever leave the server.
 * The page is not told what the plan is: it re-reads the subscription row after
 * a refresh, like any request. The checkout-return flag stays a redirect, never
 * authority.
 */

export type RefreshBillingStatus = "updated" | "already_current" | "not_found" | "try_later";

export type RefreshResponse =
  | { readonly http: 200; readonly body: { readonly ok: true; readonly status: RefreshBillingStatus } }
  | { readonly http: 401 | 403 | 429; readonly body: { readonly ok: false; readonly status: "try_later" | "forbidden" | "unauthenticated" } };

/** Per person: 5 refreshes per 10 minutes (per server instance - see rate-limit.ts honesty note). */
export const REFRESH_LIMIT = { limit: 5, windowMs: 10 * 60 * 1000 } as const;

/** Pure mapping from the adapter's outcome to the only words a browser sees. */
export function refreshStatusFromResult(r: ReconcileResult): RefreshBillingStatus {
  switch (r.outcome) {
    case "applied":
      return r.changed === false ? "already_current" : "updated";
    case "stale":
      return "already_current";
    case "noop":
      return r.reason === "duplicate_run" ? "already_current" : "not_found";
    case "not_found":
      return "not_found";
    case "conflict":
      // Another workspace's subscription is "nothing here" for THIS workspace;
      // every other conflict (mode, live-subscription clash) is an operator matter.
      return r.reason === "subject_mismatch" ? "not_found" : "try_later";
    default:
      // provider_error | store_error | needs_migration | inactive
      return "try_later";
  }
}

export async function refreshMyBillingStatus(opts: { readonly nowMs?: number } = {}): Promise<RefreshResponse> {
  const ctx = await resolveBillingSubject();
  if (!ctx.subject || !ctx.payerProfileId) {
    return { http: 401, body: { ok: false, status: "unauthenticated" } };
  }
  if (!ctx.billingAuthority) {
    return { http: 403, body: { ok: false, status: "forbidden" } };
  }

  const decision = rateLimit({
    name: "billing-refresh",
    key: ctx.payerProfileId,
    ...REFRESH_LIMIT,
    nowMs: opts.nowMs,
  });
  if (decision.limited) {
    return { http: 429, body: { ok: false, status: "try_later" } };
  }

  const cfg = getBillingConfig();
  if (cfg.state !== "stripe_test" && cfg.state !== "stripe_live") {
    return { http: 200, body: { ok: true, status: "try_later" } };
  }
  const subject = ctx.subject;
  const expectSubject =
    subject.type === "organization"
      ? ({ type: "organization", id: subject.id } as const)
      : ({ type: "profile", id: subject.id } as const);

  // 1) The workspace's own row (incl. a link-only `incomplete` one) names the
  //    provider subscription to read.
  const scoped = await findScopedSubscription({
    scope: subject,
    planKey: ORGANIZATION_PLAN_KEY,
    testMode: cfg.testMode,
  });
  if (scoped.status === "needs-migration" || scoped.status === "error") {
    return { http: 200, body: { ok: true, status: "try_later" } };
  }
  let result: ReconcileResult;
  if (scoped.status === "found" && scoped.row.providerSubscriptionId?.startsWith("sub_")) {
    result = await reconcileSubscription({
      stripeSubscriptionId: scoped.row.providerSubscriptionId,
      source: "user_refresh",
      expectSubject,
    });
  } else {
    // 2) No row yet (the webhook never landed): the PAYER's own stored customer.
    //    Each subscription it holds is bound to the subject via signed metadata.
    const customer = await findBillingCustomer(ctx.payerProfileId);
    if (customer.status === "needs-migration") {
      return { http: 200, body: { ok: true, status: "try_later" } };
    }
    if (customer.status !== "found") {
      return { http: 200, body: { ok: true, status: "not_found" } };
    }
    result = await reconcileSubscription({
      customerId: customer.customerId,
      source: "user_refresh",
      expectSubject,
    });
  }
  return { http: 200, body: { ok: true, status: refreshStatusFromResult(result) } };
}
