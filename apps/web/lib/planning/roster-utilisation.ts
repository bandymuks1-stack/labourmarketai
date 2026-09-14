import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getEmployerWorkerAvailability } from "@/lib/planning/employer-availability";
import { getEmployerWorkerCommitments } from "@/lib/planning/employer-committed-work";
import type { HeldTime, ReservationSource } from "@/lib/workforce/commitment-reservation";
import { measureUtilisation, type WorkerUtilisation } from "@/lib/workforce/utilisation";

/**
 * HOW MUCH OF THE NEXT MONTH THE ROSTER IS ALREADY SPOKEN FOR — the read
 * behind CAL-9.
 *
 * NO NEW READ AND NO NEW STORE. The same two authorized employer reads that
 * answer "who is free this week?" and back the CAL-7 reservation verdict are
 * asked once more, over a window instead of at a moment. One description of
 * what holds a person's time; three readings of it.
 *
 * THE WINDOW IS AN INPUT, NOT A CONSTANT, and it travels with every answer.
 * `measureUtilisation` refuses to state a ratio without the window it came
 * from, because the denominator here is CALENDAR DAYS: this product records
 * no contracted hours and no working pattern, so an FTE percentage would be a
 * number invented in code. "18 of 30 days committed" is measurable; "60%
 * utilised" is not.
 *
 * SEP-7 travels too. A read that did not answer produces `unknown` with null
 * counts for every worker — never a roster that looks entirely free because
 * the absence table could not be reached.
 */

/** Four weeks. Long enough to plan against, short enough that every day in it
 *  is a day somebody could still change. */
export const ROSTER_UTILISATION_WINDOW_DAYS = 28;

/** Both bookings and project assignments come from ONE read. */
const COMMITMENT_SOURCES: readonly ReservationSource[] = ["project", "booking"];

export interface RosterUtilisationWindow {
  readonly startDate: string;
  readonly endDate: string;
  readonly days: number;
}

export type RosterUtilisation =
  | { readonly status: "not-authed" }
  | {
      readonly status: "ok";
      readonly window: RosterUtilisationWindow;
      readonly rows: readonly WorkerUtilisation[];
    };

function isoDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export async function getRosterUtilisation(
  workerIds: readonly string[],
  options?: {
    /** Injected for tests and for a caller that already fixed a window. */
    readonly today?: Date;
    readonly days?: number;
    readonly caller?: { readonly supabase: SupabaseClient; readonly userId: string };
  },
): Promise<RosterUtilisation> {
  const days = options?.days ?? ROSTER_UTILISATION_WINDOW_DAYS;
  const startMs = (options?.today ?? new Date()).getTime();
  const window: RosterUtilisationWindow = {
    startDate: isoDay(startMs),
    endDate: isoDay(startMs + (days - 1) * 86_400_000),
    days,
  };
  if (workerIds.length === 0) return { status: "ok", window, rows: [] };

  const [committed, availability] = await Promise.all([
    getEmployerWorkerCommitments(workerIds, options?.caller),
    getEmployerWorkerAvailability(options?.caller),
  ]);
  if (availability.status === "not-authed") return { status: "not-authed" };

  const unreadableSources: ReservationSource[] = [];
  const heldByWorker = new Map<string, HeldTime[]>();
  const push = (workerId: string, item: HeldTime) => {
    const list = heldByWorker.get(workerId);
    if (list) list.push(item);
    else heldByWorker.set(workerId, [item]);
  };

  if (committed.status === "ok") {
    for (const c of committed.commitments) {
      push(c.workerId, {
        source: c.kind,
        sourceId: c.sourceId,
        label: c.label,
        startDate: c.startDate,
        endDate: c.endDate,
      });
    }
    // An assignment to a project nobody dated cannot be placed on a
    // calendar. It becomes a named gap, which turns that worker's counts
    // into a floor — never a silently smaller number.
    for (const u of committed.undatedProjects) {
      push(u.workerId, {
        source: "project",
        sourceId: u.projectId,
        label: u.label,
        startDate: null,
        endDate: null,
      });
    }
  } else {
    unreadableSources.push(...COMMITMENT_SOURCES);
  }

  if (availability.status === "ok") {
    for (const u of availability.unavailability) {
      push(u.workerId, {
        // Never a reason: the employer read does not fetch one and nothing
        // downstream may add one back.
        source: "absence",
        sourceId: u.item.id,
        label: null,
        startDate: u.item.startDate,
        endDate: u.item.endDate,
      });
    }
  } else {
    unreadableSources.push("absence");
  }

  return {
    status: "ok",
    window,
    rows: workerIds.map((workerId) =>
      measureUtilisation({
        workerId,
        window: { startDate: window.startDate, endDate: window.endDate },
        held: heldByWorker.get(workerId) ?? [],
        unreadableSources,
      }),
    ),
  };
}
