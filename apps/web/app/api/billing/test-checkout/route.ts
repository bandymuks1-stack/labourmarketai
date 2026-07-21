import { NextResponse } from "next/server";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { getBillingConfig } from "@/lib/billing/config";
import { getBillingProvider } from "@/lib/billing/provider";
import { testPriceIdFor } from "@/lib/billing/prices";
import {
  evaluateCheckoutRequest,
  planRequiresOrganization,
  type OrgBindingResult,
} from "@/lib/billing/checkout-core";
import { getPlan } from "@/lib/billing/plans";
import { resolveOrganizationBinding } from "@/lib/billing/org-membership";
import { ensureBillingCustomer } from "@/lib/billing/customer-store";
import {
  checkoutMetadata,
  checkoutIdempotencyKey,
} from "@/lib/billing/metadata-core";

/**
 * TEST checkout route (Stripe sprint PR3; extended by Stripe TEST
 * subscriptions v1) — STRICTLY gated. A Stripe test Checkout Session is
 * created ONLY when: billing is in a valid stripe_test config, the caller is
 * authenticated, the plan is a known PAID plan, the caller is eligible (plan
 * audience role or admin), a company/agency plan resolves to an organization
 * with a VERIFIED active owner/manager membership, and a test price is
 * configured. The price is resolved server-side ONLY (a caller can never
 * supply a price, currency, or price id); creation is idempotent per
 * (owner, plan, org); a success redirect NEVER activates a plan — only the
 * signature-verified webhook does. NEVER creates a live session (the provider
 * is noop unless config is stripe_test; live is blocked).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Schema = z
  .object({
    planKey: z.string().min(1).max(40),
    organizationId: z.string().uuid().optional(),
  })
  .strict();

export async function POST(req: Request) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ ok: false, reason: "bad_request" }, { status: 400 });
  }
  const parsed = Schema.safeParse(raw);
  if (!parsed.success) {
    // A caller-supplied price / priceId / currency / any unknown field is
    // rejected outright by the strict schema — never silently ignored.
    return NextResponse.json({ ok: false, reason: "bad_request" }, { status: 400 });
  }
  const planKey = parsed.data.planKey;
  const origin = new URL(req.url).origin;

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

  // Server-side org binding for company/agency plans (never client-trusted).
  const plan = getPlan(planKey);
  let orgBinding: OrgBindingResult = "not_required";
  let organizationId: string | null = null;
  if (user && plan && planRequiresOrganization(plan.audience)) {
    const resolved = await resolveOrganizationBinding(
      supabase,
      user.id,
      parsed.data.organizationId ?? null,
    );
    orgBinding = resolved.binding;
    organizationId = resolved.organizationId;
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

  // One stored TEST customer per profile (find-or-create, race-safe). A
  // missing mapping table degrades honestly without blocking checkout.
  const customer = await ensureBillingCustomer({ id: user.id, email: user.email ?? null });
  const providerCustomerId = customer.ok ? customer.customerId : null;

  const provider = await getBillingProvider();
  const result = await provider.createCheckoutSession({
    planKey,
    priceId,
    clientReferenceId: user.id,
    customerEmail: user.email ?? null,
    providerCustomerId,
    organizationId,
    metadata: checkoutMetadata({ planKey, ownerId: user.id, organizationId }),
    idempotencyKey: checkoutIdempotencyKey({ ownerId: user.id, planKey, organizationId }),
    successUrl: `${origin}/dashboard/account?billing=test_success`,
    cancelUrl: `${origin}/pricing?billing=test_cancelled`,
  });
  if (!result.ok) {
    return NextResponse.json({ ok: false, reason: result.reason }, { status: 400 });
  }
  return NextResponse.json({ ok: true, url: result.url, testMode: true });
}
