/**
 * Project stages — client-safe model (Wagon 6 slice 1).
 *
 * Pure types + the status vocabulary, importable from client components. The
 * server read (`stages.ts`, `server-only`) and the write actions build on this.
 */

export const STAGE_STATUSES = [
  "planned",
  "in_progress",
  "blocked",
  "done",
  "cancelled",
] as const;
export type StageStatus = (typeof STAGE_STATUSES)[number];

export interface ProjectStage {
  readonly id: string;
  readonly name: string;
  readonly stageOrder: number;
  readonly status: StageStatus;
  readonly plannedStart: string | null;
  readonly plannedEnd: string | null;
  readonly actualStart: string | null;
  readonly actualEnd: string | null;
  readonly blockedReason: string | null;
  readonly completionCriteria: string | null;
  /** Tie-break for the derived WBS numbering (stage_order, created_at, id). */
  readonly createdAt?: string | null;
  /** engagement_contexts.id of the responsible party (set via
   *  set_project_stage_responsible_v1); null = nobody named. */
  readonly responsibleEngagementId?: string | null;
}

export type ProjectStagesData =
  | { applied: false }
  | { applied: true; stages: ProjectStage[]; error: string | null };

export function isStageStatus(v: unknown): v is StageStatus {
  return typeof v === "string" && (STAGE_STATUSES as readonly string[]).includes(v);
}
