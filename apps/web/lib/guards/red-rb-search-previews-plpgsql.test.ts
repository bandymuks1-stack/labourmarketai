import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ANON_SECDEF_ALLOWLIST } from "@/lib/security/anon-secdef-allowlist";

/**
 * R-B (2026-09-20 launch-completion audit): the anonymous job board's
 * profession filter times out because ONE generic SQL body cannot pick the
 * right plan for four parameter shapes.
 *
 * WHAT WAS MEASURED ON PRODUCTION (2026-09-20, DO block aborted by RAISE,
 * zero residue): `/jobs?profession=welder` under anon walked
 * public_vacancies_active_published_idx across every live row — ~14,878
 * shared buffers, 8.3 s cold against the anon role's 3 s statement_timeout.
 * The plpgsql rewrite with one static-predicate branch per shape served the
 * same page from public_vacancies_active_profession_idx in 617 buffers /
 * 387 ms, and returned the IDENTICAL 20 ids and totals for (welder) /
 * (none) / ('svets') / ('svets' + welder, offset 5).
 *
 * THE FIX IS RED (SECURITY DEFINER replace, rule g) and lives in
 * supabase/migrations/20260920120000_search_previews_plpgsql_v1.sql,
 * applied only after the owner's approval. This guard pins what is true
 * regardless of apply state:
 *   1. the migration is the minimum: one function body, plpgsql, branching
 *      on the two parameters; same signature, same RETURNS TABLE column
 *      list as v2, same clamps, same escaping, same NULL projection;
 *   2. it touches NO grant, policy, table, index or row;
 *   3. its rollback restores the 20260906080000 v2 definition VERBATIM;
 *   4. the anon-secdef allowlist entry still describes this exact signature.
 */
const REPO = join(__dirname, "..", "..", "..", "..");
const MIG_NAME = "20260920120000_search_previews_plpgsql_v1";
const MIGRATION = join(REPO, "supabase", "migrations", `${MIG_NAME}.sql`);
const ROLLBACK = join(REPO, "supabase", "rollbacks", `${MIG_NAME}.down.sql`);
const V2 = join(
  REPO,
  "supabase",
  "migrations",
  "20260906080000_search_public_vacancy_previews_count_v2.sql",
);

// EOL-normalized reads: on a Windows checkout with autocrlf the frozen v2 file
// is CRLF in the working copy while a freshly written file is LF; CI is LF
// throughout. The verbatim comparison is about bytes of SQL, not line endings.
const readText = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const strip = (sql: string) => sql.replace(/--[^\n]*/g, "");
const ws = (s: string) => s.replace(/\s+/g, " ").trim();

/** The RETURNS TABLE (...) column list of the search function in `sql`. */
const returnsTable = (sql: string) =>
  ws(
    strip(sql).match(
      /function\s+public\.search_public_vacancy_previews_v1\s*\([\s\S]*?\)\s*returns\s+table\s*\(([\s\S]*?)\)\s*language/i,
    )?.[1] ?? "",
  );

/** The argument list of the search function in `sql`. */
const args = (sql: string) =>
  ws(
    strip(sql).match(
      /function\s+public\.search_public_vacancy_previews_v1\s*\(([\s\S]*?)\)\s*returns/i,
    )?.[1] ?? "",
  );

