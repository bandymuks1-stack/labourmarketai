"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { parseCollisions } from "@/lib/planning/override-receipt-model";

/**
 * J-TIME-FREEDOM step 5 — "The authorized actor decides, and an explicit
 * override is recorded with a receipt."
 *
 * ONE server action over ONE gated RPC (`record_commitment_override_v1`,
 * migration 20260915120000). Every rule lives in the database: the caller
 * manages the project, the worker holds an ACTIVE assignment to it, the
 * collisions carry a closed shape, the window is snapshotted from the
 * project row and never from this form. This wrapper validates the form's
 * SHAPE only, so a malformed request is refused here as `invalid` rather
 * than reaching the database as noise.
 *
 * The receipt is an ACT, not a gate. The assignment already exists — the
 * manager saw the clash (step 3), saw what they could do instead (step 4),
 * and chose to keep it. Recording that choice changes nothing about the
 * assignment; it makes the choice visible afterwards, to them and to the
 * person whose calendar now holds two things.
 *
 * HONEST DEGRADATION: until the migration is applied the RPC does not exist
 * (42883 / PGRST202) and the outcome is `needs_migration` — rendered as
 * "prepared, not enabled", never as success and never as a silent no-op.
 */

export type OverrideReceiptState =
  | { status: "idle" }
  | { status: "ok"; id: string }
  | { status: "invalid" }
  | { status: "not_authorized" }
  | { status: "needs_migration" }
  | { status: "error"; reason?: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MISSING_RPC = new Set(["42883", "PGRST202", "42P01"]);

export async function recordOverrideReceiptAction(
  _prev: OverrideReceiptState,
  formData: FormData,
): Promise<OverrideReceiptState> {
  const projectId = String(formData.get("project_id") ?? "").trim();
  const workerId = String(formData.get("worker_id") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 1000);
  if (!UUID.test(projectId) || !UUID.test(workerId)) return { status: "invalid" };
  const collisions = parseCollisions(String(formData.get("collisions") ?? ""));
  if (!collisions) return { status: "invalid" };

  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc("record_commitment_override_v1", {
    p_project_id: projectId,
    p_worker_id: workerId,
    p_collisions: collisions,
    p_reason: reason || null,
  });
  if (error) {
    if (MISSING_RPC.has(error.code ?? "")) return { status: "needs_migration" };
    if (error.code === "42501") return { status: "not_authorized" };
    if (error.code === "22023") return { status: "invalid" };
    return { status: "error", reason: error.code };
  }
  revalidatePath("/", "layout");
  return { status: "ok", id: typeof data === "string" ? data : "" };
}
