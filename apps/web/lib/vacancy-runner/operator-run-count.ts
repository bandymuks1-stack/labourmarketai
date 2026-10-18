/**
 * OPERATOR-RUN STORED-ROW COUNT — the before/after `public_vacancies` count
 * printed by `scripts/vacancy-operator-run.ts`.
 *
 * Why this exists: the count is DIAGNOSTIC accounting, not the import. It used
 * to throw on any error, which turned a completed session into a red run and
 * discarded the session's accounting document. Observed 2026-10-15 (run
 * 38689419280, issue #2402): the session imported and advanced the stream
 * cursor at 05:58:35, then the AFTER count — an exact count issued right after
 * a burst of PATCHes, so the index-only scan needed tens of thousands of heap
 * fetches — hit the 8 s `statement_timeout` at 05:58:44. A HEAD response has
 * no body, so PostgREST's error carried no code and the script printed
 * `count_failed:unknown` and exited 1 with an empty artifact.
 *
 * The contract now:
 *   - a missing table (42P01) is still `not_provisioned`;
 *   - a failed count is retried with backoff (the write burst settles);
 *   - a count that still fails returns `unavailable:<code|http_status>` and
 *     NEVER throws — the exit code is decided by the session status alone
 *     (`operatorRunExitCode`), so an honest import is never reported as failed
 *     and a failed import is never hidden by a working count.
 */

export type StoredRowCount = number | "not_provisioned" | `unavailable:${string}`;

interface CountResponse {
  count: number | null;
  error: { code?: string | null } | null;
  status?: number;
}

export interface CountStoredOptions {
  /** Delays between attempts, in ms. Length + 1 = attempts. */
  backoffMs?: readonly number[];
  sleep?: (ms: number) => Promise<void>;
}

const DEFAULT_BACKOFF_MS = [3_000, 10_000] as const;

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function countStoredRows(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: { from: (t: string) => any },
  providerKey: string,
  options: CountStoredOptions = {},
): Promise<StoredRowCount> {
  const backoff = options.backoffMs ?? DEFAULT_BACKOFF_MS;
  const sleep = options.sleep ?? defaultSleep;
  let reason = "unknown";
  for (let attempt = 0; attempt <= backoff.length; attempt += 1) {
    if (attempt > 0) await sleep(backoff[attempt - 1]);
    let res: CountResponse;
    try {
      res = (await client
        .from("public_vacancies")
        .select("*", { count: "exact", head: true })
        .eq("provider_key", providerKey)) as CountResponse;
    } catch (err) {
      reason = err instanceof Error && err.name ? err.name : "exception";
      continue;
    }
    if (!res.error) return res.count ?? 0;
    if (res.error.code === "42P01") return "not_provisioned";
    reason =
      res.error.code ||
      (typeof res.status === "number" && res.status > 0
        ? `http_${res.status}`
        : "unknown");
  }
  return `unavailable:${reason}`;
}
