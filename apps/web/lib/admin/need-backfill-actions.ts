"use server";

import "server-only";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isSuperadmin } from "@/lib/auth/superadmin";
import { isWorkTypeSlug, isMarketCountry } from "@/lib/taxonomy/work-categories";

/**
 * Apply reviewed structured fields to one submitted demand (need-structuring
 * backfill). Admin-only, closed-set-validated, RLS-governed.
 *
 * It writes ONLY the structured columns (role_or_work_type / country /
 * team_size / start_period) + the whitelisted payload.accommodation — the same
 * worker-board-safe surface the demand wizard writes. Free text is never
 * written or exposed. No migration; the UPDATE rides the existing
 * customer_requests admin RLS.
 */
const ACCOMMODATION = new Set([
  "provided_free",
  "provided_paid",
  "provided_deducted",
  "not_provided",
]);
const START = new Set(["flexible", "this_week", "urgent"]);

export type ApplyNeedStructureState =
  | { ok: true }
  | { ok: false; code: "invalid" | "not_admin" | "error" }
  | null;

export async function applyNeedStructureAction(
  requestId: string,
  raw: {
    workType?: string;
    country?: string;
    teamSize?: string;
    startPeriod?: string;
    accommodation?: string;
  },
): Promise<ApplyNeedStructureState> {
  if (!(await isSuperadmin())) return { ok: false, code: "not_admin" };
  if (typeof requestId !== "string" || requestId.length < 10) {
    return { ok: false, code: "invalid" };
  }

  // Closed-set validation — exactly like the demand wizard's submit path. A
  // value that is not a known slug / market / enum is dropped to null, never
  // written as free text.
  const workType =
    raw.workType && isWorkTypeSlug(raw.workType) ? raw.workType : null;
  const country =
    raw.country && isMarketCountry(raw.country.toUpperCase())
      ? raw.country.toUpperCase()
      : null;
  const teamSize =
    raw.teamSize && /^\d{1,6}$/.test(raw.teamSize)
      ? Math.min(100000, Math.max(1, parseInt(raw.teamSize, 10)))
      : null;
  const startPeriod =
    raw.startPeriod && START.has(raw.startPeriod) ? raw.startPeriod : null;
  const accommodation =
    raw.accommodation && ACCOMMODATION.has(raw.accommodation)
      ? raw.accommodation
      : null;

  if (!workType && !country && teamSize == null && !startPeriod && !accommodation) {
    return { ok: false, code: "invalid" };
  }

  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;

  // Merge the whitelisted accommodation into payload without touching the rest.
  const { data: existing } = await sb
    .from("customer_requests")
    .select("payload")
    .eq("id", requestId)
    .maybeSingle();
  const payload = {
    ...((existing?.payload as Record<string, unknown> | null) ?? {}),
    accommodation,
  };

  const { data: updated, error } = await sb
    .from("customer_requests")
    .update({
      role_or_work_type: workType,
      country,
      team_size: teamSize,
      start_period: startPeriod,
      payload,
    })
    .eq("id", requestId)
    .eq("status", "submitted")
    .select("id");

  if (error) {
    console.error("[need-backfill] update failed:", error.message);
    return { ok: false, code: "error" };
  }
  if (!Array.isArray(updated) || updated.length === 0) {
    // RLS blocked the write (admin needs active_role='admin' for others' rows).
    return { ok: false, code: "not_admin" };
  }

  revalidatePath("/", "layout");
  return { ok: true };
}
