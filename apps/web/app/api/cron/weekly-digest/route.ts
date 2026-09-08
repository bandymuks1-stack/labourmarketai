import { NextResponse } from "next/server";

import { authorizeCronRequest } from "@/lib/api/cron-auth";
import { emitWeeklyDigestNotificationsForCron } from "@/lib/notifications/event-emitters";

/**
 * WEEKLY DIGEST CRON (completion v1) — invoked by the Vercel cron entry in
 * apps/web/vercel.json (Mondays 07:00 UTC). Sweeps recently-active workers
 * and materializes this ISO week's digest event for those the read-time
 * emitter has not reached; the deterministic per-week entity id + the
 * store's UNIQUE (recipient, dedupe_key) keep the digest exactly-once per
 * recipient per week across both paths.
 *
 * AUTH: `authorizeCronRequest` (lib/api/cron-auth.ts) — the CRON_SECRET
 * machine check, kept out of this file so no route parses Authorization
 * itself (api-auth-boundary guard). While CRON_SECRET is unset the route
 * REFUSES 401 unconditionally (inert until the owner sets the env — honest
 * degradation, never an open trigger). Responses carry counts only; no ids,
 * no addresses, nothing sensitive.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const auth = authorizeCronRequest(request);
  if (auth !== "ok") {
    return NextResponse.json({ ok: false, reason: auth }, { status: 401 });
  }

  const result = await emitWeeklyDigestNotificationsForCron();
  if (result.kind === "unavailable") {
    // Store unapplied / service env missing — honest 503, cron will retry
    // next week; nothing was partially claimed as delivered.
    return NextResponse.json(
      { ok: false, reason: "unavailable" },
      { status: 503 },
    );
  }
  return NextResponse.json({ ok: true, ...result });
}
