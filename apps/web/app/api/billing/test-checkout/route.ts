import { NextResponse } from "next/server";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { getBillingConfig } from "@/lib/billing/config";
import { getBillingProvider } from "@/lib/billing/provider";
import { testPriceIdFor } from "@/lib/billing/prices";
import { evaluateCheckoutRequest } from "@/lib/billing/checkout-core";

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

const Schema = z.object({ planKey: z.string().min(1).max(40) });

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

  const config = getBillingConfig();
  const gate = evaluateCheckoutRequest({
    config,
    authenticated: Boolean(user),
    planKey,
    userRoles,
    isAdmin,
    priceConfigured: Boolean(testPriceIdFor(planKey)),
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
  const result = await provider.createCheckoutSession({
    planKey,
    priceId,
    clientReferenceId: user.id,
    customerEmail: user.email ?? null,
    successUrl: `${origin}/dashboard/account?billing=test_success`,
    cancelUrl: `${origin}/pricing?billing=test_cancelled`,
  });
  if (!result.ok) {
    return NextResponse.json({ ok: false, reason: result.reason }, { status: 400 });
  }
  return NextResponse.json({ ok: true, url: result.url, testMode: true });
}
