import { NextResponse } from "next/server";

import { authorizeCronRequest } from "@/lib/api/cron-auth";
import { runPlatformEmailRetrySweep } from "@/lib/email/platform-email-delivery-store";

/**
 * RETRY SWEEP for the platform e-mails (company registration notice, company
 * welcome, request alert) — lib/email/platform-email-delivery.ts holds every rule.
 *
 * AUTH: `authorizeCronRequest`, the CRON_SECRET machine check (401 while it is
 * unset). nginx answers 404 for /api/cron/* from the internet, so only the VPS
 * itself reaches it (ops/vps/lm-cron.sh, every 10 minutes).
 *
 * Each call retries at most 20 due e-mails and closes attempts whose outcome is
 * unknown. It can only send an e-mail that an earlier event already recorded and
 * that has not been sent: it creates no event, so calling it twice sends nothing
 * twice. The body is counts only — no ids, no addresses.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const auth = authorizeCronRequest(request);
  if (auth !== "ok") {
    return NextResponse.json({ ok: false, reason: auth }, { status: 401 });
  }
  const result = await runPlatformEmailRetrySweep();
  if (result.kind === "unavailable") {
    return NextResponse.json({ ok: false, reason: result.code === "not_applied" ? "needs_migration" : "unavailable" }, { status: 503 });
  }
  return NextResponse.json({ ok: true, ...result.report });
}
