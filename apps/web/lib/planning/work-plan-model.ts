/**
 * Work plan — pure model (FINAL COMPLETION Train F1, 2026-09-02).
 *
 * CALENDAR = PLAN, JOURNAL = FACT. A work plan entry is the organization's
 * statement "worker W is planned on project P / object O from D1 to D2". It
 * is a SOURCE OBJECT of the calendar projection (like a booking or an
 * absence), never a calendar copy: the calendar renders it and links back.
 *
 * PURE — no IO — so validation and projection are unit-testable and the
 * same on the server action, the calendar and any client.
 */
import {
  daySpanDays,
  planningMeta,
  toIsoDay,
  type PlanningItem,
} from "@/lib/planning/planning-model";

export const WORK_PLAN_STATUSES = ["planned", "cancelled"] as const;
export type WorkPlanStatus = (typeof WORK_PLAN_STATUSES)[number];

/** The bounded `?plan=` return vocabulary of the two write actions — never
 *  raw error text. Lives here (pure) so the page can validate the param
 *  without importing the server-action module. */
export const WORK_PLAN_OUTCOMES = [
  "planned",
  "cancelled",
  "invalid",
  "not_allowed",
  "worker_not_in_scope",
  "project_not_in_organization",
  "work_object_not_in_organization",
  "unavailable",
  "error",
] as const;
export type WorkPlanOutcome = (typeof WORK_PLAN_OUTCOMES)[number];

export function isWorkPlanOutcome(v: string | undefined): v is WorkPlanOutcome {
  return (WORK_PLAN_OUTCOMES as readonly string[]).includes(v ?? "");
}

/** One stored row, as the read layer returns it. */
export type WorkPlanEntry = {
  readonly id: string;
  readonly organizationId: string;
  readonly workerId: string;
  readonly workerName: string | null;
  readonly projectId: string | null;
  readonly projectTitle: string | null;
  readonly workObjectId: string | null;
  readonly workObjectName: string | null;
  readonly startDate: string;
  readonly endDate: string;
  /** "HH:MM" or null. */
  readonly startTime: string | null;
  readonly endTime: string | null;
  readonly note: string | null;
  readonly status: WorkPlanStatus;
  readonly createdAt: string;
};

const DAY_RX = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RX = /^([01]\d|2[0-3]):[0-5]\d$/;
const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const WORK_PLAN_NOTE_MAX = 500;
export const WORK_PLAN_MAX_DAYS = 366;

export type WorkPlanInput = {
  readonly organizationId: string;
  readonly workerId: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly projectId: string | null;
  readonly workObjectId: string | null;
  readonly startTime: string | null;
  readonly endTime: string | null;
  readonly note: string | null;
};

export type WorkPlanValidation =
  | { readonly ok: true; readonly value: WorkPlanInput }
  | {
      readonly ok: false;
      readonly code:
        | "organization"
        | "worker"
        | "start_date"
        | "end_date"
        | "window_order"
        | "window_too_long"
        | "time"
        | "time_order"
        | "note_too_long"
        | "project"
        | "work_object";
    };

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** A real UTC calendar day: shape AND existence (2026-02-30 is not a day). */
function isRealDay(value: string): boolean {
  if (!DAY_RX.test(value)) return false;
  const t = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === value;
}

function optionalId(v: unknown): string | null | undefined {
  const s = str(v);
  if (s === "") return null;
  return UUID_RX.test(s) ? s : undefined;
}

/** Validate raw form values into a WorkPlanInput. Mirrors the database
 *  checks (window ordered, bounded, times ordered, note ≤ 500) so a person
 *  sees the reason before the round trip, and the RPC stays the authority. */
export function validateWorkPlanInput(raw: {
  organizationId?: unknown;
  workerId?: unknown;
  startDate?: unknown;
  endDate?: unknown;
  projectId?: unknown;
  workObjectId?: unknown;
  startTime?: unknown;
  endTime?: unknown;
  note?: unknown;
}): WorkPlanValidation {
  const organizationId = str(raw.organizationId);
  if (!UUID_RX.test(organizationId)) return { ok: false, code: "organization" };
  const workerId = str(raw.workerId);
  if (!UUID_RX.test(workerId)) return { ok: false, code: "worker" };
  const startDate = str(raw.startDate);
  if (!isRealDay(startDate)) return { ok: false, code: "start_date" };
  const endDateRaw = str(raw.endDate);
  const endDate = endDateRaw === "" ? startDate : endDateRaw;
  if (!isRealDay(endDate)) return { ok: false, code: "end_date" };
  if (endDate < startDate) return { ok: false, code: "window_order" };
  const span = Number(daySpanDays(startDate, endDate) ?? "1");
  if (span > WORK_PLAN_MAX_DAYS) return { ok: false, code: "window_too_long" };
  const startTime = str(raw.startTime) || null;
  const endTime = str(raw.endTime) || null;
  if ((startTime && !TIME_RX.test(startTime)) || (endTime && !TIME_RX.test(endTime))) {
    return { ok: false, code: "time" };
  }
  if (startTime && endTime && endTime <= startTime) return { ok: false, code: "time_order" };
  const note = str(raw.note) || null;
  if (note && note.length > WORK_PLAN_NOTE_MAX) return { ok: false, code: "note_too_long" };
  const projectId = optionalId(raw.projectId);
  if (projectId === undefined) return { ok: false, code: "project" };
  const workObjectId = optionalId(raw.workObjectId);
  if (workObjectId === undefined) return { ok: false, code: "work_object" };
  return {
    ok: true,
    value: {
      organizationId,
      workerId,
      startDate,
      endDate,
      projectId,
      workObjectId,
      startTime,
      endTime,
      note,
    },
  };
}

/** Project a stored entry onto the calendar. Cancelled windows are not a
 *  plan any more and are not projected (they stay readable as history in
 *  the plan list). */
export function projectWorkPlanItem(
  entry: WorkPlanEntry,
  roleContext: PlanningItem["roleContext"],
): PlanningItem | null {
  if (entry.status !== "planned") return null;
  const start = toIsoDay(entry.startDate);
  if (!start) return null;
  const end = toIsoDay(entry.endDate) ?? start;
  return {
    id: `plan:${entry.id}`,
    sourceType: "plan",
    sourceId: entry.id,
    label: entry.projectTitle ?? entry.workObjectName ?? entry.workerName ?? null,
    detail: entry.workerName ?? null,
    startDate: start,
    endDate: end,
    status: entry.status,
    statusKey: `planning.planStatus.${entry.status}`,
    href: `/dashboard/planning?view=day&date=${start}`,
    roleContext,
    ...planningMeta({
      startTime: entry.startTime ?? undefined,
      duration: daySpanDays(start, end) ?? undefined,
      project: entry.projectTitle ?? undefined,
      place: entry.workObjectName ?? undefined,
      counterpart: entry.workerName ?? undefined,
    }),
  };
}
