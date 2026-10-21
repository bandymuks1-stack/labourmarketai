import { NextResponse } from "next/server";
import { z } from "zod";

import {
  LMC_PURCHASES_ENABLED,
  STRIPE_LMC_TOPUPS_ENABLED,
} from "@/lib/billing/lmc-flags";
import { getBillingConfigFor } from "@/lib/billing/config";
import { createTestModePaymentSession } from "@/lib/billing/provider";
import { CANONICAL_ORIGIN } from "@/lib/domain/canonical";
import { resolveEmployerCompanyContext } from "@/lib/company/employer-company-context";
import { hasOrganizationCapability } from "@/lib/company/role-capabilities";
import { findSellableTopupPackage } from "@/lib/lmc/topup-packages";
import {
  topupCheckoutKey,
  topupMetadata,
  type LmcWalletSubject,
} from "@/lib/lmc/topup-metadata";
import { createClient } from "@/lib/supabase/server";

/**
 * LMC TOP-UP CHECKOUT — Stripe TEST only (LMC train Wagon 4).
 *
 * HOME: `/api/lmc`, the separate surface named by the canonical catalogue
 * (docs/product/lmc-canonical-commercial-catalogue-v1.md §7.1, MDD-20) — the
 * billing API stays subscription-only (guard stripe-lmc-separation).
 *
 * Order of refusals (pinned by lib/guards/lmc-topup-test-only.test.ts):
 *   1. BOTH kill-switches (`STRIPE_LMC_TOPUPS_ENABLED`, `LMC_PURCHASES_ENABLED`)
 *      — while either is false (both are) → 503 before the body is read, any
 *      client is built or Stripe is reached;
 *   2. strict body: ONLY a package key — no amount, price, currency or subject;
 *   3. the package must be owner-approved (the list is empty: MDD-03 open);
 *   4. signed in; the ledger subject is derived server-side (an organization
 *      workspace with manage-billing → that company; otherwise the person);
 *   5. the adapter must be `stripe_test` for this subject — never live.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Schema = z.object({ packageKey: z.string().min(1).max(40) }).strict();

export async function POST(req: Request) {
  if (!STRIPE_LMC_TOPUPS_ENABLED || !LMC_PURCHASES_ENABLED) {
    return NextResponse.json({ ok: false, reason: "topups_disabled" }, { status: 503 });
  }

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
  const pkg = findSellableTopupPackage(parsed.data.packageKey);
  if (!pkg) {
    return NextResponse.json({ ok: false, reason: "package_not_sellable" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, reason: "unauthenticated" }, { status: 401 });
  }

  let subject: LmcWalletSubject = { type: "person", profileId: user.id };
  let organizationId: string | null = null;
  const ctx = await resolveEmployerCompanyContext();
  if (ctx.kind === "ok") {
    if (!hasOrganizationCapability(ctx.role, "manage-billing")) {
      return NextResponse.json({ ok: false, reason: "no_billing_authority" }, { status: 403 });
    }
    subject = { type: "company", companyId: ctx.companyId };
    organizationId = ctx.organizationId;
  }

  const config = getBillingConfigFor(organizationId);
  if (config.state !== "stripe_test") {
    return NextResponse.json({ ok: false, reason: "test_mode_required" }, { status: 503 });
  }

  const checkoutKey = topupCheckoutKey(subject, pkg.key, Date.now());
  const result = await createTestModePaymentSession({
    productName: "LabourMarket.ai credit (LMC)",
    unitAmountMinor: pkg.chargeMinor,
    currency: pkg.currency,
    clientReferenceId: user.id,
    customerEmail: user.email ?? null,
    metadata: topupMetadata({ subject, packageKey: pkg.key, checkoutKey }),
    idempotencyKey: checkoutKey,
    successUrl: `${CANONICAL_ORIGIN}/dashboard/account?lmc_topup=test_success`,
    cancelUrl: `${CANONICAL_ORIGIN}/dashboard/account?lmc_topup=test_cancelled`,
  });
  if (!result.ok) {
    return NextResponse.json({ ok: false, reason: result.reason }, { status: 400 });
  }
  // The redirect never credits anything: only the signed webhook does.
  return NextResponse.json({ ok: true, url: result.url, testMode: true });
}
