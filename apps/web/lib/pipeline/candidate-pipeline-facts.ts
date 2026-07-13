import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * Server-side fact loading for the canonical candidate pipeline (P4).
 *
 * Loads, for ONE demand and the candidate workers shown on the scouting page,
 * the two facts the page does not already have:
 *   - booking_requests status per (owner, request, worker) pair — the propose
 *     RPC upserts one row per pair, so one status per worker;
 *   - whether a direct in-app conversation exists between the company user
 *     and each worker (the honest "interview/Pokalbis" fact).
 *
 * DOCUMENTED LIMITATION: the conversation fact is PAIR-level, not
 * demand-level — a direct thread between this company user and the worker
 * counts regardless of which demand originally opened it. Conversations carry
 * no queryable per-demand key on the client-readable rows (the typed source
 * relation lives behind an owner-gated RPC), so pair-level is the truthful
 * fact we actually have. It is never fabricated.
 *
 * RLS: every read runs through the caller's session.
 *   - booking_requests: owner-scoped rows only (owner_id = auth.uid()).
 *   - workers.profile_id: employer-visible workers only; the profile ids are
 *     resolved SERVER-SIDE ONLY and never returned to the browser (Step 3A
 *     anonymization holds — only worker ids and booleans leave this module).
 *   - conversation_participants/conversations: participant-scoped policies
 *     (same pattern as lib/communication/direct-conversation.ts).
 *
 * Honest degradation: any absent table (owner-gated migration not applied)
 * or read error yields EMPTY facts — the derived stage simply falls to the
 * lower rungs of the ladder. Nothing is ever invented.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

/** Bound the pair queries (the scouting list itself is bounded upstream). */
const MAX_WORKERS = 200;

export interface DemandPipelineFacts {
  /** worker_id → booking_requests.status for THIS demand. */
  readonly bookingByWorker: ReadonlyMap<string, string>;
  /** worker_ids that share a direct conversation with the company user. */
  readonly conversationByWorker: ReadonlySet<string>;
}

const EMPTY: DemandPipelineFacts = {
  bookingByWorker: new Map(),
  conversationByWorker: new Set(),
};

export async function loadDemandPipelineFacts(
  requestId: string,
  workerIds: readonly string[],
): Promise<DemandPipelineFacts> {
  if (!requestId || workerIds.length === 0) return EMPTY;
  const ids = [...new Set(workerIds)].slice(0, MAX_WORKERS);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return EMPTY;

  const bookingByWorker = new Map<string, string>();
  try {
    const { data } = await asAny(supabase)
      .from("booking_requests")
      .select("worker_id, status")
      .eq("owner_id", user.id)
      .eq("request_id", requestId)
      .in("worker_id", ids);
    for (const r of (data ?? []) as { worker_id: string; status: string }[]) {
      bookingByWorker.set(r.worker_id, r.status);
    }
  } catch {
    // owner-gated booking migration not applied → no booking facts (honest)
  }

  const conversationByWorker = new Set<string>();
  try {
    // 1) Resolve worker → profile ids server-side only (never sent to client).
    const { data: workers } = await asAny(supabase)
      .from("workers")
      .select("id, profile_id")
      .in("id", ids);
    const profileToWorker = new Map<string, string>();
    for (const w of (workers ?? []) as { id: string; profile_id: string | null }[]) {
      if (w.profile_id) profileToWorker.set(w.profile_id, w.id);
    }
    if (profileToWorker.size === 0) {
      return { bookingByWorker, conversationByWorker };
    }

    // 2) The caller's conversations (participant-scoped RLS).
    const { data: mine } = await asAny(supabase)
      .from("conversation_participants")
      .select("conversation_id")
      .eq("profile_id", user.id);
    const myConvIds = [
      ...new Set(
        ((mine ?? []) as { conversation_id: string | null }[])
          .map((r) => r.conversation_id)
          .filter((v): v is string => typeof v === "string"),
      ),
    ];
    if (myConvIds.length === 0) {
      return { bookingByWorker, conversationByWorker };
    }

    // 3) Shared participant rows for the candidate workers' profiles.
    const { data: shared } = await asAny(supabase)
      .from("conversation_participants")
      .select("conversation_id, profile_id")
      .in("profile_id", [...profileToWorker.keys()])
      .in("conversation_id", myConvIds);
    const sharedRows = ((shared ?? []) as {
      conversation_id: string | null;
      profile_id: string | null;
    }[]).filter(
      (r): r is { conversation_id: string; profile_id: string } =>
        typeof r.conversation_id === "string" && typeof r.profile_id === "string",
    );
    if (sharedRows.length === 0) {
      return { bookingByWorker, conversationByWorker };
    }

    // 4) Only DIRECT threads count as the pair conversation (the same shape
    //    the gated scouting contact flow creates).
    const { data: direct } = await asAny(supabase)
      .from("conversations")
      .select("id")
      .in("id", [...new Set(sharedRows.map((r) => r.conversation_id))])
      .eq("kind", "direct");
    const directIds = new Set(
      ((direct ?? []) as { id: string }[]).map((r) => r.id),
    );
    for (const row of sharedRows) {
      if (!directIds.has(row.conversation_id)) continue;
      const workerId = profileToWorker.get(row.profile_id);
      if (workerId) conversationByWorker.add(workerId);
    }
  } catch {
    // communication tables unreadable → no conversation facts (honest)
  }

  return { bookingByWorker, conversationByWorker };
}
