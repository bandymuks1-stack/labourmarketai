import { addDays } from "./forecast-days";
import type { ForecastFacts } from "./forecast-engine";

/**
 * Synthetic facts for the forecast engine tests and the demonstration test.
 * Not production data, never shown in the product.
 *
 * The base project, as of TODAY: 28 leaf tasks, 14 done (one every other day
 * over the last 28 days), 10 h recorded on each of the last 28 days on the
 * journal (280 h, all confirmed), a team of 2, planned end TODAY + 35.
 *   hours per task      280 / 14            = 20 h
 *   required hours      14 × 20             = 280 h
 *   daily rate          280 / 28            = 10 h per calendar day
 *   per person          10 / 2              = 5 h
 *   completion          280 / 10 = 28 days  → TODAY + 28, slack 7 → on_track
 */
export const TODAY = "2026-10-14";

export function baseFacts(overrides: Partial<ForecastFacts> = {}): ForecastFacts {
  const window = Array.from({ length: 28 }, (_, i) => addDays(TODAY, -i));
  return {
    projectId: "00000000-0000-4000-8000-00000000f001",
    today: TODAY,
    project: { status: "live", startDate: addDays(TODAY, -60), plannedEnd: addDays(TODAY, 35) },
    tasks: {
      total: 28,
      done: 14,
      blocked: 0,
      completedOn: Array.from({ length: 14 }, (_, i) => addDays(TODAY, -2 * i)),
    },
    stages: { total: 3, done: 1, blocked: 0, overdue: 0, completedOn: [addDays(TODAY, -20)] },
    hours: {
      basis: "journal",
      byDay: window.map((day) => ({ day, hours: 10 })),
      totalHours: 280,
      confirmedHours: 280,
      otherLedgerHours: null,
      complete: true,
      contributorsInWindow: 2,
    },
    team: { activePeople: 2, absences: [], freeInternalPeople: null },
    quality: { open: { low: 0, medium: 0, high: 0, critical: 0 }, overdueOpen: 0, failedCorrections: 0 },
    readiness: { workersWithMissingItems: 0 },
    economics: { budgetCents: null, actualCostCents: null },
    sources: [{ key: "journal_entries", rows: 28, state: "read" }],
    ...overrides,
  };
}
