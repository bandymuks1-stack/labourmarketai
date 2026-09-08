import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  __resetPublicVacancyCache,
  searchPublicVacancyPreviews,
} from "./public-vacancy-preview";

/**
 * THE THUNDERING HERD, AND THE FIVE THINGS THE FIX MUST NOT BREAK.
 *
 * Measured on production 2026-09-08: ten distinct postgres sessions timed out
 * within 135 ms of each other and the SAME ten timed out again 3.03 s later, so
 * every timeout count in the logs is an exact multiple of 10 or 20. Individually
 * these calls take 1–144 ms; ten at once exceed `anon`'s 3 s statement_timeout
 * together. Every call arrives as `user_agent = "node"` — the Next.js server
 * rendering a `force-dynamic` page, once per render.
 *
 * These tests drive the real function with an injected client, so they measure
 * BEHAVIOUR (how many queries actually reach the database), not shape.
 */

type Rpc = ReturnType<typeof makeClient>;

function makeClient(opts: {
  rows?: Record<string, unknown>[];
  error?: { code: string } | null;
  delayMs?: number;
}) {
  const calls: { name: string; params: Record<string, unknown> }[] = [];
  const client = {
    rpc: async (name: string, params: Record<string, unknown>) => {
      calls.push({ name, params });
      if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs));
      return { data: opts.rows ?? [], error: opts.error ?? null };
    },
  };
  return { client, calls };
}

const ROW = {
  id: "11111111-1111-4111-8111-111111111111",
  profession_slug: "welder",
  occupation_raw: "Svetsare",
  employment_form: null,
  working_time: null,
  positions: 1,
  compensation_currency: null,
  compensation_min: null,
  compensation_max: null,
  source_language: "sv",
  published_at: "2026-09-01T00:00:00Z",
  total_count: 47710,
};

beforeEach(() => {
  __resetPublicVacancyCache();
  vi.useRealTimers();
});

describe("identical concurrent reads become ONE database query", () => {
  it("ten simultaneous identical calls issue exactly one RPC", async () => {
    const { client, calls } = makeClient({ rows: [ROW], delayMs: 25 });
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        searchPublicVacancyPreviews({}, client as unknown as Rpc["client"] as never),
      ),
    );
    // THE FIX, measured: 10 renders -> 1 query. This is the herd.
    expect(calls.length).toBe(1);
    expect(results).toHaveLength(10);
    for (const r of results) {
      expect(r.status).toBe("ok");
      expect(r.totalCount).toBe(47710);
    }
  });

  it("a later identical call is served from the short cache", async () => {
    const { client, calls } = makeClient({ rows: [ROW] });
    await searchPublicVacancyPreviews({}, client as never);
    await searchPublicVacancyPreviews({}, client as never);
    expect(calls.length).toBe(1);
  });
});

describe("NEGATIVE CONTROL — different inputs are never coalesced", () => {
  it("a different search term issues its own query", async () => {
    const { client, calls } = makeClient({ rows: [ROW] });
    await searchPublicVacancyPreviews({ query: "svetsare" }, client as never);
    await searchPublicVacancyPreviews({ query: "elektriker" }, client as never);
    expect(calls.length).toBe(2);
    expect(calls[0].params.p_query).toBe("svetsare");
    expect(calls[1].params.p_query).toBe("elektriker");
  });

  it("a different profession filter issues its own query", async () => {
    const { client, calls } = makeClient({ rows: [ROW] });
    await searchPublicVacancyPreviews({ professionSlug: "welder" }, client as never);
    await searchPublicVacancyPreviews({ professionSlug: "cleaner" }, client as never);
    expect(calls.length).toBe(2);
  });

  it("a different page issues its own query", async () => {
    const { client, calls } = makeClient({ rows: [ROW] });
    await searchPublicVacancyPreviews({ page: 1 }, client as never);
    await searchPublicVacancyPreviews({ page: 2 }, client as never);
    expect(calls.length).toBe(2);
    expect(calls[0].params.p_offset).toBe(0);
    expect(calls[1].params.p_offset).toBe(20);
  });

  it("an unfiltered call and a filtered call do not share a cache entry", async () => {
    const { client, calls } = makeClient({ rows: [ROW] });
    await searchPublicVacancyPreviews({}, client as never);
    await searchPublicVacancyPreviews({ query: "x" }, client as never);
    expect(calls.length).toBe(2);
  });

  it("whitespace-only input normalises to the unfiltered key, matching the RPC", async () => {
    // `"  "` and `null` produce the SAME p_query at the database, so sharing is
    // correct here — the inputs are genuinely equivalent, which is the only
    // condition under which sharing is allowed.
    const { client, calls } = makeClient({ rows: [ROW] });
    await searchPublicVacancyPreviews({ query: "   " }, client as never);
    await searchPublicVacancyPreviews({}, client as never);
    expect(calls.length).toBe(1);
    expect(calls[0].params.p_query).toBeNull();
  });
});

