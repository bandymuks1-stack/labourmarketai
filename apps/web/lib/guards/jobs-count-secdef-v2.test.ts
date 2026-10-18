import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { ANON_SECDEF_ALLOWLIST } from "@/lib/security/anon-secdef-allowlist";

/**
 * #1572 — THE ANONYMOUS BOARD STOPS WINDOW-COUNTING 47k ROWS PER CALL.
 *
 * `search_public_vacancy_previews_v1` computed `total_count` with
 * `count(*) over ()`, a WindowAgg over every live row on every call. Measured
 * on production 2026-09-08, both bodies timed back-to-back in one transaction,
 * warmed, two runs each:
 *
 *   unfiltered      current 97 / 90 ms warm, 3351 ms COLD   ->  new 1 / 1 ms
 *   profession=x    current 36 / 35 ms                      ->  new 53 / 48 ms
 *   q=x             current 122 / 123 ms                    ->  new 123 / 123 ms
 *
 * The cold number is the one that mattered: `anon` carries
 * `statement_timeout=3s`, so the unfiltered call exceeded its budget and the
 * board answered HTTP 500. The new unfiltered path never scans the set at all,
 * so it has no cold cliff. The profession filter is ~14 ms slower because the
 * filtered total is a second scan rather than a window over the first — a real
 * regression, far below the timeout, and recorded rather than hidden.
 *
 * THIS GUARD EXISTS BECAUSE THE ORIGINAL BRANCH SHIPPED NO TEST. A RED
 * `SECURITY DEFINER` replacement with nothing pinning its properties is below
 * the standard every other gated migration in this repo meets, and the owner
 * made the guard a CONDITION of approval.
 *
 * It asserts the four things the owner named. It asserts SHAPE — behaviour was
 * measured on production and is recorded above, not re-run here.
 */

const ROOT = join(__dirname, "..", "..", "..", "..");
const FWD = join(
  ROOT,
  "supabase/migrations/20260906080000_search_public_vacancy_previews_count_v2.sql",
);
const DOWN = join(
  ROOT,
  "supabase/rollbacks/20260906080000_search_public_vacancy_previews_count_v2.down.sql",
);

const forward = readFileSync(FWD, "utf8");
const rollback = readFileSync(DOWN, "utf8");

/** Executable SQL only — `--` comment lines and `comment on …;` removed, so an
 *  assertion never trips on the file's own explanation. */
function sqlOnly(sql: string): string {
  return sql
    .split("\n")
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n")
    .replace(/comment\s+on\s+[\s\S]*?;\s*$/gim, "");
}

/** The `returns table( … )` column contract, normalised to a comparable list. */
function returnsContract(sql: string): string[] {
  const m = sqlOnly(sql).match(/returns\s+table\s*\(([\s\S]*?)\)\s*language/i);
  if (!m) return [];
  return m[1]
    .split(",")
    .map((c) => c.trim().replace(/\s+/g, " ").toLowerCase())
    .filter(Boolean);
}

