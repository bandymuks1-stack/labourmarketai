"use server";

import "server-only";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { resolveEmployerCompanyContext } from "@/lib/company/employer-company-context";
import { listProjectAssignments } from "@/lib/projects/projects";
import { listActiveCompanyWorkers } from "@/lib/company/company-workers";
import { listBookingEngagementWorkers } from "@/lib/projects/booking-engagement-workers";
import {
  composeAssignableWorkers,
  type AssignableWorker,
} from "@/lib/projects/assignable-workers";
import { listProjectStages } from "@/lib/projects/stages";
import { getProjectStadium } from "@/lib/projects/stadium";
import { deriveProjectReadinessRatio } from "@/lib/projects/operations-centre-model";
import { getProjectGallerySummary } from "@/lib/journal/project-gallery";
import { listProjectTasks } from "@/lib/tasks/tasks";
import { isOverdue, OPEN_WORK_TASK_STATUSES } from "@/lib/tasks/task-model";
import { isProjectStatus, type ProjectStatus } from "@/lib/projects/project-lifecycle-model";
import {
  PROJECT_ASSIGNMENT_LIMIT,
  PROJECT_RESULT_LIMIT,
  PROJECT_STAGE_LIMIT,
  type ProjectDetailResult,
  type ProjectLifecycleResult,
  type ProjectListResult,
  type ProjectListRow,
  type ProjectPulse,
  type ProjectStageRow,
} from "@/lib/projects/project-result-contract";
import { emitServerFunnelEvent } from "@/lib/telemetry/server-funnel";
import { FUNNEL_EVENTS } from "@/lib/telemetry/funnel-events";

/**
 * W11 — the project workspace adapter: the `project` result's ONE data path.
 *
 * Thin, like `lib/conversation/employer-workspace.ts`. It reads through the
 * canonical project modules and writes through exactly one RPC:
 *
 *   projects list / detail  →  the RLS-scoped `projects` read (projects_select)
 *   assignments             →  lib/projects/projects.ts (listProjectAssignments)
 *   stages                  →  lib/projects/stages.ts   (listProjectStages)
 *   authority               →  can_manage_project()      — the EXISTING helper
 *   lifecycle write         →  set_project_status_v1()   — the ONE write
 *
 * ─── NO SECOND AUTHORIZATION MODEL ──────────────────────────────────────────
 * `canManage` is not re-derived here from company ownership or organization
 * membership. It calls `can_manage_project(uuid)` — the same SQL function the
 * RPC, the stage RPCs, the budget RPCs and the assignment gate all use, which
 * is granted to `authenticated` in production. So the control the panel offers
 * and the authority the write enforces are literally the same predicate. A
 * client that lies about it gains nothing: the RPC re-checks.
 *
 * ─── NO SECOND LIFECYCLE ────────────────────────────────────────────────────
 * The transition matrix is NOT re-implemented here. `set_project_status_v1`
 * owns it in SQL under a row lock; `project-lifecycle-model.ts` states the same
 * rules purely so the UI can offer only reachable actions. This module simply
 * forwards the RPC's tagged outcome. It never turns a failure into a success
 * and never invents an outcome the server did not return.
 */

const RPC_NOT_FOUND = "42883";
const UNDEFINED_COLUMN = "42703";
const RELATION_NOT_FOUND = "42P01";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

function migMissing(code?: string): boolean {
  return code === RPC_NOT_FOUND || code === UNDEFINED_COLUMN || code === RELATION_NOT_FOUND;
}

/** Coerce a stored status to the canonical union. An unreadable or legacy
 *  value becomes `null` — rendered as unknown, NEVER silently as `draft`. */
function toStatus(value: unknown): ProjectStatus | null {
  return isProjectStatus(value) ? value : null;
}

/**
 * The projects the caller can see, for the result's depth-0 picker.
 *
 * The company-context gate runs FIRST, for the same reason the scouting page
 * runs it first: "you are standing in your personal space" and "you have no
 * projects" are different truths fixed by different acts, and a read that
 * cannot tell them apart will eventually tell someone the wrong one.
 */
