import type { TimeRealityKind } from "@/components/app/work-world/primitives";
import { isConflictEligible, type PlanningItem } from "@/lib/planning/planning-model";

/**
 * WHICH TEMPORAL REALITY IS THIS ROW? — the calendar's one honest rule.
 *
 * The calendar already knew the answer in three places (the journal source is
 * a dated fact; `isConflictEligible` names the rows that physically bind the
 * person; an undated row goes to its own section). This states it ONCE so
 * every row can wear it, and so a guard can pin that a plan is never drawn
 * as an observation:
 *
 *   observed  — a journal entry: the work happened, at its real recorded day.
 *   committed — the caller's own binding commitment (accepted incoming
 *               booking, assigned project, approved absence, approved or
 *               completed trip) — exactly the conflict-eligible set, so the
 *               calendar's conflict rule and its committed label can never
 *               disagree.
 *   planned   — every other dated row: a proposed booking, a task due day, a
 *               project band seen as its manager, a finance due date, an
 *               invitation, a stage, a requested absence.
 *   unknown   — no date. Never today, never zero.
 *
 * `conflict` and `derived` are not row realities: a conflict is a RELATION
 * between two committed rows (`detectConflicts`), and a derived month share
 * belongs to a period record, not to a calendar row.
 */
export type RowTimeReality = Extract<
  TimeRealityKind,
  "observed" | "committed" | "planned" | "unknown"
>;

export function temporalReality(item: PlanningItem): RowTimeReality {
  if (!item.startDate) return "unknown";
  if (item.sourceType === "journal") return "observed";
  if (isConflictEligible(item)) return "committed";
  return "planned";
}
