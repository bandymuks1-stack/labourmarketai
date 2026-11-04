import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { ANON_SECDEF_ALLOWLIST } from "@/lib/security/anon-secdef-allowlist";

/**
 * One index-only scan answers the free-text search's exact total and its page.
 * The total is never capped or estimated: the same predicate, read once.
 * Results compared with v4 by scripts/db-proof/search-one-scan-equivalence.sql.
 */
const ROOT = join(__dirname, "..", "..", "..", "..");
const INDEX = "20261104120000_public_vacancies_occupation_scan_idx_v1";
const FN = "20261104120100_search_public_vacancy_previews_one_scan_v5";
const V4 = "20261011090000_search_public_vacancy_previews_c_like_v4";
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const sqlOnly = (s: string) =>
  s
    .split("\n")
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n");
/** v4's function statements only, from `create or replace` to the comment's end. */
const v4Body = (s: string) => s.slice(s.indexOf("create or replace function"), s.indexOf("-- ROLLBACK")).trim();

describe("search one scan v5", () => {
  const fn = sqlOnly(read(`supabase/migrations/${FN}.sql`));
  const freeText = fn.slice(fn.indexOf("-- Free text only"), fn.indexOf("-- Profession AND free text"));
  const v4 = sqlOnly(read(`supabase/migrations/${V4}.sql`));

  it("the free-text branch reads the matches once and takes an exact total from them", () => {
    const branch = fn.slice(fn.indexOf("elsif p_profession_slug is null then"), fn.indexOf("else\n    "));
    expect(branch).toMatch(/with match as materialized \(/);
    expect(branch).toMatch(/total as \(select count\(\*\) as n from match\)/);
    expect(branch).toMatch(/\(select t\.n from total t\)/);
    expect(branch.match(/from public\.public_vacancies h\b/g)).toHaveLength(1);
    expect(branch).not.toMatch(/into v_total/);
    expect(freeText).not.toMatch(/reltuples|estimate|least\(count/i);
  });

  it("keeps the predicate, projection, caps and security properties", () => {
    expect(fn).toMatch(/lower\(h\.occupation_raw\) collate "C" like v_pattern/);
    expect(fn).toMatch(/h\.is_active and \(h\.expires_at is null or h\.expires_at > now\(\)\)/);
    expect(fn).toMatch(/null::text, v\.profession_slug/);
    expect(fn).toMatch(/least\(greatest\(coalesce\(p_limit, 20\), 1\), 50\)/);
    expect(fn).toMatch(/security definer/);
    expect(fn).toMatch(/set search_path to 'public'/);
    expect(fn).toMatch(/set max_parallel_workers_per_gather to 0/);
    expect(fn).toMatch(/set work_mem to '16MB'/);
    expect(fn).not.toMatch(/\b(grant|revoke|drop\s+function|execute)\b/i);
    for (const col of ["employer_name", "application_url", "description_raw"]) {
      expect(fn).not.toMatch(new RegExp(`\\b${col}\\b`));
    }
    const e = ANON_SECDEF_ALLOWLIST.find((x) => x.name === "search_public_vacancy_previews_v1");
    expect(e?.identityArgs).toBe("p_query text, p_profession_slug text, p_limit integer, p_offset integer");
  });

  it("changes no other branch", () => {
    const branch = (s: string, from: string, to: string) => s.slice(s.indexOf(from), s.indexOf(to));
    for (const [from, to] of [
      ["-- Unfiltered board", "elsif v_needle is null then"],
      ["-- Profession only.", "elsif p_profession_slug is null then"],
      ["-- Profession AND free text.", "end if;\nend;"],
    ] as const) {
      expect(branch(fn, from, to), from).toBe(branch(v4, from, to));
    }
  });

  it("the rollback is the v4 function verbatim, without work_mem", () => {
    const down = read(`supabase/rollbacks/${FN}.down.sql`);
    expect(down).toContain(v4Body(read(`supabase/migrations/${V4}.sql`)));
    expect(sqlOnly(down)).not.toMatch(/work_mem/);
  });
});

describe("occupation scan index", () => {
  const raw = read(`supabase/migrations/${INDEX}.sql`);
  const sql = sqlOnly(raw);

  it("carries only what the search reads, on active rows", () => {
    expect(sql.replace(/\s+/g, " ")).toMatch(
      /create index if not exists public_vacancies_active_occupation_scan_idx on public\.public_vacancies \(occupation_raw\) include \(expires_at, published_at, id\) where is_active;/,
    );
  });

  it("refuses an invalid or differently shaped index before recording it", () => {
    expect(sql).toMatch(/not v_valid/);
    expect(sql).toMatch(/v_def <> 'CREATE INDEX public_vacancies_active_occupation_scan_idx ON public\.public_vacancies USING btree \(occupation_raw\) INCLUDE \(expires_at, published_at, id\) WHERE is_active'/);
  });

  it("states its concurrent apply procedure and ships a rollback", () => {
    expect(raw).toMatch(/create index concurrently if not exists public_vacancies_active_occupation_scan_idx/);
    expect(existsSync(join(ROOT, `supabase/rollbacks/${INDEX}.down.sql`))).toBe(true);
    expect(read(`supabase/rollbacks/${INDEX}.down.sql`)).toMatch(/drop index if exists public\.public_vacancies_active_occupation_scan_idx;/);
  });

  it("the equivalence script is read-only and compares against the v4 statements", () => {
    const proof = read("scripts/db-proof/search-one-scan-equivalence.sql");
    expect(proof).toMatch(/^begin transaction isolation level repeatable read read only;$/m);
    expect(proof).toMatch(/^rollback;$/m);
    expect(proof).toMatch(/raise exception 'one-scan search differs/);
    for (const term of ["'a'", "'el'", "'ter'", "'kock'", "'undersköterska'", "'zzqx'"]) {
      expect(proof).toContain(term);
    }
  });
});
