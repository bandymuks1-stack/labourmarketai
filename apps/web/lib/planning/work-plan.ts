import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import {
  projectWorkPlanItem,
  type WorkPlanEntry,
  type WorkPlanStatus,
} from "@/lib/planning/work-plan-model";
import type { PlanningItem } from "@/lib/planning/planning-model";

/**
 * Work plan — server read layer (FINAL COMPLETION Train F1).
 *
 * Reads `work_plan_entries` through the caller's own RLS (managers of the
 * planning organization, or the planned worker). Degrades honestly while the
 * migration is unapplied: `applied: false`, never an empty list pretending
 * nothing is planned. Read-only — writes go through the two RPCs in
 * work-plan-actions.ts.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(supabase: SupabaseClient): any {
  return supabase;
}

const MISSING_RELATION = new Set(["42P01", "PGRST205"]);
const WORK_PLAN_READ_LIMIT = 500;

export type WorkPlanReadResult =
  | { readonly applied: false }
  | { readonly applied: true; readonly entries: readonly WorkPlanEntry[] };

type Row = {
  id: string;
  organization_id: string;
  worker_id: string;
  project_id: string | null;
  work_object_id: string | null;
  start_date: string;
  end_date: string;
  start_time: string | null;
  end_time: string | null;
  note: string | null;
  status: string;
  created_at: string;
  workers: { display_name: string | null; profiles: { full_name: string | null } | null } | null;
  projects: { title: string | null } | null;
  work_objects: { name: string | null } | null;
  organizations: { display_name: string | null } | null;
};

const SELECT =
  "id, organization_id, worker_id, project_id, work_object_id, start_date, end_date, start_time, end_time, note, status, created_at, workers(display_name, profiles(full_name)), projects(title), work_objects(name), organizations(display_name)";

function toEntry(r: Row): WorkPlanEntry | null {
  if (r.status !== "planned" && r.status !== "cancelled") return null;
  return {
    id: r.id,
    organizationId: r.organization_id,
    workerId: r.worker_id,
    workerName: r.workers?.profiles?.full_name?.trim() || r.workers?.display_name?.trim() || null,
    projectId: r.project_id,
    projectTitle: r.projects?.title?.trim() || null,
    workObjectId: r.work_object_id,
    workObjectName: r.work_objects?.name?.trim() || null,
    organizationName: r.organizations?.display_name?.trim() || null,
    startDate: r.start_date,
    endDate: r.end_date,
    startTime: r.start_time ? r.start_time.slice(0, 5) : null,
    endTime: r.end_time ? r.end_time.slice(0, 5) : null,
    note: r.note,
    status: r.status as WorkPlanStatus,
    createdAt: r.created_at,
  };
}

/** Every plan entry the caller may see in [rangeStart, rangeEnd] (inclusive
 *  day strings), optionally one organization only. */
export async function listWorkPlanEntries(opts: {
  rangeStart: string;
  rangeEnd: string;
  organizationId?: string | null;
  includeCancelled?: boolean;
}): Promise<WorkPlanReadResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { applied: true, entries: [] };
  let q = asAny(supabase)
    .from("work_plan_entries")
    .select(SELECT)
    .lte("start_date", opts.rangeEnd)
    .gte("end_date", opts.rangeStart)
    .order("start_date", { ascending: true })
    .limit(WORK_PLAN_READ_LIMIT);
  if (opts.organizationId) q = q.eq("organization_id", opts.organizationId);
  if (!opts.includeCancelled) q = q.eq("status", "planned");
  const { data, error } = await q;
  if (error) {
    if (MISSING_RELATION.has(error.code)) return { applied: false };
    return { applied: true, entries: [] };
  }
  const entries: WorkPlanEntry[] = [];
  for (const r of (data ?? []) as Row[]) {
    const e = toEntry(r);
    if (e) entries.push(e);
  }
  return { applied: true, entries };
}

