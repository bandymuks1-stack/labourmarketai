"use server";

import "server-only";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { ABSENCE_TYPES } from "@/lib/leave/absences-model";

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

  const { error } = await asAny(supabase).rpc("request_worker_absence_v1", {
    p_worker_id: input.workerId,
    p_absence_type: input.absenceType,
    p_start_date: input.startDate,
    p_end_date: input.endDate,
    p_half_day: !!input.halfDay,
    p_note: (input.note ?? "").trim().slice(0, 500) || null,
  });
  if (error) return mapError(error);
  revalidatePath("/", "layout");
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

  const { error } = await asAny(supabase).rpc("review_worker_absence_v1", {
    p_absence_id: input.absenceId,
    p_decision: input.decision,
  });
  if (error) return mapError(error);
  revalidatePath("/", "layout");
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
