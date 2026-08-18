/**
 * Pure Employee Lifecycle model (EC-canonical lifecycle v1) — shared by the
 * server read service, the server actions, the guard test and the lifecycle
 * UI sections. No server-only imports, no IO.
 *
 * The model codes against the contract the SEPARATE, human-gated migration
 * 20260817190000_employee_lifecycle_v1 proposes on the CANONICAL employment
 * record `engagement_contexts` (lead decision, duplication-consolidation
 * plan v1). Until the lead applies it the read/action layers degrade
 * honestly (the established tasks/finance/approvals pattern) — nothing here
 * fakes a stage, a checklist or an ending.
 *
 * HONEST lifecycle only: a NULL lifecycle_stage READS as 'active' for an
 * active engagement and 'ended' for an ended one (the same COALESCE rule
 * the SQL guards use) — legacy rows need no backfill and no touch.
 */

export const LIFECYCLE_STAGES = [
  "onboarding",
  "active",
  "probation",
  "change_pending",
  "offboarding",
  "ended",
] as const;
export type LifecycleStage = (typeof LIFECYCLE_STAGES)[number];

/** Stages a manager may set DIRECTLY (probation = stage + date only;
 *  change_pending = stage + note only — the binding v1 scope). Onboarding,
 *  offboarding and ended are owned by the run/end commands. */
export const DIRECT_LIFECYCLE_STAGES = [
  "active",
  "probation",
  "change_pending",
] as const;
export type DirectLifecycleStage = (typeof DIRECT_LIFECYCLE_STAGES)[number];

export const ENDED_REASONS = [
  "resignation",
  "termination",
  "contract_end",
  "mutual_agreement",
  "retirement",
  "other",
] as const;
export type EndedReason = (typeof ENDED_REASONS)[number];

export const ONBOARDING_ITEM_KINDS = [
  "task",
  "document_ack",
  "asset_issue",
  "training_note",
  "custom",
] as const;
export type OnboardingItemKind = (typeof ONBOARDING_ITEM_KINDS)[number];

export const OFFBOARDING_ITEM_KINDS = [
  "asset_return",
  "document_ack",
  "access_removal",
  "final_evidence",
  "custom",
] as const;
export type OffboardingItemKind = (typeof OFFBOARDING_ITEM_KINDS)[number];

export const RUN_STATUSES = ["in_progress", "completed", "cancelled"] as const;
export type LifecycleRunStatus = (typeof RUN_STATUSES)[number];

export const RUN_ITEM_STATUSES = ["pending", "done", "skipped"] as const;
export type LifecycleRunItemStatus = (typeof RUN_ITEM_STATUSES)[number];

export const LIFECYCLE_EVENT_ACTIONS = [
  "stage_changed",
  "onboarding_started",
  "onboarding_completed",
  "onboarding_cancelled",
  "offboarding_started",
  "offboarding_completed",
  "offboarding_cancelled",
  "probation_set",
  "change_noted",
  "engagement_ended",
] as const;
export type LifecycleEventAction = (typeof LIFECYCLE_EVENT_ACTIONS)[number];

/** The item kinds the run's own WORKER may honestly confirm themselves
 *  (managers may confirm anything; the SQL enforces the same rule). */
export const WORKER_CONFIRMABLE_KINDS: readonly OnboardingItemKind[] = [
  "document_ack",
  "training_note",
  "custom",
];

/** Bounded lengths — mirrored by the gated RPC validation (single contract). */
export const LIFECYCLE_TEMPLATE_NAME_MIN = 3;
export const LIFECYCLE_TEMPLATE_NAME_MAX = 120;
export const LIFECYCLE_ITEM_TITLE_MIN = 2;
export const LIFECYCLE_ITEM_TITLE_MAX = 160;
export const LIFECYCLE_ITEM_DESCRIPTION_MAX = 500;
export const LIFECYCLE_NOTE_MAX = 500;
export const LIFECYCLE_TEMPLATE_MAX_ITEMS = 30;
export const LIFECYCLE_TEMPLATE_FORM_MAX_ITEMS = 8;
export const LIFECYCLE_EXTRA_ITEMS_MAX = 20;

/** Bounded reads everywhere — the lifecycle surfaces never stream unbounded rows. */
export const LIFECYCLE_READ_LIMIT = 100;

/**
 * Postgres/PostgREST error codes that mean "the lifecycle migration is not
 * applied yet": missing relation, missing column, missing function, and the
 * PostgREST schema-cache miss for an RPC. The read layer and the actions map
 * ALL of these to the honest "not available yet" state — never a crash.
 */
export const LIFECYCLE_MIGRATION_MISSING_ERROR_CODES = [
  "42P01",
  "42703",
  "42883",
  "PGRST202",
] as const;

