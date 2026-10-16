import "server-only";

import { createClient } from "@/lib/supabase/server";
import {
  listManagedProjects,
  type ManagedProject,
} from "@/lib/projects/projects";
import {
  readProjectDocumentedPeriods,
  type ProjectDocumentedPeriod,
} from "@/lib/organization-evidence/project-documented-period";

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
  /** Active assignments, or null when the read failed (SEP-7: UNKNOWN ≠ 0). */
  readonly assignedCount: number | null;
  /**
   * The documented work period, derived from the project's own records
   * (`project-documented-period.ts`): `null` = no recorded work; `undefined`
   * = it could not be read (the card then says nothing, never "no work").
   * Recorded participation — never confused with `assignedCount`.
   */
  readonly documentedPeriod?: ProjectDocumentedPeriod | null;
}

export async function listProjectMap(
  opts: { readonly finishedPage?: number } = {},
): Promise<ProjectMapCard[]> {
  const projects = await listManagedProjects(opts);
  if (projects.length === 0) return [];

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const periodsRead = user
    ? await readProjectDocumentedPeriods({ supabase, userId: user.id }, projects.map((p) => p.id))
    : ({ kind: "unavailable" } as const);
  const counts = new Map<string, number>();
  // Audit 2026-10-16 (C-2): `res.error` was never read and a thrown read
  // "kept zeros", so a permission refusal or a statement timeout put "0
  // people" on every project card. A failed read is now UNKNOWN (null) and
  // the card says so; zero is reserved for a read that answered zero.
  let countsKnown = true;
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
    if (res.error) {
      countsKnown = false;
      console.error("[projects/map] assignment count read failed:", res.error.code ?? "unknown");
    } else {
      for (const row of (res.data ?? []) as { project_id: string }[]) {
        counts.set(row.project_id, (counts.get(row.project_id) ?? 0) + 1);
      }
    }
  } catch {
    countsKnown = false;
  }

  return projects.map((p) => ({
    ...p,
    assignedCount: countsKnown ? (counts.get(p.id) ?? 0) : null,
    documentedPeriod: periodsRead.kind === "ok" ? (periodsRead.periods.get(p.id) ?? null) : undefined,
  }));
}
