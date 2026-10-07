import type { SupabaseClient } from "@supabase/supabase-js";

import type { TeamWorkContextRow } from "@/lib/projects/team-work-context-model";

/**
 * THE ONE READ of "which projects can I work on because a team I belong to is
 * ACTIVELY assigned to them" (20261003150700, `my_team_work_contexts_v1`).
 *
 * Runs as the caller; the database resolves membership AS OF NOW through
 * `team_member_at_v1` (a member who left, or joined later, is not listed) and
 * hides ended / replaced assignments and completed projects. It returns the
 * caller's own contexts only. A failed read yields an empty list — honest
 * degradation: the database's own rule still decides every write.
 *
 * Never a copy into `project_worker_assignments`: the team stays ONE relation.
 */
export async function readMyTeamWorkContexts(
  supabase: Pick<SupabaseClient, "rpc">,
): Promise<TeamWorkContextRow[]> {
  try {
    const { data, error } = await supabase.rpc("my_team_work_contexts_v1" as never);
    if (error || !Array.isArray(data)) return [];
    return data as TeamWorkContextRow[];
  } catch {
    return [];
  }
}
