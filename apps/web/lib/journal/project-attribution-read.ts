import type { createClient } from "@/lib/supabase/server";
import { readMyTeamWorkContexts } from "@/lib/projects/team-work-context";
import {
  addClientProjects,
  addTeamProjects,
  groupProjectsByOrganization,
  independentOrganizationIdsByProject,
  type AssignedProject,
} from "@/lib/journal/project-attribution";

type ServerSupabase = Awaited<ReturnType<typeof createClient>>;

type AssignmentRows = {
  project_id: string;
  projects: {
    id: string;
    title: string | null;
    organization_id: string | null;
  } | null;
}[];

/** The worker's ACTIVE person assignments (their own rows under RLS) and, from
 *  their own engagement spine, the organisations they belong to and the ones
 *  they own. The journal reads the engagement spine only (never
 *  company_memberships); the database stays the authority. `ownership` is null
 *  when it could not be read - callers then add nothing. */
async function readAssignmentsAndOwnership(
  supabase: ServerSupabase,
  workerId: string,
): Promise<{
  rows: AssignmentRows;
  ownership: { memberOrgIds: Set<string>; owned: string[] } | null;
}> {
  const { data } = await supabase
    .from("project_worker_assignments")
    .select("project_id, projects(id, title, organization_id)")
    .eq("worker_id", workerId)
    .eq("status", "active");
  const rows: AssignmentRows = (data ?? []).map((r) => ({
    project_id: r.project_id as string,
    projects: (r.projects ?? null) as AssignmentRows[number]["projects"],
  }));
  if (rows.length === 0) return { rows, ownership: null };

  const { data: worker } = await supabase
    .from("workers")
    .select("profile_id")
    .eq("id", workerId)
    .maybeSingle();
  const profileId = (worker?.profile_id as string | null) ?? null;
  if (!profileId) return { rows, ownership: null };
  const ecs = await supabase
    .from("engagement_contexts")
    .select("organization_id, relationship_slug")
    .eq("profile_id", profileId)
    .eq("status", "active");
  if (ecs.error) return { rows, ownership: null };
  const memberOrgIds = new Set<string>();
  const owned: string[] = [];
  for (const e of ecs.data ?? []) {
    const org = e.organization_id as string | null;
    if (!org) continue;
    memberOrgIds.add(org);
    if (e.relationship_slug === "owner" && !owned.includes(org)) owned.push(org);
  }
  return { rows, ownership: { memberOrgIds, owned } };
}

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
  const { rows, ownership } = await readAssignmentsAndOwnership(supabase, workerId);
  const byOrg = groupProjectsByOrganization(rows);
  if (ownership) addClientProjects(byOrg, rows, ownership.memberOrgIds, ownership.owned);

  // A team that is ACTIVELY assigned to a project is a context too
  // (20261003150700): the caller's own team contexts, resolved in the database
  // through team_member_at_v1 - never a copy into project_worker_assignments.
  // A failed read adds nothing; the DB's own rule still decides the write.
  return addTeamProjects(byOrg, await readMyTeamWorkContexts(supabase));
}

/**
 * projectId -> the caller's OWN-workspace organisation ids through which they
 * reach that project AS AN INDEPENDENT PROVIDER (active person assignment on a
 * project of an organisation they are not a member of; the workspace is not the
 * project's own organisation). The evidence picker accepts an entry whose
 * context is one of these, mirroring independent_journal_context_v1 and
 * link_journal_entry_to_task_v1; the RPC stays the final authority.
 */
export async function readIndependentOrganizationsByProject(
  supabase: ServerSupabase,
  workerId: string,
): Promise<Map<string, string[]>> {
  const { rows, ownership } = await readAssignmentsAndOwnership(supabase, workerId);
  if (!ownership) return new Map();
  return independentOrganizationIdsByProject(rows, ownership.memberOrgIds, ownership.owned);
}

/** Workspaces (organisations) the worker's person OWNS - used only to keep an
 *  own-workspace entry out of a task picker for a project they are not
 *  assigned to. A failed read yields none (the link RPC still decides). */
export async function readOwnedWorkspaceIds(
  supabase: ServerSupabase,
  workerId: string,
): Promise<string[]> {
  const { ownership } = await readAssignmentsAndOwnership(supabase, workerId);
  return ownership ? [...ownership.owned] : [];
}
