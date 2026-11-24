"use server";

import "server-only";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { FOLLOW_UP_STATUSES } from "@/lib/followup/follow-up-tasks-model";

/**
 * Follow-up task write actions (branch 24, §8.13).
 *
 * The ONLY write paths are the two gated SECURITY DEFINER RPCs
 * (migration 20260705235000): create_follow_up_task_v1 and
 * set_follow_up_task_status_v1. Both re-check is_admin() on the server,
 * validate the honest status enum, bound the note and cap open tasks.
 * Direct table writes are REVOKEd — these actions never insert/update/
 * delete a row themselves.
 *
 * INTERNAL ONLY: nothing here (or anywhere in this layer) sends email,
 * SMS, push, Telegram or any other outbound message. Creating a task
 * records an internal next action; it contacts nobody.
 */

const RPC_NOT_FOUND = "42883";
const UNDEFINED_COLUMN = "42703";
const RELATION_NOT_FOUND = "42P01";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

export type FollowUpActionResult =
  | { ok: true }
  | {
      ok: false;
      code:
        | "needs_migration"
        | "invalid"
        | "auth"
        | "not_authorized"
        | "limit_reached"
        | "not_found"
        | "error";
      message?: string;
    };

const UUID_RX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function mapRpcError(error: {
  code?: string;
  message: string;
}): FollowUpActionResult {
  if (
    error.code === RPC_NOT_FOUND ||
    error.code === UNDEFINED_COLUMN ||
    error.code === RELATION_NOT_FOUND
  ) {
    return { ok: false, code: "needs_migration" };
  }
  if (error.code === "42501") return { ok: false, code: "not_authorized" };
  console.error("[follow-up] RPC failed:", error.message);
  return { ok: false, code: "error", message: error.message };
}

function mapOutcome(outcome: string): FollowUpActionResult {
  if (outcome === "created" || outcome === "updated") {
    revalidatePath("/", "layout");
    return { ok: true };
  }
  if (outcome === "not_allowed") return { ok: false, code: "not_authorized" };
  if (outcome === "task_limit_reached")
    return { ok: false, code: "limit_reached" };
  if (outcome === "not_found") return { ok: false, code: "not_found" };
  return { ok: false, code: "invalid" };
}

export async function createFollowUpTaskAction(input: {
  note: string;
  subjectProfileId?: string;
  subjectCompanyId?: string;
}): Promise<FollowUpActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, code: "auth" };

  const note = (input.note ?? "").trim();
  if (!note) return { ok: false, code: "invalid" };

  const subjectProfileId = (input.subjectProfileId ?? "").trim();
  const subjectCompanyId = (input.subjectCompanyId ?? "").trim();
  if (subjectProfileId && subjectCompanyId) {
    return { ok: false, code: "invalid" };
  }
  for (const id of [subjectProfileId, subjectCompanyId]) {
    if (id && !UUID_RX.test(id)) return { ok: false, code: "invalid" };
  }

  const { data, error } = await asAny(supabase).rpc(
    "create_follow_up_task_v1",
    {
      p_note: note.slice(0, 500),
      p_subject_profile_id: subjectProfileId,
      p_subject_company_id: subjectCompanyId,
    },
  );
  if (error) return mapRpcError(error);
  return mapOutcome(String(data ?? ""));
}

export async function setFollowUpTaskStatusAction(input: {
  taskId: string;
  status: string;
}): Promise<FollowUpActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, code: "auth" };

  const taskId = (input.taskId ?? "").trim();
  if (!UUID_RX.test(taskId)) return { ok: false, code: "invalid" };
  const status = (input.status ?? "").trim();
  if (!(FOLLOW_UP_STATUSES as readonly string[]).includes(status)) {
    return { ok: false, code: "invalid" };
  }

  const { data, error } = await asAny(supabase).rpc(
    "set_follow_up_task_status_v1",
    { p_task_id: taskId, p_status: status },
  );
  if (error) return mapRpcError(error);
  return mapOutcome(String(data ?? ""));
}
