/**
 * Pure Management Decisions model (v1) — shared by the server read service,
 * the server actions, the guard test and the UI section. No server-only
 * imports, no IO.
 *
 * Codes against the contract the SEPARATE, human-gated migration
 * 20260817232000_management_decisions_v1 proposes. Until the lead applies it
 * the read/action layers degrade honestly — nothing here fakes a decision.
 *
 * THIN BY CONSTRUCTION, pinned by lib/guards/management-decisions.test.ts:
 *   * APPROVAL / VOTING is the EXISTING Workflow & Approval Engine's. A vote
 *     IS an engine step with approval_mode 'any' or 'all' over an approver
 *     set ('all' = unanimous, 'any' = first decision carries). This module
 *     exports no ballot, tally or quorum vocabulary and decides nothing.
 *   * TASKS are real `work_tasks` rows created through the existing task
 *     RPCs; this module stores a pointer only.
 *   * DOCUMENTS are real `org_documents` rows; this module stores a pointer
 *     only.
 * No AI anywhere.
 */

/** MIRROR of workflow_instances.status plus this register's own bookends. */
export const DECISION_STATUSES = [
  "draft",
  "submitted_for_approval",
  "approved",
  "rejected",
  "withdrawn",
  "cancelled",
  "recorded",
] as const;
export type DecisionStatus = (typeof DECISION_STATUSES)[number];

/** The engine context vocabulary value this module rides. It already exists
 *  in the engine's closed CHECK (20260817130000) — nothing is widened. */
export const DECISION_WORKFLOW_CONTEXT = "management_decision" as const;

export const DECISION_EVENT_TYPES = [
  "created",
  "updated",
  "submitted",
  "synced",
  "result_recorded",
  "document_linked",
  "task_linked",
] as const;
export type DecisionEventType = (typeof DECISION_EVENT_TYPES)[number];

/** Bounded lengths — mirrored by the gated RPC validation (one contract). */
export const DECISION_TITLE_MIN = 3;
export const DECISION_TITLE_MAX = 160;
export const DECISION_AGENDA_MAX = 4000;
export const DECISION_RESULT_MAX = 4000;
export const DECISION_READ_LIMIT = 100;

export const DECISION_MIGRATION_MISSING_ERROR_CODES = [
  "42P01",
  "42703",
  "42883",
  "PGRST202",
] as const;

export function isDecisionMigrationMissingCode(code: string | undefined): boolean {
  return (DECISION_MIGRATION_MISSING_ERROR_CODES as readonly string[]).includes(
    code ?? "",
  );
}

export function isValidDecisionStatus(v: string): v is DecisionStatus {
  return (DECISION_STATUSES as readonly string[]).includes(v);
}

/** A decision whose mirror is still following a live engine instance — the
 *  read layer read-repairs exactly these, and nothing else. */
export function needsMirrorSync(status: DecisionStatus): boolean {
  return status === "submitted_for_approval";
}

export type ManagementDecisionRow = {
  readonly id: string;
  readonly organizationId: string;
  readonly title: string;
  readonly agenda: string;
  readonly decisionResult: string | null;
  readonly status: DecisionStatus;
  readonly workflowInstanceId: string | null;
  readonly responsibleProfileId: string | null;
  readonly deadline: string | null;
  readonly createdAt: string;
};

export type DecisionDocumentLinkRow = {
  readonly id: string;
  readonly decisionId: string;
  readonly orgDocumentId: string;
  readonly documentTitle: string | null;
};

export type DecisionTaskLinkRow = {
  readonly id: string;
  readonly decisionId: string;
  readonly workTaskId: string;
  readonly taskTitle: string | null;
  readonly taskStatus: string | null;
};

/** The honest `?dec=` outcomes the actions can navigate back with. */
export const DECISION_NOTICES = [
  "created",
  "updated",
  "submitted",
  "synced",
  "unchanged",
  "recorded",
  "already_recorded",
  "linked",
  "already_linked",
  "no_instance",
  "invalid",
  "invalid_state",
  "invalid_document",
  "invalid_task",
  "invalid_responsible",
  "needs_migration",
  "not_authorized",
  "not_found",
  "limit_reached",
  "error",
] as const;
export type DecisionNotice = (typeof DECISION_NOTICES)[number];

export const DECISION_SUCCESS_NOTICES: readonly DecisionNotice[] = [
  "created",
  "updated",
  "submitted",
  "synced",
  "recorded",
  "linked",
];

export function isDecisionNotice(v: string): v is DecisionNotice {
  return (DECISION_NOTICES as readonly string[]).includes(v);
}

export function noticeForDecisionOutcome(outcome: string): DecisionNotice {
  return isDecisionNotice(outcome) ? outcome : "error";
}
