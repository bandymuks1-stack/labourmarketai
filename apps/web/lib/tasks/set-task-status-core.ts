import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  isMigrationMissingCode,
  isValidWorkTaskStatus,
  type WorkTaskStatus,
} from "@/lib/tasks/task-model";

/**
 * THE ONE work-task status write (owner contract 2026-09-04 §5.5 — one
 * canonical action backbone; §14 WORK PERFORMED → RESULT). The tasks page's
 * form action and the chat's sentence ("užduotis sumontuoti pastolius
 * atlikta") both enter here; the page redirects with a notice, the chat says
 * the outcome in words. Authorization is NOT here: `set_work_task_status_v2`
 * re-checks that the caller is the task's creator, its assignee, or manages
 * its project, and refuses a transition out of `done` / `cancelled`.
 * `set_work_task_status_v1` is the pre-apply fallback the page already used.
 */
export type SetWorkTaskStatusCoreResult =
  | { readonly kind: "updated"; readonly taskId: string; readonly status: WorkTaskStatus }
  | { readonly kind: "invalid" }
  | { readonly kind: "invalid_transition" }
  | { readonly kind: "not_found" }
  | { readonly kind: "not_authorized" }
  | { readonly kind: "needs_migration" }
  | { readonly kind: "error"; readonly message: string };

const UUID_RX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

export async function setWorkTaskStatusCore(
  supabase: SupabaseClient,
  taskId: string,
  status: string,
): Promise<SetWorkTaskStatusCoreResult> {
  const id = String(taskId ?? "").trim();
  const next = String(status ?? "").trim();
  if (!UUID_RX.test(id) || !isValidWorkTaskStatus(next)) return { kind: "invalid" };

  type RpcRes = { data: unknown; error: { code?: string; message?: string } | null };
  let res: RpcRes = await asAny(supabase).rpc("set_work_task_status_v2", {
    p_task_id: id,
    p_status: next,
  });
  if (res.error && isMigrationMissingCode(res.error.code)) {
    // pre-apply fallback — the v1 status RPC the page shipped with
    res = await asAny(supabase).rpc("set_work_task_status_v1", {
      p_task_id: id,
      p_status: next,
    });
  }
  if (res.error) {
    if (isMigrationMissingCode(res.error.code)) return { kind: "needs_migration" };
    if (res.error.code === "42501") return { kind: "not_authorized" };
    return { kind: "error", message: res.error.message ?? "rpc_failed" };
  }
  const outcome = String(res.data ?? "");
  if (outcome === "updated") return { kind: "updated", taskId: id, status: next };
  if (outcome === "not_allowed") return { kind: "not_authorized" };
  if (outcome === "not_found") return { kind: "not_found" };
  if (outcome === "invalid_transition") return { kind: "invalid_transition" };
  return { kind: "invalid" };
}
