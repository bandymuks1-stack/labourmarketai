/**
 * Pure Workflow & Approval Engine model (canonical engine v1) — shared by the
 * server read service, the server actions, the guard test and the approvals
 * UI section. No server-only imports, no IO.
 *
 * The model codes against the `workflow_*` contract the SEPARATE, human-gated
 * migration pair proposes (20260817120000_workflow_engine_v1 +
 * 20260817121000_notification_events_v3_workflow_types). Until the lead
 * applies them the read/action layers degrade honestly (the established
 * tasks/finance pattern) — nothing here fakes a request or a decision.
 *
 * HONEST lifecycle only. Escalation is a SAFE STATE: an escalated step is
 * marked and notified, never auto-approved. No AI anywhere in the engine.
 */

export const WORKFLOW_INSTANCE_STATUSES = [
  "pending",
  "approved",
  "rejected",
  "withdrawn",
  "cancelled",
] as const;
export type WorkflowInstanceStatus = (typeof WORKFLOW_INSTANCE_STATUSES)[number];

export const WORKFLOW_STEP_STATUSES = [
  "waiting",
  "active",
  "approved",
  "rejected",
  "skipped",
  "escalated",
] as const;
export type WorkflowStepStatus = (typeof WORKFLOW_STEP_STATUSES)[number];

export const WORKFLOW_APPROVAL_MODES = ["single", "all", "any"] as const;
export type WorkflowApprovalMode = (typeof WORKFLOW_APPROVAL_MODES)[number];

export const WORKFLOW_DECISIONS = ["approved", "rejected"] as const;
export type WorkflowDecision = (typeof WORKFLOW_DECISIONS)[number];

export const WORKFLOW_TRANSITION_ACTIONS = [
  "started",
  "step_activated",
  "approved",
  "rejected",
  "delegated",
  "withdrawn",
  "cancelled",
  "escalated",
  "completed",
] as const;
export type WorkflowTransitionAction =
  (typeof WORKFLOW_TRANSITION_ACTIONS)[number];

export const WORKFLOW_CONTEXT_ENTITY_TYPES = [
  "generic_request",
  "worker_absence",
  "expense",
  "invoice",
  "document_ack",
  "timesheet",
  "procurement",
  "business_trip",
  "management_decision",
  "agreement",
] as const;
export type WorkflowContextEntityType =
  (typeof WORKFLOW_CONTEXT_ENTITY_TYPES)[number];

/** The two approver-rule shapes the v1 authoring form offers. The SQL rule
 *  vocabulary additionally accepts explicit profile lists ('profiles') for
 *  future authoring surfaces. */
export const WORKFLOW_FORM_RULES = ["owner_admin", "requester_manager"] as const;
export type WorkflowFormRule = (typeof WORKFLOW_FORM_RULES)[number];

/** Bounded lengths — mirrored by the gated RPC validation (single contract). */
export const WORKFLOW_TITLE_MIN = 3;
export const WORKFLOW_TITLE_MAX = 160;
export const WORKFLOW_NAME_MIN = 3;
export const WORKFLOW_NAME_MAX = 120;
export const WORKFLOW_STEP_NAME_MIN = 2;
export const WORKFLOW_STEP_NAME_MAX = 120;
export const WORKFLOW_REASON_MAX = 500;
export const WORKFLOW_DETAILS_MAX = 2000;
export const WORKFLOW_DEADLINE_HOURS_MIN = 1;
export const WORKFLOW_DEADLINE_HOURS_MAX = 2160;
export const WORKFLOW_MAX_FORM_STEPS = 3;

/** Bounded reads everywhere — the approvals surfaces never stream unbounded rows. */
export const WORKFLOW_READ_LIMIT = 100;

/**
 * Postgres/PostgREST error codes that mean "the workflow engine migration is
 * not applied yet": missing relation, missing column, missing function, and
 * the PostgREST schema-cache miss for an RPC. The read layer and the actions
 * map ALL of these to the honest "not available yet" state — never a crash.
 */
export const WORKFLOW_MIGRATION_MISSING_ERROR_CODES = [
  "42P01",
  "42703",
  "42883",
  "PGRST202",
] as const;

export function isWorkflowMigrationMissingCode(
  code: string | undefined,
): boolean {
  return (WORKFLOW_MIGRATION_MISSING_ERROR_CODES as readonly string[]).includes(
    code ?? "",
  );
}

export function isValidWorkflowInstanceStatus(
  v: string,
): v is WorkflowInstanceStatus {
  return (WORKFLOW_INSTANCE_STATUSES as readonly string[]).includes(v);
}

export function isValidWorkflowStepStatus(v: string): v is WorkflowStepStatus {
  return (WORKFLOW_STEP_STATUSES as readonly string[]).includes(v);
}

export function isValidWorkflowApprovalMode(
  v: string,
): v is WorkflowApprovalMode {
  return (WORKFLOW_APPROVAL_MODES as readonly string[]).includes(v);
}

export function isValidWorkflowDecision(v: string): v is WorkflowDecision {
  return (WORKFLOW_DECISIONS as readonly string[]).includes(v);
}