export async function loadProjectsForResult(): Promise<ProjectListResult> {
  try {
    const ctx = await resolveEmployerCompanyContext();
    if (ctx.kind !== "ok") return { kind: "no-company-context" };

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { kind: "blocked" };

    const res = await asAny(supabase)
      .from("projects")
      .select(
        "id, title, status, city, organization_id, organizations(display_name, legal_name)",
      )
      .order("created_at", { ascending: false })
      .limit(PROJECT_RESULT_LIMIT);
    if (res.error) return { kind: "blocked" };

    type Row = {
      id: string;
      title: string | null;
      status: string | null;
      city: string | null;
      organizations: { display_name: string | null; legal_name: string | null } | null;
    };
    const rows = (res.data ?? []) as Row[];
    if (rows.length === 0) return { kind: "empty" };

    const projects: readonly ProjectListRow[] = rows.map((p) => ({
      projectId: p.id,
      title: p.title?.trim() || "—",
      status: toStatus(p.status),
      city: p.city?.trim() || null,
      orgName:
        p.organizations?.display_name?.trim() ||
        p.organizations?.legal_name?.trim() ||
        null,
    }));
    return { kind: "projects", projects };
  } catch {
    // A thrown read is never rendered as "you have no projects".
    return { kind: "blocked" };
  }
}

/**
 * ONE project, for the result's depth-1 view.
 *
 * `projectId` is a REQUEST, never a permission: the row read runs under
 * `projects_select` (owner / admin / assigned worker), and every write offered
 * afterwards re-checks `can_manage_project` server-side. A hand-typed id in the
 * URL therefore buys nothing.
 */
export async function loadProjectDetailForResult(
  projectId: string,
): Promise<ProjectDetailResult> {
  if (typeof projectId !== "string" || projectId.trim() === "") {
    return { kind: "not-found" };
  }
  try {
    const ctx = await resolveEmployerCompanyContext();
    if (ctx.kind !== "ok") return { kind: "no-company-context" };

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { kind: "blocked" };

    const res = await asAny(supabase)
      .from("projects")
      .select(
        "id, title, status, city, country, start_date, end_date, organizations(display_name, legal_name)",
      )
      .eq("id", projectId)
      .maybeSingle();
    if (res.error) return migMissing(res.error.code) ? { kind: "blocked" } : { kind: "blocked" };
    if (!res.data) return { kind: "not-found" };

    const row = res.data as {
      id: string;
      title: string | null;
      status: string | null;
      city: string | null;
      country: string | null;
      start_date: string | null;
      end_date: string | null;
      organizations: { display_name: string | null; legal_name: string | null } | null;
    };

    // THE authority — the same predicate the RPC enforces, asked once.
    let canManage = false;
    try {
      const { data } = await asAny(supabase).rpc("can_manage_project", {
        p_project_id: projectId,
      });
      canManage = data === true;
    } catch {
      // Unreadable authority is NOT authority. Fail closed: the panel then
      // renders the project without lifecycle controls rather than offering
      // buttons that would be refused.
      canManage = false;
    }

    const assignments = await listProjectAssignments(projectId);

    // Stages are behind an owner-gated migration. `applied: false` is a
    // DIFFERENT fact from "no stages" and travels as `null`, so the panel can
    // say which one is true instead of showing a confident empty list.
    // The PULSE — the operations centre's own reads, bounded, in parallel; any
    // failure makes the whole pulse null (never a zero pretending to be a fact).
    let pulse: ProjectPulse | null = null;
    try {
      const [stadium, gallery, tasks] = await Promise.all([
        getProjectStadium(projectId),
        getProjectGallerySummary(projectId),
        listProjectTasks(projectId),
      ]);
      if (stadium && tasks.status === "ok") {
        const now = new Date();
        const open = tasks.tasks.filter((t) => (OPEN_WORK_TASK_STATUSES as readonly string[]).includes(t.status));
        const ratio = deriveProjectReadinessRatio(stadium.ops.workers);
        pulse = {
          entriesToday: stadium.entriesToday,
          evidenceEntries: gallery.entryCount,
          evidencePhotos: gallery.photoCount,
          tasksOpen: open.length,
          tasksOverdue: open.filter((t) => isOverdue(t.dueAt, now)).length,
          readinessChecked: ratio.checked,
          readinessTotal: ratio.total,
          workersWithMissingDocs: stadium.ops.counters.withMissingDocs,
        };
      }
    } catch {
      pulse = null;
    }

    let stages: readonly ProjectStageRow[] | null = null;
    let stageTotal: number | null = null;
    try {
      const data = await listProjectStages(projectId);
      if (data.applied) {
        stageTotal = data.stages.length;
        stages = data.stages.slice(0, PROJECT_STAGE_LIMIT).map((s) => ({
          id: s.id,
          name: s.name,
          status: s.status,
          stageOrder: s.stageOrder,
          plannedStart: s.plannedStart,
          plannedEnd: s.plannedEnd,
          actualStart: s.actualStart,
          actualEnd: s.actualEnd,
          blockedReason: s.blockedReason,
        }));
      }
    } catch {
      stages = null;
      stageTotal = null;
    }

    return {
      kind: "project",
      project: {
        projectId: row.id,
        title: row.title?.trim() || "—",
        status: toStatus(row.status),
        city: row.city?.trim() || null,
        country: row.country?.trim() || null,
        orgName:
          row.organizations?.display_name?.trim() ||
          row.organizations?.legal_name?.trim() ||
          null,
        startDate: row.start_date,
        endDate: row.end_date,
        assignments: assignments.slice(0, PROJECT_ASSIGNMENT_LIMIT),
        assignmentTotal: assignments.length,
        stages,
        stageTotal,
        canManage,
        pulse,
      },
    };
  } catch {
    return { kind: "blocked" };
  }
}

