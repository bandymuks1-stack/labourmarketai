import "server-only";

import { createClient } from "@/lib/supabase/server";
import {
  effectiveEndDay,
  projectAbsenceItem,
  rangesOverlapInclusive,
  type PlanningItem,
} from "@/lib/planning/planning-model";

/**
 * Employer-side worker availability (W12 employer projection).
 *
 * WHAT THIS EXISTS FOR. The canonical calendar answered every WORKER question
 * and none of the employer ones. `/dashboard/company/planning` is a demand and
 * gap-risk surface over `getWorkforce()` — it never touched the planning model.
 * So an employer could assign a worker to days that worker had approved leave
 * for, and nothing in the product said a word: the only employer-side absence
 * read (`getManagerPendingAbsences`) filters `status = 'requested'`, i.e. an
 * approval queue, never a schedule.
 *
 * ── MINIMUM NECESSARY VISIBILITY (owner decision) ──────────────────────────
 *
 * An employer may learn: this worker is UNAVAILABLE, over this date range, and
 * what that collides with. An employer may NOT learn WHY.
 *
 * That is enforced by what the query ASKS FOR, not by what the UI chooses to
 * render. The select list below deliberately omits `note` (free text, up to
 * 500 chars, written by the worker) and `absence_type` — `sickness` alone is
 * health information and it is one of the five allowed values. Neither column
 * ever reaches this process, so no later refactor of a component can leak
 * them, and no client bundle can contain them.
 *
 * The canonical `projectAbsenceItem` mapper turns out to be exactly the right
 * shape for this: it already returns `label: null` and carries no place, no
 * counterpart and no type, because the WORKER'S own calendar had already
 * decided that absence detail belongs on the absences surface. Reusing it
 * means the employer view cannot drift from the worker view on date semantics,
 * and gets the privacy minimisation for free.
 *
 * ── AUTHORIZATION ──────────────────────────────────────────────────────────
 *
 * NOT enforced here. `worker_absences` RLS (migration 20260718150000) already
 * reads:
 *
 *   worker themselves  OR  public.caller_manages_worker(worker_id)  OR  admin
 *
 * and `caller_manages_worker` is true only when the caller OWNS the company
 * that actively employs the worker (`company_workers.status = 'active'`) or
 * OWNS the agency that actively represents them. An unrelated organisation
 * receives zero rows from the database itself — the boundary is structural,
 * not a filter this module could forget to apply. Nothing here widens it: no
 * service-role client, no SECURITY DEFINER call, no migration.
 *
 * Read-only. Sends nothing anywhere.
 */

/** Absence lifecycle states that make a worker genuinely UNAVAILABLE.
 *  A `requested` absence is a pending intention, not a commitment — showing it
 *  as unavailability would block scheduling on something nobody approved. */
const UNAVAILABLE_STATUSES = ["approved"] as const;

/** Bounded reads — the employer view never streams unbounded rows. */
const MANAGED_WORKER_LIMIT = 200;
const ABSENCE_READ_LIMIT = 500;

export interface WorkerUnavailability {
  readonly workerId: string;
  /** The worker's display name — already visible to this employer on every
   *  workforce surface; no new disclosure. */
  readonly workerName: string | null;
  /** The canonical planning item, built by the SAME mapper the worker's own
   *  calendar uses. Carries dates and status only. */
  readonly item: PlanningItem;
}

export type EmployerAvailabilityResult =
  | { readonly status: "not-authed" }
  | { readonly status: "unavailable" } /* leave model not applied yet */
  | { readonly status: "error" }
  | {
      readonly status: "ok";
      readonly unavailability: readonly WorkerUnavailability[];
      /** Workers the caller manages — the denominator for "who is free". */
      readonly managedWorkerCount: number;
    };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

const RELATION_NOT_FOUND = "42P01";
const UNDEFINED_COLUMN = "42703";

/**
 * Approved, dated unavailability for every worker the caller manages.
 *
 * Both reads are ordinary authenticated reads; RLS decides the rows. The
 * worker list is read first only so the view can say how many workers it
 * covers — the absence read is NOT scoped by it, because narrowing to a list
 * this process computed would be a weaker guarantee than the database's own
 * `caller_manages_worker`.
 */