export function isValidWorkflowContextEntityType(
  v: string,
): v is WorkflowContextEntityType {
  return (WORKFLOW_CONTEXT_ENTITY_TYPES as readonly string[]).includes(v);
}

export function isValidWorkflowFormRule(v: string): v is WorkflowFormRule {
  return (WORKFLOW_FORM_RULES as readonly string[]).includes(v);
}

/** A step still open for decisions (an escalated step CAN still be decided —
 *  escalation is visibility, never an authority transfer). */
export function isDecidableStepStatus(status: WorkflowStepStatus): boolean {
  return status === "active" || status === "escalated";
}

export type WorkflowInstanceRow = {
  readonly id: string;
  readonly organizationId: string;
  readonly versionId: string;
  readonly contextEntityType: WorkflowContextEntityType;
  readonly contextEntityId: string | null;
  readonly requesterProfileId: string;
  readonly title: string;
  readonly status: WorkflowInstanceStatus;
  readonly currentStepOrder: number | null;
  readonly createdAt: string;
  readonly completedAt: string | null;
};

export type WorkflowInstanceStepRow = {
  readonly id: string;
  readonly instanceId: string;
  readonly stepOrder: number;
  readonly name: string;
  readonly approvalMode: WorkflowApprovalMode;
  readonly status: WorkflowStepStatus;
  readonly deadlineAt: string | null;
  readonly activatedAt: string | null;
  readonly completedAt: string | null;
};

export type WorkflowApproverSlotRow = {
  readonly id: string;
  readonly instanceStepId: string;
  readonly instanceId: string;
  readonly approverProfileId: string;
  readonly delegatedToProfileId: string | null;
  readonly decision: WorkflowDecision | null;
  readonly decidedAt: string | null;
  readonly reason: string | null;
};

export type WorkflowTransitionRow = {
  readonly id: string;
  readonly instanceId: string;
  readonly actorProfileId: string | null;
  readonly action: WorkflowTransitionAction;
  readonly stepOrder: number | null;
  readonly reason: string | null;
  readonly createdAt: string;
};

export type WorkflowDefinitionRow = {
  readonly id: string;
  readonly organizationId: string;
  readonly slug: string;
  readonly name: string;
  readonly contextEntityType: WorkflowContextEntityType;
  readonly isActive: boolean;
  readonly latestVersionId: string | null;
  readonly latestVersionPublished: boolean;
  readonly stepCount: number;
};

/**
 * Pure step-progress derivation for the timeline UI: how many slots have
 * decided, and whether the step is (given its mode) waiting on more people.
 * Mirrors the SQL evaluation exactly:
 *   single/any — the first decision completes the step;
 *   all        — one rejection rejects; approval needs every slot.
 */
export function deriveStepProgress(
  mode: WorkflowApprovalMode,
  decisions: readonly (WorkflowDecision | null)[],
): {
  readonly total: number;
  readonly approved: number;
  readonly rejected: number;
  readonly settled: boolean;
  readonly outcome: WorkflowDecision | null;
} {
  const total = decisions.length;
  const approved = decisions.filter((d) => d === "approved").length;
  const rejected = decisions.filter((d) => d === "rejected").length;
  if (mode === "single" || mode === "any") {
    const first = decisions.find((d) => d !== null) ?? null;
    return { total, approved, rejected, settled: first !== null, outcome: first };
  }
  // 'all'
  if (rejected > 0) {
    return { total, approved, rejected, settled: true, outcome: "rejected" };
  }
  if (total > 0 && approved === total) {
    return { total, approved, rejected, settled: true, outcome: "approved" };
  }
  return { total, approved, rejected, settled: false, outcome: null };
}

/** The honest `?wf=` outcomes the actions can navigate back with. */
export const WORKFLOW_NOTICES = [
  "created",
  "published",
  "started",
  "already_pending",
  "already_published",
  "already_exists",
  "already_decided",
  "approved",
  "rejected",
  "step_approved",
  "recorded",
  "delegated",
  "withdrawn",
  "cancelled",
  "marked_overdue",
  "no_overdue",
  "no_approvers",
  "not_published",
  "not_pending",
  "invalid",
  "invalid_delegate",
  "needs_migration",
  "not_authorized",
  "not_found",
  "limit_reached",
  "error",
] as const;
export type WorkflowNotice = (typeof WORKFLOW_NOTICES)[number];

export function isWorkflowNotice(v: string): v is WorkflowNotice {
  return (WORKFLOW_NOTICES as readonly string[]).includes(v);
}

/** Lowercase slug derived from a template name — mirrors the SQL slug rule
 *  `^[a-z0-9]+(_[a-z0-9]+)*$` (2..60). Returns null when nothing usable
 *  survives normalisation. */
export function workflowSlugFromName(name: string): string | null {
  const slug = name
    .toLowerCase()
    .normalize("NFKD")
    // Strip combining diacritics left by NFKD (e.g. "ū" -> "u" + U+0304).
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60)
    .replace(/_+$/g, "");
  if (slug.length < 2) return null;
  if (!/^[a-z0-9]+(_[a-z0-9]+)*$/.test(slug)) return null;
  return slug;
}
