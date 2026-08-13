import "server-only";

import {
  getJournalWindowReport,
} from "@/lib/journal/journal-window-report";
import { countReviewablePendingEntries } from "@/lib/journal/reviewable-count";
import { getManagerPendingAbsences } from "@/lib/leave/absences";
import {
  absentOn,
  absentWithinDays,
  getEmployerWorkerAvailability,
} from "@/lib/planning/employer-availability";
import { utcTodayKey } from "@/lib/time/display";

/**
 * Organization Today (V8 employer daily loop, GAP 2) — the manager's morning
 * facts, composed EXCLUSIVELY from existing minimised reads. This module
 * issues no query of its own (guard: lib/guards/journal-window-privacy.test.ts
 * pins the no-`.from(` rule), so it can never widen what any read exposes.
 *
 * FACT-ONLY contract. Every figure is a real measurement:
 *   - roster            = ACTIVE company_workers links (the availability
 *                         read's denominator) — NOT "who is working today";
 *                         there is no shift or attendance data and this panel
 *                         must never claim there is;
 *   - absentToday/Next7 = APPROVED recorded absences (WHO and WHEN, never
 *                         WHY — the W12 minimised read);
 *   - pendingAbsenceDecisions = absence requests waiting on this manager;
 *   - journalEntriesToday     = the org's journal entries recorded today
 *                               (the GAP 4 window read, `today`);
 *   - awaitingReview          = the current reviewable queue.
 *
 * DEGRADATION: each read fails alone (the opening-brief pattern) and a failed
 * read yields `null` — "cannot be read right now" — never a zero presented as
 * a measurement. `pendingIncomingBookings` from the spec was DROPPED after
 * verification: `getPendingIncomingBookingCount()` counts proposals awaiting
 * the CALLER-as-worker's response (user-scoped), which is not an org fact.
 */

export interface AbsentTodayRow {
  readonly workerId: string;
  readonly name: string;
}

export interface AbsentUpcomingRow {
  readonly workerId: string;
  readonly name: string;
  readonly startDate: string;
  readonly endDate: string;
}

export type OrganizationToday =
  | {
      readonly applied: true;
      readonly todayIso: string;
      /** null = that fact cannot be read right now (never a fabricated 0). */
      readonly roster: number | null;
      readonly absentToday: readonly AbsentTodayRow[] | null;
      readonly absentNext7: readonly AbsentUpcomingRow[] | null;
      readonly pendingAbsenceDecisions: number | null;
      readonly journalEntriesToday: number | null;
      readonly awaitingReview: number | null;
    }
  | { readonly applied: false; readonly reason: "not-authed" | "error" };

const NEXT_DAYS = 7;

export async function getOrganizationToday(): Promise<OrganizationToday> {
  const todayIso = utcTodayKey();

  // Roster + absences — the W12 minimised availability read.
  let roster: number | null = null;
  let absentToday: readonly AbsentTodayRow[] | null = null;
  let absentNext7: readonly AbsentUpcomingRow[] | null = null;
  try {
    const availability = await getEmployerWorkerAvailability();
    if (availability.status === "not-authed") {
      return { applied: false, reason: "not-authed" };
    }
    if (availability.status === "ok") {
      roster = availability.managedWorkerCount;
      const seen = new Set<string>();
      const today: AbsentTodayRow[] = [];
      for (const u of absentOn(todayIso, availability.unavailability)) {
        if (seen.has(u.workerId)) continue; // one row per worker, not per band
        seen.add(u.workerId);
        today.push({ workerId: u.workerId, name: u.workerName ?? "—" });
      }
      absentToday = today;
      absentNext7 = absentWithinDays(
        todayIso,
        NEXT_DAYS,
        availability.unavailability,
      ).map((u) => ({
        workerId: u.workerId,
        name: u.workerName ?? "—",
        startDate: u.item.startDate ?? "",
        endDate: u.item.endDate ?? u.item.startDate ?? "",
      }));
    }
    // "unavailable" (leave model unapplied) keeps the nulls — stated, not 0.
  } catch {
    /* absent fields stay null */
  }

  let pendingAbsenceDecisions: number | null = null;
  try {
    const pending = await getManagerPendingAbsences();
    if (pending.applied) pendingAbsenceDecisions = pending.pending.length;
  } catch {
    /* stays null */
  }

  let journalEntriesToday: number | null = null;
  try {
    const report = await getJournalWindowReport("today", todayIso);
    if (report.applied) journalEntriesToday = report.totals.entries;
  } catch {
    /* stays null */
  }

  let awaitingReview: number | null = null;
  try {
    awaitingReview = await countReviewablePendingEntries();
  } catch {
    /* stays null */
  }

  // Nothing measurable at all → the panel must not render an empty shell that
  // impersonates "all clear".
  if (
    roster === null &&
    pendingAbsenceDecisions === null &&
    journalEntriesToday === null &&
    awaitingReview === null
  ) {
    return { applied: false, reason: "error" };
  }

  return {
    applied: true,
    todayIso,
    roster,
    absentToday,
    absentNext7,
    pendingAbsenceDecisions,
    journalEntriesToday,
    awaitingReview,
  };
}
