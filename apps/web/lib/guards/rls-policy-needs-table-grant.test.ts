import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * A POLICY WITHOUT A GRANT IS A LOCKED DOOR (production defect 2026-10-08).
 *
 * `public` has no default privileges for `authenticated`, so a table created
 * without an explicit GRANT is readable by its owner only. Postgres checks the
 * table privilege BEFORE row-level security: a `for select to authenticated`
 * policy on an ungranted table never runs, and every read fails with 42501.
 * Five tables created 2026-09-30 shipped that way (account_classifications,
 * organization_identifiers, organization_facts, organization_claims,
 * platform_capability_grants) — the admin marketplace funnel and company
 * ingest failed for every caller until 20261008210000.
 *
 * Pinned: every table that a migration CREATEs and gives a SELECT-capable
 * policy `to authenticated` must also be granted SELECT to `authenticated`
 * in some migration. Tables created before this rule (legacy v1 schema, whose
 * privileges were deliberately revoked on 2026-07-22) are not created with a
 * `to authenticated` policy and are therefore out of scope.
 */

const MIGRATIONS = join(__dirname, "..", "..", "..", "..", "supabase", "migrations");

function allSql(): string {
  return readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => readFileSync(join(MIGRATIONS, f), "utf8"))
    .join("\n")
    .replace(/--[^\n]*/g, "")
    .toLowerCase();
}

function createdTables(sql: string): Set<string> {
  const out = new Set<string>();
  for (const m of sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?"?([a-z0-9_]+)"?\s*\(/g)) {
    out.add(m[1]);
  }
  return out;
}

function tablesWithAuthenticatedSelectPolicy(sql: string): Set<string> {
  const out = new Set<string>();
  const policy = /create\s+policy\s+[^;]*?\bon\s+(?:public\.)?"?([a-z0-9_]+)"?([^;]*);/g;
  for (const m of sql.matchAll(policy)) {
    const body = m[2];
    const cmd = /\bfor\s+(select|all|insert|update|delete)\b/.exec(body)?.[1] ?? "all";
    if (cmd !== "select" && cmd !== "all") continue;
    if (!/\bto\s+[^;]*\bauthenticated\b/.test(body)) continue;
    out.add(m[1]);
  }
  return out;
}

function tablesGrantedSelect(sql: string): Set<string> {
  const out = new Set<string>();
  const grant = /grant\s+([a-z,\s]+?)\s+on\s+(?:table\s+)?([^;]+?)\s+to\s+([^;]+);/g;
  for (const m of sql.matchAll(grant)) {
    const privs = m[1];
    if (!/\b(select|all)\b/.test(privs)) continue;
    if (!/\bauthenticated\b/.test(m[3])) continue;
    for (const t of m[2].split(",")) {
      const name = t.trim().replace(/^public\./, "").replace(/"/g, "");
      if (/^[a-z0-9_]+$/.test(name)) out.add(name);
    }
  }
  return out;
}

describe("an RLS policy for authenticated needs a table GRANT", () => {
  const sql = allSql();
  const created = createdTables(sql);
  const withPolicy = tablesWithAuthenticatedSelectPolicy(sql);
  const granted = tablesGrantedSelect(sql);

  it("finds the tables it is meant to check (the scan is not vacuous)", () => {
    expect(withPolicy.size).toBeGreaterThan(20);
    expect(granted.has("account_classifications")).toBe(true);
  });

  it("every created table with a select policy for authenticated is granted select", () => {
    const locked = [...withPolicy].filter((t) => created.has(t) && !granted.has(t)).sort();
    expect(locked).toEqual([]);
  });
});
