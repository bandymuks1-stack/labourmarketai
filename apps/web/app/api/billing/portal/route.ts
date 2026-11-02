import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { getBillingConfig } from "@/lib/billing/config";
import { getBillingProvider } from "@/lib/billing/provider";
import { evaluatePortalRequest } from "@/lib/billing/portal-core";
import { findBillingCustomer } from "@/lib/billing/customer-store";
import { requestPublicOrigin } from "@/lib/mcp/public-origin";

/**
 * Customer Portal route (Stripe TEST subscriptions v1) — server-side only.
 * Opens a Stripe TEST Customer Portal session for the AUTHENTICATED caller's
 * OWN stored billing customer. The request body is ignored entirely: a caller
 * can never supply a customer id (their own or anyone else's) — the mapping
 * is looked up by the authenticated profile id. Possible only in a valid
 * stripe_test config; live is structurally blocked upstream.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  // The public origin, not req.url: behind the VPS proxy req.url is the bind host (0.0.0.0:3000).
  const origin = requestPublicOrigin(req);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const config = getBillingConfig();
  const lookup = user
    ? await findBillingCustomer(user.id)
    : ({ status: "absent" } as const);

  const gate = evaluatePortalRequest({
    config,
    authenticated: Boolean(user),
    customerLookup:
      lookup.status === "found"
        ? "found"
        : lookup.status === "needs-migration"
          ? "needs-migration"
          : "absent",
  });
  if (!gate.ok) {
    return NextResponse.json(
      { ok: false, reason: gate.reason, testMode: config.testMode },
      { status: gate.status },
    );
  }
  if (lookup.status !== "found" || !user) {
    // Defensive — the gate already covers these.
    return NextResponse.json({ ok: false, reason: "no_billing_customer" }, { status: 404 });
  }

  const provider = await getBillingProvider();
  const result = await provider.createPortalSession({
    customerId: lookup.customerId,
    returnUrl: `${origin}/dashboard/account?billing=portal_return`,
  });
  if (!result.ok) {
    return NextResponse.json({ ok: false, reason: result.reason }, { status: 400 });
  }
  return NextResponse.json({ ok: true, url: result.url, testMode: config.testMode });
}
