import "server-only";

import type { DomainCaller } from "@/lib/domain/caller";
import { listJournalEntries } from "@/lib/journal/journal-list-core";
import { deriveEntryWorkTime } from "@/lib/journal/work-time";
import { organizationHoursPerDay } from "@/lib/journal/work-intelligence";
import { readOrganizationRecords } from "@/lib/journal/work-intelligence-read";
import {
  deriveWorkTimeChecks,
  openDayCheckFor,
  type WorkDayCheck,
} from "@/lib/journal/work-time-plausibility";

export type { WorkDayCheck } from "@/lib/journal/work-time-plausibility";

/**
 * The day check an INTAKE surface shows right after a save (owner §13 —
 * the warning belongs where the record was made, not only in the section
 * the person may open later). Reuses THE journal-list read and THE
 * canonical work-time rule; nothing here derives an hour of its own.
 *
 * THE SAME LEDGER AS THE SECTION (issue #1689, lane B): the section's day
 * check adds the organization's own hour records for the same day (owner
 * §19 — an imported timesheet on top of a live record); this check read
 * none, so a composer could report a clean save that the section, one
 * navigation later, flagged as a day over 24 h. Both now build the per-day
 * map through the ONE helper (`organizationHoursPerDay`) over the ONE
 * allocation read (`readOrganizationRecords`). An unreadable ledger is
 * `null` → an empty map: the check then rests on the journal alone, as it
 * did before, never on an invented figure.
 *
 * Honest degradation: an unreadable journal yields `null` — the save has
 * already succeeded and stays reported as such; the check is simply not
 * known (SEP-7: UNKNOWN ≠ "nothing to check"). The section shows the full
 * set on the next read regardless.
 */
export async function readSavedEntryDayCheck(
  caller: DomainCaller,
  workerId: string,
  entryId: string,
): Promise<WorkDayCheck | null> {
  try {
    const [read, organizationRecords] = await Promise.all([
      listJournalEntries(caller, { workerId }),
      readOrganizationRecords(caller.supabase, workerId),
    ]);
    if (!read.ok) return null;
    const checks = deriveWorkTimeChecks(
      read.entries.map((e) => ({
        time: deriveEntryWorkTime({
          entryId: e.id,
          createdAt: e.created_at,
          originalText: e.original_text,
          metrics: e.journal_entry_metrics ?? [],
        }),
        metrics: e.journal_entry_metrics ?? [],
      })),
      { organizationHoursByDay: organizationHoursPerDay(organizationRecords) },
    );
    const hit = openDayCheckFor(checks, entryId);
    if (!hit || (hit.code !== "day_over_24h" && hit.code !== "long_day")) return null;
    return {
      code: hit.code,
      day: hit.day,
      hours: hit.hours,
      entries: hit.entryIds.length,
    };
  } catch {
    return null;
  }
}
