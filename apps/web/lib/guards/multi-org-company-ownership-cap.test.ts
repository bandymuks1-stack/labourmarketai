import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * M-P0-1 GUARDS — one-person-one-company cap removal package.
 *
 * Owner doctrine (2026-08-05): one profile may own several organizations;
 * the active workspace is explicitly selected, never inferred from the
 * first/oldest/only company row. This slice removes the DATABASE cap
 * (`companies_profile_id_key UNIQUE (profile_id)`), replacing duplicate
 * prevention with a truthful (creator, canonical legal_name) key.
 *
 * Pinned here:
 *   1. the migration drops exactly the cap constraint and creates the
 *      replacement key (partial unique, canonicalised);
 *   2. it performs NO DML — no insert/update/delete of company rows;
 *   3. it ships RED — no `@human-gate-approved` marker until an owner
 *      decision is recorded in MULTI_ORGANIZATION_STRUCTURAL_TRAIN.md;
 *   4. the paired rollback exists and fails loudly (counts only) when a
 *      profile meanwhile owns two companies — it must never delete or
 *      reassign a company to restore the cap;
 *   5. no NEW code reintroduces a first/oldest-company fallback on
 *      `companies.profile_id` (the existing singleton writers are M-P0-2/3
 *      scope and are inventoried, not multiplied).
 */

const APP_ROOT = join(__dirname, "..", "..");
const REPO_ROOT = join(APP_ROOT, "..", "..");
const MIGRATIONS_DIR = join(REPO_ROOT, "supabase", "migrations");
const ROLLBACKS_DIR = join(REPO_ROOT, "supabase", "rollbacks");
const MIGRATION = "20260805170000_multi_org_company_ownership_cap_removal_v1.sql";
const ROLLBACK = "20260805170000_multi_org_company_ownership_cap_removal_v1.down.sql";

const stripComments = (sql: string) =>
  sql
    .split(/\r?\n/)
    .filter((line) => !/^\s*--/.test(line))
    .join("\n");

describe("M-P0-1 — company ownership cap removal", () => {
  const raw = readFileSync(join(MIGRATIONS_DIR, MIGRATION), "utf8");
  const sql = stripComments(raw);

  it("drops exactly the cap and creates the truthful replacement key", () => {
    expect(sql).toMatch(
      /alter\s+table\s+public\.companies\s+drop\s+constraint\s+companies_profile_id_key/i,
    );
    expect(sql).toMatch(
      /create\s+unique\s+index\s+companies_creator_canonical_name_key/i,
    );
    expect(sql).toMatch(/lower\(btrim\(legal_name\)\)/i);
    expect(sql).toMatch(/where\s+legal_name\s+is\s+not\s+null/i);
    // Exactly one constraint drop, nothing else dropped.
    expect(sql.match(/drop\s+constraint/gi)?.length).toBe(1);
    expect(sql).not.toMatch(/drop\s+table/i);
    expect(sql).not.toMatch(/drop\s+policy/i);
    expect(sql).not.toMatch(/drop\s+function/i);
  });

  it("performs no DML on company rows", () => {
    expect(sql).not.toMatch(/\binsert\s+into\s+public\.companies/i);
    expect(sql).not.toMatch(/\bupdate\s+public\.companies/i);
    expect(sql).not.toMatch(/\bdelete\s+from\s+public\.companies/i);
  });

  it("carries the recorded-decision human-gate marker", () => {
    // OWNER APPROVAL recorded 2026-08-05 (directive §3, "OWNER APPROVES
    // M-P0-1 APPLY"); applied to prod the same day (ledger 20260805171825).
    // Before that decision this assertion enforced ABSENCE of the marker.
    // Same line-anchored detection as .github/scripts/migration-safety.mjs —
    // prose MENTIONS of the marker in header comments do not count.
    const ANNOTATION = /(^|\r?\n)[ \t]*--[ \t]*@human-gate-approved\b/i;
    expect(
      ANNOTATION.test(raw),
      `${MIGRATION} must carry @human-gate-approved — the owner decision is recorded`,
    ).toBe(true);
  });

  it("rollback exists, fails loudly on a closed window, and destroys nothing", () => {
    expect(existsSync(join(ROLLBACKS_DIR, ROLLBACK))).toBe(true);
    const down = stripComments(readFileSync(join(ROLLBACKS_DIR, ROLLBACK), "utf8"));
    expect(down).toMatch(/ROLLBACK WINDOW CLOSED/);
    expect(down).toMatch(/raise\s+exception/i);
    expect(down).toMatch(
      /add\s+constraint\s+companies_profile_id_key\s+unique\s*\(profile_id\)/i,
    );
    expect(down).not.toMatch(/\bdelete\s+from\s+public\.companies/i);
    expect(down).not.toMatch(/\bupdate\s+public\.companies/i);
  });

  it("no later migration re-adds companies_profile_id_key or a profile_id unique", () => {
    // A later migration silently re-adding the cap would restore the
    // one-person-one-company product bug. Filename order = apply order.
    // Later migrations MAY reference the constraint name read-only (e.g.
    // M-P0-2's preflight raises when the cap is still present); what is
    // forbidden is re-CREATING the cap in any spelling.
    const readding = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith(".sql"))
      .filter((f) => f.localeCompare(MIGRATION) > 0)
      .filter((f) => {
        const later = stripComments(
          readFileSync(join(MIGRATIONS_DIR, f), "utf8"),
        );
        return (
          /add\s+constraint\s+companies_profile_id_key/i.test(later) ||
          /add\s+constraint\s+\S+\s+unique\s*\(\s*profile_id\s*\)/i.test(later) ||
          /create\s+unique\s+index\s+(?:concurrently\s+)?(?:if\s+not\s+exists\s+)?\S+\s+on\s+(?:public\.)?companies\s*(?:using\s+\S+\s*)?\(\s*profile_id\s*\)/i.test(
            later,
          )
        );
      })
      .sort();
    expect(
      readding,
      "a later migration re-adds the one-person-one-company cap — forbidden by M-P0-1 doctrine",
    ).toEqual([]);
  });
});
