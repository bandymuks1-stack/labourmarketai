import "server-only";

/**
 * VACANCY REPOSITORY — the `persist` implementation the importer has always
 * declared and never had, plus the cursor store the checkpoint logic needs.
 *
 * The importer computes `nextCursor` on every run and hands it back to a
 * caller that, until now, did not exist. Both halves live here so that one
 * module owns "what the last run knew" and a caller cannot advance a
 * checkpoint without also having stored the rows it covers.
 *
 * ── WHY EXACT ACCOUNTING RATHER THAN A BARE UPSERT ─────────────────────────
 *
 * The `persist` contract promises `{ inserted, updated }`. A single
 * `.upsert()` cannot honour that: PostgREST reports rows affected, not which
 * arm of the conflict fired, so every re-run would report the whole batch as
 * written and the import report would say a snapshot imported 40 000 ads every
 * night forever. That number would then be the headline evidence an owner
 * reads when deciding whether the source is worth activating — so getting it
 * wrong is not a cosmetic accounting slip, it is fabricated evidence.
 *
 * So this reads the batch's existing (external_id, content_hash) pairs first
 * and partitions:
 *   - NOT PRESENT           -> insert   (counted as inserted)
 *   - PRESENT, hash moved   -> update   (counted as updated)
 *   - PRESENT, hash equal   -> touch    (counted as NEITHER — nothing changed)
 * One extra SELECT buys an honest number and, on a steady-state snapshot,
 * turns tens of thousands of pointless UPDATEs into one cheap timestamp touch.
 *
 * ── WHAT THIS MODULE REFUSES TO DO ─────────────────────────────────────────
 *
 * It does not decide whether an import may happen. Governance activation and
 * the env kill switch are evaluated in the importer, before a single network
 * request; by the time rows reach here, both gates are already open. A
 * repository that re-litigated the gate would be a second, divergent copy of
 * the policy — and the one that silently disagreed would win.
 *
 * It also does not FETCH. This module lives in `lib/vacancy-store/**` rather
 * than beside the importer for exactly that reason: `lib/vacancy-import/**` is
 * the network layer and the boundary guard pins that it holds no database
 * client, while this layer holds a database client and the guard pins that it
 * never calls `fetch`. Keeping the two capabilities in separate folders means
 * no single module can both read the internet and write the database.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PublicVacancyV1 } from "@/lib/vacancy-sources/vacancy-contract";
import {
  toPublicVacancyRow,
  vacancyRowKey,
  type PublicVacancyRowV1,
} from "./vacancy-row";

/**
 * The narrow slice of a Supabase client this module uses. Declared structurally
 * so a test can supply a fake without a database and without `any`.
 */
type VacancyDbClient = Pick<SupabaseClient, "from">;

export interface VacancyPersistResultV1 {
  readonly inserted: number;
  readonly updated: number;
  /** Rows already stored at the identical content hash — re-seen, not
   *  re-written. Reported so a caller can tell "nothing changed" apart from
   *  "nothing arrived". */
  readonly unchanged: number;
  /** Withdrawals for ads this store never held. Nothing was written — there
   *  is no row to tombstone, and the table's own bounds (title 1..300)
   *  rightly refuse a contentless insert. Reported so "we ignored N
   *  withdrawals" is a stated fact rather than a silent drop. */
  readonly withdrawnAbsent: number;
}

const VACANCY_TABLE = "public_vacancies";
const CURSOR_TABLE = "vacancy_import_cursors";

/**
 * PostgREST encodes `.in()` filters into the request URL, and the gateway
 * rejects URLs past ~8 KB with a non-PostgREST error (empty `code`). A stream
 * batch of ~800 Swedish ad ids crossed that line on 2026-08-13 and every
 * persist failed as `vacancy_persist_read_failed:` while the dry run — which
 * never reads existing rows — looked healthy. 200 ids keeps the URL an order
 * of magnitude under the limit regardless of id shape.
 */
const EXISTENCE_READ_CHUNK = 200;

/**
 * The write arms need a bound too, learned the same day: a single upsert
 * carrying the whole batch (2 500+ full rows in one statement) tripped the
 * database's statement timeout — 57014, `vacancy_persist_insert_failed`, run
 * aborted, cursor honestly stuck. Chunked upserts stay idempotent
 * (natural-key ON CONFLICT), so a run that dies between chunks re-runs
 * safely: already-written rows re-classify as unchanged and are merely
 * touched.
 *
 * 500 was not small enough. As production grew to ~37 000 rows the same
 * 57014 came back (runs 31826082813 / 31827497540, 2026-08-14): every row
 * write maintains three GIN indexes (skills, full text) plus the b-trees, so
 * per-statement cost rises with table size and any statement can additionally
 * be the unlucky one that pays for a GIN pending-list flush. Two defences,
 * both below: a smaller initial chunk, and a bounded halving retry on 57014
 * (`runStatementChunks`) so one slow statement shrinks instead of killing the
 * whole session.
 */
