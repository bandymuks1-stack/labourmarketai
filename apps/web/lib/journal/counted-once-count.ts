import { countedOnce, type CorrectionChainRow } from "@/lib/journal/counted-once";

/**
 * A COUNT OF LIVE ENTRIES THAT NEVER COUNTS A CORRECTION CHAIN TWICE.
 *
 * A PostgREST `head: true` count cannot de-duplicate: a CONFIRMED original
 * keeps `superseded_by` NULL by design (its confirmation is somebody else's
 * evidence) and is linked to its correction only through `correction_of`, so
 * `superseded_by IS NULL` counts the original AND its live correction — two
 * days of work for one. The journal page counted it once; the CV, the
 * documents hub and the project gallery counted it twice (audit F2).
 *
 * Readers hand over the query for the LIVE rows selecting `id, correction_of`
 * and get back the counted-once total — or `null` when the read failed or hit
 * its ceiling (UNKNOWN is not a total, SEP-7).
 */

/** Ceiling for one counted read; reaching it makes the answer unknown. */
export const COUNTED_ONCE_READ_CAP = 20000;

type CountedOnceQueryResult = {
  data: readonly CorrectionChainRow[] | null;
  error: unknown;
};

/** Reads every page of an ordered `id, correction_of` query, 1000 rows a
 *  page (the server's answer cap: a bare `.limit(COUNTED_ONCE_READ_CAP)` was
 *  a silent 1000, so the "reached the ceiling" check below could never fire
 *  and a person with 1,400 entries read as 1,000 — audit 2026-10-20). Stops at
 *  the ceiling; `countedOnceTotal` then answers UNKNOWN. */
export async function readCountedRows(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  build: () => any,
): Promise<CountedOnceQueryResult> {
  const rows: CorrectionChainRow[] = [];
  for (let from = 0; from < COUNTED_ONCE_READ_CAP; from += 1000) {
    const res = (await build().range(from, from + 999)) as CountedOnceQueryResult;
    if (res.error) return { data: null, error: res.error };
    const got = res.data ?? [];
    rows.push(...got);
    if (got.length < 1000) return { data: rows, error: null };
  }
  return { data: rows, error: null };
}

export function countedOnceTotal(res: CountedOnceQueryResult): number | null {
  if (res.error || !res.data) return null;
  if (res.data.length >= COUNTED_ONCE_READ_CAP) return null;
  return countedOnce(res.data).length;
}