/**
 * The ONE lifecycle write. A thin forward of `set_project_status_v1`.
 *
 * Everything that matters happens in SQL under a row lock: authority, the
 * transition matrix, idempotency, the project-scoped roster ending and the
 * audit rows. This function adds no rule of its own — it maps the tagged
 * outcome and refreshes the screens that show project state.
 */
export async function setProjectStatusAction(
  locale: string,
  projectId: string,
  status: string,
): Promise<ProjectLifecycleResult> {
  if (typeof projectId !== "string" || projectId.trim() === "") {
    return { kind: "not_found" };
  }
  const supabase = await createClient();
  const { data, error } = await asAny(supabase).rpc("set_project_status_v1", {
    p_project_id: projectId,
    p_status: status,
  });

  if (error) {
    // The migration is owner-gated: until it applies, say so honestly instead
    // of showing a generic failure the person cannot act on.
    if (migMissing(error.code)) return { kind: "needs_migration" };
    return { kind: "error" };
  }

  const payload = (data ?? {}) as Record<string, unknown>;
  const outcome = typeof payload.outcome === "string" ? payload.outcome : "error";

  switch (outcome) {
    case "transitioned": {
      const from = toStatus(payload.from_status);
      const to = toStatus(payload.to_status);
      // A success whose states we cannot read is not a success we can report.
      if (!from || !to) return { kind: "error" };
      // Every surface that renders project state re-reads. `revalidatePath` is
      // the same refresh the other project actions use.
      revalidatePath(`/${locale}/dashboard/projects`);
      revalidatePath(`/${locale}/dashboard/projects/${projectId}`);
      revalidatePath(`/${locale}/dashboard`);
      // W14 mid-funnel: only a REAL transition into the terminal state counts
      // as a completed project (the RPC reported `transitioned`, not
      // `already_in_state`). No ids in metadata. Fire-and-forget.
      if (to === "completed") {
        emitServerFunnelEvent(FUNNEL_EVENTS.projectCompleted, {
          source: "projects",
          metadata: { surface: "projects", role_context: "company" },
        });
      }
      return {
        kind: "transitioned",
        fromStatus: from,
        toStatus: to,
        assignmentsEnded:
          typeof payload.assignments_ended === "number" ? payload.assignments_ended : 0,
      };
    }
    case "already_in_state": {
      const current = toStatus(payload.status);
      return current
        ? { kind: "already_in_state", status: current }
        : { kind: "error" };
    }
    case "invalid_transition":
      return { kind: "invalid_transition" };
    case "not_authorized":
      return { kind: "not_authorized" };
    case "not_found":
      return { kind: "not_found" };
    case "conflict":
      return { kind: "conflict" };
    default:
      // An unrecognised outcome collapses to `error` — NEVER to success.
      return { kind: "error" };
  }
}