const WRITE_CHUNK = 200;

/**
 * Touch and withdraw travel as `.in(external_id, …)` UPDATE filters, so their
 * per-statement bound answers to the same ~8 KB URL cap as the existence read
 * — 200 ids keeps the URL an order of magnitude under it. Batching them at
 * all (rather than one statement per row, the shape that failed as
 * `vacancy_persist_touch_failed:57014` on 2026-08-14) also collapses ~5 000
 * sequential round trips per reconciliation session into ~25.
 */
const UPDATE_FILTER_CHUNK = 200;

/** Below this size a statement is not split further — it is retried once and
 *  then honestly failed. 25 full rows is far under any workload the timeout
 *  was ever observed to admit, so reaching a second 57014 here means the
 *  database itself is unwell and retrying harder would only mask it. */
const MIN_STATEMENT_CHUNK = 25;

/** Postgres SQLSTATE for "canceling statement due to statement timeout". */
const STATEMENT_TIMEOUT_CODE = "57014";

/**
 * Run one bounded statement per chunk of `items`, splitting a chunk in half
 * and retrying when the database answers 57014. The split is BOUNDED: depth
 * is log2(initial/min) and a min-size chunk gets exactly one retry, so the
 * worst case is a fixed, small statement count — never a loop. Every other
 * error code fails immediately and verbatim.
 *
 * Callers pass idempotent statements only (natural-key upserts, absolute-value
 * updates), which is what makes the retry safe: re-running a half that
 * partially succeeded rewrites the same values it wrote the first time.
 */
async function runStatementChunks<T>(
  items: readonly T[],
  chunkSize: number,
  runStatement: (chunk: readonly T[]) => Promise<{ code: string | null } | null>,
  fail: (code: string | null) => never,
): Promise<void> {
  const runChunk = async (
    chunk: readonly T[],
    isRetry: boolean,
  ): Promise<void> => {
    const error = await runStatement(chunk);
    if (error === null) return;
    if (error.code !== STATEMENT_TIMEOUT_CODE) fail(error.code);
    if (chunk.length > MIN_STATEMENT_CHUNK) {
      const mid = Math.ceil(chunk.length / 2);
      await runChunk(chunk.slice(0, mid), false);
      await runChunk(chunk.slice(mid), false);
      return;
    }
    if (!isRetry) return runChunk(chunk, true);
    fail(error.code);
  };

  for (let i = 0; i < items.length; i += chunkSize) {
    await runChunk(items.slice(i, i + chunkSize), false);
  }
}

/** External ids per provider — the grouping the batched UPDATE arms filter
 *  on. One batch is one provider in practice, but the grouping is read off
 *  the data so a mixed batch cannot cross-touch another provider's rows. */
function idsByProvider(rows: readonly PublicVacancyRowV1[]): Map<string, string[]> {
  const grouped = new Map<string, string[]>();
  for (const row of rows) {
    const ids = grouped.get(row.provider_key);
    if (ids === undefined) grouped.set(row.provider_key, [row.external_id]);
    else ids.push(row.external_id);
  }
  return grouped;
}

/**
 * Store a batch of accepted vacancies idempotently.
 *
 * `seenAt` is the caller's capture clock — the same value the importer used
 * for the run — so a row's `last_seen_at` reflects when the batch was captured
 * rather than when this function happened to be reached.
 *
 * `sessionId` is the runner's import session, stamped onto every row this call
 * inserts or rewrites so a stored ad is traceable to the run that produced it.
 * Required, not defaulted: a batch reaching the writer always comes from a
 * session, and a default here is how the column once shipped silently null.
 */
