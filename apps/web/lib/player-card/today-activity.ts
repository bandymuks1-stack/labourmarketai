import "server-only";

import { createClient } from "@/lib/supabase/server";

/**
 * TODAY'S WORK-JOURNAL ACTIVITY — the one canonical reader.
 *
 * Extracted in W7-S1 from the absorbed `ProfileStateStrip`, which owned this
 * query inline. It moved out of the UI for a reason the W5 guard enforces: a
 * profile surface must read canonical models, never count rows itself. The
 * capability is unchanged — a REAL count of the worker's own live entries
 * created today.
 *
 * Days are compared on the same UTC clock the timestamps are stored in.
 * A failed read degrades to 0, which the caller renders as its honest
 * nothing-yet state — never an invented value.
 */
export async function countTodayJournalEntries(
  workerId: string,
): Promise<number> {
  try {
    const supabase = await createClient();
    const todayStartIso = `${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`;
    const { count, error } = await supabase
      .from("journal_entries")
      .select("*", { count: "exact", head: true })
      .eq("worker_id", workerId)
      .is("deleted_at", null)
      .gte("created_at", todayStartIso);
    if (error || typeof count !== "number") return 0;
    return count;
  } catch {
    return 0;
  }
}
