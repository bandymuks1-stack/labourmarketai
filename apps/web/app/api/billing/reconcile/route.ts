import { NextResponse } from "next/server";

import { isSuperadmin } from "@/lib/auth/superadmin";
import { runBillingReconciliation } from "@/lib/billing/reconcile";

/**
 * Billing reconciliation report (billing safety v1) — ADMIN-ONLY, READ-ONLY.
 * GET returns the anomaly report from lib/billing/reconcile.ts. It performs no
 * write, no Stripe mutation and never a charge; there is no POST. The request
 * carries no parameters — nothing a caller sends can widen or steer the read.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isSuperadmin())) {
    return NextResponse.json({ ok: false, reason: "not_admin" }, { status: 403 });
  }
  const report = await runBillingReconciliation();
  return NextResponse.json(report, { status: report.ok ? 200 : 503 });
}
