"use server";

import "server-only";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { HANDOVER_STATUSES } from "@/lib/projects/handover-passport-model";

/**
 * Handover passport write action (branch 19, §8.8).
 *
 * The ONLY write path is the gated SECURITY DEFINER RPC
 * add_project_handover_entry_v1 (migration 20260705230000): it re-checks
 * can_manage_project on the server, validates the honest status enum, bounds
 * the body and caps entries. Direct table writes are REVOKEd — this action
 * never inserts/updates/deletes a row itself, and the passport is
 * append-only (no edit/delete action exists at all).
 */

const RPC_NOT_FOUND = "42883";
const UNDEFINED_COLUMN = "42703";
const RELATION_NOT_FOUND = "42P01";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

export type HandoverEntryActionResult =
  | { ok: true }
  | {
      ok: false;
      code:
        | "needs_migration"
        | "invalid"
        | "auth"
        | "not_authorized"
        | "limit_reached"
        | "error";
      message?: string;
    };

export async function addHandoverEntryAction(input: {
  projectId: string;
  entryType: "note" | "status";
  statusValue?: string;
  body?: string;
}): Promise<HandoverEntryActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, code: "auth" };

  const projectId = input.projectId?.trim();
  if (!projectId) return { ok: false, code: "invalid" };

  if (input.entryType === "status") {
    const statusValue = (input.statusValue ?? "").trim();
    if (!(HANDOVER_STATUSES as readonly string[]).includes(statusValue)) {
      return { ok: false, code: "invalid" };
    }
  } else if (input.entryType === "note") {
    if (!(input.body ?? "").trim()) return { ok: false, code: "invalid" };
  } else {
    return { ok: false, code: "invalid" };
  }

  const { data, error } = await asAny(supabase).rpc(
    "add_project_handover_entry_v1",
    {
      p_project_id: projectId,
      p_entry_type: input.entryType,
      p_status_value: (input.statusValue ?? "").trim(),
      p_body: (input.body ?? "").trim().slice(0, 1000),
    },
  );
  if (error) {
    if (
      error.code === RPC_NOT_FOUND ||
      error.code === UNDEFINED_COLUMN ||
      error.code === RELATION_NOT_FOUND
    ) {
      return { ok: false, code: "needs_migration" };
    }
    if (error.code === "42501") return { ok: false, code: "not_authorized" };
    console.error("[handover-passport] add entry failed:", error.message);
    return { ok: false, code: "error", message: error.message };
  }

  const outcome = String(data ?? "");
  if (outcome === "created") {
    revalidatePath("/", "layout");
    return { ok: true };
  }
  if (outcome === "not_allowed") return { ok: false, code: "not_authorized" };
  if (outcome === "entry_limit_reached") return { ok: false, code: "limit_reached" };
  return { ok: false, code: "invalid" };
}
