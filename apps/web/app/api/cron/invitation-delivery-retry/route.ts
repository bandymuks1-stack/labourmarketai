import { NextResponse } from "next/server";

import { authorizeCronRequest } from "@/lib/api/cron-auth";
import { CANONICAL_ORIGIN } from "@/lib/domain/canonical";
import {
  runBounceReconciliation,
  runInvitationDeliveryRetry,
  runOwnerDeliveryAlert,
} from "@/lib/invitations/delivery-retry-run";

/**
 * INVITATION DELIVERY — scheduled retry, bounce reconciliation, health and owner alerts
 * (owner P0 2026-11-13 + corrections; lib/invitations/delivery-retry.ts holds the retry rules).
 *
 * AUTH: `authorizeCronRequest` (CRON_SECRET). nginx answers 404 for /api/cron/* from the
 * internet; only the VPS calls it (ops/vps/lm-invitation-delivery-retry.sh).
 *
 * POST only. `?mode=`:
 *   health (default) — counters and alerts only, nothing sent;
 *   retry            — at most 10 due CONFIRMED-TEMPORARY failures of already-authorised partner
 *                      referral sends (never an opened link, never an unknown outcome);
 *   bounces          — reads recent delivery reports from the sender mailbox (read-only) and marks
 *                      OUR messages BOUNCED / DELIVERED_CONFIRMED; sends nothing;
 *   notify           — computes the alerts server-side and delivers them to the owner's configured
 *                      channels (the VPS script de-duplicates: same alert set at most every 6 h).
 * The body is counts, reason codes and alert codes only — no ids, no addresses.
 */
const MODES = ["health", "retry", "bounces", "notify"] as const;

export async function POST(request: Request): Promise<NextResponse> {
  const auth = authorizeCronRequest(request);
  if (auth !== "ok") {
    return NextResponse.json({ ok: false, reason: auth }, { status: 401 });
  }
  const mode = new URL(request.url).searchParams.get("mode") ?? "health";
  if (!(MODES as readonly string[]).includes(mode)) {
    return NextResponse.json({ ok: false, reason: "invalid_mode" }, { status: 400 });
  }
  if (mode === "bounces") {
    const r = await runBounceReconciliation();
    if (r.kind === "not_configured") return NextResponse.json({ ok: false, mode, reason: "not_configured" }, { status: 503 });
    if (r.kind === "failed") return NextResponse.json({ ok: false, mode, reason: r.reason }, { status: 502 });
    return NextResponse.json({ ok: true, mode, scanned: r.scanned, reports: r.reports, outcomes: r.outcomes }, { status: 200 });
  }
  if (mode === "notify") {
    const r = await runOwnerDeliveryAlert();
    return NextResponse.json({ ok: true, mode, ...r }, { status: 200 });
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
