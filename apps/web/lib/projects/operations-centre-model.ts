/**
 * Pure project operations-centre model (control room PR G, capability gap
 * map §6 + §7) — shared by the server composition
 * (lib/projects/operations-centre.ts), the operations page and the guard
 * test. No server-only imports, no IO, no date library.
 *
 * The operations CENTRE is an AGGREGATION over the models that really exist
 * and are readable today:
 *
 *   - the existing operations view   (getProjectOperations — assignments,
 *                                     manager-set statuses, readiness items)
 *   - project tasks                  (work_tasks via listProjectTasks — the
 *                                     PR D layer; degrades honestly while the
 *                                     owner-gated migration is unapplied)
 *   - handover passport              (project_handover_entries — committed
 *                                     draft; degrades honestly)
 *   - journal work evidence          (journal_entries / journal_entry_photos
 *                                     counts — the WAGON 8 gallery tables)
 *   - worker availability basics     (workers.availability_status /
 *                                     available_from — applied 0001 columns)
 *   - accepted booking date ranges   (booking_requests — the caller's own
 *                                     RLS-readable rows)
 *
 * Models that do NOT exist are deliberately ABSENT — no milestones, no
 * issues/risks, no defects, no equipment, no accommodation/transport
 * resource tables (projects.housing_provided is the ONLY applied
 * accommodation field and is shown verbatim). The gap map §6/§7 records the
 * gated follow-ups; nothing here simulates them.
 *
 * Conflict semantics reuse the planning model's inclusive day-range overlap
 * (lib/planning/planning-model.ts rangesOverlapInclusive — the booking
 * accept guard's `daterange(start, coalesce(end, start), '[]') &&`
 * semantics): an ACCEPTED booking whose inclusive range touches the
 * project's inclusive date band is flagged. Proposed/declined/withdrawn/
 * expired rows are never flagged — they are not commitments.
 */

import { rangesOverlapInclusive, toIsoDay } from "@/lib/planning/planning-model";
import {
  isOpen,
  isOverdue,
  type WorkTask,
} from "@/lib/tasks/task-model";
import type {
  ReadinessItem,
  WorkerOps,
} from "@/lib/projects/operations-derive";

/** Bounded reads everywhere — the centre never streams unbounded rows. */
export const OPS_CENTRE_BOOKING_READ_LIMIT = 200;
/** Open tasks listed inline on the operations page (full list on /tasks). */
export const OPS_CENTRE_TASK_LIST_MAX = 8;
/** Attention rows rendered on the page (each row is a real record). */
export const OPS_CENTRE_ATTENTION_MAX = 20;

/* ------------------------------------------------------------------ */
/* Readiness ratio — real counts of real checklist rows                */
/* ------------------------------------------------------------------ */

export interface ReadinessRatio {
  /** Items a manager marked `checked` (never auto-approved). */
  readonly checked: number;
  /** All tracked checklist rows (real rows, any status). */
  readonly total: number;
}

/** PURE: x/y over the REAL readiness-item rows. No rows → 0/0 (the page
 *  renders the honest "nothing tracked yet" state, never a fake 100%). */
export function deriveReadinessRatio(
  items: readonly ReadinessItem[],
): ReadinessRatio {
  return {
    checked: items.filter((i) => i.status === "checked").length,
    total: items.length,
  };
}

/** PURE: project-wide ratio = the sum of every worker's real rows. */
export function deriveProjectReadinessRatio(
  workers: readonly Pick<WorkerOps, "readinessItems">[],
): ReadinessRatio {
  let checked = 0;
  let total = 0;
  for (const w of workers) {
    const r = deriveReadinessRatio(w.readinessItems);
    checked += r.checked;
    total += r.total;
  }
  return { checked, total };
}

/* ------------------------------------------------------------------ */
/* Resources — availability basics + booking window overlaps           */
/* ------------------------------------------------------------------ */

/** Applied `workers` columns only (0001): availability_status /
 *  available_from. The richer preference fields (needs_accommodation,
 *  has_transport, willing_to_relocate …) live in an UNAPPLIED draft
 *  migration and are deliberately NOT read — nothing is shown for them. */
export interface WorkerAvailabilityBasics {
  readonly availabilityStatus: string | null;
  readonly availableFrom: string | null;
}

/** One accepted booking's inclusive date range for one worker — the only
 *  fields the overlap check needs. */
export interface WorkerBookingRange {
  readonly bookingId: string;
  readonly workerId: string;
  readonly status: string;
  readonly startDate: string | null;
  readonly endDate: string | null;
}

export interface WorkerResourceRow {
  readonly workerId: string;
  readonly workerProfileId: string;
  readonly name: string;
  /** Manager-set operational status, verbatim (null = not set). */
  readonly operationalStatus: WorkerOps["operationalStatus"];
  readonly readiness: ReadinessRatio;
  readonly availability: WorkerAvailabilityBasics;
  /** ACCEPTED bookings whose inclusive range overlaps the project band.
   *  0 when the project has no start date — no window, no overlap claim. */
  readonly overlappingBookings: number;
}

/** Inclusive project band with `coalesce(end, start)` semantics; null when
 *  the project has no start date (no band → overlap is never claimed). */
export function projectDateBand(project: {
  readonly startDate: string | null;
  readonly endDate: string | null;
}): { start: string; end: string } | null {
  const start = toIsoDay(project.startDate);
  if (!start) return null;
  const end = toIsoDay(project.endDate);
  return { start, end: end && end >= start ? end : start };
}

