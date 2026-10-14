import "server-only";

import { cache } from "react";

import { readWorkerCoreRow } from "@/lib/data/worker-core";
import type { DomainCaller } from "@/lib/domain/caller";
import { readConfirmedWorkBySkill } from "@/lib/evidence/confirmed-work-read";
import { readEntrySkillSlugs } from "@/lib/journal/entry-skill-link-read";
import { listJournalEntries } from "@/lib/journal/journal-list-core";
import { deriveIndependentReviewResult } from "@/lib/journal/review-status";
import { createClient } from "@/lib/supabase/server";

import {
  deriveConsequenceTrace,
  type ConsequenceTrace,
  type TraceEntryInput,
} from "./consequence-trace";
import { loadHomeEvents } from "./home-server";

/**
 * THE CONSEQUENCE TRACE LOADER — the signed-in person's own chains, read
 * through the readers that already hold each fact. Nothing here is a new
 * source of truth and nothing is written:
 *
 *   recent entries      ← `listJournalEntries` (the journal's ONE list core,
 *                         bounded to the newest `TRACE_ENTRY_WINDOW`)
 *   skill links         ← `readEntrySkillSlugs` (those entries only)
 *   confirmed work      ← `readConfirmedWorkBySkill` (the SAME counts
 *                         matching reads)
 *   state changes       ← `loadHomeEvents` (the home's request-cached feed)
 *
 * Authorization is the caller's own session (`createClient()`, RLS as the
 * signed-in user). No service role, no admin client, no identity argument —
 * another person's trace cannot be read through this path.
 *
 * The two skill reads run only when a chain actually reaches the Living CV
 * (an independently approved entry in the window), so a person with nothing
 * confirmed pays for nothing.
 */

/** The newest entries a home walks — "recent", stated as such. */
export const TRACE_ENTRY_WINDOW = 30;
/** How far back a chain may end and still be "what changed". */
export const TRACE_WINDOW_DAYS = 14;

export const loadConsequenceTrace = cache(async (): Promise<ConsequenceTrace> => {
  const eventsPromise = loadHomeEvents();
  const sinceIso = new Date(Date.now() - TRACE_WINDOW_DAYS * 86_400_000).toISOString();

  let entries: TraceEntryInput[] | null = null;
  let entriesTruncated = false;
  let subjectProfileId: string | null = null;
  let skillLinks: Map<string, string[]> | null = null;
  let confirmedWork: ReadonlyMap<string, { confirmedWorkEntries: number; confirmedDays: number }> | null =
    null;

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const caller: DomainCaller = { supabase, userId: user.id };
      const worker = await readWorkerCoreRow(caller);
      if (worker.ok && !worker.value) {
        // No worker profile: nothing of their own to trace — a known empty
        // journal, not a failure.
        entries = [];
      } else if (worker.ok && worker.value) {
        const workerId = worker.value.id;
        subjectProfileId = worker.value.profile_id ?? user.id;
        const list = await listJournalEntries(caller, { workerId, limit: TRACE_ENTRY_WINDOW });
        if (list.ok) {
          entriesTruncated = list.coverage.truncated;
          entries = list.entries.map((e) => ({
            id: e.id,
            createdAt: e.created_at,
            originalText: e.original_text,
            metrics: e.journal_entry_metrics ?? [],
            confirmations: e.journal_entry_confirmations ?? null,
          }));
          const confirmedIds = entries
            .filter(
              (e) => deriveIndependentReviewResult(e.confirmations, subjectProfileId) === "approved",
            )
            .map((e) => e.id);
          if (confirmedIds.length > 0) {
            const [links, work] = await Promise.all([
              readEntrySkillSlugs(supabase, confirmedIds),
              readConfirmedWorkBySkill(supabase, [{ id: workerId, profileId: subjectProfileId }]),
            ]);
            skillLinks = links;
            confirmedWork = work ? (work.get(workerId) ?? new Map()) : null;
          } else {
            skillLinks = new Map();
            confirmedWork = new Map();
          }
        }
      }
    }
  } catch {
    entries = null;
  }

  return deriveConsequenceTrace({
    entries,
    entriesTruncated,
    subjectProfileId,
    skillLinks,
    confirmedWork,
    events: await eventsPromise,
    sinceIso,
  });
});
