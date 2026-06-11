"use server";

import "server-only";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import {
  OPERATIONAL_STATUSES,
  READINESS_STATUSES,
  type OperationalStatus,
  type ReadinessStatus,
} from "@/lib/projects/operations-derive";

/**
 * Pilot Operations v2 server actions (slice pilot-ops-v2-status-docs).
 *
 * Every write goes through a SECURITY DEFINER RPC that re-checks the gate
 * (can_manage_project AND an active F4 assignment, or admin) on the server —
 * direct table writes are revoked, so these RPCs are the only write path. Tagged
 * returns (Next 15 strips thrown server-action Error messages in prod), with
 * `needs_migration` surfaced cleanly until the v2 migration applies.
 */

const RPC_NOT_FOUND = "42883";
const UNDEFINED_COLUMN = "42703";
const RELATION_NOT_FOUND = "42P01";

export type OpsActionResult =
  | { ok: true }
  | {
      ok: false;
      code: "needs_migration" | "invalid" | "auth" | "not_authorized" | "error";
      message?: string;
    };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}
function migMissing(code?: string): boolean {
  return code === RPC_NOT_FOUND || code === UNDEFINED_COLUMN || code === RELATION_NOT_FOUND;
}
function mapError(code?: string, message?: string): OpsActionResult {
  if (migMissing(code)) return { ok: false, code: "needs_migration" };
  if (code === "42501") return { ok: false, code: "not_authorized" };
  return { ok: false, code: "error", message };
}

export async function setOperationalStatusAction(input: {
  projectId: string;
  workerProfileId: string;
  status: string;
  note?: string;
}): Promise<OpsActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, code: "auth" };

  const projectId = input.projectId?.trim();
  const workerProfileId = input.workerProfileId?.trim();
  const status = input.status?.trim();
  if (!projectId || !workerProfileId || !status) return { ok: false, code: "invalid" };
  if (!(OPERATIONAL_STATUSES as readonly string[]).includes(status)) {
    return { ok: false, code: "invalid" };
  }

  const { error } = await asAny(supabase).rpc("set_worker_operational_status", {
    p_project_id: projectId,
    p_worker_profile_id: workerProfileId,
    p_status: status as OperationalStatus,
    p_note: (input.note ?? "").slice(0, 500),
  });
  if (error) {
    console.error("[ops-v2] set status failed:", error.message);
    return mapError(error.code, error.message);
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function upsertReadinessItemAction(input: {
  projectId: string;
  workerProfileId: string;
  itemKey: string;
  label: string;
  status: string;
  note?: string;
}): Promise<OpsActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, code: "auth" };

  const projectId = input.projectId?.trim();
  const workerProfileId = input.workerProfileId?.trim();
  const itemKey = input.itemKey?.trim();
  const label = input.label?.trim();
  const status = (input.status ?? "needed").trim() || "needed";
  if (!projectId || !workerProfileId || !itemKey || !label) {
    return { ok: false, code: "invalid" };
  }
  if (!(READINESS_STATUSES as readonly string[]).includes(status)) {
    return { ok: false, code: "invalid" };
  }

  const { error } = await asAny(supabase).rpc("upsert_worker_readiness_item", {
    p_project_id: projectId,
    p_worker_profile_id: workerProfileId,
    p_item_key: itemKey.slice(0, 80),
    p_label: label.slice(0, 160),
    p_status: status as ReadinessStatus,
    p_note: (input.note ?? "").slice(0, 500),
  });
  if (error) {
    console.error("[ops-v2] upsert readiness item failed:", error.message);
    return mapError(error.code, error.message);
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Seed a set of default checklist items (status 'needed') for a project worker. */
export async function seedReadinessItemsAction(input: {
  projectId: string;
  workerProfileId: string;
  items: { itemKey: string; label: string }[];
}): Promise<OpsActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, code: "auth" };

  const projectId = input.projectId?.trim();
  const workerProfileId = input.workerProfileId?.trim();
  if (!projectId || !workerProfileId || !Array.isArray(input.items) || input.items.length === 0) {
    return { ok: false, code: "invalid" };
  }

  for (const it of input.items.slice(0, 25)) {
    const itemKey = it.itemKey?.trim();
    const label = it.label?.trim();
    if (!itemKey || !label) continue;
    const { error } = await asAny(supabase).rpc("upsert_worker_readiness_item", {
      p_project_id: projectId,
      p_worker_profile_id: workerProfileId,
      p_item_key: itemKey.slice(0, 80),
      p_label: label.slice(0, 160),
      p_status: "needed",
      p_note: "",
    });
    if (error) {
      console.error("[ops-v2] seed readiness item failed:", error.message);
      return mapError(error.code, error.message);
    }
  }
  revalidatePath("/", "layout");
  return { ok: true };
}
