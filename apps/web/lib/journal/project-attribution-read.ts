import type { createClient } from "@/lib/supabase/server";
import { readMyTeamWorkContexts } from "@/lib/projects/team-work-context";
import {
  addTeamProjects,
  groupProjectsByOrganization,
  type AssignedProject,
} from "@/lib/journal/project-attribution";

type ServerSupabase = Awaited<ReturnType<typeof createClient>>;

/**
 * THE ONE READ of "which projects is this worker actively assigned to, per
 * organization" — shared by the journal page, the conversation/quick-record
 * engagement lister and the write core's safety net, so every entry path
 * applies the same attribution rule (handoff 2026-10-02 §2). Runs as the
 * caller under their own RLS (their own assignment rows). A failed read
 * yields an empty map: the DB's own rule (0/1/2+) still decides the write.
 */
export async function readActiveProjectsByOrg(
  supabase: ServerSupabase,
  workerId: string,
): Promise<Map<string, AssignedProject[]>> {
  const { data } = await supabase
    .from("project_worker_assignments")
    .select("project_id, projects(id, title, organization_id)")
    .eq("worker_id", workerId)
    .eq("status", "active");
  const byOrg = groupProjectsByOrganization(
    (data ?? []).map((r) => ({
      project_id: r.project_id as string,
      projects: (r.projects ?? null) as {
        id: string;
        title: string | null;
        organization_id: string | null;
      } | null,
    })),
  );
  // A team that is ACTIVELY assigned to a project is a context too
  // (20261003150700): the caller's own team contexts, resolved in the database
  // through team_member_at_v1 - never a copy into project_worker_assignments.
  // A failed read adds nothing; the DB's own rule still decides the write.
  return addTeamProjects(byOrg, await readMyTeamWorkContexts(supabase));
}
