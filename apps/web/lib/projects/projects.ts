import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import {
  isEmployerContextFailure,
  resolveEmployerCompanyContext,
  type EmployerCompanyContext,
} from "@/lib/company/employer-company-context";

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
  /** ISO-2 project country (additive, W6): lets the workspace map resolve the
   *  city to real coordinates. Null on legacy rows — never fabricated. */
  country: string | null;
  /** Workspace context (rebuild W6): which organization the project belongs
   *  to — rendered as a labelled accent chip when the caller manages MORE
   *  than one org, so a mixed list is never ambiguous. Null → legacy row
   *  without an org binding (never fabricated). */
  organizationId: string | null;
  orgName: string | null;
  /** Lifecycle status (train D): draft/live/paused/completed — lets list
   *  surfaces filter finished work honestly. Null only when the column read
   *  unexpectedly failed (never fabricated). */
  status: string | null;
  /** Responsible person (train D, gated migration 20260817152000): null
   *  until the LEAD applies it or when nobody is named. */
  responsibleProfileId: string | null;
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

  // Train D: responsible_profile_id ships in a LEAD-gated migration
  // (20260817152000). Until applied the column is missing (42703) and the
  // read FALLS BACK to the pre-train column set — the list never regresses.
  const columnsV2 =
    "id, title, city, country, status, responsible_profile_id, organization_id, organizations(display_name, legal_name)";
  const columnsV1 =
    "id, title, city, country, status, organization_id, organizations(display_name, legal_name)";
  const run = (columns: string) =>
    asAny(supabase)
      .from("projects")
      .select(columns)
      .order("created_at", { ascending: false })
      .limit(100);
  let res = await run(columnsV2);
  if (res.error && res.error.code === UNDEFINED_COLUMN) {
    res = await run(columnsV1);
  }
  if (res.error) return [];
  type Row = {
    id: string;
    title: string | null;
    city: string | null;
    country: string | null;
    status: string | null;
    responsible_profile_id?: string | null;
    organization_id: string | null;
    organizations: { display_name: string | null; legal_name: string | null } | null;
  };
  return ((res.data ?? []) as Row[]).map((p) => ({
    id: p.id,
    title: p.title ?? null,
    city: p.city ?? null,
    country: p.country ?? null,
    organizationId: p.organization_id ?? null,
    orgName:
      p.organizations?.display_name?.trim() ||
      p.organizations?.legal_name?.trim() ||
      null,
    status: p.status ?? null,
    responsibleProfileId: p.responsible_profile_id ?? null,
  }));
}

/** Active worker assignments on a project (RLS: can_manage_project). */
export async function listProjectAssignments(
  projectId: string,
): Promise<ProjectAssignment[]> {
  const supabase = await createClient();
  const res = await asAny(supabase)
    .from("project_worker_assignments")
    // LEFT join on `profiles` — same reason as lib/projects/operations.ts:
    // an employer cannot read another person's profile row, so `!inner` dropped
    // every assignment and this list was always empty. The join only supplies
    // an optional display name that already has a fallback below.
    .select(
      "assigned_at, worker:workers!inner(profile_id, display_name, profiles(full_name))",
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

/**
 * The company the caller is ACTING FOR, resolved from the active workspace
 * (W8 slice 1). Prefer this over `callerCompanyId` in any surface that can
 * render a state, because it carries WHY there is no company.
 */
export async function callerCompanyContext(): Promise<EmployerCompanyContext> {
  return resolveEmployerCompanyContext();
}

/**
 * The caller's company id, or null.
 *
 * W8 slice 1 rewrote the body. It used to be
 * `companies.select("id").eq("profile_id", user.id).maybeSingle()` with the
 * `error` half of the response discarded — three separate defects in four
 * lines:
 *
 *   1. it ignored the ACTIVE WORKSPACE entirely, so switching organizations
 *      could not change which company's projects, planning, workforce, finance
 *      or reports the person saw (audit P0-1);
 *   2. `maybeSingle()` over a table whose uniqueness constraint is applied
 *      CONDITIONALLY (`20260604120000` only adds `companies_profile_id_key`
 *      when no duplicates existed at apply time) errors on a second row — and
 *      with `error` dropped the caller received `null`, i.e. projects and the
 *      planning project source went silently EMPTY instead of failing closed;
 *   3. any transient DB or authorization failure was likewise indistinguishable
 *      from "this person has no company".
 *
 * It now delegates to the ONE canonical resolver and returns null only for
 * legitimately company-less states. An infrastructure failure is logged with
 * its real reason before returning null, so observability never has to guess —
 * and callers that can render a state should use `callerCompanyContext()`
 * instead of collapsing every reason into a bare null.
 */
export async function callerCompanyId(): Promise<string | null> {
  const ctx = await resolveEmployerCompanyContext();
  if (ctx.kind === "ok") return ctx.companyId;
  if (isEmployerContextFailure(ctx.reason)) {
    console.error("[projects] no employer company context", { reason: ctx.reason });
  }
  return null;
}
