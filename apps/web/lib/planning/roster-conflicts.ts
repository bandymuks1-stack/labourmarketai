import "server-only";

import { getWorkforce } from "@/lib/workforce/workforce";
import { getRosterCommitments } from "@/lib/planning/roster-commitments";
import { getEmployerWorkerAvailability } from "@/lib/planning/employer-availability";
import { buildRosterTimeline, mondayOf, type RosterTimeline } from "@/lib/planning/roster-timeline-model";
import type { RosterCommitmentsView } from "@/lib/planning/roster-commitments-model";
import { viewerWorkToday } from "@/lib/time/viewer-day";

/**
 * HOW MANY PEOPLE HAVE A PLANNING CONFLICT — the company home's "conflicts"
 * decision (owner programme 2026-10-12: a manager sees conflicts within three
 * seconds, with a direct link to the problem).
 *
 * Not a second conflict engine: the SAME reads the workforce planning page
 * renders (`getWorkforce()` → its workers → `getRosterCommitments`, and
 * `getEmployerWorkerAvailability` for approved leave) and the SAME pure rules
 * it flags with:
 *   - `markCommitmentOverlaps` — two commitments of one person on the same days
 *     (any date, the "committed where" list);
 *   - `buildRosterTimeline` — a commitment or plan colliding with another one
 *     OR with approved leave, over the page's default 28-day window from this
 *     week's Monday (the timeline the link opens).
 * A person counts once, whichever rule flags them.
 *
 * UNKNOWN IS NOT ZERO (SEP-7): any failed read answers `null`, which the home
 * renders as "could not be read", never as "no conflicts".
 */
export const CONFLICT_WINDOW_DAYS = 28;

export function countPeopleWithConflicts(
  view: RosterCommitmentsView,
  timeline: RosterTimeline | null,
): number | null {
  if (view.status !== "ok") return null;
  const flagged = new Set<string>();
  for (const r of view.rows) if (r.overlaps > 0) flagged.add(r.workerId);
  for (const p of timeline?.people ?? []) if (p.bars.some((b) => b.conflict)) flagged.add(p.workerId);
  return flagged.size;
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
    const [view, availability, today] = await Promise.all([
      getRosterCommitments(ids),
      getEmployerWorkerAvailability(),
      viewerWorkToday(),
    ]);
    if (view.status !== "ok" || availability.status !== "ok") return null;
    const timeline = buildRosterTimeline({
      rows: view.rows,
      absences: availability.unavailability.map((u) => ({
        workerId: u.workerId,
        workerName: u.workerName,
        sourceId: u.item.id,
        startDate: u.item.startDate,
        endDate: u.item.endDate,
      })),
      from: mondayOf(today.todayIso),
      days: CONFLICT_WINDOW_DAYS,
      today: today.todayIso,
    });
    return countPeopleWithConflicts(view, timeline);
  } catch {
    return null;
  }
}
