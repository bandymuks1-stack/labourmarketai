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
  parseWorkflowApproverRule,
  parseWorkflowEscalationEnabled,
  resolveApproverCount,
  type WorkflowApproverSlotRow,
  type WorkflowDefinitionRow,
  type WorkflowInstanceRow,
  type WorkflowInstanceStepRow,
  type WorkflowOrgApproverContext,
  type WorkflowTemplateAdminRow,
  type WorkflowTransitionRow,
  type WorkflowVersionRow,
  type WorkflowVersionStepRow,
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

export type WorkflowTemplateAdminResult =
  | { readonly status: "not-authed" }
  | { readonly status: "needs-migration" }
  | {
      readonly status: "ok";
      /** Every template of the given organizations, newest definition first. */
      readonly templates: readonly WorkflowTemplateAdminRow[];
      /** Active members per organization — the pick-list the "specific
       *  people" rule authors from (no email→profile oracle anywhere). */
      readonly members: ReadonlyMap<
        string,
        readonly {
          readonly profileId: string;
          readonly role: string;
          readonly label: string;
        }[]
      >;
      readonly error: string | null;
    };

/**
 * Template administration read (workflow template management v1).
 *
 * One bounded, RLS-scoped pass over the definition family plus the two
 * membership truths, assembling — per template — the version history, the
 * steps of the version NEW instances would use, and how many approvers each
 * step rule resolves to in that organization today.
 *
 * It reads the ENGINE's definition tables only. It never reads or touches
 * workflow_instances / _instance_steps / _instance_approvers: a running
 * request carries its own step snapshot and its own resolved approver slots
 * and is unaffected by anything this panel can do.
 */