export async function persistVacancies(
  client: VacancyDbClient,
  vacancies: readonly PublicVacancyV1[],
  seenAt: string,
  sessionId: string,
): Promise<VacancyPersistResultV1> {
  if (vacancies.length === 0) {
    return { inserted: 0, updated: 0, unchanged: 0, withdrawnAbsent: 0 };
  }

  // Every record in one batch comes from one provider — the importer runs one
  // provider per session — but this reads the key off the data rather than
  // assuming it, so a mixed batch cannot silently collide in the lookup below.
  const providerKeys = [...new Set(vacancies.map((v) => v.providerKey))];
  const externalIds = vacancies.map((v) => v.externalId);

  const storedByKey = new Map<string, { hash: string; lifecycle: string }>();
  for (let i = 0; i < externalIds.length; i += EXISTENCE_READ_CHUNK) {
    const chunk = externalIds.slice(i, i + EXISTENCE_READ_CHUNK);
    const { data: existingRows, error: readError } = await client
      .from(VACANCY_TABLE)
      .select("provider_key, external_id, content_hash, lifecycle")
      .in("provider_key", providerKeys)
      .in("external_id", chunk);

    if (readError) {
      throw new Error(`vacancy_persist_read_failed:${readError.code ?? "unknown"}`);
    }

    for (const row of existingRows ?? []) {
      const r = row as {
        provider_key: string;
        external_id: string;
        content_hash: string;
        lifecycle: string;
      };
      storedByKey.set(vacancyRowKey(r.provider_key, r.external_id), {
        hash: r.content_hash,
        lifecycle: r.lifecycle,
      });
    }
  }

  const toInsert: PublicVacancyRowV1[] = [];
  const toUpdate: PublicVacancyRowV1[] = [];
  const toTouch: PublicVacancyRowV1[] = [];
  /** A withdrawal is a LIFECYCLE TRANSITION, not a content rewrite. The
   *  stream's removal records legitimately carry no body (the validator
   *  admits a titleless removal on purpose), so writing the whole row would
   *  hand the table an empty title its own `1..300` bound refuses — 23514,
   *  observed live on 2026-08-13, run aborted, cursor stuck. These rows get a
   *  narrow UPDATE that flips lifecycle/is_active and stamps the run, and
   *  leaves the last published content in place as history. */
  const toWithdraw: PublicVacancyRowV1[] = [];
  let withdrawnAbsent = 0;

  for (const vacancy of vacancies) {
    const row = toPublicVacancyRow(vacancy, seenAt, sessionId);
    const stored = storedByKey.get(
      vacancyRowKey(vacancy.providerKey, vacancy.externalId),
    );
    if (vacancy.lifecycle === "removed") {
      // Never stored: there is nothing to tombstone and no content to insert.
      if (stored === undefined) withdrawnAbsent += 1;
      // Already withdrawn: re-seen, refresh liveness only — the second removal
      // of one ad is not a second state change.
      else if (stored.lifecycle === "removed") toTouch.push(row);
      else toWithdraw.push(row);
      continue;
    }
    if (stored === undefined) toInsert.push(row);
    // A republished ad whose content happens to match its pre-withdrawal hash
    // must still be REWRITTEN — an equal hash would otherwise leave the stored
    // lifecycle at 'removed' and the ad invisibly dead while live upstream.
    else if (stored.hash !== row.content_hash || stored.lifecycle === "removed")
      toUpdate.push(row);
    else toTouch.push(row);
  }

  // Inserts and updates both go through upsert on the natural key. For the
  // insert arm that is not redundancy — it is the only thing that makes two
  // concurrent runs safe. Without it, two importers that both read "absent"
  // would race and one would fail on the unique index.
  const upsertChunk = async (
    chunk: readonly PublicVacancyRowV1[],
  ): Promise<{ code: string | null } | null> => {
    const { error } = await client
      .from(VACANCY_TABLE)
      .upsert(chunk as never, { onConflict: "provider_key,external_id" });
    return error ? { code: error.code ?? null } : null;
  };

  await runStatementChunks(toInsert, WRITE_CHUNK, upsertChunk, (code) => {
    throw new Error(`vacancy_persist_insert_failed:${code ?? "unknown"}`);
  });

  await runStatementChunks(toUpdate, WRITE_CHUNK, upsertChunk, (code) => {
    throw new Error(`vacancy_persist_update_failed:${code ?? "unknown"}`);
  });

  // The narrow withdrawal write: lifecycle, liveness, and the run that did it.
  // Deliberately NOT the full row — a removal record's empty body must never
  // overwrite the last published content, and the table's own bounds would
  // refuse it anyway. Every withdrawal in a batch carries the same transition
  // and the same run stamps, so the arm is one bounded UPDATE per id chunk
  // rather than one statement per row.
  for (const [providerKey, ids] of idsByProvider(toWithdraw)) {
    await runStatementChunks(
      ids,
      UPDATE_FILTER_CHUNK,
      async (chunk) => {
        const { error } = await client
          .from(VACANCY_TABLE)
          .update({
            lifecycle: "removed",
            is_active: false,
            last_seen_at: seenAt,
            updated_at: seenAt,
            import_session_id: sessionId,
          } as never)
          .eq("provider_key", providerKey)
          .in("external_id", chunk);
        return error ? { code: error.code ?? null } : null;
      },
      (code) => {
        throw new Error(`vacancy_persist_withdraw_failed:${code ?? "unknown"}`);
      },
    );
  }

  // Unchanged rows get their liveness refreshed and nothing else. This is what
  // makes "we still saw this ad today" recordable without pretending the ad
  // was rewritten. All touched rows take the SAME capture clock, so this too
  // is one bounded UPDATE per id chunk — the per-row shape it replaces failed
  // as `vacancy_persist_touch_failed:57014` on 2026-08-14 and spent minutes
  // of a capped workflow run on thousands of sequential round trips.
  for (const [providerKey, ids] of idsByProvider(toTouch)) {
    await runStatementChunks(
      ids,
      UPDATE_FILTER_CHUNK,
      async (chunk) => {
        const { error } = await client
          .from(VACANCY_TABLE)
          .update({ last_seen_at: seenAt } as never)
          .eq("provider_key", providerKey)
          .in("external_id", chunk);
        return error ? { code: error.code ?? null } : null;
      },
      (code) => {
        throw new Error(`vacancy_persist_touch_failed:${code ?? "unknown"}`);
      },
    );
  }

  return {
    inserted: toInsert.length,
    // A withdrawal that flipped a stored row IS an update — one real state
    // change, counted once, exactly like a content revision.
    updated: toUpdate.length + toWithdraw.length,
    unchanged: toTouch.length,
    withdrawnAbsent,
  };
}

