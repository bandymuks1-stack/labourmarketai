import { NextResponse } from "next/server";

import { refreshMyBillingStatus } from "@/lib/billing/refresh-billing-status";

/**
 * Refresh my billing status - authenticated, cookie session only. The request
 * body is IGNORED entirely: workspace, customer and subscription are resolved
 * server-side from the session (lib/billing/refresh-billing-status.ts), so a
 * caller can never name a subscription or workspace. Read-only toward the
 * payment provider. The response is one status word, never an id.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const res = await refreshMyBillingStatus();
  return NextResponse.json(res.body, {
    status: res.http,
    headers: { "Cache-Control": "no-store" },
  });
}
