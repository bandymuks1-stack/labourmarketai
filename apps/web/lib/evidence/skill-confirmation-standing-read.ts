import "server-only";

import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { readCorrectedOriginalIds } from "@/lib/journal/corrected-originals-read";
import {
  isDoorConfirmationState,
  standingConfirmedSkillApprovals,
  STANDING_DOOR_NOT_INSTALLED,
  type CrossPartyStandingRead,
  type DoorConfirmationState,
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
 * (migration 20261021090000) through `readCrossPartyStandingStates` below,
 * never this function.
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
    const approvedAt = standingConfirmedSkillApprovals(entriesRes, subjectProfileId, corrected);
    return approvedAt === null ? null : { ids: new Set(approvedAt.keys()), subjectProfileId, approvedAt };
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

// ── CROSS-PARTY READ (phase B) ─────────────────────────────────────────────

/** The door's own cap (`too_many_workers` above it). */
export const STANDING_DOOR_MAX_WORKER_IDS = 500;

/** The function is not in the schema yet: PostgreSQL 42883 / PostgREST PGRST202. */
const MISSING_FUNCTION_CODES = new Set(["42883", "PGRST202"]);

/**
 * THE CROSS-PARTY standing read: for every requested worker the caller may
 * already see (`can_view_worker`, the worker_skills RLS predicate), the state
 * of each recorded confirmation, decided by the database door
 * `worker_skill_confirmations_standing_v1` (migration 20261021090000) with the
 * SAME rule as `skill-confirmation-standing.ts`. Read as the caller; no
 * service role.
 *
 * Returns
 *   * a Map workerId -> skillId -> state (a worker with no recorded
 *     confirmation simply has no entry);
 *   * `STANDING_DOOR_NOT_INSTALLED` when the function does not exist yet — the
 *     caller then keeps TODAY's stored-flag reading, so nothing regresses
 *     before the owner approves and applies the migration;
 *   * `null` = UNKNOWN on any other error (or a half-installed answer across
 *     chunks) — never read as confirmed, never read as "nothing".
 *
 * Ids are de-duplicated and asked in chunks of 500 (the door's cap), each
 * paged under the 1000-row API cap, chunks in parallel. A row whose state is
 * not one of the three is skipped, so that
 * recorded confirmation reads UNKNOWN downstream.
 */
export async function readCrossPartyStandingStates(
  supabase: SupabaseClient,
  workerIds: readonly (string | null | undefined)[],
): Promise<CrossPartyStandingRead> {
  const ids = [
    ...new Set(workerIds.filter((id): id is string => typeof id === "string" && id !== "")),
  ].sort();
  const out = new Map<string, Map<string, DoorConfirmationState>>();
  if (ids.length === 0) return out;
  try {
    const chunks: string[][] = [];
    for (let i = 0; i < ids.length; i += STANDING_DOOR_MAX_WORKER_IDS) {
      chunks.push(ids.slice(i, i + STANDING_DOOR_MAX_WORKER_IDS));
    }
    // Each chunk is PAGED: the API answers at most 1000 rows per request
    // (lib/guards/row-cap-1000.test.ts), and 500 workers can hold more
    // recorded confirmations than that. Ordered by the door's key so pages
    // never overlap; the page ceiling is UNKNOWN, never a partial answer.
    const results = await Promise.all(chunks.map((chunk) => readDoorChunk(supabase, chunk)));
    let missing = 0;
    for (const res of results) {
      if (res === "missing") {
        missing += 1;
        continue;
      }
      if (res === null) return null;
      for (const row of res) {
        const wid = row?.worker_id;
        const sid = row?.skill_id;
        const state = row?.state;
        if (typeof wid !== "string" || typeof sid !== "string" || !isDoorConfirmationState(state)) {
          continue;
        }
        const m = out.get(wid) ?? new Map<string, DoorConfirmationState>();
        m.set(sid, state);
        out.set(wid, m);
      }
    }
    if (missing === results.length) return STANDING_DOOR_NOT_INSTALLED;
    if (missing > 0) return null;
    return out;
  } catch {
    return null;
  }
}

/** Every page of the door for one chunk; "missing" = the function is absent;
 *  `null` = an error, a malformed page or the page ceiling (UNKNOWN). */
async function readDoorChunk(
  supabase: SupabaseClient,
  chunk: readonly string[],
): Promise<Record<string, unknown>[] | "missing" | null> {
  const rows: Record<string, unknown>[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const from = page * PAGE_SIZE;
    const res = (await asAny(supabase)
      .rpc("worker_skill_confirmations_standing_v1", { p_worker_ids: [...chunk] })
      .order("worker_id", { ascending: true })
      .order("skill_id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1)) as {
      data: unknown;
      error: { code?: string | null } | null;
    };
    if (res.error) {
      return MISSING_FUNCTION_CODES.has(String(res.error.code ?? "")) && page === 0 ? "missing" : null;
    }
    if (!Array.isArray(res.data)) return null;
    rows.push(...(res.data as Record<string, unknown>[]));
    if (res.data.length < PAGE_SIZE) return rows;
  }
  return null;
}
