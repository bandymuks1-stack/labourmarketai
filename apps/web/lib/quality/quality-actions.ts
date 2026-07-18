"use server";

import "server-only";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import {
  CORRECTION_OUTCOMES,
  DEFECT_CATEGORIES,
  DEFECT_SEVERITIES,
  DEFECT_STATUSES,
} from "@/lib/quality/quality-model";

/**
 * Delivery & Quality write actions (Wagon 11). Writes go only through the gated
 * manager-scoped SECURITY DEFINER RPCs (migration 20260718200000). Nothing is
 * auto-accepted — a manager sets each status explicitly.
 */

const RPC_NOT_FOUND = "42883";
const UNDEFINED_COLUMN = "42703";
const RELATION_NOT_FOUND = "42P01";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

export type QualityActionResult =
  | { ok: true }
  | { ok: false; code: "needs_migration" | "invalid" | "auth" | "not_authorized" | "error"; message?: string };

function mapError(error: { code?: string; message?: string }): QualityActionResult {
  if (error.code === RPC_NOT_FOUND || error.code === UNDEFINED_COLUMN || error.code === RELATION_NOT_FOUND) {
    return { ok: false, code: "needs_migration" };
  }
  const msg = (error.message ?? "").toLowerCase();
  if (error.code === "42501" || msg.includes("not authorized")) return { ok: false, code: "not_authorized" };
  if (msg.includes("required") || msg.includes("invalid")) return { ok: false, code: "invalid" };
  console.error("[quality] write failed:", error.message);
  return { ok: false, code: "error", message: error.message };
}

async function withUser(): Promise<SupabaseClient | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? supabase : null;
}

export async function reportDefectAction(input: {
  projectId: string;
  category: string;
  description: string;
  severity?: string;
  location?: string;
  dueDate?: string;
  stageId?: string;
}): Promise<QualityActionResult> {
  const supabase = await withUser();
  if (!supabase) return { ok: false, code: "auth" };
  if (
    !input.projectId ||
    !(DEFECT_CATEGORIES as readonly string[]).includes(input.category) ||
    !input.description.trim()
  ) {
    return { ok: false, code: "invalid" };
  }
  const severity = (DEFECT_SEVERITIES as readonly string[]).includes(input.severity ?? "") ? input.severity : "medium";
  const { error } = await asAny(supabase).rpc("report_defect_v1", {
    p_project_id: input.projectId,
    p_category: input.category,
    p_description: input.description.trim().slice(0, 2000),
    p_severity: severity,
    p_stage_id: input.stageId || null,
    p_location: (input.location ?? "").trim().slice(0, 200) || null,
    p_due_date: input.dueDate || null,
  });
  if (error) return mapError(error);
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function setDefectStatusAction(input: {
  defectId: string;
  status: string;
}): Promise<QualityActionResult> {
  const supabase = await withUser();
  if (!supabase) return { ok: false, code: "auth" };
  if (!input.defectId || !(DEFECT_STATUSES as readonly string[]).includes(input.status)) {
    return { ok: false, code: "invalid" };
  }
  const { error } = await asAny(supabase).rpc("set_defect_status_v1", {
    p_defect_id: input.defectId,
    p_status: input.status,
  });
  if (error) return mapError(error);
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function addDefectCorrectionAction(input: {
  defectId: string;
  workPerformed: string;
  materials?: string;
  outcome?: string;
}): Promise<QualityActionResult> {
  const supabase = await withUser();
  if (!supabase) return { ok: false, code: "auth" };
  if (!input.defectId || !input.workPerformed.trim()) return { ok: false, code: "invalid" };
  const outcome = (CORRECTION_OUTCOMES as readonly string[]).includes(input.outcome ?? "") ? input.outcome : "pending";
  const { error } = await asAny(supabase).rpc("add_defect_correction_v1", {
    p_defect_id: input.defectId,
    p_work_performed: input.workPerformed.trim().slice(0, 2000),
    p_materials: (input.materials ?? "").trim().slice(0, 1000) || null,
    p_outcome: outcome,
  });
  if (error) return mapError(error);
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function deleteDefectAction(input: { defectId: string }): Promise<QualityActionResult> {
  const supabase = await withUser();
  if (!supabase) return { ok: false, code: "auth" };
  if (!input.defectId) return { ok: false, code: "invalid" };
  const { error } = await asAny(supabase).rpc("delete_defect_v1", { p_defect_id: input.defectId });
  if (error) return mapError(error);
  revalidatePath("/", "layout");
  return { ok: true };
}
