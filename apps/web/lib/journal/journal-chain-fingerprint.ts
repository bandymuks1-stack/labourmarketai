import "server-only";

import type { ExecResult } from "@/lib/conversation/executor-contract";
import { readWorkerCoreRow } from "@/lib/data/worker-core";
import type { DomainCaller } from "@/lib/domain/caller";

/**
 * THE JOURNAL WRITE CONFIRMATION FINGERPRINT — the caller's journal CHAIN
 * HEAD, shared by every transport that confirms a journal write.
 *
 * It is what makes a confirmation token genuinely ONE-TIME: a successful
 * confirm appends an entry, the head moves, and a replay of the same token (a
 * duplicate retry, a stolen token, a double-tap) fails as `stale_state`
 * instead of writing a second entry. A constant fingerprint would make
 * "one-time" a five-minute lie.
 *
 * It lived inside the capability registry (the MCP `journal.confirm` path),
 * while the conversation dispatcher confirmed the SAME write with a constant
 * `"n/a"` — so the chat's two-step save was replayable for the whole token
 * TTL, guarded only by a disabled button (owner P0 2026-09-23). Moved here so
 * both transports bind to one fact, the way `interestStateFingerprint` is
 * shared.
 *
 * The read is RLS-scoped as the caller (their own client), bounded (limit 1)
 * and served by `idx_journal_entries_worker (worker_id, created_at desc)`.
 */
export async function journalChainFingerprint(
  caller: DomainCaller,
): Promise<{ ok: true; fingerprint: string } | { ok: false; result: ExecResult }> {
  // G4 bridge: the same workers-row core the web reads (readWorkerCoreRow).
  const workerRead = await readWorkerCoreRow(caller);
  if (!workerRead.ok) {
    return {
      ok: false,
      result: { ok: false, code: "unavailable", message: "Worker read failed." },
    };
  }
  const worker = workerRead.value;
  if (!worker) {
    return {
      ok: false,
      result: {
        ok: false,
        code: "no_worker_profile",
        message: "This account has no worker profile, so it has no Work Journal.",
      },
    };
  }
  const { data: head, error: headError } = await caller.supabase
    .from("journal_entries")
    .select("hash_self")
    .eq("worker_id", worker.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (headError) {
    return {
      ok: false,
      result: { ok: false, code: "unavailable", message: "Journal read failed." },
    };
  }
  return {
    ok: true,
    fingerprint: `journal-head:v1:${worker.id}:${head?.hash_self ?? "genesis"}`,
  };
}
