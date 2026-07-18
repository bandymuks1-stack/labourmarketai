/**
 * Delivery & Quality — client-safe model (Wagon 11). Defects + corrections over
 * the canonical project spine. Photos/evidence reuse the project gallery.
 */

export const DEFECT_STATUSES = [
  "reported", "acknowledged", "assigned", "in_correction",
  "ready_for_review", "accepted", "reopened", "rejected", "cancelled",
] as const;
export type DefectStatus = (typeof DEFECT_STATUSES)[number];

export const DEFECT_CATEGORIES = ["workmanship", "materials", "safety", "documentation", "other"] as const;
export type DefectCategory = (typeof DEFECT_CATEGORIES)[number];

export const DEFECT_SEVERITIES = ["low", "medium", "high", "critical"] as const;
export type DefectSeverity = (typeof DEFECT_SEVERITIES)[number];

export const CORRECTION_OUTCOMES = ["pending", "passed", "failed"] as const;
export type CorrectionOutcome = (typeof CORRECTION_OUTCOMES)[number];

export interface DefectCorrection {
  readonly id: string;
  readonly workPerformed: string;
  readonly materials: string | null;
  readonly outcome: CorrectionOutcome;
  readonly completedAt: string | null;
}

export interface Defect {
  readonly id: string;
  readonly category: DefectCategory;
  readonly severity: DefectSeverity;
  readonly description: string;
  readonly location: string | null;
  readonly status: DefectStatus;
  readonly dueDate: string | null;
  readonly corrections: DefectCorrection[];
}

export type ProjectDefectsData =
  | { applied: false }
  | { applied: true; defects: Defect[] };

export function isDefectStatus(v: unknown): v is DefectStatus {
  return typeof v === "string" && (DEFECT_STATUSES as readonly string[]).includes(v);
}
export function isDefectCategory(v: unknown): v is DefectCategory {
  return typeof v === "string" && (DEFECT_CATEGORIES as readonly string[]).includes(v);
}
export function isDefectSeverity(v: unknown): v is DefectSeverity {
  return typeof v === "string" && (DEFECT_SEVERITIES as readonly string[]).includes(v);
}
export function isCorrectionOutcome(v: unknown): v is CorrectionOutcome {
  return typeof v === "string" && (CORRECTION_OUTCOMES as readonly string[]).includes(v);
}
