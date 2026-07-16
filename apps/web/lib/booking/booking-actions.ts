"use server";

import "server-only";

import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import {
  countOwnerResponsesSince,
  normalizeBookingReason,
  DECLINE_REASON_KINDS,
  WITHDRAW_REASON_KINDS,
  type BookingStatus,
} from "@/lib/booking/booking-state";
import { hasFeature } from "@/lib/billing/effective-entitlements";
import {
  COMPANY_REQUEST_LIMITS,
  evaluateRequestBudget,
  rollingDayFloorIso,
} from "@/lib/limits/request-rate-limits";

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
// Column absent (the owner-gated lifecycle-v2 column is not applied yet).
const ABSENT_COLUMN = "42703";

/** True exactly when the lifecycle-v2 FUNCTION is not installed yet — the
 *  compat wrapper falls back to the v1 RPC on these two codes only. */
function isAbsentFunction(error: { code?: string }): boolean {
  return error.code === "42883" || error.code === "PGRST202";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

export type BookingActionResult =
  | {
      kind: "ok";
      status?: string;
      /** Reason-capture outcome tag (P2-PR6). Present ONLY when the caller
       *  chose a reason: true = the v2 RPC stored it; false = the v2 RPC is
       *  not installed yet, the v1 RPC completed the action WITHOUT the
       *  reason (honest partial — the UI says the reason was not saved).
       *  Undefined = no reason was chosen (plain v1 path, unchanged). */
      reasonStored?: boolean;
    }
  | { kind: "needs-migration" }
  | { kind: "conflict" }
  | { kind: "not-authed" }
  | { kind: "not-entitled" }
  | { kind: "rate-limited" }
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

  // Bounded request budget (Wagon 1): 10 open proposals + 30/24h per company,
  // counted over the caller's own RLS-visible booking rows. FAILS CLOSED on
  // unreadable counts — except while the booking model itself is unapplied,
  // where the RPC below reports the honest needs-migration state instead.
  const countOwn = async (
    filter: (q: unknown) => unknown,
  ): Promise<{ n: number | null; absent: boolean }> => {
    try {
      let q = asAny(supabase)
        .from("booking_requests")
        .select("id", { count: "exact", head: true })
        .eq("owner_id", user.id);
      q = filter(q);
      const { count, error } = await q;
      if (error) {
        return { n: null, absent: !!(error.code && ABSENT.has(error.code)) };
      }
      return { n: typeof count === "number" ? count : null, absent: false };
    } catch {
      return { n: null, absent: false };
    }
  };
  const [open, day] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    countOwn((q) => (q as any).eq("status", "proposed")),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    countOwn((q) => (q as any).gt("created_at", rollingDayFloorIso())),
  ]);
  if (open.absent || day.absent) return { kind: "needs-migration" };
  const budget = evaluateRequestBudget(
    { openCount: open.n, last24hCount: day.n },
    COMPANY_REQUEST_LIMITS,
  );
  if (!budget.allowed) return { kind: "rate-limited" };

  const args = {
    p_request_id: input.requestId,
    p_worker_id: input.workerId,
    p_start_date: input.startDate ?? "",
    p_expected_end_date: input.expectedEndDate ?? "",
    p_location_country: input.locationCountry ?? "",
    p_role_text: input.role ?? "",
    p_note: input.note ?? "",
  };
  // Defense-in-depth: the v3 wrapper (draft migration 20260716121000) also
  // enforces the caps in the DB. Until the owner applies it, fall back to the
  // UNCHANGED applied v1 RPC — the app-layer budget above stays active.
  let { error } = await asAny(supabase).rpc("propose_booking_request_v3", args);
  if (error && isAbsentFunction(error)) {
    ({ error } = await asAny(supabase).rpc("propose_booking_request", args));
  }
  if (error) {
    if (error.code === "P0004" || /limit reached|too many open/i.test(error.message ?? "")) {
      return { kind: "rate-limited" };
    }
    return classify(error);
  }
  revalidatePath(`/${input.locale}/dashboard/bookings`);
  return { kind: "ok", status: "proposed" };
}

