import "server-only";

import { readWorkerCoreRow } from "@/lib/data/worker-core";
import type { DomainCaller } from "@/lib/domain/caller";

/**
 * THE canonical Work Journal LIST read (G4 bridge; audit gap G6's "journal
 * list is inline page SQL — no service function at all").
 *
 * Extracted verbatim from the journal page's own query: the v3 lifecycle
 * select (deleted_at / superseded_by, migration 0018) with the pre-migration
 * legacy fallback, newest first, live rows only on the v3 path. The page and
 * the `journal.list` capability both read THIS — one projection of the
 * caller's own append-only journal, never a second one.
 *
 * RLS-scoped as the caller: `worker_id` is resolved from the caller's OWN
 * worker row (or passed in by a consumer that already holds it — same row,
 * not a caller-chosen id).
 */

export type JournalMetricRow = {
  metric_slug: string;
  value_text: string | null;
  value_numeric: number | null;
  unit_slug: string | null;
};

export type JournalConfirmationRow = {
  confirmation_scope: unknown;
  created_at?: string | null;
  confirmer_role?: string | null;
};

export type JournalEntryListRow = {
  id: string;
  original_text: string;
  created_at: string;
  deleted_at?: string | null;
  superseded_by?: string | null;
  engagement_context_id?: string | null;
  journal_entry_metrics: JournalMetricRow[] | null;
  journal_entry_confirmations: JournalConfirmationRow[] | null;
};

export type JournalListResult =
  | { ok: true; workerId: string; entries: JournalEntryListRow[] }
  | { ok: false; code: "no_worker" | "unavailable" };

const V3_SELECT =
  "id, original_text, created_at, deleted_at, superseded_by, engagement_context_id, journal_entry_metrics(metric_slug, value_text, value_numeric, unit_slug), journal_entry_confirmations(confirmation_scope, created_at, confirmer_role)";

const LEGACY_SELECT =
  "id, original_text, created_at, engagement_context_id, journal_entry_metrics(metric_slug, value_text, value_numeric, unit_slug), journal_entry_confirmations(confirmation_scope, created_at, confirmer_role)";

export async function listJournalEntries(
  caller: DomainCaller,
  opts: {
    /** The caller's own worker id when the consumer already resolved it —
     *  skips the second workers read. Never a caller-CHOSEN id: RLS scopes
     *  the entries query to the caller's own rows regardless. */
    workerId?: string;
    /** Bounds the read. NOTE: the live filter (deleted/superseded) applies
     *  AFTER the limit, so a bounded page can carry fewer live rows than the
     *  limit even when more exist — honest pagination, never padded. */
    limit?: number;
  } = {},
): Promise<JournalListResult> {
  let workerId = opts.workerId ?? null;
  if (!workerId) {
    const workerRead = await readWorkerCoreRow(caller);
    if (!workerRead.ok) return { ok: false, code: "unavailable" };
    if (!workerRead.value) return { ok: false, code: "no_worker" };
    workerId = workerRead.value.id;
  }

  // The v3 columns exist after migration 0018; cast through `any` because
  // they are runtime-present but absent from some generated type snapshots —
  // the same pattern the page used inline.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const v3Query = (caller.supabase.from("journal_entries") as any)
    .select(V3_SELECT)
    .eq("worker_id", workerId)
    .order("created_at", { ascending: false });
  const v3 = await (opts.limit ? v3Query.limit(opts.limit) : v3Query);
  if (!v3.error) {
    const rows = (v3.data ?? []) as JournalEntryListRow[];
    return {
      ok: true,
      workerId,
      entries: rows.filter((e) => !e.deleted_at && !e.superseded_by),
    };
  }

  // Pre-migration fallback — the legacy projection keeps the page renderable
  // on older DBs, exactly as the inline query did.
  const legacyQuery = caller.supabase
    .from("journal_entries")
    .select(LEGACY_SELECT)
    .eq("worker_id", workerId)
    .order("created_at", { ascending: false });
  const legacy = await (opts.limit ? legacyQuery.limit(opts.limit) : legacyQuery);
  if (legacy.error) return { ok: false, code: "unavailable" };
  return {
    ok: true,
    workerId,
    entries: (legacy.data ?? []) as unknown as JournalEntryListRow[],
  };
}
