import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * M-P0-4 GUARDS — company_memberships v1 package
 * (docs/architecture/COMPANY_MEMBERSHIPS_V1.md).
 *
 * Membership is GOVERNANCE, not employment. Pinned here:
 *   1. the migration ships RED — NO `@human-gate-approved` marker until a
 *      separate owner apply decision is recorded;
 *   2. exactly one live membership tuple per profile/organization (partial
 *      unique over invited|active), revoked history retained;
 *   3. the last active owner membership cannot silently disappear
 *      (protect_last_owner trigger);
 *   4. authenticated gets SELECT only — zero write grants, zero write
 *      policies (writes are future reviewed RPCs);
 *   5. the backfill classifies honestly: owner_profile_id and ACTIVE
 *      manager/external_manager engagements migrate; `employee` engagements
 *      NEVER do; no engagement row is mutated;
 *   6. membership creates/ends no engagement, no project assignment, and
 *      never alters identity (no writes outside company_memberships);
 *   7. the paired rollback exists and fails loudly once post-apply
 *      (non-backfill) rows exist — it never destroys real governance
 *      decisions silently.
 */

const APP_ROOT = join(__dirname, "..", "..");
const REPO_ROOT = join(APP_ROOT, "..", "..");
const MIGRATION = join(
  REPO_ROOT, "supabase", "migrations", "20260806090000_company_memberships_v1.sql",
);
const ROLLBACK = join(
  REPO_ROOT, "supabase", "rollbacks", "20260806090000_company_memberships_v1.down.sql",
);

const stripComments = (sql: string) =>
  sql
    .split(/\r?\n/)
    .filter((line) => !/^\s*--/.test(line))
    .join("\n");

const raw = readFileSync(MIGRATION, "utf8");
const sql = stripComments(raw);

describe("M-P0-4 — company_memberships v1 package", () => {
  it("carries the recorded-decision human-gate marker", () => {
    // OWNER APPROVAL recorded 2026-08-05 ("OWNER DECISION — APPLY
    // COMPANY_MEMBERSHIPS V1" §1). Before that decision this assertion
    // enforced ABSENCE of the marker. Same line-anchored detection as
    // .github/scripts/migration-safety.mjs.
    const ANNOTATION = /(^|\r?\n)[ \t]*--[ \t]*@human-gate-approved\b/i;
    expect(ANNOTATION.test(raw)).toBe(true);
  });

  it("one LIVE membership tuple per profile/organization; revoked history stays", () => {
    expect(sql).toMatch(
      /create\s+unique\s+index\s+company_memberships_live_key[\s\S]*?\(organization_id,\s*profile_id\)[\s\S]*?where\s+status\s+in\s*\('invited',\s*'active'\)/i,
    );
    expect(sql).toMatch(/check\s*\(status\s+in\s*\('invited','active','revoked'\)\)/i);
  });

  it("roles derive from the existing doctrine — no invented role", () => {
    expect(sql).toMatch(
      /check\s*\(role\s+in\s*\('owner','admin','manager','external_manager','member'\)\)/i,
    );
  });

  it("the last active owner membership cannot silently disappear", () => {
    expect(sql).toMatch(/function\s+public\.company_memberships_protect_last_owner/i);
    expect(sql).toMatch(/last_owner_membership/);
    expect(sql).toMatch(
      /create\s+trigger\s+protect_last_owner\s+before\s+update\s+or\s+delete/i,
    );
  });

  it("authenticated is read-only: SELECT grant only, no write policy", () => {
    expect(sql).toMatch(/grant\s+select\s+on\s+table\s+public\.company_memberships\s+to\s+authenticated/i);
    expect(sql).not.toMatch(
      /grant\s+(all|insert|update|delete)[^;]*to\s+authenticated/i,
    );
    expect(sql).toMatch(/revoke\s+all\s+on\s+table\s+public\.company_memberships\s+from\s+anon/i);
    // Exactly one policy, and it is SELECT-only.
    const policies = sql.match(/create\s+policy/gi) ?? [];
    expect(policies).toHaveLength(1);
    expect(sql).toMatch(/create\s+policy\s+company_memberships_select[\s\S]*?for\s+select/i);
    expect(sql).not.toMatch(/for\s+(insert|update|delete|all)\b/i);
  });

  it("backfill classification: owners + manager-class engagements in, employees NEVER", () => {
    expect(sql).toMatch(/backfill:organizations\.owner_profile_id/);
    expect(sql).toMatch(/backfill:engagement_contexts/);
    expect(sql).toMatch(/in\s*\('manager','external_manager'\)/i);
    // The word `employee` must appear in NO executable statement.
    expect(sql).not.toMatch(/'employee'/);
  });

  it("governance ≠ employment: no write outside company_memberships", () => {
    expect(sql).not.toMatch(/\b(insert\s+into|update|delete\s+from)\s+public\.engagement_contexts/i);
    expect(sql).not.toMatch(/\b(insert\s+into|update|delete\s+from)\s+public\.(profiles|profile_roles|projects|companies|organizations)\b/i);
    const inserts = [...sql.matchAll(/insert\s+into\s+public\.([a-z_]+)/gi)].map(
      (m) => m[1],
    );
    expect(new Set(inserts)).toEqual(new Set(["company_memberships"]));
  });

  it("status/timestamp coherence is a schema fact, not an RPC promise", () => {
    expect(sql).toMatch(/company_memberships_accepted_coherent/);
    expect(sql).toMatch(/company_memberships_revoked_coherent/);
  });

  it("rollback exists, fails loudly on post-apply rows, destroys no source data", () => {
    expect(existsSync(ROLLBACK)).toBe(true);
    const down = readFileSync(ROLLBACK, "utf8");
    const downSql = stripComments(down);
    expect(downSql).toMatch(/ROLLBACK WINDOW CLOSED/);
    expect(downSql).toMatch(/raise\s+exception/i);
    expect(downSql).not.toMatch(/(update|delete\s+from)\s+public\.(organizations|engagement_contexts)/i);
    // The rollback carries no approval marker — nothing to approve in undoing.
    expect(down).not.toMatch(/(^|\r?\n)[ \t]*--[ \t]*@human-gate-approved\b/i);
  });

  it("fails closed when re-run or on a pre-org-spine schema", () => {
    expect(sql).toMatch(/to_regclass\('public\.company_memberships'\)\s+is\s+not\s+null/i);
    expect(sql).toMatch(/to_regclass\('public\.organizations'\)\s+is\s+null/i);
  });
});
