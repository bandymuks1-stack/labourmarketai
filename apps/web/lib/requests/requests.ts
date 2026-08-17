import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import {
  EMPLOYEE_REQUEST_READ_LIMIT,
  isEmployeeRequestMigrationMissingCode,
  isValidEmployeeRequestStatus,
  isValidEmployeeRequestType,
  resolveDisplayStatus,
  type OrgRequestsFilterInput,
  type EmployeeRequestRow,
} from "@/lib/requests/requests-model";
import {
  isValidWorkflowApprovalMode,
  isValidWorkflowStepStatus,
  type WorkflowApproverSlotRow,
  type WorkflowInstanceStepRow,
  type WorkflowTransitionRow,
} from "@/lib/approvals/approvals-model";

/**
 * Typed employee requests — read service (v1). Reads the `employee_requests`
 * register and the engine's `workflow_*` rows with the caller's RLS-scoped
 * client; never widens visibility.
 *
 * MIRROR-SYNC SEMANTICS (the module's one subtle rule): the engine instance
 * is the truth. Engine-side completions (approvals-inbox decisions, org
 * cancel) do not touch the register — there is deliberately NO trigger on
 * engine tables. This reader repairs the mirror on read: pending register
 * rows get a bounded `sync_employee_request_status_v1` pass (definer copies
 * engine → mirror), and rows whose instance the caller can read are ALSO
 * overlaid with the instance status directly, so the display is engine
 * truth even if a repair write failed.
 *
 * INTERNAL ONLY: no email, no SMS, no push, no webhook, no outbound call.
 *
 * Honest degradation: while the human-gated migration is unapplied the reads
 * see 42P01 and report { status: "needs-migration" } — the requests section
 * shows the calm "not available yet" state and nothing is faked.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(supabase: SupabaseClient): any {
  return supabase;
}

const REQUEST_COLUMNS =
  "id, organization_id, requester_profile_id, request_type, title, details, date_from, date_to, status, workflow_instance_id, created_at";
const STEP_COLUMNS =
  "id, instance_id, step_order, name, approval_mode, status, deadline_at, activated_at, completed_at";
const SLOT_COLUMNS =
  "id, instance_step_id, instance_id, approver_profile_id, delegated_to_profile_id, decision, decided_at, reason";
const TRANSITION_COLUMNS =
  "id, instance_id, actor_profile_id, action, step_order, reason, created_at";

/** Bounded read-repair per render — enough for every realistic list. */
const SYNC_REPAIR_LIMIT = 25;

type RawRow = Record<string, unknown>;

function toRequest(r: RawRow): EmployeeRequestRow | null {
  const type = String(r.request_type ?? "");
  const status = String(r.status ?? "");
  if (!isValidEmployeeRequestType(type)) return null;
  if (!isValidEmployeeRequestStatus(status)) return null;
  return {
    id: String(r.id),
    organizationId: String(r.organization_id),
    requesterProfileId: String(r.requester_profile_id),
    requestType: type,
    title: String(r.title ?? ""),
    details: (r.details as string | null) ?? null,
    dateFrom: (r.date_from as string | null) ?? null,
    dateTo: (r.date_to as string | null) ?? null,
    status,
    workflowInstanceId: (r.workflow_instance_id as string | null) ?? null,
    createdAt: String(r.created_at),
  };
}

function toStep(r: RawRow): WorkflowInstanceStepRow | null {
  const status = String(r.status ?? "");
  const mode = String(r.approval_mode ?? "");
  if (!isValidWorkflowStepStatus(status)) return null;
  if (!isValidWorkflowApprovalMode(mode)) return null;
  return {
    id: String(r.id),
    instanceId: String(r.instance_id),
    stepOrder: Number(r.step_order),
    name: String(r.name ?? ""),
    approvalMode: mode,
    status,
    deadlineAt: (r.deadline_at as string | null) ?? null,
    activatedAt: (r.activated_at as string | null) ?? null,
    completedAt: (r.completed_at as string | null) ?? null,
  };
}

