import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PUBLIC_VACANCY_SITEMAP_SHARD_SIZE } from "@/lib/vacancy-store/public-vacancy-preview";

/**
 * Jobs sitemap shard size vs the API row cap (production, 2026-11-03).
 *
 * `/jobs-sitemap.xml` lists ceil(count / SHARD_SIZE) shards and each shard asks
 * `list_public_vacancy_sitemap_v1` for SHARD_SIZE rows in ONE call. PostgREST
 * answers at most `max_rows` rows per call and says nothing about the rest, so
 * a shard larger than `max_rows` is silently cut. At 5000 every shard held
 * 1000 URLs and 42,095 of 53,095 live job pages were missing from the sitemap.
 */
const CONFIG = readFileSync(join(process.cwd(), "../../supabase/config.toml"), "utf-8");

describe("jobs sitemap shard fits one PostgREST page", () => {
  it("shard size never exceeds the configured max_rows", () => {
    const maxRows = Number(CONFIG.match(/^max_rows\s*=\s*(\d+)/m)?.[1]);
    expect(Number.isInteger(maxRows) && maxRows > 0).toBe(true);
    expect(PUBLIC_VACANCY_SITEMAP_SHARD_SIZE).toBeLessThanOrEqual(maxRows);
  });

  it("stays within the sitemaps.org 50,000-URLs-per-file ceiling", () => {
    expect(PUBLIC_VACANCY_SITEMAP_SHARD_SIZE).toBeGreaterThan(0);
    expect(PUBLIC_VACANCY_SITEMAP_SHARD_SIZE).toBeLessThanOrEqual(50000);
  });
});
