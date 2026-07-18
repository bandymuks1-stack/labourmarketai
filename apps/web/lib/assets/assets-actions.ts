"use server";

import "server-only";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { ASSET_CONDITIONS, ASSET_TYPES } from "@/lib/assets/assets-model";

/**
 * Assets & Logistics write actions (Wagon 9). Writes go only through the gated
 * SECURITY DEFINER RPCs (migration 20260718170000): create/issue/transfer/return
 * are manager-gated (org owner); acknowledge is the assigned worker only.
 */

const RPC_NOT_FOUND = "42883";
const UNDEFINED_COLUMN = "42703";
const RELATION_NOT_FOUND = "42P01";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

export type AssetActionResult =
  | { ok: true }
  | {
      ok: false;
      code: "needs_migration" | "invalid" | "auth" | "not_authorized" | "error";
      message?: string;
    };

function mapError(error: { code?: string; message?: string }): AssetActionResult {
  if (error.code === RPC_NOT_FOUND || error.code === UNDEFINED_COLUMN || error.code === RELATION_NOT_FOUND) {
    return { ok: false, code: "needs_migration" };
  }
  const msg = (error.message ?? "").toLowerCase();
  if (error.code === "42501" || msg.includes("not authorized")) return { ok: false, code: "not_authorized" };
  if (msg.includes("required") || msg.includes("invalid") || msg.includes("only an") || msg.includes("only the")) {
    return { ok: false, code: "invalid" };
  }
  console.error("[assets] write failed:", error.message);
  return { ok: false, code: "error", message: error.message };
}

async function withUser(): Promise<{ supabase: SupabaseClient; userId: string } | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? { supabase, userId: user.id } : null;
}

export async function createAssetAction(input: {
  organizationId: string;
  assetType: string;
  name: string;
  serialOrReg?: string;
  condition?: string;
  note?: string;
}): Promise<AssetActionResult> {
  const ctx = await withUser();
  if (!ctx) return { ok: false, code: "auth" };
  if (
    !input.organizationId ||
    !(ASSET_TYPES as readonly string[]).includes(input.assetType) ||
    !input.name.trim()
  ) {
    return { ok: false, code: "invalid" };
  }
  const condition = (ASSET_CONDITIONS as readonly string[]).includes(input.condition ?? "")
    ? input.condition
    : "unknown";
  const { error } = await asAny(ctx.supabase).rpc("create_asset_v1", {
    p_organization_id: input.organizationId,
    p_asset_type: input.assetType,
    p_name: input.name.trim().slice(0, 160),
    p_serial_or_reg: (input.serialOrReg ?? "").trim().slice(0, 120) || null,
    p_condition: condition,
    p_note: (input.note ?? "").trim().slice(0, 500) || null,
  });
  if (error) return mapError(error);
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function issueAssetAction(input: {
  assetId: string;
  projectId?: string;
  workerId?: string;
  conditionAtIssue?: string;
  note?: string;
}): Promise<AssetActionResult> {
  const ctx = await withUser();
  if (!ctx) return { ok: false, code: "auth" };
  if (!input.assetId || (!input.projectId && !input.workerId)) return { ok: false, code: "invalid" };
  const condition = (ASSET_CONDITIONS as readonly string[]).includes(input.conditionAtIssue ?? "")
    ? input.conditionAtIssue
    : "unknown";
  const { error } = await asAny(ctx.supabase).rpc("issue_asset_v1", {
    p_asset_id: input.assetId,
    p_project_id: input.projectId || null,
    p_worker_id: input.workerId || null,
    p_condition_at_issue: condition,
    p_note: (input.note ?? "").trim().slice(0, 500) || null,
  });
  if (error) return mapError(error);
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function acknowledgeAssetAction(input: { assignmentId: string }): Promise<AssetActionResult> {
  const ctx = await withUser();
  if (!ctx) return { ok: false, code: "auth" };
  if (!input.assignmentId) return { ok: false, code: "invalid" };
  const { error } = await asAny(ctx.supabase).rpc("acknowledge_asset_assignment_v1", {
    p_assignment_id: input.assignmentId,
  });
  if (error) return mapError(error);
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function transferAssetAction(input: {
  assignmentId: string;
  newProjectId?: string;
  newWorkerId?: string;
  note?: string;
}): Promise<AssetActionResult> {
  const ctx = await withUser();
  if (!ctx) return { ok: false, code: "auth" };
  if (!input.assignmentId || (!input.newProjectId && !input.newWorkerId)) {
    return { ok: false, code: "invalid" };
  }
  const { error } = await asAny(ctx.supabase).rpc("transfer_asset_assignment_v1", {
    p_assignment_id: input.assignmentId,
    p_new_project_id: input.newProjectId || null,
    p_new_worker_id: input.newWorkerId || null,
    p_note: (input.note ?? "").trim().slice(0, 500) || null,
  });
  if (error) return mapError(error);
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function returnAssetAction(input: {
  assignmentId: string;
  conditionAtReturn: string;
  note?: string;
}): Promise<AssetActionResult> {
  const ctx = await withUser();
  if (!ctx) return { ok: false, code: "auth" };
  if (!input.assignmentId || !(ASSET_CONDITIONS as readonly string[]).includes(input.conditionAtReturn)) {
    return { ok: false, code: "invalid" };
  }
  const { error } = await asAny(ctx.supabase).rpc("return_asset_v1", {
    p_assignment_id: input.assignmentId,
    p_condition_at_return: input.conditionAtReturn,
    p_note: (input.note ?? "").trim().slice(0, 500) || null,
  });
  if (error) return mapError(error);
  revalidatePath("/", "layout");
  return { ok: true };
}
