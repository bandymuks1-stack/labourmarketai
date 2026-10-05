import { countedOnce } from "@/lib/journal/counted-once";
import { isLiveJournalEntry, type LiveJournalEntryFlags } from "@/lib/journal/journal-list-core";

/**
 * THE ENTRIES THE VERIFIED CV MAY STAND BEHIND: live (not deleted, not
 * superseded) and counted once per correction chain. Both the employer
 * "Confirmed Work Proof" rows and the separate "accepted by the client" count
 * are read over exactly this set, so a deleted entry, a superseded entry or a
 * withdrawn original replaced by its live correction can never carry either.
 * Pure.
 */
export function cvLiveEntries<
  T extends LiveJournalEntryFlags & { id: string; correction_of?: string | null },
>(rows: readonly T[] | null | undefined): T[] {
  return countedOnce((rows ?? []).filter((e) => isLiveJournalEntry(e)));
}
