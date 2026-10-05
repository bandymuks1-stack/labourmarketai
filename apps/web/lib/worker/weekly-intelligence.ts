import "server-only";

/**
 * WEEKLY PERSONAL INTELLIGENCE — server read (value train 2, B1).
 *
 * Thin composition over CANONICAL reads only — this file adds no query truth
 * of its own beyond the worker's OWN journal rows in the trailing week:
 *
 *   - window arithmetic: `journalReportWindow` / `windowCreatedAtBounds`
 *     (lib/journal/journal-window-report — the one place "a week" is defined);
 *   - market state: `getWorkerJobRecommendations` (the board's own engine and
 *     counts — no second matching path, §19 basis carried whole);
 *   - worker identity: `getWorkerCoreRow` (the canonical request-cached
 *     workers-row read).
 *
 * MINIMISED SELECT: ids + created_at only. The entry text and photos are
 * never requested (journal-window privacy rule). Own-rows RLS applies — this
 * runs as the signed-in worker, never service-role.
 *
 * A failed journal read degrades to `available: false` (the deriver then
 * emits `journal_unavailable`) — a wrong count is worse than none.
 */
import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getWorkerCoreRow, getWorkerSkillRows } from "../data/worker-core";
import { countedOnce } from "../journal/counted-once";
import { countConfirmedEntries, type ConfirmationRow } from "../journal/review-status";
import { readWorkerEntrySkillLinks } from "../journal/entry-skill-link-read";
import { getWorkerJobRecommendations } from "../opportunities/recommendations";
import {
  journalReportWindow,
  windowCreatedAtBounds,
} from "../journal/journal-window-report";
import {
  deriveWeeklyPersonalIntelligence,
  type WeeklyJournalFacts,
  type WeeklyPersonalIntelligence,
} from "./weekly-intelligence-model";

/** Same cap as the canonical window report — an honest upper bound. */
const ENTRY_READ_LIMIT = 2000;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

export type WeeklyIntelligenceResult =
  | { readonly kind: "no-worker" }
  | { readonly kind: "ready"; readonly intelligence: WeeklyPersonalIntelligence };

async function readOwnWeeklyJournalFacts(
  supabase: SupabaseClient,
  workerId: string,
  todayIso: string,
  subjectProfileId: string | null,
): Promise<WeeklyJournalFacts> {
  const window = journalReportWindow("week", todayIso);
  const { gteIso, ltIso } = windowCreatedAtBounds(window);
  const unavailable: WeeklyJournalFacts = {
    window,
    available: false,
    entryCount: 0,
    confirmedCount: 0,
    lastEntryAtIso: null,
  };
  try {
    const entriesRes = await asAny(supabase)
      .from("journal_entries")
      .select("id, created_at, correction_of")
      .eq("worker_id", workerId)
      .gte("created_at", gteIso)
      .lt("created_at", ltIso)
      .is("superseded_by", null)
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .limit(ENTRY_READ_LIMIT);
    if (entriesRes.error) return unavailable;
    // COUNTED ONCE (lib/journal/counted-once.ts): a confirmed original that
    // was corrected and resubmitted is one day of work, not two.
    const entries = countedOnce(
      (entriesRes.data ?? []) as {
        id: string;
        created_at: string | null;
        correction_of: string | null;
      }[],
    );

    let confirmedCount = 0;
    if (entries.length > 0) {
      const confRes = await asAny(supabase)
        .from("journal_entry_confirmations")
        .select("entry_id, confirmation_scope, created_at, confirmer_id")
        .in(
          "entry_id",
          entries.map((e) => e.id),
        );
      // A failed confirmation read degrades the whole block rather than
      // silently reporting every entry as unconfirmed.
      if (confRes.error) return unavailable;
      // ONE definition of "confirmed" (lib/journal/review-status.ts): the
      // latest decision is an approval by someone other than the person. The
      // old test - "has any decision row" - counted a rejection and the
      // person's own approval as confirmed.
      const byEntry = new Map<string, ConfirmationRow[]>();
      for (const c of (confRes.data ?? []) as (ConfirmationRow & {
        entry_id: string | null;
      })[]) {
        if (typeof c.entry_id !== "string") continue;
        byEntry.set(c.entry_id, [...(byEntry.get(c.entry_id) ?? []), c]);
      }
      confirmedCount = countConfirmedEntries(
        entries.map((e) => ({
          id: e.id,
          journal_entry_confirmations: byEntry.get(e.id) ?? null,
        })),
        subjectProfileId,
      );
    }

    const last = entries.length > 0 ? entries[entries.length - 1] : null;
    return {
      window,
      available: true,
      entryCount: entries.length,
      confirmedCount,
      lastEntryAtIso: last?.created_at ?? null,
    };
  } catch {
    return unavailable;
  }
}

/**
 * The signed-in worker's weekly personal intelligence. `no-worker` for
 * accounts without a worker profile — surfaces render nothing then.
 */
export const getWeeklyPersonalIntelligence = cache(
  async (): Promise<WeeklyIntelligenceResult> => {
    const worker = await getWorkerCoreRow();
    if (!worker) return { kind: "no-worker" };

    const supabase = await createClient();
    const todayIso = new Date().toISOString().slice(0, 10);

    const [journal, recs, skillRows, linkRead] = await Promise.all([
      readOwnWeeklyJournalFacts(supabase, worker.id, todayIso, worker.profile_id ?? null),
      getWorkerJobRecommendations(),
      // Request-cached canonical worker_skills read (own rows) — carries the
      // slug identity plus verified/source provenance.
      getWorkerSkillRows(),
      // DURABLE journal→skill links (own rows). `worker_skills.source` can
      // stay 'work_journal' after the last link was removed (the source
      // reconciliation is best-effort — skill-source-apply.ts names the link
      // rows as the remaining truth), so backing is derived from the links,
      // never from the loose source value.
      readWorkerEntrySkillLinks(supabase, worker.id),
    ]);

    // A failed link read is NOT an empty result: the signal becomes
    // unavailable (null → omitted), never a guess.
    let journalBackedSlugs: ReadonlySet<string> | null = null;
    if (linkRead.ok) {
      const linkedSkillIds = new Set(linkRead.rows.map((r) => r.skill_id));
      const backed = new Set<string>();
      for (const row of skillRows) {
        const slug = row.skills?.slug;
        if (typeof slug !== "string" || !slug) continue;
        // Backed = a durable journal link exists, OR a manager really
        // confirmed it (a recorded event, not a link-dependent flag).
        if (
          (row.skill_id !== null && linkedSkillIds.has(row.skill_id)) ||
          row.verified === true ||
          row.source === "manager_confirmed"
        ) {
          backed.add(slug);
        }
      }
      journalBackedSlugs = backed;
    }

    const opportunities =
      recs.kind === "ready"
        ? {
            available: recs.boardAvailable,
            totalRecommendable: recs.totalRecommendable,
            seenAvailable: recs.seenAvailable,
            newCount: recs.newCount,
            appearedThisWeekCount: recs.appearedThisWeekCount,
            boardTruncated: recs.boardTruncated,
            top: recs.recommendations,
          }
        : {
            available: false,
            totalRecommendable: 0,
            seenAvailable: false,
            newCount: 0,
            appearedThisWeekCount: 0,
            boardTruncated: false,
            top: [],
          };

    return {
      kind: "ready",
      intelligence: deriveWeeklyPersonalIntelligence(
        journal,
        opportunities,
        journalBackedSlugs,
      ),
    };
  },
);
