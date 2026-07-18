"use server";

import "server-only";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { STAGE_STATUSES } from "@/lib/projects/stages";

/**
 * Project stages write actions (Wagon 6 slice 1).
 *
 * The ONLY write path is the gated SECURITY DEFINER RPCs (migration
 * 20260718140000): each re-checks can_manage_project on the server, validates
 * the status enum and bounds inputs. Direct table writes are default-denied
 * (no insert/update/delete policy). Honest degradation: while the migration is
 * unapplied the RPC is missing (42883) and the action returns needs_migration.
 */

const RPC_NOT_FOUND = "42883";
const UNDEFINED_COLUMN = "42703";
const RELATION_NOT_FOUND = "42P01";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

export type StageActionResult =
  | { ok: true }
  | {
      ok: false;
      code: "needs_migration" | "invalid" | "auth" | "not_authorized" | "error";
      message?: string;
    };

function mapError(error: { code?: string; message?: string }): StageActionResult {
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
  if (msg.includes("required") || msg.includes("invalid")) {
    return { ok: false, code: "invalid" };
  }
  console.error("[project-stages] write failed:", error.message);
  return { ok: false, code: "error", message: error.message };
}

export async function addStageAction(input: {
  projectId: string;
  name: string;
  plannedStart?: string;
  plannedEnd?: string;
  completionCriteria?: string;
}): Promise<StageActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, code: "auth" };

  const projectId = input.projectId?.trim();
  const name = (input.name ?? "").trim();
  if (!projectId || !name) return { ok: false, code: "invalid" };

  const { error } = await asAny(supabase).rpc("add_project_stage_v1", {
    p_project_id: projectId,
    p_name: name.slice(0, 160),
    p_stage_order: 0,
    p_planned_start: input.plannedStart || null,
    p_planned_end: input.plannedEnd || null,
    p_completion_criteria: (input.completionCriteria ?? "").trim().slice(0, 2000) || null,
  });
  if (error) return mapError(error);
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function updateStageStatusAction(input: {
  stageId: string;
  status: string;
  blockedReason?: string;
}): Promise<StageActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, code: "auth" };

  const stageId = input.stageId?.trim();
  const status = (input.status ?? "").trim();
  if (!stageId || !(STAGE_STATUSES as readonly string[]).includes(status)) {
    return { ok: false, code: "invalid" };
  }
  if (status === "blocked" && !(input.blockedReason ?? "").trim()) {
    return { ok: false, code: "invalid" };
  }

  const { error } = await asAny(supabase).rpc("update_project_stage_v1", {
    p_stage_id: stageId,
    p_status: status,
    p_blocked_reason: (input.blockedReason ?? "").trim().slice(0, 500) || null,
  });
  if (error) return mapError(error);
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function deleteStageAction(input: {
  stageId: string;
}): Promise<StageActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, code: "auth" };

  const stageId = input.stageId?.trim();
  if (!stageId) return { ok: false, code: "invalid" };

  const { error } = await asAny(supabase).rpc("delete_project_stage_v1", {
    p_stage_id: stageId,
  });
  if (error) return mapError(error);
  revalidatePath("/", "layout");
  return { ok: true };
}
