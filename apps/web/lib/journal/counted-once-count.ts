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

export function countedOnceTotal(res: CountedOnceQueryResult): number | null {
  if (res.error || !res.data) return null;
  if (res.data.length >= COUNTED_ONCE_READ_CAP) return null;
  return countedOnce(res.data).length;
}
