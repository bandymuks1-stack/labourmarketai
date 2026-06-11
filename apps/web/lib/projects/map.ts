import "server-only";

import { createClient } from "@/lib/supabase/server";
import {
  listManagedProjects,
  type ManagedProject,
} from "@/lib/projects/projects";

/**
 * Manager MAP read service (TASK 07 slice 2 — MAP → ARENA → DRAFT).
 *
 * The map is the manager's infrastructure view: projects → teams → people
 * (DESIGN_SOUL §4, max 2 clicks to action). It composes ONLY already-RLS'd
 * reads — projects the caller manages and their active assignment counts.
 * Every number is a raw count of real rows; errors degrade to 0/[], never a
 * fabricated value. No migration, no new grant.
 */

export interface ProjectMapCard extends ManagedProject {
  /** Active workers on the project — the real team size. */
  readonly assignedCount: number;
}

export async function listProjectMap(): Promise<ProjectMapCard[]> {
  const projects = await listManagedProjects();
  if (projects.length === 0) return [];

  const supabase = await createClient();
  const counts = new Map<string, number>();
  try {
    // One RLS-scoped read for all counts (can_manage_project on every row).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await (supabase as any)
      .from("project_worker_assignments")
      .select("project_id")
      .in(
        "project_id",
        projects.map((p) => p.id),
      )
      .eq("status", "active");
    for (const row of (res.data ?? []) as { project_id: string }[]) {
      counts.set(row.project_id, (counts.get(row.project_id) ?? 0) + 1);
    }
  } catch {
    // keep zeros — honest degradation
  }

  return projects.map((p) => ({
    ...p,
    assignedCount: counts.get(p.id) ?? 0,
  }));
}
