"use server";

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { countOwnerResponsesSince, type BookingStatus } from "@/lib/booking/booking-state";
import { hasFeature } from "@/lib/billing/effective-entitlements";

/**
 * Booking server actions (Stage 6) — the live wiring of the booking-state
 * machine against the PR2 RPCs (propose/respond/withdraw_booking_request).
 *
 * HONEST DEGRADATION: the migration is owner-applied (RED). Until applied, the
 * RPCs/table are absent — every action returns `kind:"needs-migration"` and the
 * UI shows a calm "not available yet" state, never an error or a fake success.
 * The worker alone accepts/declines; the company proposes/withdraws; an
 * overlapping accepted booking is blocked server-side (no double-booking).
 */

// PostgREST: function/table absent → 42883 (undefined_function), 42P01
// (undefined_table), or PGRST202 (no function in schema cache).
const ABSENT = new Set(["42883", "42P01", "PGRST202", "PGRST204"]);
const CONFLICT = "23P01";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

export type BookingActionResult =
  | { kind: "ok"; status?: string }
  | { kind: "needs-migration" }
  | { kind: "conflict" }
  | { kind: "not-authed" }
  | { kind: "not-entitled" }
  | { kind: "error"; message: string };

function classify(error: { code?: string; message?: string }): BookingActionResult {
  if (error.code && ABSENT.has(error.code)) return { kind: "needs-migration" };
  if (error.code === CONFLICT || /conflicting accepted booking/i.test(error.message ?? "")) {
    return { kind: "conflict" };
  }
  return { kind: "error", message: error.message ?? "unknown" };
}

export interface ProposeBookingInput {
  locale: string;
  requestId: string;
  workerId: string;
  startDate?: string | null;
  expectedEndDate?: string | null;
  locationCountry?: string | null;
  role?: string | null;
  note?: string | null;
}

export async function proposeBookingAction(
  input: ProposeBookingInput,
): Promise<BookingActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "not-authed" };

  // Entitlement enforcement (PR5). Permissive while billing is disabled (pilot
  // preserved); enforced once test mode is active + no active Company Pilot.
  if (!(await hasFeature("booking_requests"))) return { kind: "not-entitled" };

  const { error } = await asAny(supabase).rpc("propose_booking_request", {
    p_request_id: input.requestId,
    p_worker_id: input.workerId,
    p_start_date: input.startDate ?? "",
    p_expected_end_date: input.expectedEndDate ?? "",
    p_location_country: input.locationCountry ?? "",
    p_role_text: input.role ?? "",
    p_note: input.note ?? "",
  });
  if (error) return classify(error);
  revalidatePath(`/${input.locale}/dashboard/bookings`);
  return { kind: "ok", status: "proposed" };
}

export async function respondBookingAction(input: {
  locale: string;
  bookingId: string;
  decision: Extract<BookingStatus, "accepted" | "declined">;
}): Promise<BookingActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "not-authed" };

  const { error } = await asAny(supabase).rpc("respond_booking_request", {
    p_booking_id: input.bookingId,
    p_decision: input.decision,
  });
  if (error) return classify(error);
  revalidatePath(`/${input.locale}/dashboard/bookings`);
  return { kind: "ok", status: input.decision };
}

export async function withdrawBookingAction(input: {
  locale: string;
  bookingId: string;
}): Promise<BookingActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "not-authed" };

  const { error } = await asAny(supabase).rpc("withdraw_booking_request", {
    p_booking_id: input.bookingId,
  });
  if (error) return classify(error);
  revalidatePath(`/${input.locale}/dashboard/bookings`);
  return { kind: "ok", status: "withdrawn" };
}

export interface BookingRow {
  id: string;
  /** customer_requests.id — with workerId, the upsert key the propose RPC
   *  re-opens on; lets "propose again" reuse the EXISTING propose flow
   *  pre-scoped to the same request + worker (repeat actions, PR 6b).
   *  Opaque ids only — no profile/contact data crosses this boundary. */
  requestId: string;
  /** workers.id (already client-visible on the scouting propose surface). */
  workerId: string;
  status: BookingStatus;
  startDate: string | null;
  expectedEndDate: string | null;
  locationCountry: string | null;
  roleText: string | null;
  note: string | null;
  isOwner: boolean;
  readinessSnapshot: Record<string, unknown> | null;
  createdAt: string;
  /** Set by the respond/withdraw RPCs — backs "responses since last seen". */
  updatedAt: string;
}

