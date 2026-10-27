import { NextResponse } from "next/server";

import { authorizeCronRequest } from "@/lib/api/cron-auth";
import { outboundLinkOrigin } from "@/lib/domain/canonical";
import { runExternalReferralReprocess, type ReprocessMode } from "@/lib/invitations/external-referral-reprocess-run";

/**
 * REPROCESS UNSENT PARTNER REFERRALS — the operator's one door
 * (lib/invitations/external-referral-reprocess.ts holds every rule).
 *
 * AUTH: `authorizeCronRequest` — the CRON_SECRET machine check (401 while it
 * is unset). nginx answers 404 for /api/cron/* from the internet, so only the
 * VPS itself reaches it (ops/vps/lm-referral-reprocess.sh). It is NOT in the
 * cron bundle: nothing schedules it, the owner runs each step by hand.
 *
 * POST only (it can send mail). `?mode=`:
 *   dry_run (default) — counts only, nothing rotated, nothing sent;
 *   control           — exactly ONE referral (the soonest-expiring eligible);
 *   batch             — at most 20 per call.
 * The body is counts and reason codes only — no ids, no addresses.
 */
const MODES: readonly ReprocessMode[] = ["dry_run", "control", "batch"];

export async function POST(request: Request): Promise<NextResponse> {
  const auth = authorizeCronRequest(request);
  if (auth !== "ok") {
    return NextResponse.json({ ok: false, reason: auth }, { status: 401 });
  }
  const requested = new URL(request.url).searchParams.get("mode") ?? "dry_run";
  if (!(MODES as readonly string[]).includes(requested)) {
    return NextResponse.json({ ok: false, reason: "invalid_mode" }, { status: 400 });
  }
  const origin = outboundLinkOrigin(
    request.headers.get("x-forwarded-host") ?? request.headers.get("host"),
    request.headers.get("x-forwarded-proto"),
  );
  const result = await runExternalReferralReprocess({ mode: requested as ReprocessMode, origin });
  if (result.kind === "needs_migration") {
    return NextResponse.json({ ok: false, reason: "needs_migration" }, { status: 503 });
  }
  if (result.kind === "unavailable") {
    return NextResponse.json({ ok: false, reason: "unavailable" }, { status: 503 });
  }
  const { report } = result;
  const status = report.outcome === "email_not_configured" ? 503 : 200;
  return NextResponse.json({ ok: status === 200, ...report }, { status });
}
