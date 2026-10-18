import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ANON_SECDEF_ALLOWLIST } from "@/lib/security/anon-secdef-allowlist";

/**
 * The anonymous search function must state the profession as a PLAIN EQUALITY in
 * its own branch. A generic `(p is null or col = p)` predicate cannot use the
 * profession-first index, and a rare profession then walks the whole board
 * (handyman 1,100 ms, baker 1,277 ms against the anon 3 s timeout).
 */
const ROOT = join(__dirname, "..", "..", "..", "..");
const NAME = "20261001200100_search_public_vacancy_previews_plan_v3";
const sqlOnly = (s: string) =>
  s
    .split("\n")
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n");
const fwd = sqlOnly(readFileSync(join(ROOT, `supabase/migrations/${NAME}.sql`), "utf8"));
const down = join(ROOT, `supabase/rollbacks/${NAME}.down.sql`);

describe("search function plan v3", () => {
  it("is plpgsql with a plain-equality profession branch and no OR-null predicate", () => {
    expect(fwd).toMatch(/language\s+plpgsql/i);
    expect(fwd).toMatch(/v\.profession_slug\s*=\s*p_profession_slug/);
    expect(fwd).not.toMatch(/p_profession_slug\s+is\s+null\s+or/i);
    expect(fwd).not.toMatch(/\bexecute\b/i);
  });

  it("keeps the anonymous projection, row filter, caps and security properties", () => {
    expect(fwd).toMatch(/null::text,\s*v\.profession_slug/);
    expect(fwd).toMatch(/expires_at is null or v\.expires_at > now\(\)/i);
    expect(fwd).toMatch(/least\(greatest\(coalesce\(p_limit, 20\), 1\), 50\)/);
    expect(fwd).toMatch(/security\s+definer/i);
    expect(fwd).toMatch(/set\s+search_path\s+to\s+'public'/i);
    expect(fwd).toMatch(/max_parallel_workers_per_gather\s+to\s+0/i);
    expect(fwd).not.toMatch(/\b(grant|revoke|drop\s+function)\b/i);
    for (const col of ["employer_name", "application_url", "description_raw", "title_raw as"]) {
      expect(fwd).not.toMatch(new RegExp(`v\\.${col.split(" ")[0]}\\b`));
    }
  });

  it("keeps the anon allowlist entry valid and ships a rollback", () => {
    const e = ANON_SECDEF_ALLOWLIST.find((x) => x.name === "search_public_vacancy_previews_v1");
    expect(e?.identityArgs).toBe("p_query text, p_profession_slug text, p_limit integer, p_offset integer");
    expect(existsSync(down)).toBe(true);
    expect(sqlOnly(readFileSync(down, "utf8"))).toMatch(/language\s+sql/i);
  });
});
