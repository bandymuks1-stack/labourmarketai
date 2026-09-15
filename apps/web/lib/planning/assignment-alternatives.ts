import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { listManagedWorkers } from "@/lib/instructions/instructions";
import { readRosterHeldTime } from "@/lib/planning/roster-held-time";
import {
  proposeAlternatives,
  type AlternativesProposal,
  type CrewCandidate,
} from "@/lib/workforce/commitment-alternatives";
import {
  reserveCapacity,
  type ReservationVerdict,
  type ReservationWindow,
} from "@/lib/workforce/commitment-reservation";

/**
 * Server composition behind J-TIME-FREEDOM step 4 — "Alternatives are shown".
 *
 * ONE READ FOR THE WHOLE ROSTER. The reservation check
 * (`worker-reservation.ts`) reads one person's commitments. Proposing a crew
 * alternative needs the same answer for everyone the caller manages, so the
 * roster is read once (`readRosterHeldTime`) and every candidate's verdict is
 * derived from that one result — not one round trip per person. Both reads
 * behind it are the existing employer readers, under the caller's own RLS;
 * this module adds no client and no filter of its own.
 *
 * A failed roster read makes every candidate `unknown`, and an unknown
 * candidate is listed as unconfirmed, never as free (SEP-7).
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

  const rosterHeld = await readRosterHeldTime({
    workerIds,
    projectId: input.projectId,
    caller: input.caller,
  });

  const exclude = [input.projectId];
  const candidates: CrewCandidate[] = [];
  for (const w of workerRows) {
    if (w.id === input.collidingWorkerId) continue;
    // Already on this project — not an alternative to themselves.
    if (rosterHeld.onProject.has(w.id)) continue;
    candidates.push({
      workerId: w.id,
      profileId: w.profile_id,
      name: nameByProfile.get(w.profile_id) ?? w.profile_id.slice(0, 8),
      verdict: reserveCapacity({
        window: input.window,
        held: rosterHeld.heldByWorker.get(w.id) ?? [],
        unreadableSources: rosterHeld.unreadableSources,
        exclude,
      }),
    });
  }

  return proposeAlternatives({
    verdict: input.verdict,
    window: input.window,
    collidingWorkerId: input.collidingWorkerId,
    held: rosterHeld.heldByWorker.get(input.collidingWorkerId) ?? [],
    exclude,
    candidates,
    notBefore: input.notBefore,
  });
}