describe("#1572 — the unfiltered total comes from the singleton", () => {
  it("reads public_vacancy_supply_counts for the unfiltered case", () => {
    const code = sqlOnly(forward);
    expect(code).toMatch(/from\s+public\.public_vacancy_supply_counts/i);
    // Guarded by the singleton flag, not by a bare read of the table.
    expect(code).toMatch(/where\s+c\.singleton/i);
  });

  it("keeps a live-count fallback, so a missing singleton is not a zero", () => {
    // If the row were ever absent, `coalesce` must fall through to the real
    // count. A NULL total rendered as 0 would tell a person the market is
    // empty — the unknown-as-zero collapse this product forbids.
    const code = sqlOnly(forward);
    expect(code).toMatch(/coalesce\(/i);
    expect(code).toMatch(/select\s+count\(\*\)\s+from\s+public\.public_vacancies/i);
  });

  it("no longer window-counts every row", () => {
    expect(sqlOnly(forward)).not.toMatch(/count\(\*\)\s*over\s*\(/i);
    // …and the rollback is exactly the body that did, which is what makes it
    // a faithful inverse rather than a rewrite.
    expect(sqlOnly(rollback)).toMatch(/count\(\*\)\s*over\s*\(/i);
  });
});

describe("#1572 — the public projection did not change", () => {
  it("still returns title_raw and attribution_code as NULL", () => {
    const code = sqlOnly(forward);
    expect(code).toMatch(/null::text\s+as\s+title_raw/i);
    expect(code).toMatch(/null::text\s+as\s+attribution_code/i);
  });

  it("never selects the fields the owner ruled non-public", () => {
    // The raw title embeds employer and location wording; the named source
    // identifies the country (owner directive 2026-08-24).
    const code = sqlOnly(forward);
    for (const col of [
      "employer_name",
      "employer_homepage",
      "application_url",
      "description",
      "compensation_note",
      "region",
      "city",
      "latitude",
      "longitude",
    ]) {
      expect(code, `projection leaks ${col}`).not.toMatch(
        new RegExp(`v\\.${col}\\b`, "i"),
      );
    }
  });

  it("returns the SAME column contract as the body it replaces", () => {
    // Compared against the rollback, which is the current production body
    // verbatim — so this is a diff against production, not against intent.
    const fwd = returnsContract(forward);
    const prev = returnsContract(rollback);
    expect(fwd.length).toBeGreaterThan(10);
    expect(fwd).toEqual(prev);
  });

  it("keeps the row filter that hides withdrawn and expired ads", () => {
    expect(sqlOnly(forward)).toMatch(
      /v\.is_active[\s\S]{0,120}expires_at\s+is\s+null\s+or\s+v\.expires_at\s*>\s*now\(\)/i,
    );
  });

  it("keeps the page-size cap, so the table cannot be asked for in one call", () => {
    expect(sqlOnly(forward)).toMatch(/least\(greatest\(coalesce\(p_limit,\s*20\),\s*1\),\s*50\)/i);
    expect(sqlOnly(forward)).toMatch(/greatest\(coalesce\(p_offset,\s*0\),\s*0\)/i);
  });
});

describe("#1572 — no privilege moves", () => {
  it("adds no GRANT or REVOKE, in either direction", () => {
    for (const [label, sql] of [["migration", forward], ["rollback", rollback]] as const) {
      const code = sqlOnly(sql);
      expect(code, `${label} grants`).not.toMatch(/\bgrant\b/i);
      expect(code, `${label} revokes`).not.toMatch(/\brevoke\b/i);
    }
  });

  it("uses CREATE OR REPLACE, which PRESERVES existing execute privileges", () => {
    // A DROP + CREATE would silently drop anon's EXECUTE and take the public
    // board down. The distinction is the whole reason this migration needs no
    // GRANT of its own.
    expect(sqlOnly(forward)).toMatch(/create\s+or\s+replace\s+function/i);
    expect(sqlOnly(forward)).not.toMatch(/drop\s+function/i);
    expect(sqlOnly(rollback)).toMatch(/create\s+or\s+replace\s+function/i);
    expect(sqlOnly(rollback)).not.toMatch(/drop\s+function/i);
  });

  it("touches no table, row, index or policy", () => {
    const code = sqlOnly(forward);
    expect(code).not.toMatch(/\b(insert\s+into|update\s+public\.|delete\s+from|alter\s+table|drop\s+table|create\s+index|create\s+policy|drop\s+policy)\b/i);
  });

  it("pins search_path and stays STABLE — no volatility or path widening", () => {
    for (const sql of [forward, rollback]) {
      expect(sqlOnly(sql)).toMatch(/stable\s+security\s+definer/i);
      expect(sqlOnly(sql)).toMatch(/set\s+search_path\s+to\s+'public'/i);
    }
  });
});

describe("#1572 — the signature and the anon contract are unchanged", () => {
  const SIGNATURE = "p_query text, p_profession_slug text, p_limit integer, p_offset integer";

  it("the argument list is identical in migration and rollback", () => {
    const args = (sql: string) =>
      sqlOnly(sql)
        .match(/function\s+public\.search_public_vacancy_previews_v1\s*\(([\s\S]*?)\)\s*returns/i)?.[1]
        .replace(/\s+/g, " ")
        .trim();
    expect(args(forward)).toBeTruthy();
    expect(args(forward)).toEqual(args(rollback));
  });

  it("the anon-secdef allowlist entry still matches the function it describes", () => {
    // If the signature moved, the allowlist would describe a function that no
    // longer exists and anon reachability would be unreviewed.
    const entry = ANON_SECDEF_ALLOWLIST.find(
      (e) => e.name === "search_public_vacancy_previews_v1",
    );
    expect(entry, "search_public_vacancy_previews_v1 must stay on the allowlist").toBeDefined();
    expect(entry!.identityArgs).toBe(SIGNATURE);
    expect(entry!.mutates).toBe(false);
  });

  it("ships a paired rollback", () => {
    expect(existsSync(DOWN)).toBe(true);
  });
});