export interface VacancyCursorStateV1 {
  readonly cursorValue: string | null;
  readonly consecutiveFailures: number;
}

/**
 * The checkpoint a checkpointed channel must resume from. A missing row
 * returns a null cursor, which the importer correctly refuses to run a stream
 * on — the right cold start is a snapshot, and inventing a cursor here would
 * turn that deliberate refusal into an unbounded full re-read.
 */
export async function readVacancyCursor(
  client: VacancyDbClient,
  providerKey: string,
  channel: string,
): Promise<VacancyCursorStateV1> {
  const { data, error } = await client
    .from(CURSOR_TABLE)
    .select("cursor_value, consecutive_failures")
    .eq("provider_key", providerKey)
    .eq("channel", channel)
    .maybeSingle();

  if (error) {
    throw new Error(`vacancy_cursor_read_failed:${error.code ?? "unknown"}`);
  }
  if (!data) return { cursorValue: null, consecutiveFailures: 0 };

  const row = data as { cursor_value: string | null; consecutive_failures: number };
  return {
    cursorValue: row.cursor_value,
    consecutiveFailures: row.consecutive_failures ?? 0,
  };
}

/**
 * Record the outcome of a run.
 *
 * A FAILED run never moves the cursor. Advancing a checkpoint past records we
 * did not store is the one unrecoverable mistake available here: a re-read
 * costs bandwidth, a wrongly-advanced cursor costs vacancies that no later run
 * will ever look for again.
 */
export async function writeVacancyCursor(
  client: VacancyDbClient,
  input: {
    readonly providerKey: string;
    readonly channel: string;
    readonly succeeded: boolean;
    /** Only consulted when `succeeded`. */
    readonly nextCursor: string | null;
    /**
     * PARTIAL PROGRESS on a FAILED run, for a channel walked in bounded time
     * slices. A slice that was fetched and parsed in full has been completely
     * seen, and a later slice failing does not un-see it — so the checkpoint
     * may stand at the end of the last consumed slice even though the run as
     * a whole failed. The failure is still recorded in full (this is not a
     * quiet success): only `cursor_value` moves.
     *
     * Null for every non-windowed channel, where one response IS the whole
     * window and "partial sight is not sight" remains exactly right.
     */
    readonly partialCursor?: string | null;
    readonly previousFailures: number;
    /** Stable machine code. Never a message that could carry a secret. */
    readonly failureCode: string | null;
    readonly runAtIso: string;
  },
): Promise<void> {
  const base = {
    provider_key: input.providerKey,
    channel: input.channel,
    last_run_at: input.runAtIso,
    updated_at: input.runAtIso,
  };

  const payload = input.succeeded
    ? {
        ...base,
        cursor_value: input.nextCursor,
        last_success_at: input.runAtIso,
        last_failure_code: null,
        consecutive_failures: 0,
      }
    : {
        ...base,
        last_failure_at: input.runAtIso,
        last_failure_code: input.failureCode,
        consecutive_failures: input.previousFailures + 1,
        // Omit the key entirely when there is no partial progress, so the
        // upsert leaves any existing checkpoint untouched rather than
        // overwriting it with null.
        ...(typeof input.partialCursor === "string"
          ? { cursor_value: input.partialCursor }
          : {}),
      };

  const { error } = await client
    .from(CURSOR_TABLE)
    .upsert(payload as never, { onConflict: "provider_key,channel" });

  if (error) {
    throw new Error(`vacancy_cursor_write_failed:${error.code ?? "unknown"}`);
  }
}
