import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getEmployerWorkerAvailability } from "@/lib/planning/employer-availability";
import { getEmployerWorkerCommitments } from "@/lib/planning/employer-committed-work";
import type { HeldTime, ReservationSource } from "@/lib/workforce/commitment-reservation";

/**
 * ONE READ OF WHAT A SET OF PEOPLE ALREADY HOLD.
 *
 * `checkWorkerReservation` answers for one person. Anything that must answer
 * for several — proposing a crew alternative (step 4), assigning a brigade
 * and telling the truth about every member's calendar (WRK-6) — needs the
 * same answer for a list, and `getEmployerWorkerCommitments` already takes a
 * list. So the roster is read ONCE here and every per-person verdict is
 * derived from that one result, rather than one round trip per person.
 *
 * `unreadableSources` is derived from the read RESULTS, exactly as the
 * single check does it: a failed commitments read makes project, booking and
 * trip unreadable for EVERY person in the list, and the verdicts built on it
 * are `unknown`, never `clear` (SEP-7).
 *
 * Both reads are the existing employer readers under the caller's own RLS.
 * This module adds no client, no filter and no grant.
 */

const COMMITMENT_SOURCES: readonly ReservationSource[] = ["project", "booking", "trip"];

export interface RosterHeldTime {
  readonly heldByWorker: ReadonlyMap<string, readonly HeldTime[]>;
  readonly unreadableSources: readonly ReservationSource[];
  /** Workers holding an active assignment to the named project, when one
   *  was asked about. */
  readonly onProject: ReadonlySet<string>;
}

export async function readRosterHeldTime(input: {
  readonly workerIds: readonly string[];
  /** When given, `onProject` names the workers already assigned to it. */
  readonly projectId?: string;
  readonly caller?: { readonly supabase: SupabaseClient; readonly userId: string };
}): Promise<RosterHeldTime> {
  const [committed, availability] = await Promise.all([
    getEmployerWorkerCommitments(input.workerIds, input.caller),
    getEmployerWorkerAvailability(input.caller),
  ]);

  const heldByWorker = new Map<string, HeldTime[]>();
  const push = (workerId: string, h: HeldTime) => {
    const list = heldByWorker.get(workerId) ?? [];
    list.push(h);
    heldByWorker.set(workerId, list);
  };
  const unreadableSources: ReservationSource[] = [];
  const onProject = new Set<string>();

  if (committed.status === "ok") {
    for (const c of committed.commitments) {
      if (c.kind === "project" && input.projectId && c.sourceId === input.projectId) onProject.add(c.workerId);
      push(c.workerId, {
        source: c.kind,
        sourceId: c.sourceId,
        label: c.label,
        startDate: c.startDate,
        endDate: c.endDate,
      });
    }
    for (const u of committed.undatedProjects) {
      if (input.projectId && u.projectId === input.projectId) onProject.add(u.workerId);
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
        source: "absence",
        sourceId: u.item.id,
        // Stays null all the way through: the employer read never asks for
        // the reason and nothing downstream may add one back.
        label: null,
        startDate: u.item.startDate,
        endDate: u.item.endDate,
      });
    }
  } else {
    unreadableSources.push("absence");
  }

  return { heldByWorker, unreadableSources, onProject };
}
