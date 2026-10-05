import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { countedOnce } from "@/lib/journal/counted-once";
import { liveJournalEntriesOnly } from "@/lib/journal/journal-list-core";
import { countConfirmedEntries, type ConfirmationRow } from "@/lib/journal/review-status";

/**
 * Workstream C — honest trust signals for the person's OWN profile.
 *
 * Every number is a direct count from canonical tables under the viewer's
 * own RLS — nothing weighted, nothing invented, zero is a plain zero
 * (doctrine §7 + VISION §10: colours/numbers never lie). The visual layer
 * is the TASK 07 living-arena trust block; these semantics stay unchanged.
 */

/** Upper bound on one person's entries read here; reaching it is UNKNOWN, not a total. */
const ENTRY_READ_CAP = 5000;

interface TrustEntryRow {
  readonly id: string;
  readonly correction_of?: string | null;
  readonly journal_entry_confirmations?: readonly ConfirmationRow[] | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(supabase: SupabaseClient): any {
  return supabase;
}

/**
 * NULL MEANS UNREAD, NOT NONE. Each count is null when the read behind it
 * failed, so a surface can say "we could not check" instead of telling a
 * person they have nothing. 0 keeps its ordinary meaning: checked, and there
 * is none yet.
 */
export interface OwnTrustSignals {
  /** worker_skills rows with verified=true (manager-confirmed ladder). */
  readonly verifiedSkills: number | null;
  /**
   * CONFIRMED ENTRIES — live, counted-once entries whose latest decision is an
   * approval by someone other than the person (`countConfirmedEntries`). The
   * field keeps its historical name; it is NOT a row count of decisions.
   */
  readonly managerConfirmations: number | null;
  /** Own live journal entries, counted once per correction chain. */
  readonly journalEntries: number | null;
}

export async function getOwnTrustSignals(
  workerId: string,
): Promise<OwnTrustSignals> {
  const supabase = await createClient();

  const [skillsRes, entriesRes, workerRes] = await Promise.all([
    asAny(supabase)
      .from("worker_skills")
      .select("id", { count: "exact", head: true })
      .eq("worker_id", workerId)
      .eq("verified", true),
    // LIVE ONLY. This count is presented as "evidence trail length" and feeds
    // the Verified CV. Measured against production 2026-09-14: 65 entries
    // existed, 46 were live (8 deleted, 11 superseded) — so the unfiltered
    // read overstated four real people's evidence by up to 41%. The rule has
    // ONE home; this reader does not restate it.
    //
    // The review rows ride along on the SAME read (one round trip, no long
    // `in (...)` list) because "confirmed" is an ENTRY-level fact with ONE
    // definition (`countConfirmedEntries`, lib/journal/review-status.ts): the
    // latest decision is approved AND was not the subject's own, counted once
    // per correction chain. The old figure counted ROWS — rejected and
    // self-made decisions included, a corrected original and its correction
    // both — and read higher than every other "confirmed" number.
    liveJournalEntriesOnly(
      asAny(supabase)
        .from("journal_entries")
        .select(
          "id, correction_of, journal_entry_confirmations(confirmation_scope, created_at, confirmer_id)",
        )
        .eq("worker_id", workerId)
        .limit(ENTRY_READ_CAP),
    ),
    // Whose entries these are: independence is "not the subject's own".
    asAny(supabase).from("workers").select("profile_id").eq("id", workerId).limit(1),
  ]);

  // A READ THAT FAILED IS NOT A PERSON WITH NOTHING. Every count here used to
  // fall back to 0, so a timeout told someone with twelve confirmations that
  // they had none - and the surface then offered them the how-to-get-started
  // hint. That is the worst possible moment to be wrong about a person: this
  // block, and the Verified CV built from the same numbers, are where they see
  // what their work has added up to.
  const rows =
    entriesRes.error || (entriesRes.data ?? []).length >= ENTRY_READ_CAP
      ? null
      : ((entriesRes.data ?? []) as TrustEntryRow[]);

  // Entries are counted ONCE per correction chain (a corrected original and
  // its live correction are one day of work, not two).
  const counted = rows === null ? null : countedOnce(rows);

  // Subject unknown => independence unanswerable => the confirmed figure is
  // unknown, never a number that silently counts self-approvals.
  const profileId = workerRes.error
    ? undefined
    : (((workerRes.data ?? []) as { profile_id: string | null }[])[0]?.profile_id ?? null);

  return {
    verifiedSkills: skillsRes.error ? null : (skillsRes.count ?? 0),
    managerConfirmations:
      rows === null || profileId === undefined
        ? null
        : countConfirmedEntries(rows, profileId),
    journalEntries: counted === null ? null : counted.length,
  };
}
