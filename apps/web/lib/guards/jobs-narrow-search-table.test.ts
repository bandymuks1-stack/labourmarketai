import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The narrow search table is a derived copy of active ads, kept in step by triggers.
 * It is closed to every API role, and the search function differs from v5 in one place.
 * Accuracy is compared by scripts/db-proof/search-fixed-clock-hashes.sql.
 */
const ROOT = join(__dirname, "..", "..", "..", "..");
const TBL = "20261105100000_public_vacancy_search_table_v1";
const FN = "20261105100100_search_public_vacancy_previews_narrow_v6";
const V5 = "20261104160100_search_public_vacancy_previews_live_scan_v5";
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const sqlOnly = (s: string) =>
  s
    .split("\n")
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n");

describe("narrow search table", () => {
  const sql = sqlOnly(read(`supabase/migrations/${TBL}.sql`));

  it("is closed to every API role", () => {
    expect(sql).toMatch(/alter table public\.public_vacancy_search enable row level security;/);
    expect(sql).toMatch(/revoke all on public\.public_vacancy_search from public, anon, authenticated, service_role;/);
    expect(sql).toMatch(/revoke all on function public\.public_vacancy_search_sync\(\) from public, anon, authenticated, service_role;/);
    expect(sql).not.toMatch(/\bgrant\b/i);
    expect(sql).not.toMatch(/create policy/i);
  });

  it("copies only what the anonymous search may read", () => {
    const table = sql.slice(sql.indexOf("create table"), sql.indexOf(") with ("));
    expect(table.match(/^\s+\w+ (uuid|text|timestamptz)/gm)).toHaveLength(4);
    for (const col of ["employer_name", "application_url", "description_raw", "title_raw"]) {
      expect(sql).not.toMatch(new RegExp(`\\b${col}\\b`));
    }
  });

  it("follows every write that changes what a search can see, and no other", () => {
    for (const t of ["after insert", "after delete", "after update"]) expect(sql).toContain(t);
    const when = sql.slice(sql.indexOf("when ("), sql.indexOf("execute function", sql.indexOf("when (")));
    for (const col of ["is_active", "occupation_raw", "expires_at", "published_at"]) expect(when).toContain(col);
    expect(when).not.toMatch(/last_seen_at|updated_at|content_hash/);
  });

  it("ships a rollback that leaves the source alone", () => {
    const down = sqlOnly(read(`supabase/rollbacks/${TBL}.down.sql`));
    expect(down).toMatch(/drop table if exists public\.public_vacancy_search;/);
    expect(down).not.toMatch(/\bpublic_vacancies\b(?! *;)(?!\s*$)[^;]*\b(delete|update|truncate)\b/i);
  });
});

describe("search v6", () => {
  it("changes only where the free-text branch reads", () => {
    const body = (s: string) => {
      const b = sqlOnly(s);
      return b.slice(b.indexOf("create or replace function"), b.indexOf("comment on function"));
    };
    const v5 = body(read(`supabase/migrations/${V5}.sql`));
    const v6 = body(read(`supabase/migrations/${FN}.sql`));
    expect(v6).toBe(
      v5.replace(
        "from public.public_vacancies h\n        where h.is_active and coalesce(h.expires_at, 'infinity'::timestamptz) > now()\n          and lower(h.occupation_raw) collate \"C\" like v_pattern),",
        "from public.public_vacancy_search h\n        where coalesce(h.expires_at, 'infinity'::timestamptz) > now()\n          and lower(h.occupation_raw) collate \"C\" like v_pattern),",
      ),
    );
  });

  it("the rollback is v5 verbatim", () => {
    const v5 = read(`supabase/migrations/${V5}.sql`);
    expect(read(`supabase/rollbacks/${FN}.down.sql`)).toContain(
      v5.slice(v5.indexOf("create or replace function"), v5.indexOf("-- ROLLBACK")).trim(),
    );
  });

  it("the reconcile script is read-only and raises on a difference", () => {
    const proof = read("scripts/db-proof/narrow-search-table-reconcile.sql");
    expect(proof).toMatch(/^begin transaction isolation level repeatable read read only;$/m);
    expect(proof).toMatch(/^rollback;$/m);
    expect(proof).toMatch(/raise exception 'public_vacancy_search differs/);
  });
});
