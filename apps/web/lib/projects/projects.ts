import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * Project read service (slice f4-worker-project-assignment-v1).
 *
 * Reuses the applied project layer (projects, project_worker_assignments,
 * can_manage_project) with its EXISTING RLS — a manager reads only their own
 * projects (owns_company) and only their projects' assignments. No service_role.
 */

const UNDEFINED_COLUMN = "42703";
const RELATION_NOT_FOUND = "42P01";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

export interface ManagedProject {
  id: string;
  title: string | null;
  city: string | null;
}

export interface ProjectAssignment {
  workerProfileId: string;
  name: string;
  assignedAt: string;
}

function migMissing(code?: string): boolean {
  return code === UNDEFINED_COLUMN || code === RELATION_NOT_FOUND;
}

/** Projects the caller manages (owns_company → projects RLS). */
export async function listManagedProjects(): Promise<ManagedProject[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const res = await asAny(supabase)
    .from("projects")
    .select("id, title, city")
    .order("created_at", { ascending: false })
    .limit(100);
  if (res.error) return [];
  type Row = { id: string; title: string | null; city: string | null };
  return ((res.data ?? []) as Row[]).map((p) => ({
    id: p.id,
    title: p.title ?? null,
    city: p.city ?? null,
  }));
}

/** Active worker assignments on a project (RLS: can_manage_project). */
export async function listProjectAssignments(
  projectId: string,
): Promise<ProjectAssignment[]> {
  const supabase = await createClient();
  const res = await asAny(supabase)
    .from("project_worker_assignments")
    .select(
      "assigned_at, worker:workers!inner(profile_id, display_name, profiles!inner(full_name))",
    )
    .eq("project_id", projectId)
    .eq("status", "active")
    .order("assigned_at", { ascending: false });
  if (res.error) {
    if (migMissing(res.error.code)) return [];
    return [];
  }
  type Row = {
    assigned_at: string;
    worker: {
      profile_id: string | null;
      display_name: string | null;
      profiles: { full_name: string | null } | null;
    } | null;
  };
  return ((res.data ?? []) as Row[])
    .map((r) => {
      const w = r.worker;
      if (!w?.profile_id) return null;
      return {
        workerProfileId: w.profile_id,
        name: w.profiles?.full_name ?? w.display_name ?? w.profile_id.slice(0, 8),
        assignedAt: r.assigned_at,
      };
    })
    .filter((x: ProjectAssignment | null): x is ProjectAssignment => x !== null);
}

/** The caller's company id (for creating a project), or null. */
export async function callerCompanyId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await asAny(supabase)
    .from("companies")
    .select("id")
    .eq("profile_id", user.id)
    .maybeSingle();
  return data?.id ?? null;
}
