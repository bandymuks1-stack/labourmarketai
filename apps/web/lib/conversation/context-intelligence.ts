import {
  addDays,
  effectiveEndDay,
  itemsForDay,
  detectConflicts,
  type PlanningItem,
} from "@/lib/planning/planning-model";

/**
 * Context Intelligence Engine — PURE core (rebuild phase 3).
 *
 * Deterministic work-context composition over the rows the canonical reads
 * already returned (getPlanning's 8 sources + the workspace resolver). NO IO,
 * no LLM, no new store — this module is to the conversation what
 * planning-model is to the calendar: unit-testable rules, one place.
 *
 * Honesty contract (doctrine §7):
 *  - every derived fact traces to a real row that was ALREADY read under the
 *    caller's own RLS;
 *  - ambiguity is surfaced, never guessed away: the "exactly one" rule below
 *    mirrors the canonical journal auto-link (`create_journal_entry_full`
 *    links a project only when exactly ONE active assignment exists);
 *  - suggestions are CAPPED and rule-based — an empty day yields zero
 *    invented recommendations.
 */

/** Deadline-bearing sources — a task due day, an unpaid finance due day and a
 *  pending invitation expiry are DEADLINES; project/booking/absence bands are
 *  commitments, and journal rows are facts (never a deadline). */
const DEADLINE_SOURCES = new Set(["task", "finance", "invitation"]);

export interface WorkContext {
  /** Items whose inclusive band covers today (all sources). */
  readonly todayItems: readonly PlanningItem[];
  /** REAL overlapping personal commitments (same rule as the calendar). */
  readonly conflictCount: number;
  /** Open tasks whose due day already passed (task source = open tasks only). */
  readonly overdueTasks: readonly PlanningItem[];
  /** The nearest upcoming deadline (today or later), or null. */
  readonly nextDeadline: PlanningItem | null;
  /** EXACTLY-ONE rule: the single assigned project band covering today —
   *  several candidates → null (ambiguity is asked about, never guessed). */
  readonly activeProject: PlanningItem | null;
  /** An accepted incoming booking covers today. */
  readonly hasAcceptedBookingToday: boolean;
  /** A journal FACT was recorded today. */
  readonly hasJournalEntryToday: boolean;
  /** Non-journal items covering tomorrow — the free-day signal. */
  readonly tomorrowLoad: number;
}

export function buildWorkContext(
  items: readonly PlanningItem[],
  todayIso: string,
): WorkContext {
  const tomorrow = addDays(todayIso, 1);
  const todayItems = itemsForDay(items, todayIso);

  const nonPast = items.filter((it) => {
    const end = effectiveEndDay(it);
    return it.startDate !== null && end !== null && end >= todayIso;
  });

  const overdueTasks = items.filter(
    (it) => it.sourceType === "task" && it.startDate !== null && it.startDate < todayIso,
  );

  const deadlines = items
    .filter(
      (it) =>
        DEADLINE_SOURCES.has(it.sourceType) &&
        it.startDate !== null &&
        it.startDate >= todayIso,
    )
    .sort((a, b) => (a.startDate! < b.startDate! ? -1 : 1));

  const assignedToday = todayItems.filter(
    (it) => it.sourceType === "project" && it.roleContext === "assigned",
  );

  return {
    todayItems,
    conflictCount: detectConflicts(nonPast).length,
    overdueTasks,
    nextDeadline: deadlines[0] ?? null,
    activeProject: assignedToday.length === 1 ? assignedToday[0] : null,
    hasAcceptedBookingToday: todayItems.some(
      (it) =>
        it.sourceType === "booking" &&
        it.status === "accepted" &&
        it.roleContext === "incoming",
    ),
    hasJournalEntryToday: items.some(
      (it) => it.sourceType === "journal" && it.startDate === todayIso,
    ),
    tomorrowLoad: itemsForDay(items, tomorrow).filter(
      (it) => it.sourceType !== "journal",
    ).length,
  };
}

/** The next logical step the REAL data supports. Order = priority. */
export type NextBestAction =
  | { kind: "overdue-tasks"; count: number }
  | { kind: "log-today" }
  | { kind: "reserve-tomorrow"; day: string; deadlineLabel: string | null };

/** At most this many proactive suggestions per readback — assistance, not
 *  spam. Priority order picks the most actionable first. */
export const NEXT_BEST_ACTION_LIMIT = 2;

export function deriveNextBestActions(
  ctx: WorkContext,
  todayIso: string,
): NextBestAction[] {
  const actions: NextBestAction[] = [];

  if (ctx.overdueTasks.length > 0) {
    actions.push({ kind: "overdue-tasks", count: ctx.overdueTasks.length });
  }

  // Working today (accepted booking band) but nothing recorded → the journal
  // is the spine; the cheapest most valuable next step is to log the work.
  if (ctx.hasAcceptedBookingToday && !ctx.hasJournalEntryToday) {
    actions.push({ kind: "log-today" });
  }

  // A deadline lands TOMORROW while tomorrow is (nearly) free → suggest
  // reserving time. Only from real rows: a real deadline + a real empty day.
  const tomorrow = addDays(todayIso, 1);
  if (
    ctx.nextDeadline?.startDate === tomorrow &&
    ctx.tomorrowLoad <= 1
  ) {
    actions.push({
      kind: "reserve-tomorrow",
      day: tomorrow,
      deadlineLabel: ctx.nextDeadline.label,
    });
  }

  return actions.slice(0, NEXT_BEST_ACTION_LIMIT);
}
