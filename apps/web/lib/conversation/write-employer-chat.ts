"use server";

import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getWorkerCoreRow } from "@/lib/data/worker-core";
import { listMyInterestSignals } from "@/lib/opportunities/interest";

import type { WriteEmployerChatResult } from "@/lib/conversation/write-employer-chat-contract";

/**
 * WHOM can the person write to, right now? (launch completion 2026-09-20,
 * GREEN_CONNECT — gap G18 closed.)
 *
 * A thin transport over the ONE domain read the opportunities board runs
 * (`listMyInterestSignals`: the caller's own rows, worker_id-filtered + RLS).
 * "Active" is the same reading the board's own next-action uses: a signal
 * that is not withdrawn, on a platform demand (a public ad's employer never
 * joined, so there is no inbox to write to). No write, no ranking, no
 * chat-only logic: the thread is opened afterwards by `contactEmployerAction`
 * — the same server action the interest card's button runs — which
 * re-verifies the signal, the demand and the company before it opens
 * anything.
 */
export async function resolveWriteEmployerTarget(): Promise<WriteEmployerChatResult> {
  try {
    const worker = await getWorkerCoreRow();
    if (!worker) return { kind: "no-worker" };
    const supabase = await createClient();
    const signals = await listMyInterestSignals(supabase, worker.id);
    if (!signals.available) return { kind: "unavailable" };
    const active = signals.rows.filter(
      (r) => r.requestId !== null && r.status !== "withdrawn",
    );
    if (active.length === 0) return { kind: "none" };
    if (active.length === 1) return { kind: "one", requestId: active[0].requestId as string };
    return { kind: "many", count: active.length };
  } catch {
    return { kind: "unavailable" };
  }
}