function toSlot(r: RawRow): WorkflowApproverSlotRow {
  const decision = (r.decision as string | null) ?? null;
  return {
    id: String(r.id),
    instanceStepId: String(r.instance_step_id),
    instanceId: String(r.instance_id),
    approverProfileId: String(r.approver_profile_id),
    delegatedToProfileId: (r.delegated_to_profile_id as string | null) ?? null,
    decision:
      decision === "approved" || decision === "rejected" ? decision : null,
    decidedAt: (r.decided_at as string | null) ?? null,
    reason: (r.reason as string | null) ?? null,
  };
}

function toTransition(r: RawRow): WorkflowTransitionRow {
  return {
    id: String(r.id),
    instanceId: String(r.instance_id),
    actorProfileId: (r.actor_profile_id as string | null) ?? null,
    action: String(r.action ?? "") as WorkflowTransitionRow["action"],
    stepOrder:
      r.step_order === null || r.step_order === undefined
        ? null
        : Number(r.step_order),
    reason: (r.reason as string | null) ?? null,
    createdAt: String(r.created_at),
  };
}

/** Bounded read-repair: engine → mirror, via the gated definer command. */
async function repairPendingMirrors(
  supabase: SupabaseClient,
  rows: readonly EmployeeRequestRow[],
): Promise<boolean> {
  const candidates = rows
    .filter((r) => r.status === "pending" && r.workflowInstanceId !== null)
    .slice(0, SYNC_REPAIR_LIMIT);
  if (candidates.length === 0) return false;
  const results = await Promise.all(
    candidates.map((r) =>
      asAny(supabase)
        .rpc("sync_employee_request_status_v1", { p_request_id: r.id })
        .then(
          (res: { data?: unknown }) => String(res.data ?? ""),
          () => "",
        ),
    ),
  );
  return results.includes("synced");
}

/** Overlay the engine instance status wherever the caller can read it. */
async function overlayEngineStatus(
  supabase: SupabaseClient,
  rows: EmployeeRequestRow[],
): Promise<EmployeeRequestRow[]> {
  const instanceIds = [
    ...new Set(
      rows
        .map((r) => r.workflowInstanceId)
        .filter((id): id is string => id !== null),
    ),
  ];
  if (instanceIds.length === 0) return rows;
  const res = await asAny(supabase)
    .from("workflow_instances")
    .select("id, status")
    .in("id", instanceIds)
    .limit(EMPLOYEE_REQUEST_READ_LIMIT);
  if (res.error) return rows;
  const engineStatus = new Map<string, string>(
    ((res.data ?? []) as RawRow[]).map((r) => [
      String(r.id),
      String(r.status ?? ""),
    ]),
  );
  return rows.map((r) => {
    if (!r.workflowInstanceId) return r;
    const { status } = resolveDisplayStatus(
      r.status,
      engineStatus.get(r.workflowInstanceId),
    );
    return status === r.status ? r : { ...r, status };
  });
}

export type MemberOrganization = {
  readonly id: string;
  readonly name: string | null;
};

/**
 * Organizations the caller belongs to over BOTH membership truths — the
 * audience picker for filing a request. Own rows only; RLS re-checks.
 */
export async function listMyMemberOrganizations(): Promise<
  readonly MemberOrganization[]
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const [memRes, engRes] = await Promise.all([
    asAny(supabase)
      .from("company_memberships")
      .select("organization_id, status, organizations(display_name, legal_name)")
      .eq("profile_id", user.id)
      .eq("status", "active")
      .limit(50),
    asAny(supabase)
      .from("engagement_contexts")
      .select("organization_id, status, organizations(display_name, legal_name)")
      .eq("profile_id", user.id)
      .eq("status", "active")
      .limit(50),
  ]);

  const byId = new Map<string, MemberOrganization>();
  for (const res of [memRes, engRes]) {
    if (res.error) continue;
    for (const raw of (res.data ?? []) as (RawRow & {
      organizations?: {
        display_name?: string | null;
        legal_name?: string | null;
      } | null;
    })[]) {
      const id = String(raw.organization_id ?? "");
      if (!id || byId.has(id)) continue;
      byId.set(id, {
        id,
        name:
          raw.organizations?.display_name ??
          raw.organizations?.legal_name ??
          null,
      });
    }
  }
  return [...byId.values()];
}

