import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { listManagedWorkers } from "@/lib/instructions/instructions";
import { getEmployerWorkerAvailability } from "@/lib/planning/employer-availability";
import { getEmployerWorkerCommitments } from "@/lib/planning/employer-committed-work";
import {
  proposeAlternatives,
  type AlternativesProposal,
  type CrewCandidate,
} from "@/lib/workforce/commitment-alternatives";
import {
  reserveCapacity,
  type HeldTime,
  type ReservationSource,
  type ReservationVerdict,
  type ReservationWindow,
} from "@/lib/workforce/commitment-reservation";

/**
 * Server composition behind J-TIME-FREEDOM step 4 — "Alternatives are shown".
 *
 * ONE READ FOR THE WHOLE ROSTER. The reservation check
 * (`worker-reservation.ts`) reads one person's commitments. Proposing a crew
 * alternative needs the same answer for everyone the caller manages, and
 * `getEmployerWorkerCommitments` already takes a LIST, so the roster is read
 * once and every candidate's verdict is derived from that one result — not
 * one round trip per person. Both reads are the existing employer readers,
 * under the caller's own RLS; this module adds no client and no filter of its
 * own.
 *
 * `unreadableSources` is derived from the read RESULTS, exactly as the single
 * check does: a failed roster read makes every candidate `unknown`, and an
 * unknown candidate is listed as unconfirmed, never as free (SEP-7).
 *
 * WHY THE DATE SEARCH USES THE SAME HELD LIST AS THE VERDICT. The colliding
 * person's alternatives are computed against everything they hold — not only
 * the commitments that collided — so a "later" window is not proposed straight
 * into the next commitment along.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

const COMMITMENT_SOURCES: readonly ReservationSource[] = ["project", "booking", "trip"];

/** Bounded like every other planning read. */
const ROSTER_LIMIT = 200;

export interface AssignmentAlternativesInput {
  readonly projectId: string;
  /** `workers.id` of the person whose verdict collided. */
  readonly collidingWorkerId: string;
  readonly verdict: ReservationVerdict;
  readonly window: ReservationWindow;
  /** ISO day; no date alternative starts before it. */
  readonly notBefore: string;
  /** OPTIONAL explicit caller (G4 bridge). Absent = the cookie session. */
  readonly caller?: { readonly supabase: SupabaseClient; readonly userId: string };
}

export async function proposeAssignmentAlternatives(
  input: AssignmentAlternativesInput,
): Promise<AlternativesProposal> {
  const supabase = input.caller?.supabase ?? (await createClient());

  // The roster, as the assignment picker already sees it — profile ids and
  // names the employer is already shown. Nothing new is disclosed here.
  const roster = (await listManagedWorkers()).slice(0, ROSTER_LIMIT);
  const profileIds = roster.map((r) => r.profileId);

  const workersRes =
    profileIds.length === 0
      ? { data: [], error: null }
      : await asAny(supabase)
          .from("workers")
          .select("id, profile_id")
          .in("profile_id", profileIds)
          .limit(ROSTER_LIMIT);
  const workerRows = (workersRes.error ? [] : (workersRes.data ?? [])) as {
    id: string;
    profile_id: string;
  }[];
  const nameByProfile = new Map(roster.map((r) => [r.profileId, r.name] as const));
  const workerIds = workerRows.map((w) => w.id);
  if (!workerIds.includes(input.collidingWorkerId)) workerIds.push(input.collidingWorkerId);

  const [committed, availability] = await Promise.all([
    getEmployerWorkerCommitments(workerIds, input.caller),
    getEmployerWorkerAvailability(input.caller),
  ]);

  const heldByWorker = new Map<string, HeldTime[]>();
  const push = (workerId: string, h: HeldTime) => {
    const list = heldByWorker.get(workerId) ?? [];
    list.push(h);
    heldByWorker.set(workerId, list);
  };
  const unreadableSources: ReservationSource[] = [];
  /** Workers already on THIS project — not alternatives to themselves. */
  const alreadyOnProject = new Set<string>();

  if (committed.status === "ok") {
    for (const c of committed.commitments) {
      if (c.kind === "project" && c.sourceId === input.projectId) alreadyOnProject.add(c.workerId);
      push(c.workerId, {
        source: c.kind,
        sourceId: c.sourceId,
        label: c.label,
        startDate: c.startDate,
        endDate: c.endDate,
      });
    }
    for (const u of committed.undatedProjects) {
      if (u.projectId === input.projectId) alreadyOnProject.add(u.workerId);
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
        label: null,
        startDate: u.item.startDate,
        endDate: u.item.endDate,
      });
    }
  } else {
    unreadableSources.push("absence");
  }

  const exclude = [input.projectId];
  const candidates: CrewCandidate[] = [];
  for (const w of workerRows) {
    if (w.id === input.collidingWorkerId) continue;
    if (alreadyOnProject.has(w.id)) continue;
    candidates.push({
      workerId: w.id,
      profileId: w.profile_id,
      name: nameByProfile.get(w.profile_id) ?? w.profile_id.slice(0, 8),
      verdict: reserveCapacity({
        window: input.window,
        held: heldByWorker.get(w.id) ?? [],
        unreadableSources,
        exclude,
      }),
    });
  }

  return proposeAlternatives({
    verdict: input.verdict,
    window: input.window,
    collidingWorkerId: input.collidingWorkerId,
    held: heldByWorker.get(input.collidingWorkerId) ?? [],
    exclude,
    candidates,
    notBefore: input.notBefore,
  });
}
