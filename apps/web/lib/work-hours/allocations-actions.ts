"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { resolveEmployerCompanyContext } from "@/lib/company/employer-company-context";
import { listActiveCompanyWorkers } from "@/lib/company/company-workers";
import { getOrgWorkObjects } from "@/lib/objects/objects";
import {
  ALLOCATION_NOTE_MAX,
  ALLOCATION_SOURCE_MANUAL,
  isAllocationMigrationMissingCode,
  isValidWorkDate,
  parseHours,
  type HoursProblem,
} from "@/lib/work-hours/allocations-model";
import { displayedWorkspaceOf, refuseStaleWorkspace } from "@/lib/company/stale-workspace";

/**
 * WORK-HOUR ALLOCATIONS — writes.
 *
 * Two rules this module exists to hold:
 *
 * 1. `entered_by` is the ACTING profile, always, taken from the session and
 *    never from the form. An operator recording a colleague's hours stays
 *    visible as the person who recorded them, and the row never pretends the
 *    worker typed it. RLS enforces the same thing a second time
 *    (`entered_by = auth.uid()`), so a forged field is refused by the database
 *    even if this module were bypassed.
 *
 * 2. The organization comes from the server-side employer context, never from
 *    the client — the same rule `lib/objects/objects-actions.ts` follows.
 *
 * A correction NEVER overwrites. `recordCorrectionAction` writes a new row
 * carrying `correction_of` and stamps the original's `superseded_by`, so the
 * original number and the corrected one both survive with the link between
 * them. There is no delete path at all: the table grants no DELETE to any
 * client role and has no delete policy.
 */

export type AllocationActionState =
  | { status: "idle" }
  | {
      status: "saved";
      /** So the surface can offer "add another object for this worker". */
      allocationId: string;
      workerId: string;
      workDate: string;
    }
  | { status: "needs-migration" }
  | { status: "not-authorized" }
  | { status: "invalid"; field: "worker" | "object" | "date" | "hours" | "note"; problem?: HoursProblem }
  | { status: "error" };

