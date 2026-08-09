/**
 * Workforce leave & absence — client-safe model (Wagon 7 slice).
 */

export const ABSENCE_TYPES = [
  "annual_leave",
  "sickness",
  "unpaid",
  "training",
  "other",
] as const;
export type AbsenceType = (typeof ABSENCE_TYPES)[number];

export const ABSENCE_STATUSES = [
  "requested",
  "approved",
  "rejected",
  "cancelled",
] as const;
export type AbsenceStatus = (typeof ABSENCE_STATUSES)[number];

export interface WorkerAbsence {
  readonly id: string;
  readonly workerId: string;
  readonly workerName: string | null;
  readonly absenceType: AbsenceType;
  readonly startDate: string;
  readonly endDate: string;
  readonly halfDay: boolean;
  readonly note: string | null;
  readonly status: AbsenceStatus;
}

export type MyAbsencesData =
  | { applied: false }
  | { applied: true; workerId: string | null; absences: WorkerAbsence[] };

export type ManagerAbsencesData =
  | { applied: false }
  | { applied: true; pending: WorkerAbsence[] };

export function isAbsenceType(v: unknown): v is AbsenceType {
  return typeof v === "string" && (ABSENCE_TYPES as readonly string[]).includes(v);
}

/**
 * Roles whose holder can be asked to REVIEW someone else's absence. Mirrors
 * the gate the absences page already applies; exported so the notification
 * spine cannot drift from the page it links to.
 */
export const ABSENCE_MANAGER_ROLES = ["company", "agency"] as const;

/** True when this role is ever asked to review another person's absence. */
export function canReviewAbsences(role: string | null | undefined): boolean {
  return (ABSENCE_MANAGER_ROLES as readonly string[]).includes(role ?? "");
}

/**
 * The rows a reviewer must actually act on.
 *
 * TWO filters, and the second one is not optional. `worker_absences`'s SELECT
 * policy is `self OR (caller_manages_worker(worker_id) AND status='requested')
 * OR is_admin()`, so a `status='requested'` read returns the caller's OWN
 * pending request alongside the ones they manage — the `self` branch admits it.
 * Counting that row would tell a person their own time-off request is waiting
 * for their review, and it could never be cleared by reviewing anything.
 *
 * `callerWorkerId` is null for a reviewer who holds no worker record; then
 * there is no self row to drop and every pending row is genuinely someone
 * else's.
 */
export function pendingAbsenceReviews(
  rows: readonly WorkerAbsence[],
  callerWorkerId: string | null,
): WorkerAbsence[] {
  return rows.filter(
    (a) => a.status === "requested" && a.workerId !== callerWorkerId,
  );
}
