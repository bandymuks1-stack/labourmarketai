import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { __resetPublicVacancyCache, searchPublicVacancyPreviews } from "./public-vacancy-preview";

/**
 * A COLD CACHE IS NOT "NO JOBS". Production 2026-10-20: a free-text search
 * runs 100–230 ms warm and 4.5 s on a cold cache, past anon's 3 s limit; the
 * first visitor after a quiet spell got "unavailable". One retry on 57014
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