const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function field(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

function mapWriteError(error: { code?: string } | null): AllocationActionState | null {
  if (!error) return null;
  if (isAllocationMigrationMissingCode(error.code)) return { status: "needs-migration" };
  // 42501 = RLS refused. The caller manages neither the org nor the worker,
  // or tried to forge entered_by. Reported as refusal, never as a bug.
  if (error.code === "42501") return { status: "not-authorized" };
  console.error("[work-hours] write failed:", error.code);
  return { status: "error" };
}

function revalidate(): void {
  revalidatePath("/", "layout");
}

/**
 * Record one allocation: this worker, this date, this object, these hours.
 *
 * Deliberately does NOT check for an existing row on the same
 * (worker, date, object). Two allocations there are legitimate — a morning
 * and an afternoon shift — and refusing the second is precisely the
 * destructive-overwrite bug this feature was built to prevent. The surface
 * warns about a suspected accidental re-submit; the operator decides.
 */
export async function recordAllocationAction(
  _prev: AllocationActionState,
  formData: FormData,
): Promise<AllocationActionState> {
  await refuseStaleWorkspace(displayedWorkspaceOf(formData));
  const workerId = field(formData, "worker_id");
  const workObjectId = field(formData, "work_object_id");
  const workDate = field(formData, "work_date");
  const rawHours = field(formData, "hours");
  const note = field(formData, "note");

  if (!UUID_RX.test(workerId)) return { status: "invalid", field: "worker" };
  if (!UUID_RX.test(workObjectId)) return { status: "invalid", field: "object" };
  if (!isValidWorkDate(workDate)) return { status: "invalid", field: "date" };
  if (note.length > ALLOCATION_NOTE_MAX) return { status: "invalid", field: "note" };

  const hours = parseHours(rawHours);
  if (!hours.ok) return { status: "invalid", field: "hours", problem: hours.problem };

  const ctx = await resolveEmployerCompanyContext();
  if (ctx.kind !== "ok") return { status: "not-authorized" };

  // THIS company's crew and ITS active sites only — the same lists the hours
  // page offers and the import checks (audit 2026-10-20). The insert policy
  // checks only that the caller manages the organization, so a forged worker
  // id put hours on an unrelated person's record (and into their CV as
  // organization records). An unreadable list refuses.
  const [crew, objects] = await Promise.all([
    listActiveCompanyWorkers(ctx.companyId),
    getOrgWorkObjects(),
  ]);
  if (crew.kind !== "ok" || objects.kind !== "ok") return { status: "error" };
  if (!crew.rows.some((w) => w.workerId === workerId)) return { status: "invalid", field: "worker" };
  if (!objects.rows.some((o) => o.id === workObjectId && o.status === "active")) {
    return { status: "invalid", field: "object" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "not-authorized" };

  const res = await (supabase as never as {
    from: (t: string) => {
      insert: (v: unknown) => {
        select: (c: string) => {
          single: () => Promise<{
            data: { id: string } | null;
            error: { code?: string } | null;
          }>;
        };
      };
    };
  })
    .from("work_hour_allocations")
    .insert({
      organization_id: ctx.organizationId,
      worker_id: workerId,
      // THE ACTING PROFILE. Never read from the form.
      entered_by: user.id,
      work_date: workDate,
      work_object_id: workObjectId,
      hours_numeric: hours.hours,
      note: note === "" ? null : note,
      source: ALLOCATION_SOURCE_MANUAL,
    })
    .select("id")
    .single();

  const failure = mapWriteError(res.error);
  if (failure) return failure;
  if (!res.data) return { status: "error" };

  revalidate();
  return { status: "saved", allocationId: res.data.id, workerId, workDate };
}

/**
 * Correct an allocation without destroying what it said before.
 *
 * ONE database step (correct_work_hour_allocation_v1, 20261021090000): the
 * correction row is written and the original superseded in the same
 * transaction, by a manager of the organization or the worker who entered
 * the row themselves. The three separate writes this replaced could leave the
 * original AND the correction live (a failed supersede was only logged while
 * the action said "saved"). Until that migration is applied, the earlier
 * two-step path runs — unchanged.
 */
export async function recordCorrectionAction(
  _prev: AllocationActionState,
  formData: FormData,
): Promise<AllocationActionState> {
  await refuseStaleWorkspace(displayedWorkspaceOf(formData));
  const originalId = field(formData, "original_id");
  if (!UUID_RX.test(originalId)) return { status: "invalid", field: "worker" };
  const workerId = field(formData, "worker_id");
  const workObjectId = field(formData, "work_object_id");
  const workDate = field(formData, "work_date");
  const note = field(formData, "note");
  if (!UUID_RX.test(workObjectId)) return { status: "invalid", field: "object" };
  if (!isValidWorkDate(workDate)) return { status: "invalid", field: "date" };
  if (note.length > ALLOCATION_NOTE_MAX) return { status: "invalid", field: "note" };
  const hours = parseHours(field(formData, "hours"));
  if (!hours.ok) return { status: "invalid", field: "hours", problem: hours.problem };

  const supabase = await createClient();
  const { data, error } = await (supabase as never as {
    rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: string | null; error: { code?: string; message?: string } | null }>;
  }).rpc("correct_work_hour_allocation_v1", {
    p_original_id: originalId,
    p_hours: hours.hours,
    p_work_date: workDate,
    p_work_object_id: workObjectId,
    p_note: note === "" ? null : note,
  });
  if (error && ["42883", "PGRST202"].includes(error.code ?? "")) {
    return recordCorrectionTwoStep(formData, originalId);
  }
  if (error) {
    if (error.code === "42501") return { status: "not-authorized" };
    const msg = error.message ?? "";
    if (msg.includes("invalid_object")) return { status: "invalid", field: "object" };
    if (msg.includes("invalid_hours")) return { status: "invalid", field: "hours" };
    if (msg.includes("invalid_date")) return { status: "invalid", field: "date" };
    console.error("[work-hours] correction failed:", error.code);
    return { status: "error" };
  }
  if (!data) return { status: "error" };
  revalidate();
  return { status: "saved", allocationId: data, workerId, workDate };
}

/** The pre-20261021090000 path: kept ONLY for the window before that
 *  migration is applied (the database refuses in-place edits after it). */
async function recordCorrectionTwoStep(
  formData: FormData,
  originalId: string,
): Promise<AllocationActionState> {
  const created = await recordAllocationAction({ status: "idle" }, formData);
  if (created.status !== "saved") return created;

  const supabase = await createClient();
  const link = supabase as never as {
    from: (t: string) => {
      update: (v: unknown) => {
        eq: (c: string, v: string) => Promise<{ error: { code?: string } | null }>;
      };
    };
  };

  const correctionRes = await link
    .from("work_hour_allocations")
    .update({ correction_of: originalId })
    .eq("id", created.allocationId);
  if (correctionRes.error) {
    console.error("[work-hours] correction link failed:", correctionRes.error.code);
  }

  const supersedeRes = await link
    .from("work_hour_allocations")
    .update({ superseded_by: created.allocationId })
    .eq("id", originalId);
  if (supersedeRes.error) {
    console.error("[work-hours] supersede failed:", supersedeRes.error.code);
  }

  revalidate();
  return created;
}
