import "server-only";

import { readWorkerCoreRow } from "@/lib/data/worker-core";
import type { DomainCaller } from "@/lib/domain/caller";
import { countedOnce } from "@/lib/journal/counted-once";

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
 * COUNTED ONCE (issue #1689, audit F1): a CONFIRMED original that a live
 * correction points at (`correction_of`, 0018) keeps `superseded_by` NULL by
 * design, so the live filter alone returned BOTH rows and every number built
 * on this list — the work-in-numbers section, the CV, the organization's
 * member view, the §13 checks, the conversation — counted an edited day
 * twice and kept calling the withdrawn figure "confirmed". `entries` now
 * carries each correction chain once, by its live correction
 * (`lib/journal/counted-once.ts`); the replaced originals ride along in
 * `correctedOriginals` for any surface that shows the audit trail.
 *
 * BOUNDED READS SAY SO (issue #1689, SEP-7: UNKNOWN ≠ ZERO). PostgREST caps
 * every select at `max_rows` (supabase/config.toml: 1000) and says nothing
 * when it does — an unbounded read here silently dropped a worker's oldest
 * entries once the journal passed a thousand rows, and every figure built on
 * this list (the section, the CV, the chat, the MCP capability) then
 * under-counted without a word. The read now PAGES with `.range()` in pages
 * of `JOURNAL_LIST_PAGE_SIZE` until a short page, under a hard ceiling of
 * `JOURNAL_LIST_MAX_PAGES`, and the result carries `coverage`: how many
 * counted entries the figures rest on and whether the ceiling was hit
 * (`truncated` — more rows MAY exist; the consumer says "from the last N
 * entries" instead of stating a total as if it were complete).
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
  /** `journal_entry_metrics.source` — the provenance of the row itself
   *  (`worker_input` | `ai_extracted` | `manager_corrected`). Carried so a
   *  derived hour can say where it came from (work-intelligence); absent on
   *  callers that project their own shape. */
  source?: string | null;
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
  /** The confirmed original this row corrects (0018), when it is one. */
  correction_of?: string | null;
  engagement_context_id?: string | null;
  journal_entry_metrics: JournalMetricRow[] | null;
  journal_entry_confirmations: JournalConfirmationRow[] | null;
};

/** What a bounded read actually covered — carried to every consumer so a
 *  figure can name its base instead of posing as a total. */
export type JournalListCoverage = {
  /** The counted (live, counted-once) entries the figures rest on. */
  readonly entriesRead: number;
  /** True when the read stopped at its ceiling (the page ceiling, or the
   *  caller's `limit`) with a full last page — older rows MAY exist and
   *  are NOT in `entries`. False = every live row was read. */
  readonly truncated: boolean;
};

export type JournalListResult =
  | {
      ok: true;
      workerId: string;
      /** Live rows, each correction chain counted once by its live
       *  correction — the rows every number is built on. */
      entries: JournalEntryListRow[];
      /** Live originals that a row in `entries` corrects: still real,
       *  still confirmed, no longer counted. Empty on the legacy path. */
      correctedOriginals: JournalEntryListRow[];
      coverage: JournalListCoverage;
    }
  | { ok: false; code: "no_worker" | "unavailable" };

/** One PostgREST page — the server's own `max_rows` (supabase/config.toml),
 *  so a page shorter than this is the LAST page, not a capped one. */
export const JOURNAL_LIST_PAGE_SIZE = 1000;
/** Hard ceiling on pages per read (20 000 rows) — a bound, stated as such
 *  through `coverage.truncated`, never a silent cap. */
export const JOURNAL_LIST_MAX_PAGES = 20;

/**
 * Read every page of a query until a short page or the ceiling. `build`
 * returns a FRESH filtered + ordered query each call (PostgREST builders
 * are single-use); the order must be total (a tiebreaker on `id`) so page
 * boundaries never repeat or skip a row. A failed page fails the read —
 * a partial list that reads as complete is the defect this exists to end.
 */
export async function readAllPages<T>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  build: () => any,
  opts: { pageSize?: number; maxPages?: number } = {},
): Promise<{ rows: T[]; truncated: boolean; error: unknown | null }> {
  const pageSize = opts.pageSize ?? JOURNAL_LIST_PAGE_SIZE;
  const maxPages = opts.maxPages ?? JOURNAL_LIST_MAX_PAGES;
  const rows: T[] = [];
  for (let page = 0; page < maxPages; page += 1) {
    const from = page * pageSize;
    const res = await build().range(from, from + pageSize - 1);
    if (res.error) return { rows: [], truncated: false, error: res.error };
    const batch = (res.data ?? []) as T[];
    rows.push(...batch);
    if (batch.length < pageSize) return { rows, truncated: false, error: null };
  }
  // Every page was full: the ceiling was hit and more rows MAY exist.
  return { rows, truncated: true, error: null };
}

/** The metric rows an entry carries, as every work-time consumer reads them
 *  (`work-time.ts` needs slug / values / unit; `source` is the row's own
 *  provenance). ONE projection — the org window report embeds the same
 *  fragment so its hours come from the rows the diary and the CV read. */
export const JOURNAL_ENTRY_METRICS_EMBED =
  "journal_entry_metrics(metric_slug, value_text, value_numeric, unit_slug, source)";

/** The confirmation rows `deriveReviewResult` needs — the same fragment on
 *  every surface that turns them into a review result. */
export const JOURNAL_ENTRY_CONFIRMATIONS_EMBED =
  "journal_entry_confirmations(confirmation_scope, created_at, confirmer_role)";

const V3_SELECT = `id, original_text, created_at, deleted_at, superseded_by, correction_of, engagement_context_id, ${JOURNAL_ENTRY_METRICS_EMBED}, ${JOURNAL_ENTRY_CONFIRMATIONS_EMBED}`;

const LEGACY_SELECT = `id, original_text, created_at, engagement_context_id, ${JOURNAL_ENTRY_METRICS_EMBED}, ${JOURNAL_ENTRY_CONFIRMATIONS_EMBED}`;

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
  // the same pattern the page used inline. Newest first, `id` as the total-
  // order tiebreaker so `.range()` pages never repeat or skip a row.
  const build = (select: string) => () =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (caller.supabase.from("journal_entries") as any)
      .select(select)
      .eq("worker_id", workerId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false });
  // A caller-bounded read is ONE page of `limit`; an unbounded one pages to
  // the end (or the ceiling) and says which.
  const read = async (
    select: string,
  ): Promise<{ rows: JournalEntryListRow[]; truncated: boolean; error: unknown | null }> => {
    if (opts.limit) {
      const res = await build(select)().limit(opts.limit);
      if (res.error) return { rows: [], truncated: false, error: res.error };
      const rows = (res.data ?? []) as JournalEntryListRow[];
      return { rows, truncated: rows.length >= opts.limit, error: null };
    }
    return readAllPages<JournalEntryListRow>(build(select));
  };

  const v3 = await read(V3_SELECT);
  if (!v3.error) {
    const live = v3.rows.filter((e) => !e.deleted_at && !e.superseded_by);
    const entries = countedOnce(live);
    const counted = new Set(entries.map((e) => e.id));
    return {
      ok: true,
      workerId,
      entries,
      correctedOriginals: live.filter((e) => !counted.has(e.id)),
      coverage: { entriesRead: entries.length, truncated: v3.truncated },
    };
  }

  // Pre-migration fallback — the legacy projection keeps the page renderable
  // on older DBs, exactly as the inline query did.
  const legacy = await read(LEGACY_SELECT);
  if (legacy.error) return { ok: false, code: "unavailable" };
  const entries = legacy.rows as unknown as JournalEntryListRow[];
  return {
    ok: true,
    workerId,
    entries,
    correctedOriginals: [],
    coverage: { entriesRead: entries.length, truncated: legacy.truncated },
  };
}
