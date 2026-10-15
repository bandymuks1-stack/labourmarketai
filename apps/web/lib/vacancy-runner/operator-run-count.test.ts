/**
 * OPERATOR-RUN STORED-ROW COUNT — the count is diagnostic and never fails a run.
 *
 * Regression under test: run 38689419280 (2026-10-15, issue #2402) imported
 * and advanced its cursor, then the post-run exact count hit the 8 s
 * statement_timeout; the HEAD response had no body, so the error had no code,
 * the script threw `count_failed:unknown` and the run went red with an empty
 * accounting artifact.
 */
import { describe, expect, it, vi } from "vitest";

import { countStoredRows } from "./operator-run-count";

type Resp = { count: number | null; error: { code?: string } | null; status?: number };

function clientReturning(...responses: Array<Resp | Error>) {
  const calls: string[] = [];
  let i = 0;
  const client = {
    from(table: string) {
      calls.push(table);
      return {
        select: () => ({
          eq: async () => {
            const r = responses[Math.min(i, responses.length - 1)];
            i += 1;
            if (r instanceof Error) throw r;
            return r;
          },
        }),
      };
    },
  };
  return { client, calls };
}

const noSleep = { sleep: vi.fn(async () => {}), backoffMs: [1, 1] };

describe("countStoredRows", () => {
  it("returns the exact count on success", async () => {
    const { client } = clientReturning({ count: 141345, error: null, status: 200 });
    await expect(countStoredRows(client, "arbetsformedlingen", noSleep)).resolves.toBe(141345);
  });

  it("keeps not_provisioned for a missing table", async () => {
    const { client } = clientReturning({ count: null, error: { code: "42P01" }, status: 404 });
    await expect(countStoredRows(client, "x", noSleep)).resolves.toBe("not_provisioned");
  });

  it("retries a codeless HEAD timeout and returns the count once the write burst settles", async () => {
    const { client, calls } = clientReturning(
      { count: null, error: {}, status: 500 },
      { count: 141345, error: null, status: 200 },
    );
    await expect(countStoredRows(client, "arbetsformedlingen", noSleep)).resolves.toBe(141345);
    expect(calls).toHaveLength(2);
  });

  it("never throws: a count that keeps failing degrades to unavailable with the HTTP status", async () => {
    const { client, calls } = clientReturning({ count: null, error: {}, status: 500 });
    await expect(countStoredRows(client, "arbetsformedlingen", noSleep)).resolves.toBe(
      "unavailable:http_500",
    );
    expect(calls).toHaveLength(3);
  });

  it("prefers the PostgREST code when there is one, and survives a thrown fetch", async () => {
    const coded = clientReturning({ count: null, error: { code: "57014" }, status: 500 });
    await expect(countStoredRows(coded.client, "p", noSleep)).resolves.toBe("unavailable:57014");
    const thrown = clientReturning(new TypeError("fetch failed"));
    await expect(countStoredRows(thrown.client, "p", noSleep)).resolves.toBe(
      "unavailable:TypeError",
    );
  });
});
