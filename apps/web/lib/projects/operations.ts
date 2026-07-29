import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getWorkerReadiness, type WorkerReadiness } from "@/lib/company/worker-readiness";
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

interface AssignmentRow {
  workerId: string;
  workerProfileId: string;
  name: string;
  hasRealName: boolean;
  assignedAt: string;
}

/** Active assignments incl. worker_id (for readiness lookup) — RLS-scoped. */
async function readActiveAssignments(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  projectId: string,
): Promise<AssignmentRow[]> {
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
  if (res.error) return [];
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
  for (const r of (res.data ?? []) as Row[]) {
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
    type Row = {
      worker_id: string;
      item_key: string;
      label: string;
      status: string;
      note: string | null;
    };
    for (const r of (res.data ?? []) as Row[]) {
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
  } catch {
    /* graceful */
  }
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

  const projRes = await asAny(supabase)
    .from("projects")
    .select("id, title, city, country, start_date, end_date, status")
    .eq("id", projectId)
    .maybeSingle();
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

  const assignments = await readActiveAssignments(asAny(supabase), projectId);
  const [readiness, statuses, items] = await Promise.all([
    getWorkerReadiness(assignments.map((a) => a.workerId)),
    readOperationalStatuses(asAny(supabase), projectId),
    readReadinessItems(asAny(supabase), projectId),
  ]);

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
    }),
  );

  const instructionsSent = await countInstructionsSent(asAny(supabase), projectId);
  const counters = deriveOpsCounters(workers, instructionsSent);

  return { project, workers, counters };
}