export async function respondBookingAction(input: {
  locale: string;
  bookingId: string;
  decision: Extract<BookingStatus, "accepted" | "declined">;
  /** OPTIONAL decline reason (P2-PR6) — closed DECLINE_REASON_KINDS member.
   *  Ignored unless the decision is "declined"; invalid input degrades to
   *  "no reason chosen" (the v1 path), never an error. */
  reasonKind?: string | null;
  reasonNote?: string | null;
}): Promise<BookingActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "not-authed" };

  // Reason capture rides ONLY on a decline and ONLY with a valid closed kind.
  const reason =
    input.decision === "declined"
      ? normalizeBookingReason(input.reasonKind, input.reasonNote, DECLINE_REASON_KINDS)
      : null;

  if (reason) {
    // v2 first (stores the reason). If the owner-gated function is not
    // installed yet, fall back to the v1 RPC — the RESPONSE is never lost,
    // and the result is tagged so the UI can say the reason was not saved.
    const v2 = await asAny(supabase).rpc("respond_booking_request_v2", {
      p_booking_id: input.bookingId,
      p_decision: input.decision,
      p_reason_kind: reason.kind,
      p_reason_note: reason.note ?? "",
    });
    if (!v2.error) {
      revalidatePath(`/${input.locale}/dashboard/bookings`);
      return { kind: "ok", status: input.decision, reasonStored: true };
    }
    if (!isAbsentFunction(v2.error)) return classify(v2.error);
    const v1 = await asAny(supabase).rpc("respond_booking_request", {
      p_booking_id: input.bookingId,
      p_decision: input.decision,
    });
    if (v1.error) return classify(v1.error);
    revalidatePath(`/${input.locale}/dashboard/bookings`);
    return { kind: "ok", status: input.decision, reasonStored: false };
  }

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
  /** OPTIONAL withdraw reason (P2-PR6) — closed WITHDRAW_REASON_KINDS member.
   *  Invalid input degrades to "no reason chosen" (the v1 path). */
  reasonKind?: string | null;
  reasonNote?: string | null;
}): Promise<BookingActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "not-authed" };

  const reason = normalizeBookingReason(
    input.reasonKind,
    input.reasonNote,
    WITHDRAW_REASON_KINDS,
  );

  if (reason) {
    const v2 = await asAny(supabase).rpc("withdraw_booking_request_v2", {
      p_booking_id: input.bookingId,
      p_reason_kind: reason.kind,
      p_reason_note: reason.note ?? "",
    });
    if (!v2.error) {
      revalidatePath(`/${input.locale}/dashboard/bookings`);
      return { kind: "ok", status: "withdrawn", reasonStored: true };
    }
    if (!isAbsentFunction(v2.error)) return classify(v2.error);
    const v1 = await asAny(supabase).rpc("withdraw_booking_request", {
      p_booking_id: input.bookingId,
    });
    if (v1.error) return classify(v1.error);
    revalidatePath(`/${input.locale}/dashboard/bookings`);
    return { kind: "ok", status: "withdrawn", reasonStored: false };
  }

  const { error } = await asAny(supabase).rpc("withdraw_booking_request", {
    p_booking_id: input.bookingId,
  });
  if (error) return classify(error);
  revalidatePath(`/${input.locale}/dashboard/bookings`);
  return { kind: "ok", status: "withdrawn" };
}

/**
 * Change the dates of an OPEN outgoing proposal (P2-PR6). Owner-only and
 * proposed-only — both enforced server-side by the owner-gated
 * reschedule_booking_proposal_v1 RPC; an ACCEPTED booking is NEVER mutated in
 * place. Until the owner applies the function, the call classifies as
 * `needs-migration` and the UI says honestly that the dates were not changed.
 */
