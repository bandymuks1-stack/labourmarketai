import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";

/**
 * Workflow & Approval Engine read service (canonical engine v1).
 *
 * Reads ONLY the new `workflow_*` tables with the caller's RLS-scoped client.
 * RLS lets an instance family row be read by its requester, its resolved
 * approvers (and delegates), the org's governance owner/admin and platform
 * admins — this module never widens that; it only narrows ("my inbox" = my
 * own undecided slots).
 *
 * INTERNAL ONLY: this layer never sends anything anywhere — no email, no
 * SMS, no push, no webhook, no outbound call of any kind.
 *
 * Honest degradation: while the human-gated engine migration is not applied
 * the reads see 42P01 and report { status: "needs-migration" } — the
 * approvals section then shows the calm "not available yet" state and no
 * request is faked.
 */

import {
  WORKFLOW_READ_LIMIT,
  isValidWorkflowApprovalMode,
  isValidWorkflowContextEntityType,
  isValidWorkflowInstanceStatus,
  isValidWorkflowStepStatus,
  isWorkflowMigrationMissingCode,
  type WorkflowApproverSlotRow,
  type WorkflowDefinitionRow,
  type WorkflowInstanceRow,
  type WorkflowInstanceStepRow,
  type WorkflowTransitionRow,
} from "@/lib/approvals/approvals-model";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(supabase: SupabaseClient): any {
  return supabase;
}

const UUID_RX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const INSTANCE_COLUMNS =
  "id, organization_id, version_id, context_entity_type, context_entity_id, requester_profile_id, title, status, current_step_order, created_at, completed_at";
const STEP_COLUMNS =
  "id, instance_id, step_order, name, approval_mode, status, deadline_at, activated_at, completed_at";
const SLOT_COLUMNS =
  "id, instance_step_id, instance_id, approver_profile_id, delegated_to_profile_id, decision, decided_at, reason";
const TRANSITION_COLUMNS =
  "id, instance_id, actor_profile_id, action, step_order, reason, created_at";

type RawRow = Record<string, unknown>;