export type BookingsListResult =
  | { kind: "ok"; incoming: BookingRow[]; outgoing: BookingRow[] }
  | { kind: "needs-migration" }
  | { kind: "not-authed" };

/**
 * The caller's bookings, split into incoming (worker = subject) and outgoing
 * (company = owner). RLS already scopes rows; we tag ownership by owner_id.
 */
export async function listMyBookings(): Promise<BookingsListResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "not-authed" };

  const { data, error } = await asAny(supabase)
    .from("booking_requests")
    .select(
      "id, owner_id, request_id, worker_id, status, start_date, expected_end_date, location_country, role_text, note, readiness_snapshot, created_at, updated_at",
    )
    .order("created_at", { ascending: false });
  if (error) {
    if (error.code && ABSENT.has(error.code)) return { kind: "needs-migration" };
    return { kind: "ok", incoming: [], outgoing: [] };
  }

  const incoming: BookingRow[] = [];
  const outgoing: BookingRow[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const r of (data ?? []) as any[]) {
    const row: BookingRow = {
      id: r.id,
      requestId: String(r.request_id ?? ""),
      workerId: String(r.worker_id ?? ""),
      status: r.status,
      startDate: r.start_date ?? null,
      expectedEndDate: r.expected_end_date ?? null,
      locationCountry: r.location_country ?? null,
      roleText: r.role_text ?? null,
      note: r.note ?? null,
      isOwner: r.owner_id === user.id,
      readinessSnapshot: (r.readiness_snapshot as Record<string, unknown> | null) ?? null,
      createdAt: r.created_at,
      updatedAt: r.updated_at ?? r.created_at,
    };
    if (row.isOwner) outgoing.push(row);
    else incoming.push(row);
  }
  return { kind: "ok", incoming, outgoing };
}

/**
 * Real count of INCOMING booking proposals awaiting the worker's response
 * (status = 'proposed'). Used to surface bookings honestly under Žinutės and as
 * a dashboard next-action — ONLY when the count is real and > 0. Returns 0 on
 * any non-ok state (needs-migration / not-authed / no rows) so a missing data
 * model never produces a fake badge. Read-only; no schema/RLS change.
 */
export async function getPendingIncomingBookingCount(): Promise<number> {
  const result = await listMyBookings();
  if (result.kind !== "ok") return 0;
  return result.incoming.filter((b) => b.status === "proposed").length;
}

/**
 * The caller's booking-loop seen timestamp (audit PR5 — mirrors the
 * marketplace seen model). Null when never opened or while the owner-gated
 * booking_requests_seen migration is not applied — both degrade to 0 "new".
 */
export async function getBookingRequestsSeenAt(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await asAny(supabase)
    .from("booking_requests_seen")
    .select("seen_at")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error || !data) return null;
  return typeof data.seen_at === "string" ? data.seen_at : null;
}

/**
 * Real count of the OTHER party's booking responses since the caller last
 * opened the bookings surface: OWN (proposed-by-me) rows a worker moved to
 * accepted/declined after seen_at (the respond RPC stamps updated_at). The
 * caller's own propose/withdraw never counts. 0 when never seen / migration
 * absent — never a fabricated badge (audit PR5: booking responses were
 * silent for the proposing company).
 */
export async function getBookingResponsesNewCount(): Promise<number> {
  const seenAt = await getBookingRequestsSeenAt();
  if (!seenAt) return 0;
  const result = await listMyBookings();
  if (result.kind !== "ok") return 0;
  return countOwnerResponsesSince(result.outgoing, seenAt);
}

/**
 * Mark the caller's bookings surface as seen (single-row upsert via the
 * SECURITY DEFINER RPC). Rollout-safe: no-op when unauthenticated or the RPC
 * is absent — never throws.
 */
export async function markBookingRequestsSeen(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  try {
    await asAny(supabase).rpc("mark_booking_requests_seen");
  } catch {
    // rollout-safe: absent RPC / transient error → no-op
  }
}
