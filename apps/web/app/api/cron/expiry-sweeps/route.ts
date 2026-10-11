import { NextResponse } from "next/server";

import { authorizeCronRequest } from "@/lib/api/cron-auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * EXPIRY SWEEPS — closes stale booking proposals and contact-disclosure
 * requests in the database. RED / owner-gated: the two service_role-only RPCs
 * this calls (migration 20261009150000_expiry_sweeps_service_role_v1) are NOT
 * applied until the owner approves, and until then this route reports
 * `not_available` and changes nothing.
 *
 * AUTH: `authorizeCronRequest` — CRON_SECRET bearer, fail-closed while unset.
 * ACTOR: the RPCs act as the dedicated SYSTEM identity (a banned, role-less
 * profile the owner provisions with scripts/provision-system-actor.ts). The
 * route passes no actor, so no caller can impersonate anyone. Until that
 * identity exists the RPC refuses ("system actor not provisioned") and the
 * route answers 503 `actor_not_provisioned`. Responses carry counts and a
 * reason code only.
 *
 * Triggered by .github/workflows/expiry-sweeps-cadence.yml.
 */
type RpcResult = { data: unknown; error: { message?: string } | null };

function reasonFor(error: { message?: string } | null): string {
  return /not provisioned/i.test(error?.message ?? "") ? "actor_not_provisioned" : "not_available";
}

export async function GET(request: Request): Promise<NextResponse> {
  const auth = authorizeCronRequest(request);
  if (auth !== "ok") {
    return NextResponse.json({ ok: false, reason: auth }, { status: 401 });
  }

  // The two RPCs are not in the generated types until the migration is
  // applied and types are regenerated; a narrow local signature keeps the call
  // honest without a wider cast.
  const admin = createAdminClient();
  const rpc = admin.rpc.bind(admin) as unknown as (
    fn: string,
    args?: Record<string, unknown>,
  ) => Promise<RpcResult>;

  const booking = await rpc("sweep_expire_stale_booking_requests_v1", { p_stale_days: 14 });
  if (booking.error) {
    return NextResponse.json(
      { ok: false, reason: reasonFor(booking.error), step: "booking" },
      { status: 503 },
    );
  }
  const disclosure = await rpc("sweep_expire_contact_disclosure_requests_v1");
  if (disclosure.error) {
    return NextResponse.json(
      {
        ok: false,
        reason: reasonFor(disclosure.error),
        step: "disclosure",
        bookingExpired: typeof booking.data === "number" ? booking.data : 0,
      },
      { status: 503 },
    );
  }
  const d = (disclosure.data ?? {}) as { expired_count?: number };
  return NextResponse.json({
    ok: true,
    bookingExpired: typeof booking.data === "number" ? booking.data : 0,
    disclosureExpired: d.expired_count ?? 0,
  });
}
