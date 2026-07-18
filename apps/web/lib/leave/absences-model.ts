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
