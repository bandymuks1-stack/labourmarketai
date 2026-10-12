import "server-only";

import { getWorkforce } from "@/lib/workforce/workforce";
import { getRosterCommitments } from "@/lib/planning/roster-commitments";
import type { RosterCommitmentsView } from "@/lib/planning/roster-commitments-model";

/**
 * HOW MANY PEOPLE HAVE OVERLAPPING COMMITMENTS — the company home's
 * "conflicts" decision (owner programme 2026-10-12: a manager sees conflicts
 * within three seconds, with a direct link to the problem).
 *
 * Not a second conflict engine: the SAME two reads the workforce planning page
 * renders (`getWorkforce()` → its workers → `getRosterCommitments`) and the
 * SAME pure overlap rule (`markCommitmentOverlaps`), so the number on the home
 * is exactly the people the linked "committed where" section flags.
 *
 * UNKNOWN IS NOT ZERO (SEP-7): any failed read answers `null`, which the home
 * renders as "could not be read", never as "no conflicts".
 */
export function countPeopleWithConflicts(view: RosterCommitmentsView): number | null {
  if (view.status !== "ok") return null;
  return view.rows.filter((r) => r.overlaps > 0).length;
}

export async function countRosterConflicts(): Promise<number | null> {
  try {
    const workforce = await getWorkforce();
    if (workforce.status !== "ok") return null;
    // An unreadable roster source is not "nobody, so no conflicts".
    const { project, assignments, workers } = workforce.sources;
    if ([project, assignments, workers].some((s) => s.status !== "ok")) return null;
    const ids = workforce.workers.map((w) => w.workerId);
    if (ids.length === 0) return 0;
    return countPeopleWithConflicts(await getRosterCommitments(ids));
  } catch {
    return null;
  }
}
