/**
 * Typed employee requests — pure model (v1). Shared by the server read
 * service, the server actions, the guard test and the requests UI section.
 * No server-only imports, no IO.
 *
 * The lifecycle of a request runs on the canonical Workflow & Approval
 * Engine (lib/approvals/*): `create_employee_request_v1` starts an engine
 * instance (context_entity_type='generic_request'), approvers decide in the
 * EXISTING approvals inbox, and `employee_requests.status` is a listing
 * MIRROR of the engine instance — engine truth wins, the read layer repairs
 * the mirror when they disagree (read-repair; no triggers on engine tables).
 *
 * Absence/leave requests are DELIBERATELY NOT in this vocabulary: the
 * proven worker_absences path stays the one and only leave flow.
 */

export const EMPLOYEE_REQUEST_TYPES = [
  "remote_work",
  "schedule_change",
  "certificate_request",
  "employment_condition_change",
  "benefit_request",
  "equipment_request",
  "other",
] as const;
export type EmployeeRequestType = (typeof EMPLOYEE_REQUEST_TYPES)[number];

/** Mirror vocabulary — byte-identical to the engine instance statuses. */
export const EMPLOYEE_REQUEST_STATUSES = [
  "pending",
  "approved",
  "rejected",
  "withdrawn",
  "cancelled",
] as const;
export type EmployeeRequestStatus = (typeof EMPLOYEE_REQUEST_STATUSES)[number];

/** Request types whose approval has a schedule consequence. Their calendar
 *  band rendering is a DOCUMENTED SEAM (Train E owns the calendar
 *  projection); the vocabulary is pinned here so the seam has one name. */
export const SCHEDULE_AFFECTING_REQUEST_TYPES = [
  "remote_work",
  "schedule_change",
] as const;

/** Bounds — mirrored by the gated RPC validation (single contract). The
 *  title bound matches the engine instance title bound on purpose: the
 *  request title IS the instance title. */
export const EMPLOYEE_REQUEST_TITLE_MIN = 3;
export const EMPLOYEE_REQUEST_TITLE_MAX = 160;
export const EMPLOYEE_REQUEST_DETAILS_MAX = 2000;
/** Bounded reads everywhere — request surfaces never stream unbounded rows. */
export const EMPLOYEE_REQUEST_READ_LIMIT = 100;

/** Definition-slug convention the create RPC resolves, in this order. */
export const EMPLOYEE_REQUEST_DEFAULT_DEFINITION_SLUG = "employee_request_default";
export function employeeRequestDefinitionSlug(type: EmployeeRequestType): string {
  return `employee_request_${type}`;
}

/**
 * Postgres/PostgREST error codes that mean "the employee requests migration
 * is not applied yet" — same set the approvals layer maps to its honest
 * "not available yet" state.
 */
export const EMPLOYEE_REQUEST_MIGRATION_MISSING_CODES = [
  "42P01",
  "42703",
  "42883",
  "PGRST202",
] as const;

export function isEmployeeRequestMigrationMissingCode(
  code: string | undefined,
): boolean {
  return (
    EMPLOYEE_REQUEST_MIGRATION_MISSING_CODES as readonly string[]
  ).includes(code ?? "");
}

export function isValidEmployeeRequestType(
  v: string,
): v is EmployeeRequestType {
  return (EMPLOYEE_REQUEST_TYPES as readonly string[]).includes(v);
}

export function isValidEmployeeRequestStatus(
  v: string,
): v is EmployeeRequestStatus {
  return (EMPLOYEE_REQUEST_STATUSES as readonly string[]).includes(v);
}

export type EmployeeRequestRow = {
  readonly id: string;
  readonly organizationId: string;
  readonly requesterProfileId: string;
  readonly requestType: EmployeeRequestType;
  readonly title: string;
  readonly details: string | null;
  readonly dateFrom: string | null;
  readonly dateTo: string | null;
  /** The MIRROR status. The read layer overlays the engine instance status
   *  when it can read it (engine truth wins). */
  readonly status: EmployeeRequestStatus;
  readonly workflowInstanceId: string | null;
  readonly createdAt: string;
};

/** The honest `?req=` outcomes the request actions can navigate back with.
 *  Engine outcomes that surface through create (`no_approvers`,
 *  `not_published`, ...) are part of the vocabulary — nothing is masked. */
export const EMPLOYEE_REQUEST_NOTICES = [
  "created",
  "withdrawn",
  "template_ready",
  "policy_saved",
  "already_pending",
  "no_definition",
  "no_approvers",
  "not_published",
  "not_pending",
  "invalid",
  "needs_migration",
  "not_authorized",
  "not_found",
  "limit_reached",
  "error",
] as const;
export type EmployeeRequestNotice = (typeof EMPLOYEE_REQUEST_NOTICES)[number];

export function isEmployeeRequestNotice(
  v: string,
): v is EmployeeRequestNotice {
  return (EMPLOYEE_REQUEST_NOTICES as readonly string[]).includes(v);
}

/** Register filter shape shared by the read service and the UI section. */
export type OrgRequestsFilterInput = {
  readonly status?: EmployeeRequestStatus;
  readonly requestType?: EmployeeRequestType;
};

/**
 * Overlay the engine truth on the mirror status. The mirror exists for cheap
 * listing; whenever the caller could read the engine instance, the instance
 * status is what the UI must show. Returns the value to display plus whether
 * the stored mirror needs read-repair.
 */
export function resolveDisplayStatus(
  mirror: EmployeeRequestStatus,
  engine: string | null | undefined,
): { readonly status: EmployeeRequestStatus; readonly mirrorStale: boolean } {
  if (engine && isValidEmployeeRequestStatus(engine) && engine !== mirror) {
    return { status: engine, mirrorStale: true };
  }
  return { status: mirror, mirrorStale: false };
}
