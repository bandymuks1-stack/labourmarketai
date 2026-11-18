import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Free-text job search must not ILIKE under the ICU database collation: that
 * case-folds every candidate row through ICU (6.9 s over 118k active rows on
 * production, anon timeout 3 s). v4 folds once with lower() and compares bytes
 * with collate "C" (180 ms, same matches). v4 changes only that predicate.
 */
const ROOT = join(__dirname, "..", "..", "..", "..");
const NAME = "20261011090000_search_public_vacancy_previews_c_like_v4";
const V3 = "20261001200100_search_public_vacancy_previews_plan_v3";
const sqlOnly = (s: string) =>
  s
    .replace(/\r/g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n");
const fnBody = (s: string) => s.slice(s.indexOf("as $function$"), s.indexOf("$function$;"));
const fwd = sqlOnly(readFileSync(join(ROOT, `supabase/migrations/${NAME}.sql`), "utf8"));
const v3 = sqlOnly(readFileSync(join(ROOT, `supabase/migrations/${V3}.sql`), "utf8"));
const down = join(ROOT, `supabase/rollbacks/${NAME}.down.sql`);

describe("search function v4: free text without per-row ICU ilike", () => {
  it("matches lower(occupation_raw) collate \"C\" against a lowered needle, never ilike", () => {
    expect(fnBody(fwd)).not.toMatch(/\bilike\b/i);
    expect(fwd.match(/lower\([vh]\.occupation_raw\) collate "C" like v_pattern/g)).toHaveLength(4);
    expect(fwd).toContain("v_pattern := '%' || lower(v_needle) || '%';");
  });

  it("is the v3 body with only the free-text predicate changed", () => {
    const normalized = fnBody(fwd)
      .replace(/lower\(([vh])\.occupation_raw\) collate "C" like v_pattern/g, "$1.occupation_raw ilike v_pattern")
      .replace("lower(v_needle)", "v_needle");
    expect(normalized).toBe(fnBody(v3));
  });

  it("adds no extension, index, grant or RLS change and ships the v3 body as rollback", () => {
    expect(fwd).not.toMatch(/\b(create\s+extension|create\s+index|grant|revoke|policy|drop)\b/i);
    expect(existsSync(down)).toBe(true);
    const back = sqlOnly(readFileSync(down, "utf8"));
    expect(fnBody(back)).toBe(fnBody(v3));
  });
});