/** PURE: does one booking range overlap the project band? Only ACCEPTED
 *  rows count — a proposal is not a commitment (planning-model doctrine). */
export function bookingOverlapsBand(
  booking: WorkerBookingRange,
  band: { start: string; end: string },
): boolean {
  if (booking.status !== "accepted") return false;
  const start = toIsoDay(booking.startDate);
  if (!start) return false;
  const end = toIsoDay(booking.endDate);
  const effectiveEnd = end && end >= start ? end : start;
  return rangesOverlapInclusive(start, effectiveEnd, band.start, band.end);
}

const EMPTY_AVAILABILITY: WorkerAvailabilityBasics = {
  availabilityStatus: null,
  availableFrom: null,
};

/** PURE: merge the per-worker signals into resource rows. Every field is a
 *  real read-through — nothing is inferred, scored or invented. */
export function deriveWorkerResources(input: {
  readonly workers: readonly WorkerOps[];
  readonly availability: ReadonlyMap<string, WorkerAvailabilityBasics>;
  readonly bookings: readonly WorkerBookingRange[];
  readonly project: { readonly startDate: string | null; readonly endDate: string | null };
}): readonly WorkerResourceRow[] {
  const band = projectDateBand(input.project);
  return input.workers.map((w) => {
    const overlapping = band
      ? input.bookings.filter(
          (b) => b.workerId === w.workerId && bookingOverlapsBand(b, band),
        ).length
      : 0;
    return {
      workerId: w.workerId,
      workerProfileId: w.workerProfileId,
      name: w.name,
      operationalStatus: w.operationalStatus,
      readiness: deriveReadinessRatio(w.readinessItems),
      availability: input.availability.get(w.workerId) ?? EMPTY_AVAILABILITY,
      overlappingBookings: overlapping,
    };
  });
}

/* ------------------------------------------------------------------ */
/* Attention — blockers derived ONLY from real records                 */
/* ------------------------------------------------------------------ */

export type AttentionKind =
  | "worker_documents_needed" /* manager-set operational status */
  | "readiness_item_open" /* checklist row still needed/missing */
  | "task_overdue" /* open project task past its due day */
  | "task_blocked"; /* open project task in the blocked state */

export interface AttentionItem {
  /** Stable id: `${kind}:${recordId}` (React keys, testids). */
  readonly id: string;
  readonly kind: AttentionKind;
  /** Real subject text from the record (worker name / item label / task
   *  title) — the page adds the localized kind copy around it. */
  readonly subject: string;
  /** Where the item is RESOLVED — an in-page anchor for board-owned state,
   *  the tasks surface for task state. Never a dead link. */
  readonly href: string;
}

/** In-page anchor of the workers board (the page wraps the board with it). */
export const OPS_BOARD_ANCHOR = "#ops-workers";

/**
 * PURE: the blockers list. Each entry traces to one real row:
 *  - a worker whose manager-set operational status is `documents_needed`,
 *  - a readiness checklist row still `needed` or `missing`,
 *  - an OPEN project task that is overdue or blocked (PR D semantics).
 * No risk scores, no invented severities, no issue/defect model.
 */
export function deriveAttention(input: {
  readonly workers: readonly WorkerOps[];
  readonly tasks: readonly WorkTask[];
  readonly tasksHref: string;
  readonly now: Date;
}): readonly AttentionItem[] {
  const out: AttentionItem[] = [];

  for (const w of input.workers) {
    if (w.operationalStatus === "documents_needed") {
      out.push({
        id: `worker_documents_needed:${w.workerId}`,
        kind: "worker_documents_needed",
        subject: w.name,
        href: OPS_BOARD_ANCHOR,
      });
    }
    for (const item of w.readinessItems) {
      if (item.status === "needed" || item.status === "missing") {
        out.push({
          id: `readiness_item_open:${w.workerId}:${item.itemKey}`,
          kind: "readiness_item_open",
          subject: `${w.name} — ${item.label}`,
          href: OPS_BOARD_ANCHOR,
        });
      }
    }
  }

  for (const t of input.tasks) {
    if (!isOpen(t.status)) continue;
    if (t.status === "blocked") {
      out.push({
        id: `task_blocked:${t.id}`,
        kind: "task_blocked",
        subject: t.title,
        href: input.tasksHref,
      });
    } else if (isOverdue(t.dueAt, input.now)) {
      out.push({
        id: `task_overdue:${t.id}`,
        kind: "task_overdue",
        subject: t.title,
        href: input.tasksHref,
      });
    }
  }

  return out;
}

/** PURE: open project tasks, nearest due first (nulls last) — the small
 *  inline list; the full surface stays /dashboard/tasks?project=<id>. */
export function openProjectTasks(
  tasks: readonly WorkTask[],
  max: number = OPS_CENTRE_TASK_LIST_MAX,
): readonly WorkTask[] {
  return tasks
    .filter((t) => isOpen(t.status))
    .slice()
    .sort((a, b) => {
      const aKey = `${a.dueAt ? toIsoDay(a.dueAt) ?? "9999-99-99" : "9999-99-99"}|${a.createdAt}`;
      const bKey = `${b.dueAt ? toIsoDay(b.dueAt) ?? "9999-99-99" : "9999-99-99"}|${b.createdAt}`;
      return aKey < bKey ? -1 : aKey > bKey ? 1 : 0;
    })
    .slice(0, Math.max(0, max));
}
