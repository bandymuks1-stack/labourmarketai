import "server-only";

import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getWorkerReadiness, type WorkerReadiness } from "@/lib/company/worker-readiness";
import {
  mergeAssignedPeople,
  readTeamAssignedPeople,
  type TeamAssignedPersonRow,
} from "@/lib/projects/assigned-people";
import {
  deriveOpsCounters,
  deriveWorkerOps,
  OPERATIONAL_STATUSES,
  READINESS_STATUSES,
  type OperationalStatus,
  type ProjectOperations,
  type ProjectSummary,
  type ReadinessItem,
  type ReadinessStatus,
} from "@/lib/projects/operations-derive";

export type {
  ProjectSummary,
  WorkerOps,
  OpsCounters,
  ProjectOperations,
  WorkerOpsInput,
  OperationalStatus,
  ReadinessStatus,
  ReadinessItem,
} from "@/lib/projects/operations-derive";
export { deriveWorkerOps, deriveOpsCounters } from "@/lib/projects/operations-derive";

/**
 * Project operations read service (slice pilot-ops-launch-v1).
 *
 * Composes the ALREADY-APPLIED, ALREADY-RLS'd layers into one manager-facing
 * operations view — it adds NO migration and NO new grant:
 *   - projects                     (RLS: a manager reads only their own projects)
 *   - project_worker_assignments   (RLS: can_manage_project / worker owns row)
 *   - worker_skills + journal_entries via getWorkerReadiness (RLS: is_employer /
 *     manages_organization) — the SAME signals the company dashboard already shows
 *   - conversation_messages        (RLS: participant-scoped) for instructions sent
 *
 * Honest by construction:
 *   - Every counter is a raw count of real rows the manager is authorised to read.
 *     The caller's cookie-scoped client only (no elevated DB client), so RLS
 *     enforces every read — no cross-roster leakage.
 *   - "Ready" is DERIVED only from the fields we actually checked (name +
 *     declared skill + recorded evidence) and is labelled as such; it never
 *     claims verification, document approval, or AI understanding.
 *   - Candidate-skill CLARIFICATIONS are owner-only (RLS); a manager cannot read
 *     them, so this view never shows a manager-side candidate-skill count — it is
 *     surfaced only on the worker's own player-card. We do not fabricate it here.
 *   - There is no document/readiness model yet, so documents are reported as
 *     "not tracked" — never as approved/verified.
 */

const UNDEFINED_COLUMN = "42703";
const RELATION_NOT_FOUND = "42P01";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

function migMissing(code?: string): boolean {
  return code === UNDEFINED_COLUMN || code === RELATION_NOT_FOUND;
}

export interface OpsAssignmentRow {
  workerId: string;
  workerProfileId: string;
  name: string;
  hasRealName: boolean;
  assignedAt: string;
}
type AssignmentRow = OpsAssignmentRow;

/** Active assignments incl. worker_id (for readiness lookup) — RLS-scoped. */
async function readActiveAssignments(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  projectId: string,
): Promise<AssignmentRow[]> {
  const res = await readActiveAssignmentRows(supabase, projectId);
  if (res.error) return [];
  return toOpsAssignmentRows(res.data ?? []);
}

/** Raw active-assignment rows → the operations roster (a row needs both a
 *  worker and a profile to carry readiness). Pure; shared with the company
 *  home's batched project scan so both build the roster by one rule. */
export function toOpsAssignmentRows(rows: readonly unknown[]): OpsAssignmentRow[] {
  type Row = {
    assigned_at: string;
    worker: {
      id: string | null;
      profile_id: string | null;
      display_name: string | null;
      profiles: { full_name: string | null } | null;
    } | null;
  };
  const out: AssignmentRow[] = [];
  for (const r of rows as Row[]) {
    const w = r.worker;
    if (!w?.id || !w.profile_id) continue;
    const realName = w.profiles?.full_name ?? w.display_name ?? null;
    out.push({
      workerId: w.id,
      workerProfileId: w.profile_id,
      name: realName ?? w.profile_id.slice(0, 8),
      hasRealName: Boolean(realName && realName.trim().length > 0),
      assignedAt: r.assigned_at,
    });
  }
  return out;
}

/**
 * THE active person-assignment rows of ONE project, raw — shared by this
 * module's operations read and `listProjectAssignments`
 * (`lib/projects/projects.ts`), which ask the identical question. Read ONCE
 * per client + project per server render (perf 2026-10-22): the company
 * home's project detail and its operations pulse used to read the same
 * project's roster twice in one `/dashboard/company` render. Keyed by the
 * CLIENT object, so a read through another client (another identity) is
 * never served from this one. Request-scoped: every navigation and every
 * server action (assign / end assignment) reads again. Callers map the rows
 * into fresh objects; none mutates them.
 */
