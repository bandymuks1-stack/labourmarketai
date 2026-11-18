import "server-only";

import { createHash } from "node:crypto";
import { cookies } from "next/headers";

import { ACTIVE_WORKSPACE_COOKIE } from "@/lib/company/active-organization";
import { rememberBadge } from "@/lib/perf/badge-ttl-cache";
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

/** How long one viewer's documented periods are remembered (see listProjectMap). */
export const PROJECT_PERIODS_TTL_MS = 2 * 60_000;

/** A hash of everything that decides which evidence the viewer may read:
 *  memberships (role, status), management engagement contexts and active
 *  platform roles, each with its updated_at. Null when any read fails. */
async function readAccessFingerprint(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<string | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any;
    const [memberships, contexts, roles] = await Promise.all([
      db.from("company_memberships").select("organization_id, role, status, updated_at").eq("profile_id", userId),
      db
        .from("engagement_contexts")
        .select("organization_id, relationship_slug, status, updated_at")
        .eq("profile_id", userId),
      db.from("profile_roles").select("role, is_active").eq("profile_id", userId),
    ]);
    if (memberships.error || contexts.error || roles.error) return null;
    const rows = [
      ...((memberships.data ?? []) as Record<string, unknown>[]).map((r) => `m:${r.organization_id}:${r.role}:${r.status}:${r.updated_at}`),
      ...((contexts.data ?? []) as Record<string, unknown>[]).map((r) => `e:${r.organization_id}:${r.relationship_slug}:${r.status}:${r.updated_at}`),
      ...((roles.data ?? []) as Record<string, unknown>[]).map((r) => `r:${r.role}:${r.is_active}`),
    ].sort();
    return createHash("sha1").update(rows.join("|")).digest("hex");
  } catch {
    return null;
  }
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
  // The documented period folds the organization's whole evidence history
  // (thousands of records, read in pages) and changes only when history is
  // imported or corrected — measured 2026-10-19 as ~1.3 s on every projects
  // page view. It is remembered for 2 minutes per viewer, per active
  // workspace and per exact project set (RLS decides what each viewer reads,
  // so a viewer only ever gets their own answer back); a failed read is never
  // remembered. Run beside the assignment counts, not before them.
  //
  // ACCESS FINGERPRINT (review on #2514): evidence RLS follows who manages an
  // organization, so the key also carries a hash of the viewer's memberships,
  // management contexts and admin roles (each with its updated_at). A role
  // change, a demotion or a revocation changes the key — a cached answer is
  // never served past a change of access. If the fingerprint cannot be read,
  // nothing is cached.
  const projectIds = projects.map((p) => p.id);
  const periodsPromise = user
    ? (async () => {
        const load = () => readProjectDocumentedPeriods({ supabase, userId: user.id }, projectIds);
        const access = await readAccessFingerprint(supabase, user.id);
        if (!access) return load();
        const jar = await cookies();
        const setKey = createHash("sha1").update([...projectIds].sort().join(",")).digest("hex");
        const viewerKey = `${user.id}|${jar.get(ACTIVE_WORKSPACE_COOKIE)?.value ?? "-"}|${setKey}|${access}`;
        return rememberBadge(
          "projectDocumentedPeriods",
          viewerKey,
          PROJECT_PERIODS_TTL_MS,
          load,
          Date.now,
          (read) => read.kind === "ok",
        );
      })()
    : Promise.resolve({ kind: "unavailable" } as const);
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

  const periodsRead = await periodsPromise;
  return projects.map((p) => ({
    ...p,
    assignedCount: countsKnown ? (counts.get(p.id) ?? 0) : null,
    documentedPeriod: periodsRead.kind === "ok" ? (periodsRead.periods.get(p.id) ?? null) : undefined,
  }));
}