/** Calendar source: the caller's planned windows. A manager sees the windows
 *  of the organizations they manage (`managed`); a worker sees their own
 *  (`assigned`). RLS decides which rows arrive; the role context is derived
 *  from whether the caller is the planned worker. */
export async function readWorkPlanItems(
  rangeStart: string,
  rangeEnd: string,
): Promise<{
  state: { status: "ok" | "unavailable" | "error"; count: number };
  items: PlanningItem[];
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { state: { status: "error", count: 0 }, items: [] };
  const result = await listWorkPlanEntries({ rangeStart, rangeEnd });
  if (!result.applied) return { state: { status: "unavailable", count: 0 }, items: [] };
  const { data: own } = await asAny(supabase)
    .from("workers")
    .select("id")
    .eq("profile_id", user.id)
    .maybeSingle();
  const ownWorkerId = (own?.id as string | undefined) ?? null;
  const items: PlanningItem[] = [];
  for (const e of result.entries) {
    const item = projectWorkPlanItem(
      e,
      ownWorkerId !== null && e.workerId === ownWorkerId ? "assigned" : "managed",
    );
    if (item) items.push(item);
  }
  return { state: { status: "ok", count: items.length }, items };
}

export type PlannableWorker = { readonly workerId: string; readonly name: string };

/** Relationships `work_plan_worker_in_scope_v1` accepts as an engagement
 *  (migration 20261007140000) — the picker offers exactly those people. */
const PLANNABLE_ENGAGEMENT_SLUGS = ["employee", "collaborator", "freelancer"] as const;

/** Workers the caller can plan for: the active roster of the companies the
 *  caller manages (legacy `agency_workers` is not API-exposed — see
 *  lib/guards/agency-workers-not-api-exposed.test.ts), plus — for the active organization — the
 *  people engaged through it (a "join as employee" invitation writes
 *  engagement_contexts only; walk 2026-10-11 found them unplannable although
 *  the RPC already accepts them). Names come from the worker's own display name. */
export async function listPlannableWorkers(
  organizationId?: string | null,
): Promise<readonly PlannableWorker[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const select = "worker_id, workers(id, display_name, profiles(full_name))";
  const [cw, ec] = await Promise.all([
    asAny(supabase).from("company_workers").select(select).eq("status", "active").limit(200),
    organizationId
      ? asAny(supabase)
          .from("engagement_contexts")
          .select("profile_id")
          .eq("organization_id", organizationId)
          .eq("status", "active")
          .in("relationship_slug", [...PLANNABLE_ENGAGEMENT_SLUGS])
          .limit(200)
      : Promise.resolve({ data: [] }),
  ]);
  type R = {
    worker_id: string;
    workers: { id: string; display_name: string | null; profiles: { full_name: string | null } | null } | null;
  };
  const engagedProfiles = ((ec.data ?? []) as { profile_id: string | null }[])
    .map((r) => r.profile_id)
    .filter((p): p is string => Boolean(p));
  let engaged: R[] = [];
  if (engagedProfiles.length > 0) {
    const { data } = await asAny(supabase)
      .from("workers")
      .select("id, display_name, profiles(full_name)")
      .in("profile_id", engagedProfiles);
    engaged = ((data ?? []) as { id: string; display_name: string | null; profiles: { full_name: string | null } | null }[]).map(
      (w) => ({ worker_id: w.id, workers: w }),
    );
  }
  const out = new Map<string, PlannableWorker>();
  for (const rows of [cw.data, engaged]) {
    for (const r of (rows ?? []) as R[]) {
      if (!r.worker_id || out.has(r.worker_id)) continue;
      out.set(r.worker_id, {
        workerId: r.worker_id,
        name:
          r.workers?.profiles?.full_name?.trim() ||
          r.workers?.display_name?.trim() ||
          r.worker_id.slice(0, 8),
      });
    }
  }
  return [...out.values()].sort((a, b) => a.name.localeCompare(b.name));
}
