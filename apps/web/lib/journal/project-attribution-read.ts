import type { createClient } from "@/lib/supabase/server";
import { readMyTeamWorkContexts } from "@/lib/projects/team-work-context";
import {
  addClientProjects,
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
 *
 * Besides the employer's projects (keyed by the project's organisation) the map
 * carries two more kinds, each labelled in the picker:
 *  - projects reached through an ACTIVELY assigned team (`viaTeam`);
 *  - CLIENT projects of an independent person: an active PERSON assignment on a
 *    project of an organisation the person is not a member of, offered under
 *    the personal (organisation-less) context and each workspace they own
 *    (`clientProject`, see PERSONAL_CONTEXT_KEY / projectsForContext).
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
  const rows = (data ?? []).map((r) => ({
    project_id: r.project_id as string,
    projects: (r.projects ?? null) as {
      id: string;
      title: string | null;
      organization_id: string | null;
    } | null,
  }));
  const byOrg = groupProjectsByOrganization(rows);

  // The person's own memberships decide which of their assignments are
  // "client projects" (an employer's project is not): same rule as the
  // database's independent_journal_context_v1 (the journal reads the
  // engagement spine only; the database stays the authority). A failed read
  // adds nothing.
  if (rows.length > 0) {
    const { data: worker } = await supabase
      .from("workers")
      .select("profile_id")
      .eq("id", workerId)
      .maybeSingle();
    const profileId = (worker?.profile_id as string | null) ?? null;
    if (profileId) {
      const ecs = await supabase
        .from("engagement_contexts")
        .select("organization_id, relationship_slug")
        .eq("profile_id", profileId)
        .eq("status", "active");
      if (!ecs.error) {
        const memberOrgIds = new Set<string>();
        const owned: string[] = [];
        for (const e of ecs.data ?? []) {
          const org = e.organization_id as string | null;
          if (!org) continue;
          memberOrgIds.add(org);
          if (e.relationship_slug === "owner" && !owned.includes(org)) owned.push(org);
        }
        addClientProjects(byOrg, rows, memberOrgIds, owned);
      }
    }
  }

  // A team that is ACTIVELY assigned to a project is a context too
  // (20261003150700): the caller's own team contexts, resolved in the database
  // through team_member_at_v1 - never a copy into project_worker_assignments.
  // A failed read adds nothing; the DB's own rule still decides the write.
  return addTeamProjects(byOrg, await readMyTeamWorkContexts(supabase));
}
