import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Free-text job search gets a trigram index, never a cap on the result total
 * (owner decision 2026-11-03). The index only helps if its expression is the
 * function's predicate byte for byte: `lower(occupation_raw) collate "C"`. An
 * index on plain lower(occupation_raw) carries the ICU database collation and
 * the planner never picks it for the deployed `collate "C" like` (proven on a
 * scratch PG16 copy). The search function itself stays untouched.
 */
const ROOT = join(__dirname, "..", "..", "..", "..");
const EXT = "20261103171000_pg_trgm_extension_v1";
const IDX = "20261103171100_public_vacancies_occupation_trgm_idx_v1";
const V4 = "20261011090000_search_public_vacancy_previews_c_like_v4";
const sqlOnly = (s: string) =>
  s
    .replace(/\r/g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const ext = sqlOnly(read(`supabase/migrations/${EXT}.sql`));
const idx = sqlOnly(read(`supabase/migrations/${IDX}.sql`));
const v4 = sqlOnly(read(`supabase/migrations/${V4}.sql`));

describe("job search trigram index v1", () => {
  it("indexes exactly the expression the deployed search predicate uses", () => {
    expect(v4.match(/lower\([vh]\.occupation_raw\) collate "C" like v_pattern/g)).toHaveLength(4);
    expect(idx).toMatch(
      /create index if not exists public_vacancies_occupation_trgm_idx\s+on public\.public_vacancies\s+using gin \(\(lower\(occupation_raw\) collate "C"\) extensions\.gin_trgm_ops\)\s+where is_active;/,
    );
  });

  it("refuses to record an invalid or differently shaped leftover index", () => {
    expect(idx).toContain("if found and not v_valid then");
    expect(idx).toContain(
      `'CREATE INDEX public_vacancies_occupation_trgm_idx ON public.public_vacancies USING gin (lower(occupation_raw) COLLATE "C" extensions.gin_trgm_ops) WHERE is_active'`,
    );
  });

  it("touches no function, grant, policy or row, and never builds CONCURRENTLY inside the transaction", () => {
    for (const sql of [ext, idx]) {
      // String literals (the guard's error messages) are not statements.
      expect(sql.replace(/'(?:[^']|'')*'/g, "''")).not.toMatch(/\b(create\s+or\s+replace\s+function|grant|revoke|policy|update|delete|truncate|concurrently)\b/i);
    }
    expect(ext.trim().split(/;\s*/).filter(Boolean)).toEqual([
      "begin",
      "create extension if not exists pg_trgm with schema extensions",
      "commit",
    ]);
  });

  it("ships rollbacks that drop only what was added, the extension without cascade", () => {
    const downIdx = sqlOnly(read(`supabase/rollbacks/${IDX}.down.sql`));
    const downExt = sqlOnly(read(`supabase/rollbacks/${EXT}.down.sql`));
    expect(downIdx).toMatch(/drop index if exists public\.public_vacancies_occupation_trgm_idx;/);
    expect(downExt).toMatch(/drop extension if exists pg_trgm;/);
    expect(downExt).not.toMatch(/cascade/i);
  });
});