describe("R-B migration — the minimum plan correction", () => {
  const raw = readText(MIGRATION);
  const sql = strip(raw);

  it("carries the human-gate annotation on line 1 and the DRAFT sentence (RED, never auto-merged)", () => {
    expect(raw.startsWith("-- @human-gate-approved")).toBe(true);
    expect(raw).toMatch(/DRAFT — needs-human-gate — DO NOT APPLY automatically/);
  });

  it("replaces exactly ONE function: search_public_vacancy_previews_v1, LANGUAGE plpgsql, STABLE SECURITY DEFINER, search_path pinned", () => {
    expect((sql.match(/create or replace function/gi) ?? []).length).toBe(1);
    expect(sql).toMatch(/create or replace function public\.search_public_vacancy_previews_v1\(/);
    expect(sql).toMatch(/language plpgsql\s+stable security definer\s+set search_path to 'public'/);
    expect(sql).not.toMatch(/language sql/i);
  });

  it("keeps the v2 signature and the v2 RETURNS TABLE column list byte-for-byte", () => {
    const v2 = readText(V2);
    expect(args(sql)).toBe(
      "p_query text default null, p_profession_slug text default null, p_limit integer default 20, p_offset integer default 0",
    );
    expect(args(sql)).toBe(args(v2));
    expect(returnsTable(sql)).toBe(returnsTable(v2));
    expect(returnsTable(sql)).toContain("title_raw text");
    expect(returnsTable(sql)).toContain("attribution_code text");
    expect(returnsTable(sql)).toContain("total_count bigint");
  });

  it("branches on the two parameters: four static-predicate shapes, nothing generic", () => {
    expect(sql).toMatch(/if p_profession_slug is null and v_needle is null then/);
    expect(sql).toMatch(/elsif p_profession_slug is not null and v_needle is null then/);
    expect(sql).toMatch(/elsif p_profession_slug is null then/);
    expect((sql.match(/return query/g) ?? []).length).toBe(4);
    // The generic OR-folded predicate that defeats the planner is gone.
    expect(sql).not.toMatch(/p_profession_slug is null or v\.profession_slug = p_profession_slug/);
    // Each profession-filtered branch (two of them) is the static equality the
    // profession index serves — once in its count, once in its listing.
    expect((sql.match(/v\.profession_slug = p_profession_slug/g) ?? []).length).toBe(4);
  });

  it("projects title_raw and attribution_code as NULL in every branch (owner directive 2026-08-24)", () => {
    const selects = sql.match(/return query\s+select[\s\S]*?limit v_limit offset v_offset;/g) ?? [];
    expect(selects.length).toBe(4);
    for (const s of selects) {
      // position 2 = title_raw, position 12 = attribution_code (RETURNS TABLE order)
      expect(ws(s)).toContain("select v.id, null::text, v.profession_slug,");
      expect(ws(s)).toContain("v.source_language, null::text, v.published_at, v_total");
      expect(s).not.toMatch(/v\.title_raw|v\.attribution_code|employer|country|city|apply_url|description/);
      // Only the visible occupation label may match; the hidden title never.
      expect(s).not.toMatch(/title_raw\s+ilike/i);
      expect(s).toMatch(/order by v\.published_at desc nulls last, v\.id/);
    }
    expect((sql.match(/v\.occupation_raw ilike v_pattern/g) ?? []).length).toBe(4);
  });

  it("keeps the v2 clamps, escaping, active-row filter and singleton total", () => {
    expect(sql).toMatch(/v_limit\s+integer\s+:= least\(greatest\(coalesce\(p_limit, 20\), 1\), 50\);/);
    expect(sql).toMatch(/v_offset\s+integer\s+:= greatest\(coalesce\(p_offset, 0\), 0\);/);
    // LIKE metacharacters escaped before interpolation (a real backslash each).
    expect(sql).toMatch(/nullif\(replace\(replace\(btrim\(coalesce\(p_query, ''\)\), '%', '\\%'\), '_', '\\_'\), ''\)/);
    expect((sql.match(/v\.is_active and/g) ?? []).length).toBeGreaterThanOrEqual(8);
    expect((sql.match(/\(v\.expires_at is null or v\.expires_at > now\(\)\)/g) ?? []).length).toBeGreaterThanOrEqual(8);
    expect(sql).toMatch(/select c\.active_vacancies from public\.public_vacancy_supply_counts c where c\.singleton/);
  });

  it("touches NO grant, revoke, policy, table, index, trigger or row", () => {
    expect(sql).not.toMatch(/\bgrant\b|\brevoke\b/i);
    expect(sql).not.toMatch(/create policy|alter policy|drop policy|alter table|create table|drop table|create index|drop index|create trigger|insert into|update public\.|delete from|truncate/i);
    expect(sql).not.toMatch(/drop function/i);
  });
});

describe("R-B rollback — restores the v2 definition verbatim", () => {
  it("exists and is the 20260906080000 CREATE OR REPLACE + comment on function, byte-for-byte", () => {
    expect(existsSync(ROLLBACK)).toBe(true);
    const down = readText(ROLLBACK);
    const v2 = readText(V2);
    const start = v2.indexOf("create or replace function public.search_public_vacancy_previews_v1(");
    const commentStart = v2.indexOf("comment on function public.search_public_vacancy_previews_v1(", start);
    const end = v2.indexOf(";", v2.indexOf("'Anonymous board projection.", commentStart)) + 1;
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(commentStart);
    const v2Block = v2.slice(start, end);
    expect(v2Block).toContain("language sql");
    expect(v2Block).toContain("$function$;");
    expect(down).toContain(v2Block);
    // The rollback re-creates exactly one function and never touches privileges.
    expect((strip(down).match(/create or replace function/gi) ?? []).length).toBe(1);
    expect(strip(down)).not.toMatch(/\bgrant\b|\brevoke\b|drop policy|create policy|alter table|drop function/i);
    expect(down).not.toMatch(/(^|\r?\n)[ \t]*--[ \t]*@human-gate-approved\b/i);
  });
});

describe("R-B consumer contract — anon reachability is unchanged", () => {
  it("the anon-secdef allowlist entry still describes this exact signature, read-only", () => {
    const entry = ANON_SECDEF_ALLOWLIST.find((e) => e.name === "search_public_vacancy_previews_v1");
    expect(entry, "search_public_vacancy_previews_v1 must stay on the allowlist").toBeDefined();
    expect(entry!.identityArgs).toBe("p_query text, p_profession_slug text, p_limit integer, p_offset integer");
    expect(entry!.mutates).toBe(false);
  });

  it("the board reads the RPC by the same name and parameters", () => {
    const lib = readFileSync(
      join(REPO, "apps", "web", "lib", "vacancy-store", "public-vacancy-preview.ts"),
      "utf8",
    );
    expect(lib).toContain('"search_public_vacancy_previews_v1"');
    expect(lib).toMatch(/p_profession_slug/);
    expect(lib).toMatch(/p_query/);
  });
});
