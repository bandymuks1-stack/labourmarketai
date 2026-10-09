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
 * ACTOR: both audit tables require a real profile id, so the actor is an
 * existing admin profile named by EXPIRY_SWEEP_ACTOR_PROFILE_ID. Unset = the
 * route refuses (503 `actor_not_configured`) and runs nothing. Responses carry
 * counts and a reason code only.
 *
 * Triggered by .github/workflows/expiry-sweeps-cadence.yml.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const auth = authorizeCronRequest(request);
  if (auth !== "ok") {
    return NextResponse.json({ ok: false, reason: auth }, { status: 401 });
  }
  const actor = process.env.EXPIRY_SWEEP_ACTOR_PROFILE_ID?.trim();
  if (!actor) {
    return NextResponse.json({ ok: false, reason: "actor_not_configured" }, { status: 503 });
  }

  // The two RPCs are not in the generated types until the migration is
  // applied and types are regenerated; a narrow local signature keeps the call
  // honest without a wider cast.
  const admin = createAdminClient();
  const rpc = admin.rpc.bind(admin) as unknown as (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: unknown }>;
  const booking = await rpc("sweep_expire_stale_booking_requests_v1", {
    p_actor: actor,
    p_stale_days: 14,
  });
  if (booking.error) {
    return NextResponse.json({ ok: false, reason: "not_available", step: "booking" }, { status: 503 });
  }
  const disclosure = await rpc("sweep_expire_contact_disclosure_requests_v1", { p_actor: actor });
  if (disclosure.error) {
    return NextResponse.json(
      { ok: false, reason: "not_available", step: "disclosure", bookingExpired: booking.data ?? 0 },
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
