import { laneEdge, laneTime, type LaneEdge, type LaneTime } from "@/lib/projects/field-model";
import type { ProjectStage, ProjectStagesData } from "@/lib/projects/stages-model";

/**
 * THE PROJECT COURSE — the team's shared route through a project (Future
 * Experience C, owner decision 2026-10-14): the project's real stages as one
 * track with "we are here", read by everyone the stages' RLS admits (the
 * project's managers AND its assigned workers), so the whole team sees the
 * same goal.
 *
 * A projection of `listProjectStages` through the SAME edge/time rules the
 * manager's operations field uses (`laneEdge`, `laneTime`) — no second stage
 * model, no invented progress:
 *   - there is NO per-stage percent in the data, so none is shown;
 *   - "we are here" is the first stage in progress, else the first stage
 *     not yet done (a fact about statuses, not a forecast);
 *   - overdue = a planned end before today on a stage not done (dates only);
 *   - a failed read is UNKNOWN; a project without stages is NONE — different
 *     states, said differently.
 *
 * Pure and deterministic: no IO, no `Date` (today is passed in), no locale.
 */

export type CourseStep = {
  readonly id: string;
  readonly name: string;
  readonly status: ProjectStage["status"];
  readonly edge: LaneEdge;
  readonly time: LaneTime;
  readonly overdue: boolean;
  readonly blockedReason: string | null;
  readonly plannedEnd: string | null;
};

export type ProjectCourse =
  | {
      readonly kind: "known";
      readonly steps: readonly CourseStep[];
      /** Stages done, over stages that count (cancelled ones do not). */
      readonly done: number;
      readonly total: number;
      /** Index into `steps` of "we are here"; null when every stage is done. */
      readonly here: number | null;
      readonly blocked: number;
      readonly overdue: number;
    }
  | { readonly kind: "none" }
  | { readonly kind: "unknown" };

const DAY = /^\d{4}-\d{2}-\d{2}/;

export function deriveProjectCourse(data: ProjectStagesData | null, todayIso: string): ProjectCourse {
  if (data === null) return { kind: "unknown" };
  if (!data.applied) return { kind: "none" };
  if (data.error) return { kind: "unknown" };
  const live = data.stages;
  if (live.length === 0) return { kind: "none" };

  const steps: CourseStep[] = live.map((s) => {
    const end = s.plannedEnd && DAY.test(s.plannedEnd) ? s.plannedEnd.slice(0, 10) : null;
    const overdue = end !== null && s.status !== "done" && s.status !== "cancelled" && end < todayIso.slice(0, 10);
    return {
      id: s.id,
      name: s.name,
      status: s.status,
      edge: laneEdge(s.status, overdue),
      time: laneTime(s.actualStart ?? s.plannedStart, s.actualEnd ?? s.plannedEnd, todayIso),
      overdue,
      blockedReason: s.status === "blocked" ? (s.blockedReason?.trim() || null) : null,
      plannedEnd: end,
    };
  });

  const counted = steps.filter((s) => s.status !== "cancelled");
  const inProgress = steps.findIndex((s) => s.status === "in_progress" || s.status === "blocked");
  const firstOpen = steps.findIndex((s) => s.status !== "done" && s.status !== "cancelled");
  return {
    kind: "known",
    steps,
    done: counted.filter((s) => s.status === "done").length,
    total: counted.length,
    here: inProgress >= 0 ? inProgress : firstOpen >= 0 ? firstOpen : null,
    blocked: steps.filter((s) => s.status === "blocked").length,
    overdue: steps.filter((s) => s.overdue).length,
  };
}
