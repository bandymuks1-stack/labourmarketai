import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock("@/lib/env", () => ({
  requireSupabaseClientEnv: () => ({ url: "https://example.supabase.co", anonKey: "anon" }),
}));

import { SITEMAP_CACHE_CONTROL, serialized, withTimeoutRetry } from "./public-vacancy-sitemap-cache";

/**
 * P0 2026-11-03: a crawler fetching all 54 shards at once ran 54 deep OFFSET
 * scans in parallel and 8 hit anon's 3 s statement timeout (HTTP 500).
 */
describe("serialized — cache misses run one at a time", () => {
  it("never runs two queued jobs concurrently, and keeps going after a failure", async () => {
    let running = 0;
    let peak = 0;
    const job = (fail: boolean) => async () => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 5));
      running--;
      if (fail) throw new Error("x");
      return "ok";
    };
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, (_, i) => serialized(job(i === 3))),
    );
    expect(peak).toBe(1);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(9);
  });
});

describe("withTimeoutRetry", () => {
  it("retries once on 57014", async () => {
    let n = 0;
    const r = await withTimeoutRetry(async () => {
      if (n++ === 0) throw { code: "57014" };
      return 42;
    });
    expect(r).toBe(42);
    expect(n).toBe(2);
  });
  it("does not retry other errors", async () => {
    let n = 0;
    await expect(
      withTimeoutRetry(async () => {
        n++;
        throw { code: "42501" };
      }),
    ).rejects.toEqual({ code: "42501" });
    expect(n).toBe(1);
  });
});

describe("sitemap routes", () => {
  const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf-8");
  const shard = read("app/jobs-sitemap/[shard]/route.ts");
  const index = read("app/jobs-sitemap.xml/route.ts");

  it("read through the cached, cookie-less reader — never the per-request cookie client", () => {
    expect(shard).toMatch(/readCachedSitemapShard\(shard\)/);
    expect(index).toMatch(/readCachedActiveVacancyCount\(\)/);
    for (const src of [shard, index]) {
      expect(src).not.toMatch(/listPublicVacancySitemapEntries\(|readPublicVacancySupplyCounts\(/);
      expect(src).not.toMatch(/@\/lib\/supabase\/server/);
    }
  });

  it("answer a database failure with 503 + Retry-After, never 500", () => {
    for (const src of [shard, index]) {
      expect(src).toMatch(/status: 503/);
      expect(src).toMatch(/"Retry-After"/);
    }
  });

  it("let shared caches keep and revalidate the XML", () => {
    expect(SITEMAP_CACHE_CONTROL).toMatch(/s-maxage=3600/);
    expect(SITEMAP_CACHE_CONTROL).toMatch(/stale-while-revalidate=86400/);
  });
});
