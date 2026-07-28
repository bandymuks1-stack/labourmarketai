import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { CANONICAL_ORIGIN } from "@/lib/domain/canonical";
import { getBillingConfig } from "@/lib/billing/config";
import { getBillingProvider } from "@/lib/billing/provider";
import { getBillingCustomerId } from "@/lib/billing/subscription-store";

/**
 * Customer billing portal (commercial readiness audit v1).
 *
 * Closes the largest consumer-facing hole in the chain: a subscriber could
 * start a subscription but had NO in-product way to cancel it, update a card,
 * or fetch an invoice. Under EU consumer rules ending a contract must be at
 * least as easy as starting it, so this ships together with checkout — not
 * after it.
 *
 * Gated exactly like checkout: a valid Stripe TEST config, an authenticated
 * caller, and a customer record that belongs to THAT caller (the portal is
 * addressed by customer id, so it is never taken from the request body). The
 * return URL is the canonical origin, never a caller-supplied host.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const config = getBillingConfig();
  if (config.state === "stripe_live_blocked") {
    return NextResponse.json({ ok: false, reason: "live_blocked" }, { status: 403 });
  }
  if (config.state !== "stripe_test") {
    return NextResponse.json({ ok: false, reason: "payments_disabled" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, reason: "not_authenticated" }, { status: 401 });
  }

  // Server-resolved from the session — a caller can never address someone
  // else's billing account.
  const providerCustomerId = await getBillingCustomerId(user.id);
  if (!providerCustomerId) {
    return NextResponse.json({ ok: false, reason: "no_billing_customer" }, { status: 404 });
  }

  const provider = await getBillingProvider();
  const result = await provider.createPortalSession({
    providerCustomerId,
    returnUrl: `${CANONICAL_ORIGIN}/dashboard/account?billing=portal_return`,
  });
  if (!result.ok) {
    return NextResponse.json({ ok: false, reason: result.reason }, { status: 400 });
  }
  return NextResponse.json({ ok: true, url: result.url, testMode: true });
}
