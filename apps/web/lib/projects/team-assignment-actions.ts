"use server";

import { revalidatePath } from "next/cache";

import { assignTeamToProject, type TeamAssignmentResult } from "@/lib/projects/team-assignment";
import { emitServerFunnelEvent } from "@/lib/telemetry/server-funnel";
import { FUNNEL_EVENTS } from "@/lib/telemetry/funnel-events";

/**
 * WRK-6 — assign a whole team to a project. Thin: shape-checks the two ids,
 * hands off to the ONE composition, revalidates, and emits the SAME funnel
 * event a single assignment emits — once per member actually assigned,
 * because that is how many assignments really happened.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function assignTeamToProjectAction(input: {
  teamId: string;
  projectId: string;
}): Promise<TeamAssignmentResult> {
  if (!UUID.test(input.teamId) || !UUID.test(input.projectId)) {
    return { status: "unavailable", reason: "invalid" };
  }
  const result = await assignTeamToProject(input);
  if (result.status === "ok") {
    const assigned = result.members.filter((m) => m.outcome === "assigned").length;
    if (assigned > 0) {
      revalidatePath("/", "layout");
      for (let i = 0; i < assigned; i += 1) {
        emitServerFunnelEvent(FUNNEL_EVENTS.projectAssigned, {
          source: "projects",
          metadata: { surface: "company_teams", role_context: "company" },
        });
      }
    }
  }
  return result;
}
