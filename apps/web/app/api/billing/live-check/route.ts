import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { CANONICAL_ORIGIN } from "@/lib/domain/canonical";
import { billingLiveCheckEnabled, getBillingConfigFor } from "@/lib/billing/config";
import { getBillingProvider } from "@/lib/billing/provider";
import { resolveBillingSubject } from "@/lib/billing/billing-subject";
import {
  LIVE_CHECK_AMOUNT_CENTS,
  LIVE_CHECK_CURRENCY,
  LIVE_CHECK_PRODUCT_NAME,
  evaluateLiveCheck,
  liveCheckIdempotencyKey,
  liveCheckMetadata,
} from "@/lib/billing/live-check-core";

/**
 * The owner's one-time 1 € LIVE payment check (live-check-core). The request
 * carries NO input — amount, currency, organization and mode are all decided
 * here. A plain form POST from the account page's live-check section is
 * answered with a 303 to Stripe's hosted page (or back with the refusal); a JSON
 * caller gets JSON.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE = `${CANONICAL_ORIGIN}/dashboard/account`;

export async function POST(req: Request) {
  const wantsJson = (req.headers.get("accept") ?? "").includes("application/json");
  const refuse = (reason: string, status: number) =>
    wantsJson
      ? NextResponse.json({ ok: false, reason }, { status })
      : NextResponse.redirect(`${PAGE}?live_check_refused=${encodeURIComponent(reason)}`, 303);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let organizationId: string | null = null;
  let billingAuthority = false;
  if (user) {
    const subject = await resolveBillingSubject();
    if (subject.subject?.type === "organization") {
      organizationId = subject.subject.id;
      billingAuthority = subject.billingAuthority;
    }
  }

  const gate = evaluateLiveCheck({
    enabled: billingLiveCheckEnabled(),
    authenticated: Boolean(user),
    organizationId,
    billingAuthority,
    billingState: getBillingConfigFor(organizationId).state,
  });
  if (!gate.ok || !user) return refuse(gate.ok ? "unauthenticated" : gate.reason, gate.ok ? 401 : gate.status);

  const provider = await getBillingProvider();
  if (provider.id !== "stripe_live" || !provider.createOneTimeCheckoutSession) {
    return refuse("not_live", 409);
  }
  const result = await provider.createOneTimeCheckoutSession({
    amountCents: LIVE_CHECK_AMOUNT_CENTS,
    currency: LIVE_CHECK_CURRENCY,
    productName: LIVE_CHECK_PRODUCT_NAME,
    clientReferenceId: user.id,
    customerEmail: user.email ?? null,
    metadata: liveCheckMetadata({ organizationId: gate.organizationId, ownerId: user.id }),
    idempotencyKey: liveCheckIdempotencyKey(gate.organizationId, new Date()),
    successUrl: `${PAGE}?live_check=paid`,
    cancelUrl: `${PAGE}?live_check=cancelled`,
  });
  if (!result.ok) return refuse("checkout_failed", 502);
  return wantsJson
    ? NextResponse.json({ ok: true, url: result.url, sessionId: result.sessionId })
    : NextResponse.redirect(result.url, 303);
}
