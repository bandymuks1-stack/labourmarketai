/**
 * The FIELD — pure, client-safe model (frozen design contract §5 P4, design
 * system §C "Project = field", §G "Field / stadium system", §P time).
 *
 * A PROJECTION over the canonical records the operations page already reads.
 * No IO, no new table, no stored field state:
 *
 *   lanes   = project_stages in time (left status edge from the REAL status)
 *   tokens  = people on the project (project_worker_assignments, active)
 *             with their manager-kept checklist state
 *   slots   = missing capacity — open work nobody is assigned to, and the
 *             empty project itself (dashed, never a forecast)
 *   ready   = people who can come (the chat's own capacity read: the roster
 *             against approved absences, WHEN only)
 *
 * Time is PAST / NOW / NEXT from the stage dates only (§1.9: no forecasts);
 * that placement is DERIVED and is flagged as such — the stage status is the
 * fact. Work in a lane is DERIVED from due dates (tasks carry no stage link)
 * and is flagged as such too.
 *
 * Bounded (design §T): ≤ 12 lanes, ≤ 12 slots, ≤ 12 people who can come,
 * ≤ 60 objects on the scene — everything beyond is counted, never dropped
 * silently, and the LIST equivalent carries the full bounded set.
 *
 * Canonical data carries no sports vocabulary; "field", "zone", "ready" are
 * UI words only (design §G).
 */

import type { WorkTask } from "@/lib/tasks/task-model";
import type { ProjectStage, StageStatus } from "@/lib/projects/stages-model";
import type {
  OperationalStatus,
  ReadinessItem,
  WorkerOps,
} from "@/lib/projects/operations-derive";
import type { CapacityChatResult } from "@/lib/conversation/capacity-contract";
import { buildStageGantt } from "@/lib/projects/stage-gantt";
import { isOpen } from "@/lib/tasks/task-model";

export const FIELD_LANE_MAX = 12;
export const FIELD_SLOT_MAX = 12;
export const FIELD_READY_MAX = 12;
export const FIELD_OBJECT_MAX = 60;

/** Where the lane sits against today — from its dates only. */
export type LaneTime = "past" | "now" | "next" | "undated";

/** The lane's left edge — from its REAL status (never colour alone: the
 *  component renders edge + text + icon). */
export type LaneEdge = "done" | "now" | "risk" | "blocked" | "planned" | "cancelled";

export interface FieldLane {
  readonly id: string;
  readonly name: string;
  readonly status: StageStatus;
  readonly edge: LaneEdge;
  readonly time: LaneTime;
  readonly start: string | null;
  readonly end: string | null;
  /** 0–100 over the project window; null when the lane has no dates. */
  readonly offsetPct: number | null;
  readonly widthPct: number | null;
  readonly overdue: boolean;
  readonly blockedReason: string | null;
  readonly completionCriteria: string | null;
  /** Open work whose due day falls inside this lane's dates — DERIVED. */
  readonly taskIds: readonly string[];
}

export type TokenState = "clear" | "needs" | "blocked" | "untracked";

export interface FieldToken {
  readonly workerId: string;
  readonly workerProfileId: string;
  readonly name: string;
  readonly state: TokenState;
  readonly assignedAt: string;
  readonly operationalStatus: OperationalStatus | null;
  readonly checked: number;
  readonly total: number;
  readonly open: number;
  readonly items: readonly ReadinessItem[];
}

export type SlotKind = "unassigned_task" | "no_people";

export interface FieldSlot {
  readonly id: string;
  readonly kind: SlotKind;
  readonly taskId: string | null;
  readonly title: string | null;
  readonly dueAt: string | null;
}

export interface FieldReadyRow {
  readonly workerId: string;
  readonly label: string;
}

export interface FieldReady {
  readonly kind: CapacityChatResult["kind"];
  readonly rows: readonly FieldReadyRow[];
  readonly from: string | null;
  readonly to: string | null;
  readonly absencesKnown: boolean;
  /** Free roster rows beyond FIELD_READY_MAX (counted, not shown). */
  readonly more: number;
}

export interface ProjectField {
  readonly lanes: readonly FieldLane[];
  readonly lanesTotal: number;
  readonly people: readonly FieldToken[];
  readonly peopleTotal: number;
  readonly slots: readonly FieldSlot[];
  readonly slotsTotal: number;
  readonly ready: FieldReady;
  /** Open work that no lane's dates cover (or that has no due day). */
  readonly unplacedTaskIds: readonly string[];
  readonly window: { readonly start: string; readonly end: string } | null;
  readonly todayPct: number | null;
  /** Objects actually on the scene (lanes + people + slots + ready). */
  readonly objects: number;
  readonly stagesApplied: boolean;
  readonly tasksApplied: boolean;
}

function toDay(iso: string | null): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso.length > 10 ? iso.slice(0, 10) : iso);
  if (Number.isNaN(ms)) return null;
  return Math.floor(ms / 86_400_000);
}

/** PURE: the left edge from the real status (+ overdue from real dates). */
export function laneEdge(status: StageStatus, overdue: boolean): LaneEdge {
  if (status === "done") return "done";
  if (status === "cancelled") return "cancelled";
  if (status === "blocked") return "blocked";
  if (overdue) return "risk";
  if (status === "in_progress") return "now";
  return "planned";
}

/** PURE: past / now / next from dates only; undated when there are none. */
export function laneTime(
  start: string | null,
  end: string | null,
  todayIso: string,
): LaneTime {
  const s = toDay(start);
  const e = toDay(end) ?? s;
  const today = toDay(todayIso);
  if (s === null || e === null || today === null) return "undated";
  if (e < today) return "past";
  if (s > today) return "next";
  return "now";
}

