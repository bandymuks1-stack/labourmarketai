/**
 * Pure Workflow & Approval Engine model (canonical engine v1) — shared by the
 * server read service, the server actions, the guard test and the approvals
 * UI section. No server-only imports, no IO.
 *
 * The model codes against the `workflow_*` contract the SEPARATE, human-gated
 * migration pair proposes (20260817130000_workflow_engine_v1 +
 * 20260817130100_notification_events_v3_workflow_types). Until the lead
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
 *  vocabulary additionally accepts explicit profile lists ('profiles') — the
 *  version authoring panel (template management v1) offers all three. */
export const WORKFLOW_FORM_RULES = ["owner_admin", "requester_manager"] as const;
export type WorkflowFormRule = (typeof WORKFLOW_FORM_RULES)[number];

/** The closed approver-rule vocabulary of the SQL engine, verbatim. */
export const WORKFLOW_RULE_KINDS = [
  "org_role",
  "profiles",
  "requester_manager",
] as const;
export type WorkflowRuleKind = (typeof WORKFLOW_RULE_KINDS)[number];

export function isValidWorkflowRuleKind(v: string): v is WorkflowRuleKind {
  return (WORKFLOW_RULE_KINDS as readonly string[]).includes(v);
}

/** Membership roles an `org_role` rule may name — the engine's own list. */
export const WORKFLOW_RULE_ROLES = [
  "owner",
  "admin",
  "manager",
  "external_manager",
  "member",
] as const;
export type WorkflowRuleRole = (typeof WORKFLOW_RULE_ROLES)[number];

export function isValidWorkflowRuleRole(v: string): v is WorkflowRuleRole {
  return (WORKFLOW_RULE_ROLES as readonly string[]).includes(v);
}

/** The managing roles `requester_manager` resolves over in SQL
 *  (`workflow_resolve_step_approvers_v1`), verbatim — note 'member' is NOT
 *  among them. */
export const WORKFLOW_MANAGING_ROLES = [
  "owner",
  "admin",
  "manager",
  "external_manager",
] as const;

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
/** Rounds the VERSION authoring form (template management v1) offers. The SQL
 *  engine admits 1..20 steps; the form stays deliberately small. */
export const WORKFLOW_MAX_VERSION_STEPS = 5;
/** Versions per definition — mirrors the SQL cap in
 *  `create_workflow_definition_version_v1`. */
export const WORKFLOW_MAX_VERSIONS = 50;

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
  // Template management v1 outcomes.
  "installed",
  "all_skipped",
  "version_created",
  "activated",
  "deactivated",
  "already_active",
  "already_inactive",
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
/**
 * THE DEFAULT TEMPLATE PACK — the exact eight definitions
 * `install_default_workflow_pack_v1` constructs server-side. Mirrored here so
 * the panel can name what the one-click action will create BEFORE it runs,
 * and so a guard test can pin the two lists against each other. The SQL is
 * the authority; this list never travels TO the RPC (the installer takes an
 * organization id and nothing else).
 *
 * EXACTLY ONE `generic_request` entry, deliberately: employee requests
 * resolve by slug (`employee_request_default` fallback) and org document
 * approval resolves by CONTEXT with an unordered `.find()`, so a second
 * seeded generic_request template would make document approval route
 * non-deterministically between two templates.
 */
export const WORKFLOW_DEFAULT_PACK = [
  {
    slug: "timesheet_default",
    contextEntityType: "timesheet",
    deadlineHours: 168,
  },
  {
    slug: "employee_request_default",
    contextEntityType: "generic_request",
    deadlineHours: 168,
  },
  {
    slug: "agreement_default",
    contextEntityType: "agreement",
    deadlineHours: 336,
  },
  {
    slug: "procurement_default",
    contextEntityType: "procurement",
    deadlineHours: 168,
  },
  {
    slug: "business_trip_default",
    contextEntityType: "business_trip",
    deadlineHours: 168,
  },
  { slug: "expense_default", contextEntityType: "expense", deadlineHours: 168 },
  { slug: "invoice_default", contextEntityType: "invoice", deadlineHours: 168 },
  {
    slug: "management_decision_default",
    contextEntityType: "management_decision",
    deadlineHours: 336,
  },
] as const satisfies readonly {
  slug: string;
  contextEntityType: WorkflowContextEntityType;
  deadlineHours: number;
}[];

/** Parsed shape of a stored `approver_rule` jsonb value. `unknown` means the
 *  stored value is outside the closed vocabulary — the UI says so rather than
 *  guessing who would decide. */
export type WorkflowApproverRule =
  | { readonly kind: "org_role"; readonly roles: readonly string[] }
  | { readonly kind: "profiles"; readonly profileIds: readonly string[] }
  | { readonly kind: "requester_manager" }
  | { readonly kind: "unknown" };