function toInstance(r: RawRow): WorkflowInstanceRow | null {
  const status = String(r.status ?? "");
  const ctx = String(r.context_entity_type ?? "");
  if (!isValidWorkflowInstanceStatus(status)) return null;
  if (!isValidWorkflowContextEntityType(ctx)) return null;
  return {
    id: String(r.id),
    organizationId: String(r.organization_id),
    versionId: String(r.version_id),
    contextEntityType: ctx,
    contextEntityId: (r.context_entity_id as string | null) ?? null,
    requesterProfileId: String(r.requester_profile_id),
    title: String(r.title ?? ""),
    status,
    currentStepOrder:
      r.current_step_order === null || r.current_step_order === undefined
        ? null
        : Number(r.current_step_order),
    createdAt: String(r.created_at),
    completedAt: (r.completed_at as string | null) ?? null,
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

export type ApprovalsOverviewResult =
  | { readonly status: "not-authed" }
  | { readonly status: "needs-migration" }
  | {
      readonly status: "ok";
      /** Pending instances where I hold an UNDECIDED slot on the current
       *  decidable (active or escalated) step. */
      readonly inbox: readonly {
        readonly instance: WorkflowInstanceRow;
        readonly step: WorkflowInstanceStepRow;
        readonly mySlot: WorkflowApproverSlotRow;
      }[];
      /** Instances I requested (newest first). */
      readonly myRequests: readonly WorkflowInstanceRow[];
      /** Pending instances of orgs I administer, excluding rows already in
       *  the inbox / my own requests (RLS grants the wide read; this is a
       *  presentation split, not an authority claim). */
      readonly orgPending: readonly WorkflowInstanceRow[];
      /** Timeline data for every instance listed above. */
      readonly steps: ReadonlyMap<string, readonly WorkflowInstanceStepRow[]>;
      readonly slots: ReadonlyMap<string, readonly WorkflowApproverSlotRow[]>;
      readonly transitions: ReadonlyMap<
        string,
        readonly WorkflowTransitionRow[]
      >;
      readonly error: string | null;
    };

/** One bounded, RLS-scoped pass building everything the approvals section
 *  renders. Never throws; never fabricates. */
export async function getApprovalsOverview(
  adminOrganizationIds: readonly string[],
): Promise<ApprovalsOverviewResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "not-authed" };

  // 1. My undecided slots (approver or delegate).
  const slotRes = await asAny(supabase)
    .from("workflow_instance_approvers")
    .select(SLOT_COLUMNS)
    .or(
      `approver_profile_id.eq.${user.id},delegated_to_profile_id.eq.${user.id}`,
    )
    .is("decision", null)
    .limit(WORKFLOW_READ_LIMIT);
  if (slotRes.error) {
    if (isWorkflowMigrationMissingCode(slotRes.error.code)) {
      return { status: "needs-migration" };
    }
    return {
      status: "ok",
      inbox: [],
      myRequests: [],
      orgPending: [],
      steps: new Map(),
      slots: new Map(),
      transitions: new Map(),
      error: String(slotRes.error.message ?? "read failed"),
    };
  }
  const mySlots = ((slotRes.data ?? []) as RawRow[]).map(toSlot);

  // 2. My own requests.
  const myReqRes = await asAny(supabase)
    .from("workflow_instances")
    .select(INSTANCE_COLUMNS)
    .eq("requester_profile_id", user.id)
    .order("created_at", { ascending: false })
    .limit(WORKFLOW_READ_LIMIT);
  if (myReqRes.error && isWorkflowMigrationMissingCode(myReqRes.error.code)) {
    return { status: "needs-migration" };
  }
  const myRequests = ((myReqRes.data ?? []) as RawRow[])
    .map(toInstance)
    .filter((i): i is WorkflowInstanceRow => i !== null);

  // 3. Pending instances of orgs I administer (bounded; RLS re-checks).
  const validOrgIds = adminOrganizationIds.filter((id) => UUID_RX.test(id));
  let orgPendingAll: WorkflowInstanceRow[] = [];
  if (validOrgIds.length > 0) {
    const orgRes = await asAny(supabase)
      .from("workflow_instances")
      .select(INSTANCE_COLUMNS)
      .in("organization_id", validOrgIds)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(WORKFLOW_READ_LIMIT);
    if (!orgRes.error) {
      orgPendingAll = ((orgRes.data ?? []) as RawRow[])
        .map(toInstance)
        .filter((i): i is WorkflowInstanceRow => i !== null);
    }
  }

  // 4. Instances behind my slots.
  const slotInstanceIds = [...new Set(mySlots.map((s) => s.instanceId))];
  let slotInstances: WorkflowInstanceRow[] = [];
  if (slotInstanceIds.length > 0) {
    const res = await asAny(supabase)
      .from("workflow_instances")
      .select(INSTANCE_COLUMNS)
      .in("id", slotInstanceIds)
      .eq("status", "pending")
      .limit(WORKFLOW_READ_LIMIT);
    if (!res.error) {
      slotInstances = ((res.data ?? []) as RawRow[])
        .map(toInstance)
        .filter((i): i is WorkflowInstanceRow => i !== null);
    }
  }

  // 5. Timeline data for every listed instance, three bounded queries.
  const allIds = [
    ...new Set([
      ...slotInstanceIds,
      ...myRequests.map((i) => i.id),
      ...orgPendingAll.map((i) => i.id),
    ]),
  ].slice(0, WORKFLOW_READ_LIMIT);

  const steps = new Map<string, WorkflowInstanceStepRow[]>();
  const slots = new Map<string, WorkflowApproverSlotRow[]>();
  const transitions = new Map<string, WorkflowTransitionRow[]>();
  if (allIds.length > 0) {
    const [stepRes, allSlotRes, trRes] = await Promise.all([
      asAny(supabase)
        .from("workflow_instance_steps")
        .select(STEP_COLUMNS)
        .in("instance_id", allIds)
        .order("step_order", { ascending: true })
        .limit(WORKFLOW_READ_LIMIT * 5),
      asAny(supabase)
        .from("workflow_instance_approvers")
        .select(SLOT_COLUMNS)
        .in("instance_id", allIds)
        .limit(WORKFLOW_READ_LIMIT * 10),
      asAny(supabase)
        .from("workflow_transitions")
        .select(TRANSITION_COLUMNS)
        .in("instance_id", allIds)
        .order("created_at", { ascending: true })
        .limit(WORKFLOW_READ_LIMIT * 10),
    ]);
    for (const raw of (stepRes.error ? [] : stepRes.data ?? []) as RawRow[]) {
      const row = toStep(raw);
      if (!row) continue;
      const list = steps.get(row.instanceId) ?? [];
      list.push(row);
      steps.set(row.instanceId, list);
    }
    for (const raw of (allSlotRes.error ? [] : allSlotRes.data ?? []) as RawRow[]) {
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

  // 6. Assemble the inbox: my undecided slot on the CURRENT decidable step.
  const instanceById = new Map(slotInstances.map((i) => [i.id, i]));
  const inbox: {
    instance: WorkflowInstanceRow;
    step: WorkflowInstanceStepRow;
    mySlot: WorkflowApproverSlotRow;
  }[] = [];
  for (const slot of mySlots) {
    const instance = instanceById.get(slot.instanceId);
    if (!instance || instance.status !== "pending") continue;
    const step = (steps.get(slot.instanceId) ?? []).find(
      (s) => s.id === slot.instanceStepId,
    );
    if (!step) continue;
    if (step.status !== "active" && step.status !== "escalated") continue;
    if (step.stepOrder !== instance.currentStepOrder) continue;
    inbox.push({ instance, step, mySlot: slot });
  }

  const inboxIds = new Set(inbox.map((e) => e.instance.id));
  const orgPending = orgPendingAll.filter(
    (i) => !inboxIds.has(i.id) && i.requesterProfileId !== user.id,
  );

  return {
    status: "ok",
    inbox,
    myRequests,
    orgPending,
    steps,
    slots,
    transitions,
    error: null,
  };
}

export type WorkflowDefinitionsResult =
  | { readonly status: "not-authed" }
  | { readonly status: "needs-migration" }
  | {
      readonly status: "ok";
      readonly definitions: readonly WorkflowDefinitionRow[];
      readonly error: string | null;
    };

/** Every definition the caller may read (RLS: active org members), with the
 *  latest version's publish state and step count. */
export async function listVisibleWorkflowDefinitions(): Promise<WorkflowDefinitionsResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "not-authed" };

  const defRes = await asAny(supabase)
    .from("workflow_definitions")
    .select("id, organization_id, slug, name, context_entity_type, is_active")
    .order("created_at", { ascending: false })
    .limit(WORKFLOW_READ_LIMIT);
  if (defRes.error) {
    if (isWorkflowMigrationMissingCode(defRes.error.code)) {
      return { status: "needs-migration" };
    }
    return {
      status: "ok",
      definitions: [],
      error: String(defRes.error.message ?? "read failed"),
    };
  }
  const defs = (defRes.data ?? []) as RawRow[];
  if (defs.length === 0) {
    return { status: "ok", definitions: [], error: null };
  }

  const defIds = defs.map((d) => String(d.id));
  const [verRes, stepCountRes] = await Promise.all([
    asAny(supabase)
      .from("workflow_definition_versions")
      .select("id, definition_id, version, published_at")
      .in("definition_id", defIds)
      .order("version", { ascending: false })
      .limit(WORKFLOW_READ_LIMIT * 3),
    asAny(supabase)
      .from("workflow_version_steps")
      .select("version_id")
      .limit(WORKFLOW_READ_LIMIT * 10),
  ]);

  const latestByDef = new Map<
    string,
    { id: string; published: boolean }
  >();
  for (const raw of (verRes.error ? [] : verRes.data ?? []) as RawRow[]) {
    const defId = String(raw.definition_id);
    if (!latestByDef.has(defId)) {
      latestByDef.set(defId, {
        id: String(raw.id),
        published: raw.published_at !== null && raw.published_at !== undefined,
      });
    }
  }
  const stepCountByVersion = new Map<string, number>();
  for (const raw of (stepCountRes.error ? [] : stepCountRes.data ?? []) as RawRow[]) {
    const vid = String(raw.version_id);
    stepCountByVersion.set(vid, (stepCountByVersion.get(vid) ?? 0) + 1);
  }

  const definitions: WorkflowDefinitionRow[] = [];
  for (const raw of defs) {
    const ctx = String(raw.context_entity_type ?? "");
    if (!isValidWorkflowContextEntityType(ctx)) continue;
    const latest = latestByDef.get(String(raw.id)) ?? null;
    definitions.push({
      id: String(raw.id),
      organizationId: String(raw.organization_id),
      slug: String(raw.slug ?? ""),
      name: String(raw.name ?? ""),
      contextEntityType: ctx,
      isActive: raw.is_active === true,
      latestVersionId: latest?.id ?? null,
      latestVersionPublished: latest?.published ?? false,
      stepCount: latest ? stepCountByVersion.get(latest.id) ?? 0 : 0,
    });
  }
  return { status: "ok", definitions, error: null };
}