export async function getEmployerWorkerAvailability(): Promise<EmployerAvailabilityResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "not-authed" };

  const workersRes = await (supabase as AnyClient)
    .from("company_workers")
    .select("worker_id, workers(id, display_name)")
    .eq("status", "active")
    .limit(MANAGED_WORKER_LIMIT);
  if (workersRes.error) return { status: "error" };

  type WorkerRow = {
    worker_id: string;
    workers: { id: string; display_name: string | null } | null;
  };
  const managed = (workersRes.data ?? []) as WorkerRow[];
  const nameByWorker = new Map<string, string | null>(
    managed.map((r) => [r.worker_id, r.workers?.display_name ?? null]),
  );

  // MINIMISED SELECT — `note` and `absence_type` are never requested. See the
  // module header: this is the enforcement point, not the component.
  const absRes = await (supabase as AnyClient)
    .from("worker_absences")
    .select("id, worker_id, start_date, end_date, status")
    .in("status", [...UNAVAILABLE_STATUSES])
    .order("start_date", { ascending: true })
    .limit(ABSENCE_READ_LIMIT);
  if (absRes.error) {
    const code = (absRes.error as { code?: string }).code;
    if (code === RELATION_NOT_FOUND || code === UNDEFINED_COLUMN) {
      return { status: "unavailable" };
    }
    return { status: "error" };
  }

  type AbsenceRow = {
    id: string;
    worker_id: string;
    start_date: string;
    end_date: string;
    status: string;
  };
  const unavailability: WorkerUnavailability[] = [];
  for (const row of (absRes.data ?? []) as AbsenceRow[]) {
    // The caller's OWN absences come back too (the worker-themselves branch of
    // the same policy) — an employer who is also a worker should not appear in
    // their own workforce availability list.
    if (!nameByWorker.has(row.worker_id)) continue;
    const item = projectAbsenceItem({
      id: row.id,
      startDate: row.start_date,
      endDate: row.end_date,
      status: row.status,
    });
    if (!item) continue;
    unavailability.push({
      workerId: row.worker_id,
      workerName: nameByWorker.get(row.worker_id) ?? null,
      item,
    });
  }

  return {
    status: "ok",
    unavailability,
    managedWorkerCount: nameByWorker.size,
  };
}

/* ------------------------------------------------------------------ */
/* Pure scheduling questions — canonical overlap semantics, reused      */
/* ------------------------------------------------------------------ */

/** A dated thing an employer is planning (a project band, a booking window). */
export interface PlannedWindow {
  readonly startDate: string;
  readonly endDate: string | null;
}

/**
 * Does a planned window collide with this worker's unavailability?
 *
 * Delegates to `rangesOverlapInclusive` and `effectiveEndDay` — the SAME
 * inclusive day-range semantics the booking accept guard enforces in the
 * database (`daterange(start, coalesce(end, start), '[]') &&`, errcode 23P01)
 * and the same the worker's calendar renders. A second overlap rule here
 * would be a second truth, and the two would disagree the first time either
 * changed.
 */
export function unavailabilityOverlaps(
  planned: PlannedWindow,
  unavailable: Pick<PlanningItem, "startDate" | "endDate">,
): boolean {
  const plannedEnd = effectiveEndDay({
    startDate: planned.startDate,
    endDate: planned.endDate,
  });
  const unavailableEnd = effectiveEndDay(unavailable);
  if (!planned.startDate || !plannedEnd) return false;
  if (!unavailable.startDate || !unavailableEnd) return false;
  return rangesOverlapInclusive(
    planned.startDate,
    plannedEnd,
    unavailable.startDate,
    unavailableEnd,
  );
}

/** Every managed worker whose unavailability collides with a planned window —
 *  the "can I staff these dates with this person?" answer. */
export function workersUnavailableFor(
  planned: PlannedWindow,
  unavailability: readonly WorkerUnavailability[],
): readonly WorkerUnavailability[] {
  return unavailability.filter((u) => unavailabilityOverlaps(planned, u.item));
}