export const readActiveAssignmentRows = cache(
  async (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase: any,
    projectId: string,
  ): Promise<{ data: unknown[] | null; error: { code?: string } | null }> => {
    const res = await supabase
      .from("project_worker_assignments")
      // `profiles` is a LEFT join on purpose (W4 review, §3).
      //
      // It was `profiles!inner(full_name)`, and the only SELECT policy on
      // `profiles` is `(id = auth.uid()) OR is_admin()` — an employer may never
      // read another person's profile row. So the inner join dropped EVERY
      // assignment before it reached the code below, and this screen showed
      // "0 assigned" to every manager, always.
      //
      // The join exists solely to fetch an OPTIONAL display name that already has
      // a fallback (`full_name ?? display_name ?? id-prefix`); the `!inner` made
      // that fallback unreachable. Left-joining changes no policy and grants
      // nothing: PostgREST still applies RLS to the embedded resource, so an
      // unreadable profile simply arrives as `null` and the fallback runs.
      .select(
        "assigned_at, worker:workers!inner(id, profile_id, display_name, profiles(full_name))",
      )
      .eq("project_id", projectId)
      .eq("status", "active")
      .order("assigned_at", { ascending: false });
    return { data: (res.data as unknown[] | null) ?? null, error: res.error ?? null };
  },
);

/**
 * THE header row of ONE project (RLS: `projects_select` — not the caller's
 * project → no row), shared by this module's operations read and the project
 * panel's detail read (`loadProjectDetailForResult`), which asked for the same
 * row with an overlapping column list — two `projects` round trips per project
 * on the company home (perf 2026-10-22). The column list is the union of both;
 * the organization name is a LEFT embed (an unreadable organization arrives as
 * `null`, it never hides the project). Read ONCE per client + project per
 * server render; every navigation and every server action reads again.
 */
export const readProjectHeaderRow = cache(
  async (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase: any,
    projectId: string,
  ): Promise<{ data: unknown; error: { code?: string } | null }> => {
    const res = await supabase
      .from("projects")
      .select(
        "id, title, status, city, country, start_date, end_date, organizations(display_name, legal_name)",
      )
      .eq("id", projectId)
      .maybeSingle();
    return { data: res.data ?? null, error: res.error ?? null };
  },
);

/** Current operational status per worker_id for a project (RLS-scoped, v2). */
async function readOperationalStatuses(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  projectId: string,
): Promise<Map<string, OperationalStatus>> {
  const out = new Map<string, OperationalStatus>();
  try {
    const res = await supabase
      .from("project_worker_operational_statuses")
      .select("worker_id, status")
      .eq("project_id", projectId);
    if (res.error) return out; // not-yet-migrated / no access → empty, never fake.
    for (const r of (res.data ?? []) as { worker_id: string; status: string }[]) {
      if (r.worker_id && (OPERATIONAL_STATUSES as readonly string[]).includes(r.status)) {
        out.set(r.worker_id, r.status as OperationalStatus);
      }
    }
  } catch {
    /* graceful */
  }
  return out;
}

/** Readiness checklist items per worker_id for a project (RLS-scoped, v2). */
async function readReadinessItems(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  projectId: string,
): Promise<Map<string, ReadinessItem[]>> {
  const out = new Map<string, ReadinessItem[]>();
  try {
    const res = await supabase
      .from("project_worker_readiness_items")
      .select("worker_id, item_key, label, status, note")
      .eq("project_id", projectId)
      .order("item_key", { ascending: true });
    if (res.error) return out;
    return readinessItemsByWorker(res.data ?? []);
  } catch {
    /* graceful */
  }
  return out;
}

/** Checklist rows → items per worker_id (unknown statuses dropped, never
 *  guessed). Pure; shared with the batched project scan. */
export function readinessItemsByWorker(rows: readonly unknown[]): Map<string, ReadinessItem[]> {
  const out = new Map<string, ReadinessItem[]>();
  type Row = {
    worker_id: string;
    item_key: string;
    label: string;
    status: string;
    note: string | null;
  };
  for (const r of rows as Row[]) {
    if (!r.worker_id) continue;
    if (!(READINESS_STATUSES as readonly string[]).includes(r.status)) continue;
    const list = out.get(r.worker_id) ?? [];
    list.push({
      itemKey: r.item_key,
      label: r.label,
      status: r.status as ReadinessStatus,
      note: r.note ?? null,
    });
    out.set(r.worker_id, list);
  }
  return out;
}

/**
 * The PostgREST row cap (`max_rows`, 1000 on this stack). A batched read is
 * trusted only when it is provably COMPLETE — every matching row came back
 * (rows read = exact count) — otherwise the caller falls back to the
 * per-project read, which is what each project got before. Same rule as
 * `getProjectPhotoCounts`.
 */