export type MyEmployeeRequestsResult =
  | { readonly status: "not-authed" }
  | { readonly status: "needs-migration" }
  | {
      readonly status: "ok";
      readonly requests: readonly EmployeeRequestRow[];
      /** Timeline data (engine rows, RLS-scoped) per instance id. */
      readonly steps: ReadonlyMap<string, readonly WorkflowInstanceStepRow[]>;
      readonly slots: ReadonlyMap<string, readonly WorkflowApproverSlotRow[]>;
      readonly transitions: ReadonlyMap<
        string,
        readonly WorkflowTransitionRow[]
      >;
    };

/** The signed-in person's own requests, newest first, mirror repaired and
 *  overlaid with engine truth, with full engine timeline data. */
export async function getMyEmployeeRequests(): Promise<MyEmployeeRequestsResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "not-authed" };

  const res = await asAny(supabase)
    .from("employee_requests")
    .select(REQUEST_COLUMNS)
    .eq("requester_profile_id", user.id)
    .order("created_at", { ascending: false })
    .limit(EMPLOYEE_REQUEST_READ_LIMIT);
  if (res.error) {
    if (isEmployeeRequestMigrationMissingCode(res.error.code)) {
      return { status: "needs-migration" };
    }
    return {
      status: "ok",
      requests: [],
      steps: new Map(),
      slots: new Map(),
      transitions: new Map(),
    };
  }

  let rows = ((res.data ?? []) as RawRow[])
    .map(toRequest)
    .filter((r): r is EmployeeRequestRow => r !== null);

  // Read-repair, then re-read the repaired mirrors in one bounded pass.
  if (await repairPendingMirrors(supabase, rows)) {
    const again = await asAny(supabase)
      .from("employee_requests")
      .select(REQUEST_COLUMNS)
      .eq("requester_profile_id", user.id)
      .order("created_at", { ascending: false })
      .limit(EMPLOYEE_REQUEST_READ_LIMIT);
    if (!again.error) {
      rows = ((again.data ?? []) as RawRow[])
        .map(toRequest)
        .filter((r): r is EmployeeRequestRow => r !== null);
    }
  }
  rows = await overlayEngineStatus(supabase, rows);

  // Timeline rows for the listed instances (three bounded queries).
  const instanceIds = [
    ...new Set(
      rows
        .map((r) => r.workflowInstanceId)
        .filter((id): id is string => id !== null),
    ),
  ].slice(0, EMPLOYEE_REQUEST_READ_LIMIT);
  const steps = new Map<string, WorkflowInstanceStepRow[]>();
  const slots = new Map<string, WorkflowApproverSlotRow[]>();
  const transitions = new Map<string, WorkflowTransitionRow[]>();
  if (instanceIds.length > 0) {
    const [stepRes, slotRes, trRes] = await Promise.all([
      asAny(supabase)
        .from("workflow_instance_steps")
        .select(STEP_COLUMNS)
        .in("instance_id", instanceIds)
        .order("step_order", { ascending: true })
        .limit(EMPLOYEE_REQUEST_READ_LIMIT * 5),
      asAny(supabase)
        .from("workflow_instance_approvers")
        .select(SLOT_COLUMNS)
        .in("instance_id", instanceIds)
        .limit(EMPLOYEE_REQUEST_READ_LIMIT * 10),
      asAny(supabase)
        .from("workflow_transitions")
        .select(TRANSITION_COLUMNS)
        .in("instance_id", instanceIds)
        .order("created_at", { ascending: true })
        .limit(EMPLOYEE_REQUEST_READ_LIMIT * 10),
    ]);
    for (const raw of (stepRes.error ? [] : stepRes.data ?? []) as RawRow[]) {
      const row = toStep(raw);
      if (!row) continue;
      const list = steps.get(row.instanceId) ?? [];
      list.push(row);
      steps.set(row.instanceId, list);
    }
    for (const raw of (slotRes.error ? [] : slotRes.data ?? []) as RawRow[]) {
      const row = toSlot(raw);
      const list = slots.get(row.instanceId) ?? [];
      list.push(row);
      slots.set(row.instanceId, list);
    }
    for (const raw of (trRes.error ? [] : trRes.data ?? []) as RawRow[]) {
      const row = toTransition(raw);
      const list = transitions.get(row.instanceId) ?? [];
      list.push(row);
      transitions.set(row.instanceId, list);
    }
  }

  return { status: "ok", requests: rows, steps, slots, transitions };
}

