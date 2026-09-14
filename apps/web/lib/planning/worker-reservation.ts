import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getEmployerWorkerAvailability } from "@/lib/planning/employer-availability";
import { getEmployerWorkerCommitments } from "@/lib/planning/employer-committed-work";
import {
  reserveCapacity,
  type HeldTime,
  type ReservationSource,
  type ReservationVerdict,
  type ReservationWindow,
} from "@/lib/workforce/commitment-reservation";

/**
 * IS THIS PERSON ALREADY SOMEWHERE ELSE ON THESE DAYS? — the server side of
 * CAL-7.
 *
 * NO NEW READ AND NO NEW AUTHORITY. Both sources already exist and are
 * already used by the capacity answer:
 *
 *   · `getEmployerWorkerCommitments` — accepted bookings + active project
 *     assignments, authorized by `pwa_select` and `booking_requests_select`.
 *   · `getEmployerWorkerAvailability` — APPROVED absences only, authorized by
 *     `caller_manages_worker`, and deliberately never fetching `note` or
 *     `absence_type` because why someone is away can be health information.
 *
 * This module composes them and asks the ONE reservation rule
 * (`lib/workforce/commitment-reservation.ts`) the question. It grants nothing:
 * a caller who cannot see a worker's commitments gets no rows from the
 * database and therefore an honest `unknown`, not a fabricated `clear`.
 *
 * WHY THE UNREADABLE LIST IS DERIVED HERE. The pure model can only be as
 * honest as the caller's report of which reads answered. Deriving that from
 * the read RESULTS — rather than from a boolean anyone can forget to pass —
 * is what makes "clear means every source answered" a property of the code
 * instead of a convention.
 */

export interface WorkerReservationInput {
  /** `workers.id` — not a profile id. */
  readonly workerId: string;
  readonly window: ReservationWindow;
  /**
   * Source ids to ignore — pass the project id when re-checking an assignment
   * you have just made, so the caller is not reported against itself.
   */
  readonly exclude?: readonly string[];
  /** OPTIONAL explicit caller (G4 bridge). Absent = the cookie session. */
  readonly caller?: { readonly supabase: SupabaseClient; readonly userId: string };
}

/** Project assignments, accepted bookings and approved trips all come from
 *  ONE read, so when that read fails ALL THREE are unknown, and saying so is
 *  the point. Missing one from this list would let an unread source be
 *  reported as an absence of commitments. */
const COMMITMENT_SOURCES: readonly ReservationSource[] = ["project", "booking", "trip"];

export async function checkWorkerReservation(
  input: WorkerReservationInput,
): Promise<ReservationVerdict> {
  const [committed, availability] = await Promise.all([
    getEmployerWorkerCommitments([input.workerId], input.caller),
    getEmployerWorkerAvailability(input.caller),
  ]);

  const held: HeldTime[] = [];
  const unreadableSources: ReservationSource[] = [];

  if (committed.status === "ok") {
    for (const c of committed.commitments) {
      if (c.workerId !== input.workerId) continue;
      held.push({
        source: c.kind,
        sourceId: c.sourceId,
        label: c.label,
        startDate: c.startDate,
        endDate: c.endDate,
      });
    }
    // An assignment to an undated project reaches the model as a commitment
    // with no dates, which the model reports as a named gap. It is not a
    // collision (nothing proves it covers these days) and it is not nothing.
    for (const u of committed.undatedProjects) {
      if (u.workerId !== input.workerId) continue;
      held.push({
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
      if (u.workerId !== input.workerId) continue;
      held.push({
        source: "absence",
        sourceId: u.item.id,
        // Stays null all the way through. The employer read never asked for
        // the reason and nothing downstream may add one back.
        label: null,
        startDate: u.item.startDate,
        endDate: u.item.endDate,
      });
    }
  } else {
    unreadableSources.push("absence");
  }

  return reserveCapacity({
    window: input.window,
    held,
    unreadableSources,
    exclude: input.exclude,
  });
}
