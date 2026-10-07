import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { checkWorkerReservation } from "@/lib/planning/worker-reservation";
import {
  parseOverrideReasonCode,
  toReceiptCollisions,
  type ReceiptCollision,
} from "@/lib/projects/override-receipt-model";
import type { ReservationVerdict } from "@/lib/workforce/commitment-reservation";

/**
 * THE ONE "KEEP KNOWINGLY" CORE (J-TIME-FREEDOM: clash -> authorized override
 * -> immutable receipt).
 *
 * Three doors, one business logic. The web page (keepAssignmentAction), the
 * chat (`company.keep-assignment`) and the MCP tools (`assignment.keep_draft`
 * / `assignment.keep_confirm`) all end here, so a knowing override leaves the
 * SAME receipt no matter which door was used, and none of them can report
 * "kept" unless the receipt exists.
 *
 * BASIS-AGNOSTIC. The core knows a project and a person (profile). It never
 * asks whether the person holds a PERSON assignment or is a member of an
 * active TEAM assignment: record_commitment_override_v1 resolves the basis in
 * the database (person assignment first, otherwise membership of an active
 * team assignment as of now) and refuses with 22023 when there is none. Team
 * assign / end / replace tools therefore reuse this unchanged.
 *
 * SERVER-SIDE ONLY. The collisions are recomputed HERE, at the moment of the
 * decision, from the calendar sources - never taken from a client, a chat turn
 * or a model. They are reduced to the receipt whitelist (an absence keeps kind
 * + dates only) and the database re-validates authority, shape AND that every
 * listed clash is a real source row (20261003150950).
 */

export type KeepOverrideResult =
  | {
      ok: true;
      /** recorded = an immutable receipt exists; not_needed = the clash no
       *  longer exists at decision time, so there is no override to record. */
      receipt: "recorded" | "not_needed";
      receiptId?: string;
    }
  | { ok: false; code: "auth" | "invalid" | "not_authorized" | "needs_migration" | "error" };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asAny = (c: SupabaseClient): any => c;

export type OverrideCaller = { readonly supabase: SupabaseClient; readonly userId: string };

/**
 * The reservation verdict for putting `workerProfileId` on `projectId`, as the
 * calendar sees it now. The project being decided is excluded, so a person is
 * never reported against the very assignment under discussion. null = the
 * check could not run (never read as "clear").
 */
export async function reservationVerdictFor(
  supabase: SupabaseClient,
  projectId: string,
  workerProfileId: string,
  caller?: OverrideCaller,
): Promise<{ verdict: ReservationVerdict; window: { startDate: string | null; endDate: string | null } } | null> {
  const [{ data: worker }, { data: project }] = await Promise.all([
    asAny(supabase).from("workers").select("id").eq("profile_id", workerProfileId).maybeSingle(),
    asAny(supabase).from("projects").select("start_date, end_date").eq("id", projectId).maybeSingle(),
  ]);
  if (!worker?.id) return null;
  const window = {
    startDate: (project?.start_date as string | null) ?? null,
    endDate: (project?.end_date as string | null) ?? null,
  };
  const verdict = await checkWorkerReservation({
    workerId: worker.id as string,
    window,
    exclude: [projectId],
    ...(caller ? { caller } : {}),
  });
  return { verdict, window };
}

/** The collisions a receipt would hold RIGHT NOW (server-recomputed). */
export async function currentReceiptCollisions(
  supabase: SupabaseClient,
  projectId: string,
  workerProfileId: string,
  caller?: OverrideCaller,
): Promise<{ state: ReservationVerdict["state"]; collisions: ReceiptCollision[] } | null> {
  try {
    const r = await reservationVerdictFor(supabase, projectId, workerProfileId, caller);
    if (!r) return null;
    return { state: r.verdict.state, collisions: toReceiptCollisions(r.verdict) };
  } catch (error) {
    console.error("[projects] override collision recompute failed:", error);
    return null;
  }
}

const RPC_NOT_FOUND = "42883";
const UNDEFINED_COLUMN = "42703";
const RELATION_NOT_FOUND = "42P01";
const migMissing = (code?: string) =>
  code === RPC_NOT_FOUND || code === UNDEFINED_COLUMN || code === RELATION_NOT_FOUND;

/**
 * KEEP an assignment despite a known calendar clash = an explicit override.
 *
 * FAIL-LOUD: a failed receipt is returned to the caller, which must NOT
 * present the decision as made. The existing best-effort audit append is kept
 * after a successful receipt.
 */
export async function keepOverrideCore(
  supabase: SupabaseClient,
  input: {
    projectId: string;
    workerProfileId: string;
    reasonCode?: string | null;
    caller?: OverrideCaller;
  },
): Promise<KeepOverrideResult> {
  const { projectId, workerProfileId } = input;
  if (!projectId || !workerProfileId) return { ok: false, code: "invalid" };
  const reason = input.reasonCode ? parseOverrideReasonCode(input.reasonCode) : null;
  if (input.reasonCode && !reason) return { ok: false, code: "invalid" };

  const current = await currentReceiptCollisions(supabase, projectId, workerProfileId, input.caller);
  // The check could not run: the receipt would be written blind. Say so.
  if (!current) return { ok: false, code: "error" };

  const audit = async () => {
    try {
      const { error } = await asAny(supabase).rpc("record_assignment_decision", {
        p_project_id: projectId,
        p_worker_profile_id: workerProfileId,
        p_decision: "kept",
      });
      if (error && !migMissing(error.code)) console.error("[projects] decision audit failed:", error.message);
    } catch (error) {
      console.error("[projects] decision audit failed:", error);
    }
  };

  if (current.state !== "collides" || current.collisions.length === 0) {
    await audit();
    return { ok: true, receipt: "not_needed" };
  }

  const { data, error } = await asAny(supabase).rpc("record_commitment_override_v1", {
    p_project_id: projectId,
    p_worker_profile_id: workerProfileId,
    p_collisions: current.collisions,
    p_reason_code: reason,
  });
  if (error) {
    if (migMissing(error.code) || error.code === "PGRST202") return { ok: false, code: "needs_migration" };
    if (error.code === "42501") return { ok: false, code: "not_authorized" };
    console.error("[projects] override receipt failed:", error.message);
    return { ok: false, code: "error" };
  }
  await audit();
  return typeof data === "string" ? { ok: true, receipt: "recorded", receiptId: data } : { ok: true, receipt: "recorded" };
}
