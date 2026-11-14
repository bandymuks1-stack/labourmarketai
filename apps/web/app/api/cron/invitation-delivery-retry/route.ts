import { NextResponse } from "next/server";

import { authorizeCronRequest } from "@/lib/api/cron-auth";
import { CANONICAL_ORIGIN } from "@/lib/domain/canonical";
import { runInvitationDeliveryRetry } from "@/lib/invitations/delivery-retry-run";

/**
 * SCHEDULED RETRY OF TEMPORARY INVITATION DELIVERY FAILURES + delivery health
 * (owner P0 2026-11-13; lib/invitations/delivery-retry.ts holds every rule).
 *
 * AUTH: `authorizeCronRequest` (CRON_SECRET). nginx answers 404 for /api/cron/*
 * from the internet; the VPS calls it (ops/vps/lm-invitation-delivery-retry.sh).
 *
 * POST only. `?mode=`:
 *   health (default) — counters and alerts only, nothing sent;
 *   retry            — at most 10 due TEMPORARY failures of already-authorised
 *                      partner referral sends, then the counters and alerts.
 * The body is counts, reason codes and alert codes only — no ids, no addresses.
 */
const MODES = ["health", "retry"] as const;

export async function POST(request: Request): Promise<NextResponse> {
  const auth = authorizeCronRequest(request);
  if (auth !== "ok") {
    return NextResponse.json({ ok: false, reason: auth }, { status: 401 });
  }
  const mode = new URL(request.url).searchParams.get("mode") ?? "health";
  if (!(MODES as readonly string[]).includes(mode)) {
    return NextResponse.json({ ok: false, reason: "invalid_mode" }, { status: 400 });
  }
  // The link carries a raw capability token: canonical origin always.
  const result = await runInvitationDeliveryRetry({ origin: CANONICAL_ORIGIN, healthOnly: mode === "health" });
  if (result.kind === "needs_migration") {
    return NextResponse.json({ ok: false, reason: "needs_migration" }, { status: 503 });
  }
  if (result.kind === "unavailable") {
    return NextResponse.json({ ok: false, reason: "unavailable" }, { status: 503 });
  }
  const status = result.report.outcome === "email_not_configured" ? 503 : 200;
  return NextResponse.json(
    { ok: status === 200, mode, ...result.report, health: result.health, alerts: result.alerts },
    { status },
  );
}