export const PROJECT_BATCH_ROW_CAP = 1000;

type BatchRows = { complete: true; byProject: Map<string, unknown[]> } | { complete: false };

async function readProjectRowsBatch(
  build: () => PromiseLike<{ data: unknown; error: unknown; count?: number | null }>,
  projectIds: readonly string[],
): Promise<BatchRows | { error: true }> {
  const res = await build();
  if (res.error) return { error: true };
  const rows = Array.isArray(res.data) ? (res.data as { project_id?: string }[]) : null;
  if (!rows || typeof res.count !== "number" || rows.length !== res.count) return { complete: false };
  const byProject = new Map<string, unknown[]>(projectIds.map((id) => [id, []]));
  for (const r of rows) {
    const list = r.project_id ? byProject.get(r.project_id) : undefined;
    if (list) list.push(r);
  }
  return { complete: true, byProject };
}

/**
 * The active person-assignment rows of MANY projects in one read (the company
 * home's project scan — perf 2026-10-22). Same select, same filters, same
 * order and the same RLS as `readActiveAssignmentRows`; grouped per project,
 * whose order is the global order restricted to that project. A failed read
 * is every project's failed read (each degrades to "no rows", as before); an
 * incomplete batch falls back to the per-project read.
 */
export async function readActiveAssignmentRowsForProjects(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  projectIds: readonly string[],
): Promise<Map<string, { data: unknown[] | null; error: { code?: string } | null }>> {
  const out = new Map<string, { data: unknown[] | null; error: { code?: string } | null }>();
  if (projectIds.length === 0) return out;
  let failure: { code?: string } | null = null;
  const batch = await readProjectRowsBatch(async () => {
    const res = await supabase
      .from("project_worker_assignments")
      .select(
        "project_id, assigned_at, worker:workers!inner(id, profile_id, display_name, profiles(full_name))",
        { count: "exact" },
      )
      .in("project_id", [...projectIds])
      .eq("status", "active")
      .order("assigned_at", { ascending: false })
      .limit(PROJECT_BATCH_ROW_CAP);
    failure = res.error ?? null;
    return res;
  }, projectIds);
  if ("error" in batch) {
    for (const id of projectIds) out.set(id, { data: null, error: failure ?? {} });
    return out;
  }
  if (batch.complete) {
    for (const id of projectIds) out.set(id, { data: batch.byProject.get(id) ?? [], error: null });
    return out;
  }
  const single = await Promise.all(projectIds.map((id) => readActiveAssignmentRows(supabase, id)));
  projectIds.forEach((id, i) => out.set(id, single[i]));
  return out;
}

/**
 * Readiness checklist items of MANY projects in one read (the company home's
 * project scan). Same table, filters, order and RLS as the per-project read;
 * a failed read degrades every project to "no items" exactly as the
 * per-project read does; an incomplete batch falls back to it.
 */
export async function readReadinessItemsForProjects(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  projectIds: readonly string[],
): Promise<Map<string, Map<string, ReadinessItem[]>>> {
  const out = new Map<string, Map<string, ReadinessItem[]>>();
  if (projectIds.length === 0) return out;
  try {
    const batch = await readProjectRowsBatch(
      () =>
        supabase
          .from("project_worker_readiness_items")
          .select("project_id, worker_id, item_key, label, status, note", { count: "exact" })
          .in("project_id", [...projectIds])
          .order("item_key", { ascending: true })
          .limit(PROJECT_BATCH_ROW_CAP),
      projectIds,
    );
    if ("error" in batch) {
      for (const id of projectIds) out.set(id, new Map());
      return out;
    }
    if (batch.complete) {
      for (const id of projectIds) out.set(id, readinessItemsByWorker(batch.byProject.get(id) ?? []));
      return out;
    }
  } catch {
    /* fall through to the per-project reads, which degrade on their own */
  }
  const single = await Promise.all(projectIds.map((id) => readReadinessItems(supabase, id)));
  projectIds.forEach((id, i) => out.set(id, single[i]));
  return out;
}

/** Count of project-scoped instructions the manager has sent (RLS-scoped). */
async function countInstructionsSent(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  projectId: string,
): Promise<number> {
  try {
    const { count, error } = await supabase
      .from("conversation_messages")
      .select("*", { count: "exact", head: true })
      .eq("project_id", projectId)
      .eq("is_instruction", true);
    if (error || typeof count !== "number") return 0;
    return count;
  } catch {
    return 0;
  }
}

/**
 * Full operations view for one project, or null when the caller cannot read the
 * project (RLS returns no row → not their project / not authorised). The caller
 * (the route) renders a not-authorised state for null.
 */
