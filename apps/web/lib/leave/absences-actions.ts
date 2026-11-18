"use server";

import "server-only";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { ABSENCE_TYPES } from "@/lib/leave/absences-model";
import {
  emitAbsenceNotification,
  type AbsenceNotificationFacts,
} from "@/lib/notifications/event-emitters";

/**
 * Leave & absence write actions (Wagon 7 slice). Writes go only through the
 * gated SECURITY DEFINER RPCs (migration 20260718150000): request (own worker),
 * review (real manager only — approval is never faked), cancel (own worker).
 * Honest degradation: a missing RPC (42883) returns needs_migration.
 */

const RPC_NOT_FOUND = "42883";
const UNDEFINED_COLUMN = "42703";
const RELATION_NOT_FOUND = "42P01";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

export type AbsenceActionResult =
  | { ok: true }
  | {
      ok: false;
      code: "needs_migration" | "invalid" | "auth" | "not_authorized" | "error";
      message?: string;
    };

function mapError(error: { code?: string; message?: string }): AbsenceActionResult {
  if (
    error.code === RPC_NOT_FOUND ||
    error.code === UNDEFINED_COLUMN ||
    error.code === RELATION_NOT_FOUND
  ) {
    return { ok: false, code: "needs_migration" };
  }
  const msg = (error.message ?? "").toLowerCase();
  if (error.code === "42501" || msg.includes("not authorized")) {
    return { ok: false, code: "not_authorized" };
  }
  if (msg.includes("invalid") || msg.includes("only a")) {
    return { ok: false, code: "invalid" };
  }
  console.error("[absences] write failed:", error.message);
  return { ok: false, code: "error", message: error.message };
}

/**
 * THE FACTS THE BELL RIDES ON (2026-09-23). Read HERE, under the CALLER's
 * own session, from the stored row. The APPLIED `worker_absences_select`
 * (20260808120000) admits the worker themselves ALWAYS, and a real manager
 * of that worker ONLY WHILE `status = 'requested'` — the row is theirs to
 * act on, not to keep reading. That status gate decides WHEN each write
 * path may read:
 *   - request → AFTER its RPC. The requester is the worker (the RPC admits
 *     nobody else), and the id does not exist before the write.
 *   - review  → BEFORE its RPC. `review_worker_absence_v1` leaves the row
 *     approved/rejected, and from that instant the manager's SELECT arm no
 *     longer admits it: a post-RPC read is a null row for every ordinary
 *     reviewer (only `is_admin()` would still see it), and the two outcome
 *     events this store exists to deliver would stay undelivered. The
 *     pre-read sees exactly the row the RPC then acts on — the RPC refuses
 *     any non-`requested` row, and worker_id / requested_by / start_date are
 *     immutable across review. A refused review emits nothing.
 * The emitter used to read this row with the admin client, which holds no
 * grant on `worker_absences` in production, so no absence outcome ever
 * reached the worker (event-emitters.ts, SERVICE_ROLE GRANT TRUTH). Never
 * throws: an unreadable row yields null facts and the emitter reports
 * `recipient_unresolved`; a write that already succeeded is untouched.
 */
async function absenceNotificationFacts(
  supabase: SupabaseClient,
  absenceId: string,
): Promise<AbsenceNotificationFacts> {
  try {
    const { data } = await asAny(supabase)
      .from("worker_absences")
      .select("worker_id, requested_by, start_date")
      .eq("id", absenceId)
      .maybeSingle();
    const row = (data ?? null) as {
      worker_id?: string | null;
      requested_by?: string | null;
      start_date?: string | null;
    } | null;
    return {
      absenceId,
      workerId: row?.worker_id ?? null,
      requestedByProfileId: row?.requested_by ?? null,
      startDate: row?.start_date ?? null,
    };
  } catch {
    return { absenceId, workerId: null, requestedByProfileId: null, startDate: null };
  }
}

export async function requestAbsenceAction(input: {
  workerId: string;
  absenceType: string;
  startDate: string;
  endDate: string;
  halfDay?: boolean;
  note?: string;
}): Promise<AbsenceActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, code: "auth" };

  if (!input.workerId || !(ABSENCE_TYPES as readonly string[]).includes(input.absenceType)) {
    return { ok: false, code: "invalid" };
  }
  if (!input.startDate || !input.endDate || input.endDate < input.startDate) {
    return { ok: false, code: "invalid" };
  }

  const { data: newAbsenceId, error } = await asAny(supabase).rpc(
    "request_worker_absence_v1",
    {
      p_worker_id: input.workerId,
      p_absence_type: input.absenceType,
      p_start_date: input.startDate,
      p_end_date: input.endDate,
      p_half_day: !!input.halfDay,
      p_note: (input.note ?? "").trim().slice(0, 500) || null,
    },
  );
  if (error) return mapError(error);
  revalidatePath("/", "layout");
  // Durable notification — AWAITED, not detached: the serverless runtime can
  // freeze the invocation the instant the action returns, killing a `void`-
  // detached insert mid-flight (the mechanism that made the live interest
  // emitter deliver nothing). The emitter never throws, so the absence write
  // that already succeeded cannot fail on its own bell; it still degrades
  // silently until the owner-gated notification_events store is applied. The
  // emitter decides the recipient from the stored row's facts, read here
  // under the requester's own session (see absenceNotificationFacts).
  if (typeof newAbsenceId === "string" && newAbsenceId) {
    await emitAbsenceNotification(
      await absenceNotificationFacts(supabase, newAbsenceId),
      "absence_requested",
    );
  }
  return { ok: true };
}

export async function reviewAbsenceAction(input: {
  absenceId: string;
  decision: "approved" | "rejected";
}): Promise<AbsenceActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, code: "auth" };
  if (!input.absenceId || (input.decision !== "approved" && input.decision !== "rejected")) {
    return { ok: false, code: "invalid" };
  }

  // Facts BEFORE the RPC — the reviewer's SELECT arm admits this row only
  // while it is still `requested`, and the RPC is what ends that (see
  // absenceNotificationFacts). Read now, under the reviewer's own session;
  // ring the bell only once the RPC has actually decided.
  const facts = await absenceNotificationFacts(supabase, input.absenceId);

  const { error } = await asAny(supabase).rpc("review_worker_absence_v1", {
    p_absence_id: input.absenceId,
    p_decision: input.decision,
  });
  if (error) return mapError(error);
  revalidatePath("/", "layout");
  // The absence OUTCOME is the exact event an offline worker never learned
  // about under the derived-only spine — which is why it must be AWAITED: a
  // detached emit is killable at serverless return, and the outcome event has
  // no second chance to fire. The emitter never throws.
  await emitAbsenceNotification(
    facts,
    input.decision === "approved" ? "absence_approved" : "absence_rejected",
  );
  return { ok: true };
}

export async function cancelAbsenceAction(input: {
  absenceId: string;
}): Promise<AbsenceActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, code: "auth" };
  if (!input.absenceId) return { ok: false, code: "invalid" };

  const { error } = await asAny(supabase).rpc("cancel_worker_absence_v1", {
    p_absence_id: input.absenceId,
  });
  if (error) return mapError(error);
  revalidatePath("/", "layout");
  return { ok: true };
}
