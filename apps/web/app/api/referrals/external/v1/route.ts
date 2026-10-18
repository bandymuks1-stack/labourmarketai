import { NextResponse } from "next/server";

import { outboundLinkOrigin } from "@/lib/domain/canonical";
import { authorizeExternalReferralRequest } from "@/lib/api/external-referral-auth";
import { parseExternalWorkerReferral } from "@/lib/invitations/external-referral-contract";
import { receiveExternalReferral } from "@/lib/invitations/external-referral-receive";
import { clientKeyFromHeaders, rateLimit } from "@/lib/security/rate-limit";
import { emitServerFunnelEvent } from "@/lib/telemetry/server-funnel";
import { FUNNEL_EVENTS } from "@/lib/telemetry/funnel-events";

/**
 * EXTERNAL WORKER REFERRAL — the approved-partner door (universal network v1).
 *
 * POST one `NONSTOP_WORKER_REFERRAL` v1 envelope (the generic external
 * referral contract, `lib/invitations/external-referral-contract.ts`) and
 * receive ONE canonical invitation in return. There is no partner-specific
 * table behind this: the referral IS an `invitations` row with an external
 * source and the person's consent on it, and the person claims it exactly
 * the way every other invited person does — by opening the link, signing in
 * or registering, and accepting.
 *
 * AUTH: `lib/api/external-referral-auth.ts` — the source names itself
 * (`X-Referral-Source`) and proves it with its OWN machine secret, constant-
 * time compared, REFUSED while unset. No cookie path, no user path.
 *
 * ORDER OF REFUSALS, deliberately: auth → rate → schema → consent (again,
 * in the database) → idempotency. An unauthenticated caller learns nothing
 * about the schema; an authenticated one learns which paths failed, never
 * the values it sent.
 *
 * NEVER "STORED" FOR SOMETHING NOT STORED. `needs_migration` is a 503 with
 * its own reason, so the partner's operator can tell "not enabled yet" from
 * "delivered". A replay of the same (source, leadId) is a 200 `duplicate`
 * with the existing id and status and NO link.
 */

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 64 * 1024;

export async function POST(request: Request): Promise<NextResponse> {
  const auth = authorizeExternalReferralRequest(request);
  if (auth.kind !== "ok") {
    // The reason is bounded to the auth vocabulary. `unknown_source` and
    // `not_configured` are operator facts, not secrets.
    return NextResponse.json({ ok: false, reason: auth.kind }, { status: 401 });
  }

  // Per source AND per client address: a partner's bug cannot hammer the
  // door, and a stolen secret is metered like every other caller.
  const limited = rateLimit({
    name: "external-referral",
    key: `${auth.source.slug}:${clientKeyFromHeaders(request.headers)}`,
    limit: 60,
    windowMs: 60_000,
  });
  if (limited.limited) {
    return NextResponse.json(
      { ok: false, reason: "rate_limited", retryAfterSeconds: limited.retryAfterSeconds },
      { status: 429, headers: { "retry-after": String(limited.retryAfterSeconds) } },
    );
  }

  let body: unknown;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) {
      return NextResponse.json({ ok: false, reason: "payload_too_large" }, { status: 413 });
    }
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ ok: false, reason: "invalid_json" }, { status: 400 });
  }

  const parsed = parseExternalWorkerReferral(body);
  if (!parsed.ok) {
    return NextResponse.json(
      { ok: false, reason: "invalid_envelope", issues: parsed.issues },
      { status: 400 },
    );
  }

  // The partner's request must not choose the host its invitee is sent to —
  // the link carries the raw token (`outboundLinkOrigin`).
  const origin = outboundLinkOrigin(
    request.headers.get("x-forwarded-host") ?? request.headers.get("host"),
    request.headers.get("x-forwarded-proto"),
  );
  const result = await receiveExternalReferral({
    source: auth.source,
    envelope: parsed.envelope,
    origin,
  });

  switch (result.outcome) {
    case "created":
      emitServerFunnelEvent(FUNNEL_EVENTS.externalReferralReceived, {
        source: "external-referral",
        route: "/api/referrals/external/v1",
        metadata: { entity_type: "invitation", surface: auth.source.slug, success: true },
      });
      return NextResponse.json(
        {
          ok: true,
          outcome: "created",
          invitationId: result.invitationId,
          inviteUrl: result.inviteUrl,
          delivery: result.delivery,
          leadId: parsed.envelope.leadId,
        },
        { status: 201, headers: { "cache-control": "no-store" } },
      );
    case "duplicate":
      return NextResponse.json(
        {
          ok: true,
          outcome: "duplicate",
          invitationId: result.invitationId,
          status: result.status,
          leadId: parsed.envelope.leadId,
        },
        { status: 200, headers: { "cache-control": "no-store" } },
      );
    case "consent_required":
      return NextResponse.json({ ok: false, reason: "consent_required" }, { status: 422 });
    case "needs_migration":
      return NextResponse.json({ ok: false, reason: "not_enabled" }, { status: 503 });
    case "error":
      return NextResponse.json({ ok: false, reason: "error" }, { status: 500 });
    default:
      return NextResponse.json({ ok: false, reason: result.outcome }, { status: 422 });
  }
}