export async function rescheduleBookingAction(input: {
  locale: string;
  bookingId: string;
  startDate: string;
  endDate?: string | null;
  note?: string | null;
}): Promise<BookingActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "not-authed" };
  if (!input.startDate?.trim()) {
    return { kind: "error", message: "start date required" };
  }

  const note = (input.note ?? "").trim().slice(0, 500);
  const { error } = await asAny(supabase).rpc("reschedule_booking_proposal_v1", {
    p_booking_id: input.bookingId,
    p_start_date: input.startDate,
    p_end_date: input.endDate?.trim() ? input.endDate : null,
    p_note: note.length > 0 ? note : null,
  });
  if (error) return classify(error);
  revalidatePath(`/${input.locale}/dashboard/bookings`);
  return { kind: "ok", status: "proposed" };
}

/**
 * Set (or clear) the respond-by date on an OPEN outgoing proposal (P2-PR6).
 * Owner-only + proposed-only, enforced by the owner-gated
 * set_booking_response_deadline_v1 RPC. Absent function → `needs-migration`
 * and the UI says honestly that the deadline was not saved.
 */
export async function setBookingDeadlineAction(input: {
  locale: string;
  bookingId: string;
  deadline: string;
}): Promise<BookingActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "not-authed" };
  if (!input.deadline?.trim()) {
    return { kind: "error", message: "deadline required" };
  }

  const { error } = await asAny(supabase).rpc("set_booking_response_deadline_v1", {
    p_booking_id: input.bookingId,
    p_deadline: input.deadline,
  });
  if (error) return classify(error);
  revalidatePath(`/${input.locale}/dashboard/bookings`);
  return { kind: "ok", status: "proposed" };
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
  /** Owner-set respond-by date (lifecycle v2). Null while the owner-gated
   *  column is not applied yet OR simply unset — both render nothing. */
  responseDeadlineDate: string | null;
}

export type BookingsListResult =
  | { kind: "ok"; incoming: BookingRow[]; outgoing: BookingRow[] }
  | { kind: "needs-migration" }
  | { kind: "not-authed" };

// Column lists for the tolerant read: the extended list ALSO asks for the
// owner-gated lifecycle-v2 deadline column; while it is not applied the
// select fails with 42703 (undefined column) and we retry with the base list.
const BASE_BOOKING_COLUMNS =
  "id, owner_id, request_id, worker_id, status, start_date, expected_end_date, location_country, role_text, note, readiness_snapshot, created_at, updated_at";
const EXTENDED_BOOKING_COLUMNS = `${BASE_BOOKING_COLUMNS}, response_deadline_date`;

/** Per-REQUEST downgrade memo (React request cache): once the extended
 *  column list 42703s, every later listMyBookings call in the SAME request
 *  (badge counts, page render) skips the doomed extended attempt. A new
 *  request probes again, so the column lights up as soon as it is applied. */
const deadlineColumnDowngrade = cache((): { absent: boolean } => ({ absent: false }));

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

  const downgrade = deadlineColumnDowngrade();
  let res:
    | { data: unknown[] | null; error: { code?: string; message?: string } | null }
    | null = null;
  if (!downgrade.absent) {
    res = await asAny(supabase)
      .from("booking_requests")
      .select(EXTENDED_BOOKING_COLUMNS)
      .order("created_at", { ascending: false });
    if (res?.error?.code === ABSENT_COLUMN) {
      downgrade.absent = true; // cache the downgrade for this request
      res = null;
    }
  }
  if (res === null) {
    res = await asAny(supabase)
      .from("booking_requests")
      .select(BASE_BOOKING_COLUMNS)
      .order("created_at", { ascending: false });
  }
  const { data, error } = res!;
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
      responseDeadlineDate:
        typeof r.response_deadline_date === "string" ? r.response_deadline_date : null,
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
