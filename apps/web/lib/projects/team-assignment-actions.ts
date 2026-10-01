"use server";

import { assignTeamToProject, type TeamAssignmentResult } from "@/lib/projects/team-assignment";

/**
 * WRK-6 — assign a whole team to a project. Thin: shape-checks the two ids and
 * hands off to the ONE composition. Revalidation and the funnel event happen
 * per member inside the existing single-assignment action, so they count the
 * assignments that really happened.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function assignTeamToProjectAction(input: {
  teamId: string;
  projectId: string;
}): Promise<TeamAssignmentResult> {
  if (!UUID.test(input.teamId) || !UUID.test(input.projectId)) {
    return { status: "unavailable" };
  }
  return assignTeamToProject(input);
}