export async function getProjectOperations(
  projectId: string,
): Promise<ProjectOperations | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const projRes = await readProjectHeaderRow(asAny(supabase), projectId);
  if (projRes.error && !migMissing(projRes.error.code)) return null;
  const p = projRes.data as
    | {
        id: string;
        title: string | null;
        city: string | null;
        country: string | null;
        start_date: string | null;
        end_date: string | null;
        status: string | null;
      }
    | null;
  if (!p) return null; // RLS: not the caller's project → not authorised.

  const project: ProjectSummary = {
    id: p.id,
    title: p.title ?? null,
    city: p.city ?? null,
    country: p.country ?? null,
    startDate: p.start_date ?? null,
    endDate: p.end_date ?? null,
    status: p.status ?? null,
  };

  // ONE meaning of "assigned" (lib/projects/assigned-people.ts): the active
  // PERSON assignments UNION the current members of every ACTIVELY assigned
  // team, distinct per person; a person assigned both ways counts once and
  // stays an individual assignment. A team-only member carries viaTeam.
  // (The person rows and the team members are independent: one wave.)
  const [personAssignments, teamPeople] = await Promise.all([
    readActiveAssignments(asAny(supabase), projectId),
    readTeamAssignedPeople(asAny(supabase), [projectId]),
  ]);
  const assignments = opsAssignmentsOf(projectId, personAssignments, teamPeople);
  const [readiness, statuses, items, instructionsSent] = await Promise.all([
    getWorkerReadiness(assignments.map((a) => a.workerId)),
    readOperationalStatuses(asAny(supabase), projectId),
    readReadinessItems(asAny(supabase), projectId),
    countInstructionsSent(asAny(supabase), projectId),
  ]);
  return composeProjectOperations(project, assignments, readiness, statuses, items, instructionsSent);
}

/**
 * THE operations roster of one project, pure: the active PERSON assignments
 * UNION the members of every actively assigned team (lib/projects/assigned-people.ts),
 * a person assigned both ways once. Shared with the company home's batched
 * project scan, so its readiness numbers are built from the same people.
 * `teamPeople` may hold other projects' members; only this project's merge.
 */
export function opsAssignmentsOf(
  projectId: string,
  personAssignments: readonly OpsAssignmentRow[],
  teamPeople: readonly TeamAssignedPersonRow[],
): (OpsAssignmentRow & { viaTeam: boolean })[] {
  return mergeAssignedPeople(
    personAssignments.map((a) => ({ ...a, projectId, profileId: a.workerProfileId as string | null, workerId: a.workerId as string | null })),
    teamPeople.filter((t) => t.projectId === projectId),
  ).map((m) =>
    m.viaTeam
      ? {
          // A team member without a worker row is still a person on the project;
          // the profile id stands in as the row key (no readiness is read for it).
          workerId: m.workerId ?? m.profileId ?? "",
          workerProfileId: m.profileId ?? "",
          name: m.name?.trim() || (m.profileId ?? "").slice(0, 8),
          hasRealName: Boolean(m.name && m.name.trim().length > 0),
          assignedAt: m.assignedAt ?? "",
          viaTeam: true,
        }
      : {
          workerId: m.workerId as string,
          workerProfileId: m.workerProfileId,
          name: m.name,
          hasRealName: m.hasRealName,
          assignedAt: m.assignedAt,
          viaTeam: false,
        },
  );
}

/**
 * The operations view from its read parts, pure — the ONE derivation
 * (`deriveWorkerOps` / `deriveOpsCounters`). The batched project scan uses it
 * for the checklist-derived numbers only (readiness ratio, missing documents),
 * which depend on the roster and the checklist items alone.
 */
export function composeProjectOperations(
  project: ProjectSummary,
  assignments: readonly (OpsAssignmentRow & { viaTeam: boolean })[],
  readiness: ReadonlyMap<string, WorkerReadiness>,
  statuses: ReadonlyMap<string, OperationalStatus>,
  items: ReadonlyMap<string, ReadinessItem[]>,
  instructionsSent: number,
): ProjectOperations {
  const EMPTY: WorkerReadiness = {
    journalEntries: 0,
    declaredSkills: 0,
    confirmedSkills: 0,
    openReviewItems: 0,
    lastActivity: null,
  };

  const workers = assignments.map((a) =>
    deriveWorkerOps({
      workerId: a.workerId,
      workerProfileId: a.workerProfileId,
      name: a.name,
      hasRealName: a.hasRealName,
      assignedAt: a.assignedAt,
      readiness: readiness.get(a.workerId) ?? EMPTY,
      operationalStatus: statuses.get(a.workerId) ?? null,
      readinessItems: items.get(a.workerId) ?? [],
      viaTeam: a.viaTeam,
    }),
  );

  const counters = deriveOpsCounters(workers, instructionsSent);

  return { project, workers, counters };
}
