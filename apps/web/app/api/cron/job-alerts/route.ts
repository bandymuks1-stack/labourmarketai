import { NextResponse } from "next/server";

import { authorizeCronRequest } from "@/lib/api/cron-auth";
import { emitJobAlertNotificationsForCron } from "@/lib/notifications/event-emitters";

/**
 * JOB ALERTS SWEEP (stream N) — reaches registered workers who have stated
 * profession + preferred countries (+ optional salary expectation) and tells
 * each, in the existing bell, about NEW real active jobs that fit — once per
 * job revision (deterministic entity id + UNIQUE dedupe), at most a few per
 * run, per the person's existing notification preferences. E-mail only with an
 * explicit stored opt-in, through the existing dispatcher.
 *
 * Triggered by .github/workflows/job-alerts-cadence.yml (the Vercel Hobby plan
 * holds two crons already; the supply cadences use GitHub Actions the same
 * way). AUTH: `authorizeCronRequest` — CRON_SECRET bearer, fail-closed while
 * unset. Responses carry counts and a reason code only.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const auth = authorizeCronRequest(request);
  if (auth !== "ok") {
    return NextResponse.json({ ok: false, reason: auth }, { status: 401 });
  }
  const result = await emitJobAlertNotificationsForCron();
  if (result.kind === "unavailable") {
    return NextResponse.json(
      { ok: false, reason: result.reason },
      { status: 503 },
    );
  }
  return NextResponse.json({ ok: true, ...result });
}
