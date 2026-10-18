"use server";

import { revalidatePath } from "next/cache";

import {
  assignTeamToWork,
  endTeamAssignment,
  type EndTeamAssignmentResult,
  type TeamAssignResult,
} from "@/lib/projects/team-assignment";
import { emitServerFunnelEvent } from "@/lib/telemetry/server-funnel";
import { FUNNEL_EVENTS } from "@/lib/telemetry/funnel-events";

/**
 * WRK-6 — assign a team to a project / work object / task as ONE relationship,
 * and end or replace it. Thin: shape-checks the ids and hands off to the ONE
 * composition; the database decides authority.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const optionalId = (v: string | null | undefined) => v == null || v === "" || UUID.test(v);

export async function assignTeamToWorkAction(input: {
  teamId: string;
  projectId: string;
  workObjectId?: string | null;
  taskId?: string | null;
  replaceAssignmentId?: string | null;
}): Promise<TeamAssignResult> {
  if (!UUID.test(input.teamId) || !UUID.test(input.projectId)) return { status: "error" };
  if (!optionalId(input.workObjectId) || !optionalId(input.taskId) || !optionalId(input.replaceAssignmentId)) {
    return { status: "error" };
  }
  const result = await assignTeamToWork({
    teamId: input.teamId,
    projectId: input.projectId,
    workObjectId: input.workObjectId || null,
    taskId: input.taskId || null,
    replaceAssignmentId: input.replaceAssignmentId || null,
  });
  if (result.status === "ok") {
    revalidatePath("/", "layout");
    if (result.outcome !== "already_assigned") {
      emitServerFunnelEvent(FUNNEL_EVENTS.projectAssigned, {
        source: "projects",
        metadata: { surface: "projects", role_context: "company" },
      });
    }
  }
  return result;
}

export async function endTeamAssignmentAction(input: {
  assignmentId: string;
  reason?: string | null;
}): Promise<EndTeamAssignmentResult> {
  if (!UUID.test(input.assignmentId)) return { status: "error" };
  const result = await endTeamAssignment({ assignmentId: input.assignmentId, reason: input.reason ?? null });
  if (result.status === "ok") revalidatePath("/", "layout");
  return result;
}