export async function getWorkflowTemplateAdministration(
  organizationIds: readonly string[],
): Promise<WorkflowTemplateAdminResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "not-authed" };

  const orgIds = [...new Set(organizationIds.filter((id) => UUID_RX.test(id)))];
  if (orgIds.length === 0) {
    return { status: "ok", templates: [], members: new Map(), error: null };
  }

  const defRes = await asAny(supabase)
    .from("workflow_definitions")
    .select(
      "id, organization_id, slug, name, context_entity_type, is_active, created_at",
    )
    .in("organization_id", orgIds)
    .order("created_at", { ascending: false })
    .limit(WORKFLOW_READ_LIMIT);
  if (defRes.error) {
    if (isWorkflowMigrationMissingCode(defRes.error.code)) {
      return { status: "needs-migration" };
    }
    return {
      status: "ok",
      templates: [],
      members: new Map(),
      error: String(defRes.error.message ?? "read failed"),
    };
  }
  const defs = (defRes.data ?? []) as RawRow[];

  // The two membership truths behind approver resolution. Both are
  // RLS-scoped: an org owner/admin reads their own org's rows, nobody else
  // sees anything. A read failure degrades to an empty context — the panel
  // then shows the honest zero-approver warning rather than a wrong number.
  const [memberRes, engagementRes] = await Promise.all([
    asAny(supabase)
      .from("company_memberships")
      .select(
        "profile_id, organization_id, role, profiles!company_memberships_profile_id_fkey(full_name, email)",
      )
      .in("organization_id", orgIds)
      .eq("status", "active")
      .limit(WORKFLOW_READ_LIMIT * 5),
    asAny(supabase)
      .from("engagement_contexts")
      .select("profile_id, organization_id")
      .in("organization_id", orgIds)
      .eq("status", "active")
      .limit(WORKFLOW_READ_LIMIT * 5),
  ]);

  const membersByOrg = new Map<
    string,
    { profileId: string; role: string; label: string }[]
  >();
  for (const raw of (memberRes.error ? [] : memberRes.data ?? []) as RawRow[]) {
    const orgId = String(raw.organization_id);
    const profile = (raw.profiles ?? null) as {
      full_name?: string | null;
      email?: string | null;
    } | null;
    const list = membersByOrg.get(orgId) ?? [];
    list.push({
      profileId: String(raw.profile_id),
      role: String(raw.role ?? ""),
      label: String(profile?.full_name ?? profile?.email ?? "").trim(),
    });
    membersByOrg.set(orgId, list);
  }
  const engagementsByOrg = new Map<string, string[]>();
  for (const raw of (engagementRes.error
    ? []
    : engagementRes.data ?? []) as RawRow[]) {
    const orgId = String(raw.organization_id);
    const list = engagementsByOrg.get(orgId) ?? [];
    list.push(String(raw.profile_id));
    engagementsByOrg.set(orgId, list);
  }
  const approverContext = new Map<string, WorkflowOrgApproverContext>();
  for (const orgId of orgIds) {
    approverContext.set(orgId, {
      members: (membersByOrg.get(orgId) ?? []).map((m) => ({
        profileId: m.profileId,
        role: m.role,
      })),
      engagementProfileIds: engagementsByOrg.get(orgId) ?? [],
    });
  }

  if (defs.length === 0) {
    return { status: "ok", templates: [], members: membersByOrg, error: null };
  }

  const defIds = defs.map((d) => String(d.id));
  const verRes = await asAny(supabase)
    .from("workflow_definition_versions")
    .select("id, definition_id, version, published_at")
    .in("definition_id", defIds)
    .order("version", { ascending: false })
    .limit(WORKFLOW_READ_LIMIT * 5);
  const versionsByDef = new Map<string, WorkflowVersionRow[]>();
  for (const raw of (verRes.error ? [] : verRes.data ?? []) as RawRow[]) {
    const defId = String(raw.definition_id);
    const list = versionsByDef.get(defId) ?? [];
    list.push({
      id: String(raw.id),
      definitionId: defId,
      version: Number(raw.version),
      publishedAt: (raw.published_at as string | null) ?? null,
    });
    versionsByDef.set(defId, list);
  }

  // The version NEW instances would use = the highest PUBLISHED one (the
  // engine's own `order by version desc limit 1` over published versions).
  // With none published nothing is in force; the newest DRAFT is shown
  // instead, clearly labelled as not yet in use.
  const effectiveVersionIds: string[] = [];
  const effectiveByDef = new Map<
    string,
    { id: string; isDraft: boolean; publishedVersion: number | null }
  >();
  for (const defId of defIds) {
    const versions = (versionsByDef.get(defId) ?? [])
      .slice()
      .sort((a, b) => b.version - a.version);
    const published = versions.find((v) => v.publishedAt !== null) ?? null;
    const chosen = published ?? versions[0] ?? null;
    if (!chosen) continue;
    effectiveVersionIds.push(chosen.id);
    effectiveByDef.set(defId, {
      id: chosen.id,
      isDraft: published === null,
      publishedVersion: published?.version ?? null,
    });
  }

  const stepsByVersion = new Map<string, WorkflowVersionStepRow[]>();
  if (effectiveVersionIds.length > 0) {
    const stepRes = await asAny(supabase)
      .from("workflow_version_steps")
      .select(
        "id, version_id, step_order, name, approval_mode, approver_rule, deadline_hours, escalation_rule",
      )
      .in("version_id", effectiveVersionIds)
      .order("step_order", { ascending: true })
      .limit(WORKFLOW_READ_LIMIT * 10);
    for (const raw of (stepRes.error ? [] : stepRes.data ?? []) as RawRow[]) {
      const mode = String(raw.approval_mode ?? "");
      if (!isValidWorkflowApprovalMode(mode)) continue;
      const versionId = String(raw.version_id);
      const list = stepsByVersion.get(versionId) ?? [];
      list.push({
        id: String(raw.id),
        versionId,
        stepOrder: Number(raw.step_order),
        name: String(raw.name ?? ""),
        approvalMode: mode,
        rule: parseWorkflowApproverRule(raw.approver_rule),
        deadlineHours:
          raw.deadline_hours === null || raw.deadline_hours === undefined
            ? null
            : Number(raw.deadline_hours),
        escalationEnabled: parseWorkflowEscalationEnabled(raw.escalation_rule),
      });
      stepsByVersion.set(versionId, list);
    }
  }

  const templates: WorkflowTemplateAdminRow[] = [];
  for (const raw of defs) {
    const ctx = String(raw.context_entity_type ?? "");
    if (!isValidWorkflowContextEntityType(ctx)) continue;
    const defId = String(raw.id);
    const orgId = String(raw.organization_id);
    const effective = effectiveByDef.get(defId) ?? null;
    const versions = (versionsByDef.get(defId) ?? [])
      .slice()
      .sort((a, b) => b.version - a.version);
    const steps = effective ? stepsByVersion.get(effective.id) ?? [] : [];
    const orgCtx = approverContext.get(orgId) ?? {
      members: [],
      engagementProfileIds: [],
    };
    const definition: WorkflowDefinitionRow = {
      id: defId,
      organizationId: orgId,
      slug: String(raw.slug ?? ""),
      name: String(raw.name ?? ""),
      contextEntityType: ctx,
      isActive: raw.is_active === true,
      latestVersionId: versions[0]?.id ?? null,
      latestVersionPublished: (versions[0]?.publishedAt ?? null) !== null,
      stepCount: steps.length,
    };
    templates.push({
      definition,
      versions,
      publishedVersion: effective?.publishedVersion ?? null,
      effectiveVersionId: effective?.id ?? null,
      effectiveVersionIsDraft: effective?.isDraft ?? false,
      steps: steps.map((s) => ({
        ...s,
        resolved: resolveApproverCount(s.rule, orgCtx),
      })),
    });
  }

  return { status: "ok", templates, members: membersByOrg, error: null };
}
