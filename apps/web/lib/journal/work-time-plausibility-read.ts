import "server-only";

import type { DomainCaller } from "@/lib/domain/caller";
import { listJournalEntries } from "@/lib/journal/journal-list-core";
import { deriveEntryWorkTime } from "@/lib/journal/work-time";
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
    const read = await listJournalEntries(caller, { workerId });
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
