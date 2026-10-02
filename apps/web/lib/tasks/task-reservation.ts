import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { checkWorkerReservation } from "@/lib/planning/worker-reservation";
import type { ReservationVerdict } from "@/lib/workforce/commitment-reservation";
import { utcDay } from "@/lib/tasks/task-model";
import { readWorkTaskReservationFacts } from "@/lib/tasks/tasks";

/**
 * IS THE ASSIGNEE ALREADY SOMEWHERE ELSE ON THE TASK'S DUE DAY?
 *
 * NO NEW QUERY LOGIC. It resolves the assignee to a worker and asks the ONE
 * reservation composition (`checkWorkerReservation` — the same two authorized
 * employer reads the project assignment uses). A task has a due date, not a
 * start date, so the window is that single UTC day.
 *
 * ADVISORY (SEP-2): run AFTER the assign RPC, never throws, never refuses, and
 * records nothing. `null` means "not applicable" (no due date, no assignee,
 * the assignee is not a worker) and is NOT the same as clear. Once a worker is
 * resolved, any failure of the check is `unknown` — never `clear` (SEP-7).
 *
 * The task's own project is excluded: being assigned to the project the task
 * belongs to is not a second place to be.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

const UNREADABLE: ReservationVerdict = {
  state: "unknown",
  collisions: [],
  gaps: [{ reason: "source_unreadable", source: "project" }],
};

export async function checkTaskAssignmentReservation(
  supabase: SupabaseClient,
  taskId: string,
): Promise<ReservationVerdict | null> {
  try {
    const task = await readWorkTaskReservationFacts(supabase, taskId);
    const assignee = task?.assigneeProfileId ?? null;
    const day = task?.dueAt ? utcDay(task.dueAt) : null;
    if (!assignee || !day) return null;

    const { data: worker } = await asAny(supabase)
      .from("workers")
      .select("id")
      .eq("profile_id", assignee)
      .maybeSingle();
    if (!worker?.id) return null;

    const projectId = task?.projectId ?? null;
    try {
      return await checkWorkerReservation({
        workerId: worker.id as string,
        window: { startDate: day, endDate: day },
        exclude: projectId ? [projectId] : undefined,
      });
    } catch (error) {
      console.error("[tasks] reservation check failed:", error);
      return UNREADABLE;
    }
  } catch (error) {
    console.error("[tasks] reservation lookup failed:", error);
    return null;
  }
}
