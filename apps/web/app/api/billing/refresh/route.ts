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
  let res: Awaited<ReturnType<typeof refreshMyBillingStatus>>;
  try {
    res = await refreshMyBillingStatus();
  } catch {
    // Never leak an exception message (it could carry provider ids).
    res = { http: 500, body: { ok: false, status: "try_later" } };
  }
  return NextResponse.json(res.body, {
    status: res.http,
    headers: { "Cache-Control": "no-store" },
  });
}
