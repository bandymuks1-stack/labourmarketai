import { NextResponse } from "next/server";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { CANONICAL_ORIGIN } from "@/lib/domain/canonical";
import { getBillingConfig } from "@/lib/billing/config";
import { getBillingProvider } from "@/lib/billing/provider";
import { testPriceIdFor } from "@/lib/billing/prices";
import {
  evaluateCheckoutRequest,
  planRequiresOrganization,
  type OrgBindingResult,
} from "@/lib/billing/checkout-core";
import { getPlan } from "@/lib/billing/plans";
import { resolveBillingSubject } from "@/lib/billing/billing-subject";
import { ensureBillingCustomer } from "@/lib/billing/customer-store";
import {
  checkoutIdempotencyKey,
  checkoutMetadata,
} from "@/lib/billing/metadata-core";

/**
 * TEST checkout route (Stripe sprint PR3) — STRICTLY gated. A Stripe test
 * Checkout Session is created ONLY when: billing is in a valid stripe_test
 * config, the caller is authenticated, the plan is a known PAID pilot plan, the
 * caller is eligible (plan audience role or admin), and a test price is
 * configured. Otherwise returns an honest, specific error. NEVER creates a live
 * session (the provider is noop unless config is stripe_test; live is blocked).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// STRICT: unknown fields (a price, an org id, a subject) are REJECTED — the
// client's only input is the plan key.
const Schema = z.object({ planKey: z.string().min(1).max(40) }).strict();

export async function POST(req: Request) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ ok: false, reason: "bad_request" }, { status: 400 });
  }
  const parsed = Schema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, reason: "bad_request" }, { status: 400 });
  }
  const planKey = parsed.data.planKey;
  /**
   * Audit L-07: this was `new URL(req.url).origin`, i.e. derived from the Host
   * header. A spoofed Host would place an attacker-chosen origin into the
   * Stripe success/cancel redirect. Impact was limited (the redirect belongs to
   * the attacker's own checkout session), but the return URL of a payment flow
   * has no reason to be caller-controlled. The single-domain policy already
   * says there is exactly one product origin — so use it.
   */
  const origin = CANONICAL_ORIGIN;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let userRoles: string[] = [];
  let isAdmin = false;
  if (user) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: roles } = await (supabase as any)
      .from("profile_roles")
      .select("role")
      .eq("profile_id", user.id);
    userRoles = ((roles ?? []) as { role: string }[]).map((r) => r.role);
    isAdmin = userRoles.includes("admin");
  }

  // M-P0-7 subject binding (Stripe TEST multi-subject v2): the VALIDATED
  // active workspace proposes the billing subject; the `manage-billing`
  // capability (owner/admin membership — never bare membership, never
  // engagement) decides authority. The client sends ONLY a plan key — no org
  // id, no price, no subject can be supplied.
  let orgBinding: OrgBindingResult = "not_required";
  let organizationId: string | null = null;
  const planAudience = getPlan(planKey)?.audience;
  if (user && planAudience && planRequiresOrganization(planAudience)) {
    const subject = await resolveBillingSubject();
    if (subject.subject?.type === "organization") {
      orgBinding = subject.billingAuthority ? "verified" : "not_member";
      organizationId = subject.billingAuthority ? subject.subject.id : null;
    } else {
      orgBinding = "missing";
    }
  }

  const config = getBillingConfig();
  const gate = evaluateCheckoutRequest({
    config,
    authenticated: Boolean(user),
    planKey,
    userRoles,
    isAdmin,
    priceConfigured: Boolean(testPriceIdFor(planKey)),
    orgBinding,
  });
  if (!gate.ok) {
    return NextResponse.json(
      { ok: false, reason: gate.reason, testMode: config.testMode },
      { status: gate.status },
    );
  }

  const priceId = testPriceIdFor(planKey);
  if (!priceId || !user) {
    // Defensive — the gate already covers these.
    return NextResponse.json({ ok: false, reason: "price_not_configured" }, { status: 400 });
  }

  const provider = await getBillingProvider();
  // Per-payer TEST customer (find-or-create, idempotent). Degrades to email
  // prefill when unavailable — never blocks a valid checkout.
  const customer = await ensureBillingCustomer({ id: user.id, email: user.email });
  const result = await provider.createCheckoutSession({
    planKey,
    priceId,
    clientReferenceId: user.id,
    customerEmail: user.email ?? null,
    providerCustomerId: customer.ok ? customer.customerId : null,
    organizationId,
    metadata: checkoutMetadata({ planKey, ownerId: user.id, organizationId }),
    idempotencyKey: checkoutIdempotencyKey({ ownerId: user.id, planKey, organizationId }),
    successUrl: `${origin}/dashboard/account?billing=${config.testMode ? "test_success" : "success"}`,
    cancelUrl: `${origin}/pricing?billing=${config.testMode ? "test_cancelled" : "cancelled"}`,
  });
  if (!result.ok) {
    return NextResponse.json({ ok: false, reason: result.reason }, { status: 400 });
  }
  return NextResponse.json({ ok: true, url: result.url, testMode: config.testMode });
}
