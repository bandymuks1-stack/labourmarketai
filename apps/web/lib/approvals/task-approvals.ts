import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import {
  isValidWorkflowInstanceStatus,
  isWorkflowMigrationMissingCode,
  type WorkflowInstanceStatus,
} from "@/lib/approvals/approvals-model";

/**
 * Task approval read (field-work audit v1, chain step B).
 *
 * A work task's approval is a NORMAL workflow instance — `context_entity_type
 * = 'work_task'`, `context_entity_id = <task id>`. There is no task-specific
 * approval store, no second decision table and no parallel status field on
 * `work_tasks`: approver resolution, decide / delegate / withdraw / cancel,
 * deadlines, escalation and the append-only transition log all come from the
 * engine that already exists (20260817130000).
 *
 * This module only ANSWERS "does this task have an approval, and where is it
 * up to". It never decides anything.
 *
 * Reads run under the caller's RLS-scoped client, so `workflow_instances`
 * own policy decides visibility — a task you can see whose approval you
 * cannot read simply reports no approval, rather than leaking one.
 *
 * Honest degradation: until the (GREEN) context-widening migration
 * 20260819210000 is applied, an org cannot author a `work_task` definition,
 * so there is nothing to read and the surface says so plainly.
 */

const UUID_RX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Bounded read — the tasks page renders a bounded list. */
const TASK_APPROVAL_READ_LIMIT = 200;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(supabase: SupabaseClient): any {
  return supabase;
}

export type TaskApprovalState = {
  readonly instanceId: string;
  readonly taskId: string;
  readonly title: string;
  readonly status: WorkflowInstanceStatus;
  readonly currentStepOrder: number | null;
  readonly createdAt: string;
  readonly completedAt: string | null;
};

export type TaskApprovalBatch = {
  /** Reported once for the whole page, never per card. */
  readonly status: "ok" | "needs-migration";
  /** Newest instance per task — a task may be re-submitted after a rejection. */
  readonly byTask: Readonly<Record<string, TaskApprovalState>>;
};

export const EMPTY_TASK_APPROVALS: TaskApprovalBatch = {
  status: "ok",
  byTask: {},
};

/** A `work_task` approval flow the caller's org has authored and published. */
export type TaskApprovalDefinition = {
  readonly id: string;
  readonly name: string;
  /** The organization that owns the flow. A task may only be sent through a
   *  flow of its OWN organization — see `getTaskOrganizations`. */
  readonly organizationId: string | null;
};

/**
 * Approval state for MANY tasks in ONE bounded read (the getTaskCollaboration
 * / getTaskEvidenceByTask precedent — never a per-card query).
 */
export async function getTaskApprovalStates(
  taskIds: readonly string[],
): Promise<TaskApprovalBatch> {
  const ids = [...new Set(taskIds.filter((id) => UUID_RX.test(id)))];
  if (ids.length === 0) return EMPTY_TASK_APPROVALS;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return EMPTY_TASK_APPROVALS;

  const res = await asAny(supabase)
    .from("workflow_instances")
    .select(
      "id, context_entity_id, title, status, current_step_order, created_at, completed_at",
    )
    .eq("context_entity_type", "work_task")
    .in("context_entity_id", ids)
    .order("created_at", { ascending: false })
    .limit(TASK_APPROVAL_READ_LIMIT);

  if (res.error) {
    if (isWorkflowMigrationMissingCode(res.error.code)) {
      return { status: "needs-migration", byTask: {} };
    }
    return EMPTY_TASK_APPROVALS;
  }

  type Row = {
    id: string;
    context_entity_id: string | null;
    title: string;
    status: string;
    current_step_order: number | null;
    created_at: string;
    completed_at: string | null;
  };

  const byTask: Record<string, TaskApprovalState> = {};
  for (const r of (res.data ?? []) as Row[]) {
    if (!r.context_entity_id) continue;
    // Rows arrive newest-first, so the FIRST row per task wins and a
    // re-submission after a rejection is the one shown.
    if (byTask[r.context_entity_id]) continue;
    if (!isValidWorkflowInstanceStatus(r.status)) continue;
    byTask[r.context_entity_id] = {
      instanceId: r.id,
      taskId: r.context_entity_id,
      title: r.title,
      status: r.status,
      currentStepOrder: r.current_step_order,
      createdAt: r.created_at,
      completedAt: r.completed_at,
    };
  }
  return { status: "ok", byTask };
}

/**
 * The ACTIVE `work_task` approval flows the caller may start.
 *
 * Empty is a real, honest state: an organization that has not authored a task
 * approval flow simply cannot request one yet, and the surface says exactly
 * that rather than inventing a default. Authoring happens through the
 * EXISTING template panel — this never creates a definition.
 */
export async function listTaskApprovalDefinitions(): Promise<
  readonly TaskApprovalDefinition[]
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const res = await asAny(supabase)
    .from("workflow_definitions")
    .select("id, name, is_active, context_entity_type, organization_id")
    .eq("context_entity_type", "work_task")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(50);
  if (res.error) return [];

  return (
    (res.data ?? []) as {
      id: string;
      name: string;
      organization_id: string | null;
    }[]
  ).map((d) => ({
    id: d.id,
    name: d.name,
    organizationId: d.organization_id ?? null,
  }));
}

/**
 * The organization each task belongs to, for the tasks a caller can see.
 *
 * `work_tasks` carries no `organization_id`: a task reaches its organization
 * through `project_id -> projects.organization_id` or through
 * `object_id -> work_objects.organization_id`. A task with both spines null
 * belongs to no organization.
 *
 * This exists so the UI offers a task ONLY the approval flows of its OWN
 * organization. A review found that the previous list returned every
 * work_task definition the caller could read across all their memberships, so
 * a person in two organizations was offered org B's flow for an org A task.
 * `20260820070000` refuses that combination in the engine; this keeps the UI
 * from presenting it in the first place.
 *
 * If both spines resolve and DISAGREE, the task is treated as belonging to
 * neither — the same "unambiguous or nothing" rule the rest of the chain uses.
 */
export async function getTaskOrganizations(
  taskIds: readonly string[],
): Promise<ReadonlyMap<string, string>> {
  const out = new Map<string, string>();
  const ids = [...new Set(taskIds)].filter((id) => id.length > 0);
  if (ids.length === 0) return out;

  const supabase = await createClient();
  const res = await asAny(supabase)
    .from("work_tasks")
    .select("id, projects(organization_id), work_objects(organization_id)")
    .in("id", ids);
  if (res.error) return out;

  type Row = {
    id: string;
    projects: { organization_id: string | null } | null;
    work_objects: { organization_id: string | null } | null;
  };
  for (const row of (res.data ?? []) as Row[]) {
    const viaProject = row.projects?.organization_id ?? null;
    const viaObject = row.work_objects?.organization_id ?? null;
    if (viaProject && viaObject && viaProject !== viaObject) continue;
    const org = viaProject ?? viaObject;
    if (org) out.set(row.id, org);
  }
  return out;
}