/**
 * The workers this caller may actually assign, for the chat's assignment step.
 *
 * Deliberately the SAME population the assignment RPC accepts
 * — BOTH of its gates, through the SAME two reads the projects page uses:
 *   - `caller_manages_worker`: the caller's ACTIVE roster, read from the
 *     canonical `listActiveCompanyWorkers` (bounded: 50 rows);
 *   - `caller_has_booking_engagement_for_project`: the caller's ACTIVE
 *     accepted-booking engagements, read from the EXISTING caller-bound RPC
 *     `list_booking_engagement_workers_v1` via `listBookingEngagementWorkers`
 *     (SECURITY DEFINER, `companies.profile_id = auth.uid()`, no contact
 *     fields; one active engagement per (company, worker) pair).
 * D5 agency-chain walk (2026-09-06): a client who accepted an agency's
 * candidate could assign that person on the page but not in the chat, because
 * the chat read the roster alone. Chat and page now reach the same state
 * through the same reads. The join itself is the pure, guarded
 * `composeAssignableWorkers` (dedup by profile id; roster wins the label).
 *
 * Offering anyone else would be offering a control that the server refuses —
 * the exact "fake control" the product forbids. Contact details are NOT
 * returned: the chat needs a name to show, a profile id to dispatch and the
 * source to label honestly, and nothing else leaves the server.
 *
 * Degradation stays NAMED: a roster read that fails is `blocked`, never an
 * empty team; an engagement read that fails is also `blocked` (a half-read
 * team presented as the whole team is the page/chat split this fixes); an
 * engagement RPC that is not applied yet simply contributes no candidates,
 * exactly as the page's picker does.
 */
export async function loadAssignableWorkersForProject(): Promise<
  | { kind: "workers"; workers: readonly AssignableWorker[] }
  | { kind: "empty" }
  | { kind: "no-company-context" }
  | { kind: "needs-migration" }
  | { kind: "blocked" }
> {
  try {
    const ctx = await resolveEmployerCompanyContext();
    if (ctx.kind !== "ok" || !ctx.companyId) return { kind: "no-company-context" };

    const [res, engagement] = await Promise.all([
      listActiveCompanyWorkers(ctx.companyId),
      listBookingEngagementWorkers(),
    ]);
    if (res.kind === "needs-migration") return { kind: "needs-migration" };
    if (res.kind !== "ok") return { kind: "blocked" };
    if (engagement.kind === "error") return { kind: "blocked" };

    const roster = res.rows
      .filter((r) => r.status === "active" && r.profileId)
      .map((r) => ({
        profileId: r.profileId,
        // The display name the canonical reader already returns for the
        // caller's OWN roster; the id prefix is the honest last resort.
        name: r.displayName?.trim() || r.profileId.slice(0, 8),
      }));
    const workers = composeAssignableWorkers(roster, engagement.workers);
    return workers.length > 0 ? { kind: "workers", workers } : { kind: "empty" };
  } catch {
    return { kind: "blocked" };
  }
}
