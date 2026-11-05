import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { ANON_SECDEF_ALLOWLIST } from "@/lib/security/anon-secdef-allowlist";

/**
 * SR-10: the free-text search finds an ad by its public title or occupation, through a narrow
 * derived copy of active ads, kept in step by triggers. The copy is closed to every API role and
 * holds folded text only. The title is searched and never returned, and nothing non-public is
 * searched or returned (owner 2026-11-05, replacing the matching rule of 20260824120000).
 * Results are proved by scripts/db-proof/search-title-oracle.sql and search-title-cases.sql.
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
const NON_PUBLIC = ["description_raw", "employer_name", "employer_external_org_id", "employer_homepage", "application_url", "country", "region", "city", "lat", "lng", "compensation_description"];

describe("narrow search table", () => {
  const sql = sqlOnly(read(`supabase/migrations/${TBL}.sql`));

  it("is closed to every API role", () => {
    expect(sql).toMatch(/alter table public\.public_vacancy_search enable row level security;/);
    expect(sql).toMatch(/revoke all on public\.public_vacancy_search from public, anon, authenticated, service_role;/);
    expect(sql).toMatch(/revoke all on function public\.public_vacancy_search_sync\(\) from public, anon, authenticated, service_role;/);
    expect(sql).toMatch(/revoke all on function public\.public_vacancy_search_fold\(text\) from public, anon, authenticated, service_role;/);
    expect(sql).not.toMatch(/\bgrant\b/i);
    expect(sql).not.toMatch(/create policy/i);
  });

  it("holds only the folded text and what the search filters and sorts by", () => {
    const table = sql.slice(sql.indexOf("create table"), sql.indexOf(") with ("));
    expect(table.match(/^\s+\w+ (uuid|text|timestamptz)/gm)).toHaveLength(4);
    expect(table).toContain('search_text text collate "C" not null');
    expect(sql.match(/coalesce\(\w+\.title_raw, ''\) \|\| ' ' \|\| coalesce\(\w+\.occupation_raw, ''\)/g)).toHaveLength(2);
    for (const col of NON_PUBLIC) expect(sql, col).not.toMatch(new RegExp(`\\b${col}\\b`));
  });

  it("folds in the database's collation and leaves no LIKE wildcard", () => {
    const fold = sql.slice(sql.indexOf("function public.public_vacancy_search_fold"), sql.indexOf("revoke all on function public.public_vacancy_search_fold"));
    // lower() under "C" leaves Ä and Š as they are, so a search for lärare misses LÄRARE.
    expect(fold).not.toContain('collate "C"');
    expect(fold).toContain("'[^[:alnum:]+#]+'");
    expect(fold).toContain("'ß', 'ss'");
    expect(fold).toContain("NFD");
    expect(fold).toContain("'øæłđ', 'oald'");
    expect(fold).toMatch(/immutable/);
  });

  it("follows every write that changes what a search can see, and no other", () => {
    for (const t of ["after insert", "after delete", "after update"]) expect(sql).toContain(t);
    const when = sql.slice(sql.indexOf("when ("), sql.indexOf("execute function", sql.indexOf("when (")));
    for (const col of ["is_active", "title_raw", "occupation_raw", "expires_at", "published_at"]) expect(when).toContain(col);
    expect(when).not.toMatch(/last_seen_at|updated_at|content_hash/);
  });

  it("ships a rollback that leaves the source alone", () => {
    const down = sqlOnly(read(`supabase/rollbacks/${TBL}.down.sql`));
    expect(down).toMatch(/drop table if exists public\.public_vacancy_search;/);
    expect(down).toMatch(/drop function if exists public\.public_vacancy_search_fold\(text\);/);
    expect(down).not.toMatch(/\b(delete|update|truncate)\b/i);
  });
});

describe("search v6", () => {
  const fn = sqlOnly(read(`supabase/migrations/${FN}.sql`));
  const v5 = sqlOnly(read(`supabase/migrations/${V5}.sql`));
  const branch = (s: string, from: string, to: string) => {
    const a = s.indexOf(from);
    const b = s.indexOf(to, a + 1);
    expect(a, from).toBeGreaterThan(-1);
    expect(b, to).toBeGreaterThan(a);
    return s.slice(a, b);
  };

  it("both free-text branches read the one folded text, and short terms must start a word", () => {
    const freeText = branch(fn, "elsif p_profession_slug is null then", "end if;\nend;");
    expect(freeText.match(/search_text like v_match/g)).toHaveLength(2);
    expect(freeText.match(/search_text like v_word/g)).toHaveLength(2);
    expect(freeText.match(/order by m\.rank desc, m\.published_at desc nulls last, m\.id/g)).toHaveLength(2);
    expect(freeText.match(/total as \(select count\(\*\) as n from match\)/g)).toHaveLength(2);
    expect(freeText).not.toMatch(/\blower\(/);
    expect(fn).toMatch(/v_match := case when length\(v_folded\) <= 3 then '% ' \|\| v_folded \|\| '%' else '%' \|\| v_folded \|\| '%' end;/);
    expect(fn).toMatch(/v_folded := btrim\(public\.public_vacancy_search_fold\(v_needle\)\);/);
  });

  it("finds nothing for a term with nothing searchable in it", () => {
    expect(fn).toMatch(/if v_folded = '' then\s+return;\s+end if;/);
  });

  it("searches and returns nothing non-public, and returns the title as NULL", () => {
    for (const col of NON_PUBLIC) expect(fn, col).not.toMatch(new RegExp(`\\b${col}\\b`));
    expect(fn).toMatch(/select v\.id, null::text, v\.profession_slug, v\.occupation_raw/);
    expect(fn).not.toMatch(/\btitle_raw\b(?! text,)/);
    expect(fn).not.toMatch(/\b(grant|revoke|drop\s+function)\b/i);
    expect(fn).toMatch(/security definer/);
    const e = ANON_SECDEF_ALLOWLIST.find((x) => x.name === "search_public_vacancy_previews_v1");
    expect(e?.identityArgs).toBe("p_query text, p_profession_slug text, p_limit integer, p_offset integer");
  });

  it("changes neither branch without free text", () => {
    for (const [from, to] of [
      ["if p_profession_slug is null and v_needle is null then", "elsif v_needle is null then"],
      ["elsif v_needle is null then", "elsif p_profession_slug is null then"],
    ] as const) {
      expect(branch(fn, from, to), from).toBe(branch(v5, from, to));
    }
  });

  it("the rollback is v5 verbatim", () => {
    const raw = read(`supabase/migrations/${V5}.sql`);
    expect(read(`supabase/rollbacks/${FN}.down.sql`)).toContain(
      raw.slice(raw.indexOf("create or replace function"), raw.indexOf("-- ROLLBACK")).trim(),
    );
  });

  it("the proof scripts raise on a difference, and only the cases write", () => {
    const reconcile = read("scripts/db-proof/narrow-search-table-reconcile.sql");
    expect(reconcile).toMatch(/^begin transaction isolation level repeatable read read only;$/m);
    expect(reconcile).toMatch(/^rollback;$/m);
    expect(reconcile).toMatch(/raise exception 'public_vacancy_search differs/);
    const oracle = read("scripts/db-proof/search-title-oracle.sql");
    expect(oracle).toMatch(/^begin transaction isolation level repeatable read read only;$/m);
    expect(oracle).toMatch(/raise exception 'title search differs/);
    const cases = read("scripts/db-proof/search-title-cases.sql");
    expect(cases).toMatch(/^rollback;$/m);
    expect(cases).toMatch(/Never run it on production/);
    expect(cases).toMatch(/raise exception 'title search failed/);
    for (const term of ["'byggarbetare'", "'ok'", "'-'", "'лікар'", "'šaltkalvis'", "'schweisser'", "'larare'"]) expect(cases, term).toContain(term);
  });
});
