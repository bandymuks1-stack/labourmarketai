import { NextResponse } from "next/server";

import { authorizeCronRequest } from "@/lib/api/cron-auth";
import { runBillingRecovery } from "@/lib/billing/billing-recovery";
import { isBillingRecoveryEnabled } from "@/lib/billing/recovery-flag";

/**
 * BILLING RECOVERY SWEEP — scheduled convergence of subscriptions that are
 * awaiting provider sync (e.g. a checkout whose subscription webhook never
 * landed). Reads Stripe, applies through the SAME primitive as the webhook
 * (lib/billing/apply-subscription-snapshot), at most a small bounded batch per
 * run. It never creates, changes, cancels or refunds a payment.
 *
 * Triggered by .github/workflows/billing-recovery-cadence.yml (inert until the
 * owner sets BILLING_RECOVERY_SCHEDULE_ENABLED=true AND the server runs with
 * BILLING_RECOVERY_ENABLED=true; the Vercel Hobby cron slots
 * are full). AUTH: `authorizeCronRequest` — CRON_SECRET bearer, fail-closed while
 * unset. Responses carry counts and a reason code only: no ids, no secrets.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  const auth = authorizeCronRequest(request);
  if (auth !== "ok") {
    return NextResponse.json({ ok: false, reason: auth }, { status: 401 });
  }
  // A valid CRON_SECRET alone never permits live recovery writes: the server-side
  // capability flag must also be on (default OFF, fail closed).
  if (!isBillingRecoveryEnabled()) {
    return NextResponse.json({ ok: false, reason: "recovery_disabled" }, { status: 503 });
  }
  const result = await runBillingRecovery();
  if (result.kind === "unavailable") {
    return NextResponse.json({ ok: false, reason: result.reason }, { status: 503 });
  }
  const { kind: _kind, ...counts } = result;
  void _kind;
  return NextResponse.json({ ok: true, ...counts });
}