export function parseWorkflowApproverRule(raw: unknown): WorkflowApproverRule {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { kind: "unknown" };
  }
  const rec = raw as Record<string, unknown>;
  const kind = String(rec.kind ?? "");
  if (kind === "requester_manager") return { kind: "requester_manager" };
  if (kind === "org_role") {
    const roles = Array.isArray(rec.roles)
      ? rec.roles.map((r) => String(r)).filter(isValidWorkflowRuleRole)
      : [];
    if (roles.length === 0) return { kind: "unknown" };
    return { kind: "org_role", roles };
  }
  if (kind === "profiles") {
    const ids = Array.isArray(rec.profile_ids)
      ? rec.profile_ids.map((r) => String(r)).filter((r) => r.length > 0)
      : [];
    if (ids.length === 0) return { kind: "unknown" };
    return { kind: "profiles", profileIds: ids };
  }
  return { kind: "unknown" };
}

/** Whether a stored `escalation_rule` marks-and-notifies (the ONLY action the
 *  engine admits). Anything else reads as "no escalation configured" rather
 *  than as an unknown automatic behaviour. */
export function parseWorkflowEscalationEnabled(raw: unknown): boolean {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
  return String((raw as Record<string, unknown>).action ?? "") === "mark_escalated";
}

/** A snapshot of one organization's approver-resolution truth, read with the
 *  caller's own RLS-scoped client. */
export type WorkflowOrgApproverContext = {
  /** Active `company_memberships` rows of the organization. */
  readonly members: readonly {
    readonly profileId: string;
    readonly role: string;
  }[];
  /** Profile ids with an ACTIVE `engagement_contexts` row in the org — the
   *  second membership truth the SQL resolver honours for named profiles. */
  readonly engagementProfileIds: readonly string[];
};

/**
 * How many approvers a step rule resolves to in THIS organization, mirroring
 * `workflow_resolve_step_approvers_v1` exactly:
 *
 *   org_role          — distinct ACTIVE members whose role is in `roles`;
 *   profiles          — distinct named ids that hold an ACTIVE membership OR
 *                       an ACTIVE engagement context in the org;
 *   requester_manager — distinct ACTIVE members holding a MANAGING role,
 *                       MINUS the requester.
 *
 * The requester is unknown at template-authoring time, so
 * `requester_manager` is reported as a RANGE: `max` is the managing-member
 * count, `min` subtracts the one seat the requester may occupy. `min === 0`
 * is the honest fail-closed warning — that is the case in which
 * `start_workflow_instance_v1` refuses the submission with `no_approvers`.
 */
export function resolveApproverCount(
  rule: WorkflowApproverRule,
  ctx: WorkflowOrgApproverContext,
): { readonly min: number; readonly max: number; readonly exact: boolean } {
  if (rule.kind === "org_role") {
    const roles = new Set(rule.roles);
    const n = new Set(
      ctx.members.filter((m) => roles.has(m.role)).map((m) => m.profileId),
    ).size;
    return { min: n, max: n, exact: true };
  }
  if (rule.kind === "profiles") {
    const eligible = new Set<string>([
      ...ctx.members.map((m) => m.profileId),
      ...ctx.engagementProfileIds,
    ]);
    const n = new Set(rule.profileIds.filter((id) => eligible.has(id))).size;
    return { min: n, max: n, exact: true };
  }
  if (rule.kind === "requester_manager") {
    const managing = new Set(WORKFLOW_MANAGING_ROLES as readonly string[]);
    const n = new Set(
      ctx.members.filter((m) => managing.has(m.role)).map((m) => m.profileId),
    ).size;
    return { min: Math.max(0, n - 1), max: n, exact: false };
  }
  return { min: 0, max: 0, exact: true };
}

export type WorkflowVersionRow = {
  readonly id: string;
  readonly definitionId: string;
  readonly version: number;
  readonly publishedAt: string | null;
};

export type WorkflowVersionStepRow = {
  readonly id: string;
  readonly versionId: string;
  readonly stepOrder: number;
  readonly name: string;
  readonly approvalMode: WorkflowApprovalMode;
  readonly rule: WorkflowApproverRule;
  readonly deadlineHours: number | null;
  readonly escalationEnabled: boolean;
};

/** One administrable template: the definition, its version history, the
 *  steps of the version NEW instances would use (the highest PUBLISHED one,
 *  falling back to the newest draft), and the live approver resolution. */
export type WorkflowTemplateAdminRow = {
  readonly definition: WorkflowDefinitionRow;
  readonly versions: readonly WorkflowVersionRow[];
  readonly publishedVersion: number | null;
  readonly effectiveVersionId: string | null;
  readonly effectiveVersionIsDraft: boolean;
  readonly steps: readonly (WorkflowVersionStepRow & {
    readonly resolved: ReturnType<typeof resolveApproverCount>;
  })[];
};

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
