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
import { admitCheckout } from "@/lib/billing/checkout-admission";
import {
  attachProviderSession,
  markCheckoutOperationFailed,
  openCheckoutOperation,
} from "@/lib/billing/checkout-operations-store";
import {
  expiresAtUnixFromIso,
  type BillingScope,
} from "@/lib/billing/checkout-operations-core";

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

  // ── Billing safety v1 (owner directive 2026-09-05) ────────────────────────
  // 1. ADMISSION — one active subscription per billing subject + plan. A local
  //    row in a billing state refuses a new checkout unless the PROVIDER (read)
  //    says that subscription is dead. Fail closed on an unreadable state.
  const scope: BillingScope = organizationId
    ? { type: "organization", id: organizationId }
    : { type: "profile", id: user.id };
  const admission = await admitCheckout({ scope, planKey, testMode: config.testMode, provider });
  if (!admission.admit) {
    return NextResponse.json(
      admission.reason === "subscription_exists"
        ? { ok: false, reason: "subscription_exists", subscriptionStatus: admission.localStatus, testMode: config.testMode }
        : { ok: false, reason: "checkout_unavailable", testMode: config.testMode },
      { status: admission.reason === "subscription_exists" ? 409 : 503 },
    );
  }

  // Per-payer customer for the ACTIVE mode (find-or-create, idempotent).
  // Degrades to email prefill when unavailable — never blocks a valid checkout.
  const customer = await ensureBillingCustomer({ id: user.id, email: user.email });

  // 2. OPERATION IDENTITY — the server-side record every Checkout Session is
  //    derived from. Concurrent/duplicate requests collide on the one-open-
  //    per-scope index and REUSE the same identity → the same Stripe
  //    idempotency key → Stripe replays the same session. Its window is the
  //    session's expiry. Until the table is applied the deterministic legacy
  //    key (24h Stripe-side dedupe) stays in force; an unreadable store fails
  //    CLOSED — no session without an identity.
  const opened = await openCheckoutOperation({
    ownerId: user.id,
    organizationId,
    scope,
    planKey,
    priceId,
    testMode: config.testMode,
    source: "web",
  });
  if (opened.kind === "error") {
    return NextResponse.json({ ok: false, reason: "checkout_unavailable", testMode: config.testMode }, { status: 503 });
  }
  const operation = opened.kind === "needs-migration" ? null : opened.operation;
  const idempotencyKey = operation
    ? operation.idempotencyKey
    : checkoutIdempotencyKey({ ownerId: user.id, planKey, organizationId });

  const result = await provider.createCheckoutSession({
    planKey,
    priceId,
    clientReferenceId: user.id,
    customerEmail: user.email ?? null,
    providerCustomerId: customer.ok ? customer.customerId : null,
    organizationId,
    metadata: checkoutMetadata({ planKey, ownerId: user.id, organizationId }),
    idempotencyKey,
    expiresAt: operation ? expiresAtUnixFromIso(operation.expiresAt) : undefined,
    successUrl: `${origin}/dashboard/account?billing=${config.testMode ? "test_success" : "success"}`,
    cancelUrl: `${origin}/pricing?billing=${config.testMode ? "test_cancelled" : "cancelled"}`,
  });
  if (!result.ok) {
    // Close the identity so the next attempt gets a fresh one (an honest
    // provider refusal must not pin a dead key for 45 minutes).
    if (operation) await markCheckoutOperationFailed(operation.id, result.reason);
    return NextResponse.json({ ok: false, reason: result.reason }, { status: 400 });
  }
  if (operation) await attachProviderSession(operation.id, result.sessionId);
  return NextResponse.json({
    ok: true,
    url: result.url,
    testMode: config.testMode,
    // Evidence for support: which server-side operation this session belongs to.
    operationId: operation?.id ?? null,
    reused: opened.kind === "reused",
  });
}
