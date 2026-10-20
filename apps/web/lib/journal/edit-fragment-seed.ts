import type { JournalEditingEntry } from "@/lib/journal/edit-entry";
import type { JournalFragmentSuggestion } from "@/lib/structuring/extract-journal-suggestions";

/** A saved activity as the editor's fragment review holds it. */
export type SeededFragment = JournalFragmentSuggestion & {
  status: "confirmed";
  userLabel: string;
  source: "worker_input" | "ai_extracted" | null;
};

/**
 * AN EDIT STARTS FROM THE ENTRY'S SAVED ACTIVITIES (audit 2026-10-20).
 *
 * The fragment list began empty on an edit, and `fragments_json` is sent
 * only from it — so saving an edit straight away (a typo fix) wrote an entry
 * with no per-activity rows: "2 h tiles, 3 h grout" stored as fragment times
 * went from 5 h to 0 h everywhere. The saved activities are seeded as
 * already-confirmed fragments (they ARE the worker's saved record); a new
 * review (analyse) replaces them with a fresh parse the worker confirms.
 */
export function seedFragmentsFromEntry(
  entry: JournalEditingEntry | null | undefined,
): SeededFragment[] {
  if (!entry) return [];
  return [...entry.activities]
    .sort((a, b) => a.index - b.index)
    .flatMap((a): SeededFragment[] => {
      const phrase = (a.rawPhrase ?? a.activityLabel ?? a.userLabel ?? "").trim();
      if (!phrase) return [];
      const unit = a.time?.unitSlug;
      const time: SeededFragment["time"] =
        a.time && (unit === "hours" || unit === "days" || unit === "minutes")
          ? { value: a.time.value, unitSlug: unit as "hours" | "days" | "minutes" }
          : null;
      return [
        {
          rawPhrase: phrase,
          time,
          activitySlug: null,
          activityLabel: a.activityLabel,
          isUnknown: false,
          status: "confirmed",
          userLabel: a.userLabel ?? "",
          source: a.source,
        },
      ];
    });
}