/**
 * The latest version of an org's conventional request template (RLS-scoped
 * lookup for the seed helper; the engine's publish command re-checks
 * authority server-side). Lives here so engine-table reads stay confined to
 * the read services (workflow-engine guard).
 */
export async function findConventionalTemplateVersion(
  organizationId: string,
  slug: string,
): Promise<{ versionId: string; published: boolean } | null> {
  const supabase = await createClient();
  const defRes = await asAny(supabase)
    .from("workflow_definitions")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("slug", slug)
    .maybeSingle();
  if (defRes.error || !defRes.data?.id) return null;
  const verRes = await asAny(supabase)
    .from("workflow_definition_versions")
    .select("id, published_at")
    .eq("definition_id", defRes.data.id)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (verRes.error || !verRes.data?.id) return null;
  return {
    versionId: String(verRes.data.id),
    published:
      verRes.data.published_at !== null &&
      verRes.data.published_at !== undefined,
  };
}

export type OrgEmployeeRequestsResult =
  | { readonly status: "needs-migration" }
  | {
      readonly status: "ok";
      readonly requests: readonly EmployeeRequestRow[];
    };

/**
 * The requests REGISTER for the given organizations — the org managing
 * roles' list view (RLS: has_org_demand_access re-checks every row). The
 * decide surface stays the EXISTING approvals inbox; this register only
 * lists and filters.
 */
export async function listOrgEmployeeRequests(
  organizationIds: readonly string[],
  filter: OrgRequestsFilterInput = {},
): Promise<OrgEmployeeRequestsResult> {
  if (organizationIds.length === 0) {
    return { status: "ok", requests: [] };
  }
  const supabase = await createClient();

  const buildQuery = () => {
    let q = asAny(supabase)
      .from("employee_requests")
      .select(REQUEST_COLUMNS)
      .in("organization_id", organizationIds as string[])
      .order("created_at", { ascending: false })
      .limit(EMPLOYEE_REQUEST_READ_LIMIT);
    if (filter.status) q = q.eq("status", filter.status);
    if (filter.requestType) q = q.eq("request_type", filter.requestType);
    return q;
  };

  const res = await buildQuery();
  if (res.error) {
    if (isEmployeeRequestMigrationMissingCode(res.error.code)) {
      return { status: "needs-migration" };
    }
    return { status: "ok", requests: [] };
  }
  let rows = ((res.data ?? []) as RawRow[])
    .map(toRequest)
    .filter((r): r is EmployeeRequestRow => r !== null);

  if (await repairPendingMirrors(supabase, rows)) {
    const again = await buildQuery();
    if (!again.error) {
      rows = ((again.data ?? []) as RawRow[])
        .map(toRequest)
        .filter((r): r is EmployeeRequestRow => r !== null);
    }
  }
  rows = await overlayEngineStatus(supabase, rows);
  return { status: "ok", requests: rows };
}
