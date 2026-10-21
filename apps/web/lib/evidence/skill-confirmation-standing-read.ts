import "server-only";

import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { readCorrectedOriginalIds } from "@/lib/journal/corrected-originals-read";
import {
  standingConfirmedSkillIds,
  type StandingEntryRow,
  type StandingSkillRead,
} from "./skill-confirmation-standing";

/**
 * THE DB FEEDING of `skill-confirmation-standing.ts` for ONE worker, read AS
 * THE CALLER (RLS applies; no service role, no RPC widening).
 *
 * SCOPE — OWN SURFACES ONLY. The subject can read their own entries, their
 * skill links and the decisions on them (the trust block already does), so
 * for the Living CV, the EU CV, the trust block, the player card and the MCP
 * reads this is exact. A CROSS-PARTY viewer (an employer that sees a worker
 * through discoverability consent) sees `worker_skills` through
 * `can_view_worker` but NOT that worker's journal — this read would return an
 * empty standing set for them and under-state every confirmed skill. Those
 * readers must use the DB door `worker_skill_confirmations_standing_v1`
 * (migration 20261021098000), never this function.
 *
 * Reads: the subject (workers.profile_id), every LIVE entry that has at least
 * one decision (inner join), its decisions and skill links, and the originals
 * live corrections replace. `null` = UNKNOWN (a failed page, the ceiling, an
 * unreadable subject) — callers never read that as "nothing stands" without
 * saying so (SkillConfirmationState `unknown`).
 */

const PAGE_SIZE = 1000;
const MAX_PAGES = 20;

/**
 * Every page of one ordered read; `null` on a failed page or at the ceiling
 * (more rows MAY exist — unknown, never partial). Local on purpose: the
 * journal list core imports `@/lib/data/worker-core`, which imports this
 * module, so reusing its pager would close an import cycle. The live-entry
 * filter below is the same two clauses `liveJournalEntriesOnly` sends.
 */
async function readEveryPage<T>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  build: () => any,
): Promise<T[] | null> {
  const rows: T[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const from = page * PAGE_SIZE;
    const res = (await build().range(from, from + PAGE_SIZE - 1)) as {
      data: T[] | null;
      error: unknown;
    };
    if (res.error) return null;
    const got = res.data ?? [];
    rows.push(...got);
    if (got.length < PAGE_SIZE) return rows;
  }
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

export async function readStandingConfirmedSkillIds(
  supabase: SupabaseClient,
  workerId: string,
): Promise<StandingSkillRead | null> {
  try {
    const [workerRes, entriesRes, corrected] = await Promise.all([
      asAny(supabase).from("workers").select("profile_id").eq("id", workerId).limit(1),
      readEveryPage<StandingEntryRow>(() =>
        asAny(supabase)
          .from("journal_entries")
          .select(
            "id, correction_of, journal_entry_confirmations!inner(confirmation_scope, created_at, confirmer_id), journal_entry_skills(skill_id)",
          )
          .eq("worker_id", workerId)
          .is("deleted_at", null)
          .is("superseded_by", null)
          .order("id", { ascending: true }),
      ),
      readCorrectedOriginalIds(supabase, workerId),
    ]);
    if (workerRes.error || entriesRes === null || corrected === null) return null;
    const rows = (workerRes.data ?? []) as { profile_id: string | null }[];
    if (rows.length === 0) return null; // the worker row is not readable: unknown
    const subjectProfileId = rows[0].profile_id ?? null;
    const ids = standingConfirmedSkillIds(entriesRes, subjectProfileId, corrected);
    return ids === null ? null : { ids, subjectProfileId };
  } catch {
    return null;
  }
}

/** Request-cached OWN read (cookie session client) — the player card, the
 *  core skill read and the CV ask once per request, not three times. */
export const readOwnStandingConfirmedSkillIds = cache(
  async (workerId: string): Promise<StandingSkillRead | null> => {
    try {
      const supabase = await createClient();
      return await readStandingConfirmedSkillIds(supabase as SupabaseClient, workerId);
    } catch {
      return null;
    }
  },
);
