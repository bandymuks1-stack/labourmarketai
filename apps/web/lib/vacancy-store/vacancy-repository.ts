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
    return { inserted: 0, updated: 0, unchanged: 0 };
  }

  // Every record in one batch comes from one provider — the importer runs one
  // provider per session — but this reads the key off the data rather than
  // assuming it, so a mixed batch cannot silently collide in the lookup below.
  const providerKeys = [...new Set(vacancies.map((v) => v.providerKey))];
  const externalIds = vacancies.map((v) => v.externalId);

  const storedHashByKey = new Map<string, string>();
  for (let i = 0; i < externalIds.length; i += EXISTENCE_READ_CHUNK) {
    const chunk = externalIds.slice(i, i + EXISTENCE_READ_CHUNK);
    const { data: existingRows, error: readError } = await client
      .from(VACANCY_TABLE)
      .select("provider_key, external_id, content_hash")
      .in("provider_key", providerKeys)
      .in("external_id", chunk);

    if (readError) {
      throw new Error(`vacancy_persist_read_failed:${readError.code ?? "unknown"}`);
    }

    for (const row of existingRows ?? []) {
      const r = row as { provider_key: string; external_id: string; content_hash: string };
      storedHashByKey.set(vacancyRowKey(r.provider_key, r.external_id), r.content_hash);
    }
  }

  const toInsert: PublicVacancyRowV1[] = [];
  const toUpdate: PublicVacancyRowV1[] = [];
  const toTouch: PublicVacancyRowV1[] = [];

  for (const vacancy of vacancies) {
    const row = toPublicVacancyRow(vacancy, seenAt, sessionId);
    const storedHash = storedHashByKey.get(
      vacancyRowKey(vacancy.providerKey, vacancy.externalId),
    );
    if (storedHash === undefined) toInsert.push(row);
    else if (storedHash !== row.content_hash) toUpdate.push(row);
    else toTouch.push(row);
  }

  // Inserts and updates both go through upsert on the natural key. For the
  // insert arm that is not redundancy — it is the only thing that makes two
  // concurrent runs safe. Without it, two importers that both read "absent"
  // would race and one would fail on the unique index.
  if (toInsert.length > 0) {
    const { error } = await client
      .from(VACANCY_TABLE)
      .upsert(toInsert as never, { onConflict: "provider_key,external_id" });
    if (error) {
      throw new Error(`vacancy_persist_insert_failed:${error.code ?? "unknown"}`);
    }
  }

  if (toUpdate.length > 0) {
    const { error } = await client
      .from(VACANCY_TABLE)
      .upsert(toUpdate as never, { onConflict: "provider_key,external_id" });
    if (error) {
      throw new Error(`vacancy_persist_update_failed:${error.code ?? "unknown"}`);
    }
  }

  // Unchanged rows get their liveness refreshed and nothing else. This is what
  // makes "we still saw this ad today" recordable without pretending the ad
  // was rewritten.
  for (const row of toTouch) {
    const { error } = await client
      .from(VACANCY_TABLE)
      .update({ last_seen_at: row.last_seen_at } as never)
      .eq("provider_key", row.provider_key)
      .eq("external_id", row.external_id);
    if (error) {
      throw new Error(`vacancy_persist_touch_failed:${error.code ?? "unknown"}`);
    }
  }

  return {
    inserted: toInsert.length,
    updated: toUpdate.length,
    unchanged: toTouch.length,
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
