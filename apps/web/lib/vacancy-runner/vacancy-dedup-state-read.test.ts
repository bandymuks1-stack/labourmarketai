/**
 * Dedup-state read — KEYSET paging + bounded 57014 retry.
 *
 * Root cause pinned (2026-10-09): the read used OFFSET paging, so the late
 * pages of the ~131,700-row Swedish store cost ~20 s each against an 8 s
 * statement timeout (`dedup_state_read_failed:57014`, 5 of the last 10 failed
 * scheduled runs). These tests pin that no OFFSET (`range`) is issued, that
 * every row is read exactly once in order, and that a transient 57014 is
 * retried while every other error stays verbatim.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getVacancyProvider } from "@/lib/vacancy-sources/vacancy-provider-registry";
import {
  __setDedupRetrySleepForTest,
  loadDedupState,
  runVacancyIngestionSession,
} from "./vacancy-ingestion";

type Err = { code: string } | null;

function fakeStore(total: number, failures: Err[] = []) {
  const ids = Array.from({ length: total }, (_, i) =>
    String(i).padStart(7, "0"),
  );
  const calls: { gt: string | null; limit: number | null; range: boolean }[] = [];
  const pending = [...failures];
  const client = {
    from: () => {
      const state = { gt: null as string | null, limit: null as number | null, range: false };
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = () => chain;
      chain.order = () => chain;
      chain.range = () => {
        state.range = true;
        return chain;
      };
      chain.gt = (_c: string, v: string) => {
        state.gt = v;
        return chain;
      };
      chain.limit = (n: number) => {
        state.limit = n;
        return chain;
      };
      chain.then = (ok: (v: unknown) => unknown, err?: (e: unknown) => unknown) => {
        calls.push({ ...state });
        const e = pending.shift();
        if (e) return Promise.resolve({ data: null, error: e }).then(ok, err);
        const rows = ids
          .filter((id) => state.gt === null || id > state.gt)
          .slice(0, state.limit ?? 1000)
          .map((id) => ({ external_id: id, content_hash: `h${id}` }));
        return Promise.resolve({ data: rows, error: null }).then(ok, err);
      };
      return chain;
    },
  };
  return { client: client as never, calls };
}

const sleeps: number[] = [];
beforeEach(() => {
  sleeps.length = 0;
  __setDedupRetrySleepForTest(async (ms) => {
    sleeps.push(ms);
  });
});
afterEach(() => {
  __setDedupRetrySleepForTest(null);
  vi.unstubAllEnvs();
});

describe("loadDedupState", () => {
  it("reads every row exactly once with keyset pages and never issues OFFSET", async () => {
    const { client, calls } = fakeStore(2500);
    const state = await loadDedupState(client, "arbetsformedlingen");
    expect(state.knownIdentityHashes.size).toBe(2500);
    expect(state.knownContentHashes.size).toBe(2500);
    expect(calls.map((c) => c.gt)).toEqual([null, "0000999", "0001999"]);
    expect(calls.every((c) => !c.range && c.limit === 1000)).toBe(true);
  });

  it("an exact multiple of the page size ends on an empty page", async () => {
    const { client, calls } = fakeStore(2000);
    const state = await loadDedupState(client, "arbetsformedlingen");
    expect(state.knownIdentityHashes.size).toBe(2000);
    expect(calls).toHaveLength(3);
  });

  it("retries a transient 57014 with backoff and loses nothing", async () => {
    const { client } = fakeStore(1500, [null, { code: "57014" }, { code: "57014" }]);
    const state = await loadDedupState(client, "arbetsformedlingen");
    expect(state.knownIdentityHashes.size).toBe(1500);
    expect(sleeps).toEqual([1000, 3000]);
  });

  it("a persistent 57014 fails closed with the verbatim code after bounded retries", async () => {
    const e = { code: "57014" };
    const { client } = fakeStore(10, [e, e, e, e, e]);
    await expect(loadDedupState(client, "arbetsformedlingen")).rejects.toThrow(
      "dedup_state_read_failed:57014",
    );
    expect(sleeps).toEqual([1000, 3000, 8000]);
  });

  it("any other error is not retried", async () => {
    const { client } = fakeStore(10, [{ code: "XX000" }]);
    await expect(loadDedupState(client, "arbetsformedlingen")).rejects.toThrow(
      "dedup_state_read_failed:XX000",
    );
    expect(sleeps).toEqual([]);
  });

  it("a missing table is an empty store", async () => {
    const { client } = fakeStore(10, [{ code: "42P01" }]);
    const state = await loadDedupState(client, "arbetsformedlingen");
    expect(state.knownIdentityHashes.size).toBe(0);
  });
});

describe("runner_exception records source health on the cursor row", () => {
  function client(cursorRow: unknown) {
    const upserts: { table: string; payload: Record<string, unknown> }[] = [];
    const c = {
      from: (table: string) => {
        const chain: Record<string, unknown> = {};
        for (const k of ["select", "eq", "order", "gt", "limit"]) chain[k] = () => chain;
        chain.maybeSingle = () => Promise.resolve({ data: cursorRow, error: null });
        chain.then = (ok: (v: unknown) => unknown) =>
          Promise.resolve({ data: null, error: { code: "XX000" } }).then(ok);
        chain.upsert = (payload: Record<string, unknown>) => {
          upserts.push({ table, payload });
          return Promise.resolve({ error: null });
        };
        return chain;
      },
    };
    return { c: c as never, upserts };
  }
  const run = (c: never, mode: "persist" | "dry_run") => {
    vi.stubEnv("VACANCY_SOURCE_ARBETSFORMEDLINGEN_ENABLED", "on");
    vi.stubEnv("VACANCY_IMPORT_KILL_SWITCH", "");
    return runVacancyIngestionSession(c, getVacancyProvider("arbetsformedlingen")!, {
      channel: "stream",
      mode,
      nowIso: "2026-10-09T01:00:00.000Z",
    });
  };

  it("bumps consecutive_failures, never touches cursor_value", async () => {
    const { c, upserts } = client({ cursor_value: "2026-10-08T16:00:45.119Z", consecutive_failures: 2 });
    const r = await run(c, "persist");
    expect(r.status).toBe("runner_exception");
    expect(upserts).toHaveLength(1);
    expect(upserts[0]!.payload.consecutive_failures).toBe(3);
    expect(upserts[0]!.payload.last_failure_code).toBe("dedup_state_read_failed:XX000");
    expect("cursor_value" in upserts[0]!.payload).toBe(false);
  });

  it("invents no row when none exists, and a dry run writes nothing", async () => {
    const a = client(null);
    await run(a.c, "persist");
    expect(a.upserts).toHaveLength(0);
    const b = client({ cursor_value: "x", consecutive_failures: 0 });
    await run(b.c, "dry_run");
    expect(b.upserts).toHaveLength(0);
  });
});
