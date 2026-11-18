import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { __resetPublicVacancyCache, searchPublicVacancyPreviews } from "./public-vacancy-preview";

/**
 * A COLD CACHE IS NOT "NO JOBS". A free-text search that is fast on a warm
 * cache can pass anon's statement timeout on a cold one; the first visitor
 * after a quiet spell got "unavailable". One retry on 57014
 * meets the warm cache. Any other error is not retried.
 */
function client(answers: { data: unknown; error: { code: string } | null }[]) {
  let i = 0;
  const calls: string[] = [];
  return {
    calls,
    c: {
      rpc: async (name: string) => {
        calls.push(name);
        return answers[Math.min(i++, answers.length - 1)];
      },
    } as never,
  };
}

beforeEach(() => __resetPublicVacancyCache());

describe("public vacancy search — one retry on a statement timeout", () => {
  it("timeout then success → the jobs are shown (two calls)", async () => {
    const { c, calls } = client([
      { data: null, error: { code: "57014" } },
      { data: [], error: null },
    ]);
    const r = await searchPublicVacancyPreviews({ query: "welder" }, c);
    expect(r.status).toBe("ok");
    expect(calls).toHaveLength(2);
  });

  it("two timeouts → unavailable (no third call)", async () => {
    const { c, calls } = client([{ data: null, error: { code: "57014" } }]);
    const r = await searchPublicVacancyPreviews({ query: "welder" }, c);
    expect(r.status).toBe("unavailable");
    expect(calls).toHaveLength(2);
  });

  it("any other error is not retried (and still surfaces as before)", async () => {
    const { c, calls } = client([{ data: null, error: { code: "XX000" } }]);
    await expect(searchPublicVacancyPreviews({ query: "kock" }, c)).rejects.toMatchObject({ code: "XX000" });
    expect(calls).toHaveLength(1);
  });
});

describe("an overloaded database is not retried (only an isolated timeout is)", () => {
  it("a second search timing out right after the first goes to the cooldown without a retry", async () => {
    const first = client([{ data: null, error: { code: "57014" } }]);
    await searchPublicVacancyPreviews({ query: "a" }, first.c);
    expect(first.calls).toHaveLength(2); // isolated: retried
    const second = client([{ data: null, error: { code: "57014" } }]);
    const r = await searchPublicVacancyPreviews({ query: "b" }, second.c);
    expect(r.status).toBe("unavailable");
    expect(second.calls).toHaveLength(1); // not isolated: no retry
  });
});
