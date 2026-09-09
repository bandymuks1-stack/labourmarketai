/**
 * Guard: Lane H window 6 (2026-09-06) — performance / production hygiene.
 *
 * Measured on production (pg_stat_statements since 2026-05-19, EXPLAIN
 * ANALYZE 2026-09-06; log: docs/launch/pilot-feedback/walks-2026-09-06/
 * perf-hygiene/PERF_HYGIENE_LOG.md) and pinned here so a refactor cannot
 * quietly re-open them:
 *
 *   H-1  readSupplyLastRefreshedAt (`order by last_seen_at desc limit 1`,
 *        869 calls, mean 270.8 ms, max 6,747 ms) sorted every live row to
 *        find one value. The fix is the P0-1 pattern: a partial index in the
 *        read's order + the read asking for the SAME null placement
 *        (`nullsFirst: false`), because a plain DESC is NULLS FIRST and can
 *        never walk a NULLS LAST index.
 *   H-2  notification_events refuses service-role writes with 42501 (owner
 *        GRANT pending, #1566). Every dashboard render retried the write and
 *        logged the same line (40 in 12 h). The adapter now names the state
 *        (`write_blocked`) and skips for a bounded window — behaviour
 *        pinned in lib/notifications/events-write-blocked.test.ts; this
 *        guard pins that the wrapper still reports real failures.
 *
 * Text-level (no DB).
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const web = resolve(__dirname, "..", "..");
const repo = resolve(web, "..", "..");
const read = (rel: string, base = web) => readFileSync(resolve(base, rel), "utf8");

const MIGRATION =
  "supabase/migrations/20260906070000_public_vacancies_active_last_seen_idx_v1.sql";
const ROLLBACK =
  "supabase/rollbacks/20260906070000_public_vacancies_active_last_seen_idx_v1.down.sql";

describe("H-1 GREEN migration — active rows newest-seen first", () => {
  const sql = read(MIGRATION, repo);

  it("adds ONE partial index in the freshness read's order and nothing else", () => {
    expect(sql).toMatch(
      /create index if not exists public_vacancies_active_last_seen_idx\s+on public\.public_vacancies \(last_seen_at desc nulls last, id\)\s+where is_active;/,
    );
    // GREEN by construction: no privilege, policy, function or data change.
    expect(sql).not.toMatch(/\b(grant|revoke|policy|create\s+or\s+replace\s+function|alter\s+function|update|delete|insert)\b/i);
    expect(sql).not.toMatch(/concurrently/i);
  });

  it("ships its paired rollback that drops exactly that index", () => {
    expect(existsSync(resolve(repo, ROLLBACK))).toBe(true);
    const down = read(ROLLBACK, repo);
    expect(down).toMatch(/drop index if exists public\.public_vacancies_active_last_seen_idx;/);
    expect(down).not.toMatch(/\b(grant|revoke|policy|create|alter|update|delete|insert)\b/i);
  });
});

describe("H-1 the read asks for the index's null placement", () => {
  const src = read("lib/vacancy-store/vacancy-read.ts");

  it("readSupplyLastRefreshedAt orders last_seen_at DESC NULLS LAST", () => {
    const fn = src.slice(src.indexOf("export async function readSupplyLastRefreshedAt"));
    expect(fn).toMatch(
      /\.order\("last_seen_at",\s*\{\s*ascending:\s*false,\s*nullsFirst:\s*false\s*\}\)/,
    );
    expect(fn).toMatch(/\.limit\(1\)/);
  });

  it("NEGATIVE CONTROL — a plain DESC on last_seen_at would be NULLS FIRST and miss the index", () => {
    const fn = src.slice(src.indexOf("export async function readSupplyLastRefreshedAt"));
    expect(fn).not.toMatch(/\.order\("last_seen_at",\s*\{\s*ascending:\s*false\s*\}\)/);
  });
});

describe("H-2 the notification store's unprivileged writer is a named state", () => {
  const src = read("lib/notifications/events.ts");

  it("42501 maps to write_blocked with a bounded TTL, not to unexpected_error", () => {
    expect(src).toMatch(/const INSUFFICIENT_PRIVILEGE = "42501";/);
    expect(src).toMatch(/kind:\s*"write_blocked"/);
    expect(src).toMatch(/STORE_WRITE_BLOCKED_TTL_MS = 15 \* 60 \* 1000/);
  });

  it("the fire-and-forget wrapper still reports genuinely unexpected failures", () => {
    const wrapper = src.slice(src.indexOf("export function emitNotificationEventInBackground"));
    expect(wrapper).toMatch(/outcome\.kind === "unexpected_error"/);
    expect(wrapper).toMatch(/emit failed unexpectedly/);
  });
});