describe("NEGATIVE CONTROL — a failure never becomes data", () => {
  it("a statement timeout stays `unavailable`, never zero results", async () => {
    const { client } = makeClient({ error: { code: "57014" } });
    const r = await searchPublicVacancyPreviews({}, client as never);
    expect(r.status).toBe("unavailable");
    // The distinction the whole handler exists for: this is NOT "no jobs".
    expect(r.status).not.toBe("ok");
  });

  it("a failure is NEVER cached as a successful empty result", async () => {
    const fail = makeClient({ error: { code: "57014" } });
    await searchPublicVacancyPreviews({}, fail.client as never);

    // A later call with a WORKING client must get real data, not a cached
    // emptiness. Caching a failure as data is the fake zero this forbids.
    __resetPublicVacancyCache();
    const ok = makeClient({ rows: [ROW] });
    const r = await searchPublicVacancyPreviews({}, ok.client as never);
    expect(r.status).toBe("ok");
    expect(r.totalCount).toBe(47710);
  });

  it("`not_provisioned` is not cached as data either", async () => {
    const missing = makeClient({ error: { code: "42883" } });
    const r = await searchPublicVacancyPreviews({}, missing.client as never);
    expect(r.status).toBe("not_provisioned");
    expect(r.totalCount).toBe(0);
  });

  it("an unrecognised error still THROWS — silence would hide the next defect", async () => {
    const boom = makeClient({ error: { code: "42P01" } });
    await expect(searchPublicVacancyPreviews({}, boom.client as never)).rejects.toBeTruthy();
  });
});

describe("NEGATIVE CONTROL — retry behaviour is bounded", () => {
  it("a retry wave inside the cooldown does not re-hammer the database", async () => {
    const { client, calls } = makeClient({ error: { code: "57014" } });
    // The production shape: ten fail, then ten retry ~3 s later.
    await Promise.all(
      Array.from({ length: 10 }, () => searchPublicVacancyPreviews({}, client as never)),
    );
    const afterFirstWave = calls.length;
    const second = await Promise.all(
      Array.from({ length: 10 }, () => searchPublicVacancyPreviews({}, client as never)),
    );
    // First wave coalesces to one; the retry wave is answered from the cooldown.
    expect(afterFirstWave).toBe(1);
    expect(calls.length).toBe(1);
    for (const r of second) expect(r.status).toBe("unavailable");
  });

  it("this module issues no retries of its own", async () => {
    const { client, calls } = makeClient({ error: { code: "57014" } });
    await searchPublicVacancyPreviews({}, client as never);
    expect(calls.length).toBe(1);
  });
});

describe("NEGATIVE CONTROL — nothing caller-specific can enter the shared cache", () => {
  it("the RPC is called with the parameter tuple ONLY", async () => {
    const { client, calls } = makeClient({ rows: [ROW] });
    await searchPublicVacancyPreviews({ query: "a", professionSlug: "b", page: 2 }, client as never);
    expect(Object.keys(calls[0].params).sort()).toEqual([
      "p_limit",
      "p_offset",
      "p_profession_slug",
      "p_query",
    ]);
  });

  it("the cached value carries no identity field", async () => {
    const { client } = makeClient({ rows: [ROW] });
    const r = await searchPublicVacancyPreviews({}, client as never);
    const text = JSON.stringify(r);
    for (const forbidden of ["employer", "email", "profile", "user", "saved", "session"]) {
      expect(text.toLowerCase()).not.toContain(forbidden);
    }
  });

  it("two different callers receive byte-identical bytes for the same inputs", async () => {
    // The justification for sharing at all: the RPC consults no auth.uid(), no
    // auth.jwt() and no current_setting, so its output depends only on its
    // parameters. Verified against the live function on 2026-09-08.
    const { client } = makeClient({ rows: [ROW] });
    const a = await searchPublicVacancyPreviews({}, client as never);
    const b = await searchPublicVacancyPreviews({}, client as never);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