/** PURE: one person's token state from the manager-kept checklist rows and
 *  the manager-set operational status — nothing inferred beyond that. */
export function tokenState(w: Pick<WorkerOps, "docsMissing" | "docsBlocked" | "operationalStatus" | "readinessItems">): TokenState {
  if (w.docsBlocked > 0 || w.operationalStatus === "documents_needed") return "blocked";
  if (w.docsMissing > 0) return "needs";
  if (w.readinessItems.length === 0) return "untracked";
  return "clear";
}

export interface BuildFieldInput {
  readonly stages: readonly ProjectStage[];
  readonly stagesApplied: boolean;
  readonly workers: readonly WorkerOps[];
  readonly tasks: readonly WorkTask[];
  readonly tasksApplied: boolean;
  readonly capacity: CapacityChatResult | null;
  readonly todayIso: string;
}

/** PURE: the whole field from the composed canonical reads. */
export function buildProjectField(input: BuildFieldInput): ProjectField {
  const ordered = input.stages
    .slice()
    .sort((a, b) =>
      a.stageOrder !== b.stageOrder ? a.stageOrder - b.stageOrder : a.name.localeCompare(b.name),
    );
  const shown = ordered.slice(0, FIELD_LANE_MAX);
  const gantt = buildStageGantt(shown, input.todayIso);
  const barById = new Map(
    gantt.hasTimeline ? gantt.bars.map((b) => [b.id, b] as const) : [],
  );

  const openTasks = input.tasks.filter((t) => isOpen(t.status));
  const placed = new Set<string>();

  const lanes: FieldLane[] = shown.map((s) => {
    const bar = barById.get(s.id) ?? null;
    const start = s.actualStart ?? s.plannedStart ?? null;
    const end = s.actualEnd ?? s.plannedEnd ?? start;
    const sDay = toDay(start);
    const eDay = toDay(end) ?? sDay;
    const taskIds: string[] = [];
    if (sDay !== null && eDay !== null) {
      for (const t of openTasks) {
        if (placed.has(t.id)) continue;
        const d = toDay(t.dueAt);
        if (d !== null && d >= sDay && d <= eDay) {
          taskIds.push(t.id);
          placed.add(t.id);
        }
      }
    }
    const overdue = bar?.overdue ?? false;
    return {
      id: s.id,
      name: s.name,
      status: s.status,
      edge: laneEdge(s.status, overdue),
      time: laneTime(start, end, input.todayIso),
      start,
      end,
      offsetPct: bar ? bar.offsetPct : null,
      widthPct: bar ? bar.widthPct : null,
      overdue,
      blockedReason: s.blockedReason,
      completionCriteria: s.completionCriteria,
      taskIds,
    };
  });

  const unplacedTaskIds = openTasks.filter((t) => !placed.has(t.id)).map((t) => t.id);

  const assigned = new Set(input.workers.map((w) => w.workerId));
  const allPeople: FieldToken[] = input.workers.map((w) => ({
    workerId: w.workerId,
    workerProfileId: w.workerProfileId,
    name: w.name,
    state: tokenState(w),
    assignedAt: w.assignedAt,
    operationalStatus: w.operationalStatus,
    checked: w.docsChecked,
    total: w.readinessItems.length,
    open: w.docsMissing,
    items: w.readinessItems,
  }));

  const allSlots: FieldSlot[] = [];
  if (input.workers.length === 0) {
    allSlots.push({ id: "slot:no_people", kind: "no_people", taskId: null, title: null, dueAt: null });
  }
  for (const t of openTasks) {
    if (t.assigneeProfileId) continue;
    allSlots.push({ id: `slot:task:${t.id}`, kind: "unassigned_task", taskId: t.id, title: t.title, dueAt: t.dueAt });
  }
  const slots = allSlots.slice(0, FIELD_SLOT_MAX);

  let ready: FieldReady = { kind: "error", rows: [], from: null, to: null, absencesKnown: false, more: 0 };
  if (input.capacity) {
    if (input.capacity.kind === "ok") {
      const free = input.capacity.rows
        .filter((r) => r.state === "free" && !assigned.has(r.workerId))
        .map((r) => ({ workerId: r.workerId, label: r.label }));
      ready = {
        kind: "ok",
        rows: free.slice(0, FIELD_READY_MAX),
        from: input.capacity.from,
        to: input.capacity.to,
        absencesKnown: input.capacity.absencesKnown,
        more: Math.max(0, free.length - FIELD_READY_MAX),
      };
    } else {
      ready = { ...ready, kind: input.capacity.kind };
    }
  }

  // Object budget: lanes and slots are few; people are clustered beyond it.
  const budgetForPeople = Math.max(
    0,
    FIELD_OBJECT_MAX - lanes.length - slots.length - ready.rows.length,
  );
  const people = allPeople.slice(0, budgetForPeople);

  return {
    lanes,
    lanesTotal: ordered.length,
    people,
    peopleTotal: allPeople.length,
    slots,
    slotsTotal: allSlots.length,
    ready,
    unplacedTaskIds,
    window: gantt.hasTimeline ? { start: gantt.windowStart, end: gantt.windowEnd } : null,
    todayPct: gantt.hasTimeline ? gantt.todayPct : null,
    objects: lanes.length + people.length + slots.length + ready.rows.length,
    stagesApplied: input.stagesApplied,
    tasksApplied: input.tasksApplied,
  };
}
