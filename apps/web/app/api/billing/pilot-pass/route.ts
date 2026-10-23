import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { CANONICAL_ORIGIN } from "@/lib/domain/canonical";
import { billingPilotPassEnabled, getBillingConfigFor } from "@/lib/billing/config";
import { getBillingProvider } from "@/lib/billing/provider";
import { resolveBillingSubject } from "@/lib/billing/billing-subject";
import { getEffectiveEntitlements } from "@/lib/billing/effective-entitlements";
import { ensureBillingCustomer } from "@/lib/billing/customer-store";
import {
  PILOT_PASS_AMOUNT_CENTS,
  PILOT_PASS_CURRENCY,
  PILOT_PASS_PRODUCT_NAME,
  evaluatePilotPass,
  pilotPassIdempotencyKey,
  pilotPassMetadata,
} from "@/lib/billing/pilot-pass-core";

/**
 * Organization pilot pass (pilot-pass-core): 1 € once → the paid Organization
 * plan for the pilot period, activated by the signed webhook. The request
 * carries NO input — amount, currency, plan, period, organization and mode
 * are all decided on the server. A plain form POST from the account page's
 * pilot-pass section is answered with a 303 to Stripe's hosted page (or back
 * with the refusal); a JSON caller gets JSON.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE = `${CANONICAL_ORIGIN}/dashboard/account`;

export async function POST(req: Request) {
  const wantsJson = (req.headers.get("accept") ?? "").includes("application/json");
  const refuse = (reason: string, status: number) =>
    wantsJson
      ? NextResponse.json({ ok: false, reason }, { status })
      : NextResponse.redirect(`${PAGE}?pilot_pass_refused=${encodeURIComponent(reason)}`, 303);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let organizationId: string | null = null;
  let billingAuthority = false;
  let planActive = false;
  if (user) {
    const subject = await resolveBillingSubject();
    if (subject.subject?.type === "organization") {
      organizationId = subject.subject.id;
      billingAuthority = subject.billingAuthority;
      const ent = await getEffectiveEntitlements();
      planActive = ent.source === "subscription" && ent.active;
    }
  }

  const config = getBillingConfigFor(organizationId);
  const gate = evaluatePilotPass({
    enabled: billingPilotPassEnabled(),
    authenticated: Boolean(user),
    organizationId,
    billingAuthority,
    billingState: config.state,
    planActive,
  });
  if (!gate.ok) return refuse(gate.reason, gate.status);
  if (!user) return refuse("unauthenticated", 401);

  const provider = await getBillingProvider();
  if (!provider.active || !provider.createOneTimeCheckoutSession) {
    return refuse("billing_not_active", 409);
  }
  const customer = await ensureBillingCustomer({ id: user.id, email: user.email });
  const result = await provider.createOneTimeCheckoutSession({
    amountCents: PILOT_PASS_AMOUNT_CENTS,
    currency: PILOT_PASS_CURRENCY,
    productName: PILOT_PASS_PRODUCT_NAME,
    clientReferenceId: user.id,
    customerEmail: user.email ?? null,
    providerCustomerId: customer.ok ? customer.customerId : null,
    metadata: pilotPassMetadata({ organizationId: gate.organizationId, ownerId: user.id }),
    idempotencyKey: pilotPassIdempotencyKey(gate.organizationId, new Date()),
    successUrl: `${PAGE}?pilot_pass=paid`,
    cancelUrl: `${PAGE}?pilot_pass=cancelled`,
  });
  if (!result.ok) return refuse("checkout_failed", 502);
  return wantsJson
    ? NextResponse.json({ ok: true, url: result.url, sessionId: result.sessionId, testMode: result.testMode })
    : NextResponse.redirect(result.url, 303);
}
