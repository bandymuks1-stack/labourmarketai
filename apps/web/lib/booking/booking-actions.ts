"use server";

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { BookingStatus } from "@/lib/booking/booking-state";

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
  status: BookingStatus;
  startDate: string | null;
  expectedEndDate: string | null;
  locationCountry: string | null;
  roleText: string | null;
  note: string | null;
  isOwner: boolean;
  readinessSnapshot: Record<string, unknown> | null;
  createdAt: string;
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
      "id, owner_id, status, start_date, expected_end_date, location_country, role_text, note, readiness_snapshot, created_at",
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
      status: r.status,
      startDate: r.start_date ?? null,
      expectedEndDate: r.expected_end_date ?? null,
      locationCountry: r.location_country ?? null,
      roleText: r.role_text ?? null,
      note: r.note ?? null,
      isOwner: r.owner_id === user.id,
      readinessSnapshot: (r.readiness_snapshot as Record<string, unknown> | null) ?? null,
      createdAt: r.created_at,
    };
    if (row.isOwner) outgoing.push(row);
    else incoming.push(row);
  }
  return { kind: "ok", incoming, outgoing };
}