export function isLifecycleMigrationMissingCode(
  code: string | undefined,
): boolean {
  return (
    LIFECYCLE_MIGRATION_MISSING_ERROR_CODES as readonly string[]
  ).includes(code ?? "");
}

export function isValidLifecycleStage(v: string): v is LifecycleStage {
  return (LIFECYCLE_STAGES as readonly string[]).includes(v);
}

export function isValidDirectLifecycleStage(
  v: string,
): v is DirectLifecycleStage {
  return (DIRECT_LIFECYCLE_STAGES as readonly string[]).includes(v);
}

export function isValidEndedReason(v: string): v is EndedReason {
  return (ENDED_REASONS as readonly string[]).includes(v);
}

export function isValidRunItemStatus(v: string): v is LifecycleRunItemStatus {
  return (RUN_ITEM_STATUSES as readonly string[]).includes(v);
}

export function isValidOnboardingItemKind(v: string): v is OnboardingItemKind {
  return (ONBOARDING_ITEM_KINDS as readonly string[]).includes(v);
}

/**
 * THE derived-stage read rule, mirroring the SQL COALESCE guards exactly:
 * a NULL lifecycle_stage means the row predates the lifecycle engine —
 * 'ended' when the engagement status already says so, 'active' otherwise.
 */
export function deriveLifecycleStage(
  engagementStatus: string,
  lifecycleStage: string | null,
): LifecycleStage {
  if (lifecycleStage && isValidLifecycleStage(lifecycleStage)) {
    return lifecycleStage;
  }
  return engagementStatus === "ended" ? "ended" : "active";
}

export type LifecycleMemberRow = {
  readonly engagementId: string;
  readonly profileId: string;
  readonly name: string;
  readonly relationshipSlug: string;
  readonly engagementStatus: string;
  readonly stage: LifecycleStage;
  readonly probationUntil: string | null;
  readonly endedReason: EndedReason | null;
  readonly isRegisteredOwner: boolean;
  readonly openOnboardingRunId: string | null;
  readonly openOffboardingRunId: string | null;
};

export type LifecycleTemplateRow = {
  readonly id: string;
  readonly name: string;
  readonly isActive: boolean;
  readonly itemCount: number;
};

export type LifecycleRunItemRow = {
  readonly id: string;
  readonly runId: string;
  readonly itemOrder: number;
  readonly kind: string;
  readonly title: string;
  readonly description: string | null;
  readonly required: boolean;
  readonly status: LifecycleRunItemStatus;
  readonly responsibleProfileId: string | null;
  readonly linkedEntityType: string | null;
  readonly linkedEntityId: string | null;
  readonly note: string | null;
  readonly completedAt: string | null;
};

export type LifecycleRunRow = {
  readonly id: string;
  readonly engagementContextId: string;
  readonly status: LifecycleRunStatus;
  readonly templateName: string | null;
  readonly startedAt: string;
  readonly completedAt: string | null;
  readonly items: readonly LifecycleRunItemRow[];
};

export type LifecycleEventRow = {
  readonly id: string;
  readonly engagementContextId: string;
  readonly action: LifecycleEventAction;
  readonly beforeStage: string | null;
  readonly afterStage: string | null;
  readonly note: string | null;
  readonly createdAt: string;
};

/** Pure progress derivation for checklist UI (mirrors the SQL completion
 *  gate: a run may complete when every REQUIRED item reads 'done'). */
export function deriveRunProgress(items: readonly LifecycleRunItemRow[]): {
  readonly total: number;
  readonly done: number;
  readonly requiredOpen: number;
  readonly completable: boolean;
} {
  const total = items.length;
  const done = items.filter((i) => i.status === "done").length;
  const requiredOpen = items.filter(
    (i) => i.required && i.status !== "done",
  ).length;
  return { total, done, requiredOpen, completable: requiredOpen === 0 };
}

/** The honest `?lc=` outcomes the actions can navigate back with. */
export const LIFECYCLE_NOTICES = [
  "created",
  "started",
  "updated",
  "completed",
  "cancelled",
  "ended",
  "already_ended",
  "already_exists",
  "already_running",
  "items_open",
  "item_closed",
  "run_closed",
  "link_invalid",
  "asset_not_returned",
  "offboarding_open",
  "onboarding_open",
  "invalid_responsible",
  "invalid_stage",
  "invalid_transition",
  "not_active",
  "not_org_scoped",
  "template_not_found",
  "last_owner",
  "limit_reached",
  "invalid",
  "needs_migration",
  "not_authorized",
  "not_found",
  "error",
] as const;
export type LifecycleNotice = (typeof LIFECYCLE_NOTICES)[number];

export function isLifecycleNotice(v: string): v is LifecycleNotice {
  return (LIFECYCLE_NOTICES as readonly string[]).includes(v);
}
