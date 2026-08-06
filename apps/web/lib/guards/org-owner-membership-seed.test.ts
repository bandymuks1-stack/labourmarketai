import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * M-P0-4 GAP-CLOSURE GUARDS — org owner membership seed v1
 * (20260807090000, the 2026-08-06 PROD_QA finding).
 *
 * Organizations created after the 20260806090000 backfill have NO owner
 * membership, so membership_actor_role-derived authority never exists for
 * them and the governance spine is unreachable. Pinned here:
 *   1. the migration ships RED — NO `@human-gate-approved` marker until a
 *      separate owner apply decision is recorded (never agent-added);
 *   2. an AFTER INSERT trigger on public.organizations seeds exactly the
 *      tuple the finding prescribes: role 'owner', status 'active',
 *      accepted_at now(), source 'org-create';
 *   3. the seed is idempotent — live-tuple NOT EXISTS guard plus
 *      ON CONFLICT DO NOTHING against the live-key partial unique index;
 *   4. the one-time backfill mirrors the original rule
 *      (organizations.owner_profile_id → owner/active), is guarded by the
 *      same live-tuple NOT EXISTS, and carries a distinguishable
 *      'backfill:%' source;
 *   5. governance ≠ employment — no write outside company_memberships,
 *      no 'employee', no role other than 'owner' is ever inserted;
 *   6. the definer function follows the 20260806090000 §6 pattern —
 *      search_path pinned, revoked from public and anon;
 *   7. the paired rollback removes ONLY the trigger + function; it never
 *      deletes membership rows (a data revert is blocked by the
 *      last-owner survival trigger by design) and carries no marker.
 */

const APP_ROOT = join(__dirname, "..", "..");
const REPO_ROOT = join(APP_ROOT, "..", "..");
const MIGRATION = join(
  REPO_ROOT, "supabase", "migrations", "20260807090000_org_owner_membership_seed_v1.sql",
);
const ROLLBACK = join(
  REPO_ROOT, "supabase", "rollbacks", "20260807090000_org_owner_membership_seed_v1.down.sql",
);

const stripComments = (sql: string) =>
  sql
    .split(/\r?\n/)
    .filter((line) => !/^\s*--/.test(line))
    .join("\n");

const raw = readFileSync(MIGRATION, "utf8");
const sql = stripComments(raw);

describe("M-P0-4 gap closure — org owner membership seed v1", () => {
  it("ships RED: no human-gate marker before the owner's apply decision", () => {
    // Same line-anchored detection as .github/scripts/migration-safety.mjs.
    // This assertion FLIPS to `true` only when the owner's apply decision is
    // recorded — the marker is never added on the agent's own initiative.
    const ANNOTATION = /(^|\r?\n)[ \t]*--[ \t]*@human-gate-approved\b/i;
    expect(ANNOTATION.test(raw)).toBe(false);
  });

  it("seeds every new org via AFTER INSERT on public.organizations", () => {
    expect(sql).toMatch(
      /create\s+trigger\s+on_org_owner_membership_seed\s+after\s+insert\s+on\s+public\.organizations/i,
    );
    expect(sql).toMatch(
      /execute\s+function\s+public\.company_memberships_seed_org_owner\(\)/i,
    );
  });

  it("seeds exactly the prescribed tuple: owner / active / now() / org-create", () => {
    expect(sql).toMatch(
      /new\.id,\s*new\.owner_profile_id,\s*'owner',\s*'active',\s*now\(\),\s*'org-create'/i,
    );
  });

  it("fails closed (§4): an org INSERT without an owner_profile_id is refused", () => {
    // The canonical invariant: organization created → owner membership
    // active, atomically. A creation that cannot establish the owner must
    // not succeed — never a silent skip.
    expect(sql).toMatch(/new\.owner_profile_id\s+is\s+null/i);
    expect(sql).toMatch(/org_without_owner/);
    expect(sql).toMatch(/errcode\s*=\s*'23514'/i);
  });

  it("backfill never writes the ambiguous class (§5)", () => {
    // An org whose ACTIVE owner membership belongs to a DIFFERENT profile
    // than organizations.owner_profile_id is ambiguous: reported via
    // NOTICE, excluded from both the backfill and the post-condition,
    // never written.
    const exclusions = sql.match(
      /m2\.profile_id\s*<>\s*o\.owner_profile_id/gi,
    ) ?? [];
    // Once in the backfill guard, twice in the post-condition census.
    expect(exclusions.length).toBeGreaterThanOrEqual(3);
    expect(sql).toMatch(/raise\s+notice/i);
    expect(sql).toMatch(/AMBIGUOUS/);
  });

  it("is idempotent: live-tuple NOT EXISTS guard + ON CONFLICT DO NOTHING", () => {
    const guards = sql.match(
      /not\s+exists\s*\(\s*select\s+1\s+from\s+public\.company_memberships/gi,
    ) ?? [];
    // Once in the trigger, once in the backfill, once in the post-condition.
    expect(guards.length).toBeGreaterThanOrEqual(2);
    expect(sql).toMatch(/status\s+in\s*\('invited','active'\)/i);
    const conflicts = sql.match(/on\s+conflict\s+do\s+nothing/gi) ?? [];
    expect(conflicts).toHaveLength(2);
  });

  it("backfill mirrors the original owner rule with a distinguishable source", () => {
    expect(sql).toMatch(/'backfill:organizations\.owner_profile_id:v2'/);
    expect(sql).toMatch(
      /from\s+public\.organizations\s+o\s+where\s+o\.owner_profile_id\s+is\s+not\s+null/i,
    );
  });

  it("governance ≠ employment: owner-only, no write outside company_memberships", () => {
    const inserts = [...sql.matchAll(/insert\s+into\s+public\.([a-z_]+)/gi)].map(
      (m) => m[1],
    );
    expect(new Set(inserts)).toEqual(new Set(["company_memberships"]));
    expect(sql).not.toMatch(/'employee'/);
    expect(sql).not.toMatch(/'(admin|manager|external_manager|member)'/);
    expect(sql).not.toMatch(
      /\b(insert\s+into|update|delete\s+from)\s+public\.engagement_contexts/i,
    );
    // No row mutation anywhere: seed and backfill are INSERT-only.
    expect(sql).not.toMatch(/(^|;)\s*(update|delete\s+from)\s+\w/im);
  });

  it("definer function follows the §6 pattern: pinned path, revoked from public/anon", () => {
    expect(sql).toMatch(
      /function\s+public\.company_memberships_seed_org_owner[\s\S]*?security\s+definer[\s\S]*?set\s+search_path\s*=\s*public/i,
    );
    expect(sql).toMatch(
      /revoke\s+all\s+on\s+function\s+public\.company_memberships_seed_org_owner\(\)\s+from\s+public/i,
    );
    expect(sql).toMatch(
      /revoke\s+all\s+on\s+function\s+public\.company_memberships_seed_org_owner\(\)\s+from\s+anon/i,
    );
    // §7 exactness: default privileges hand authenticated an EXECUTE grant
    // at creation — revoked explicitly, nothing but trigger machinery may
    // hold this function.
    expect(sql).toMatch(
      /revoke\s+all\s+on\s+function\s+public\.company_memberships_seed_org_owner\(\)\s+from\s+authenticated/i,
    );
  });

  it("fails closed on a schema without the M-P0-4 spine", () => {
    expect(sql).toMatch(/to_regclass\('public\.company_memberships'\)\s+is\s+null/i);
    expect(sql).toMatch(/company_memberships_live_key/);
  });

  it("post-condition: zero orgs may remain owner-orphaned", () => {
    expect(sql).toMatch(/seed incomplete/);
    expect(sql).toMatch(/raise\s+exception/i);
  });

  it("rollback drops only the trigger + function, never membership rows", () => {
    expect(existsSync(ROLLBACK)).toBe(true);
    const down = readFileSync(ROLLBACK, "utf8");
    const downSql = stripComments(down);
    expect(downSql).toMatch(
      /drop\s+trigger\s+if\s+exists\s+on_org_owner_membership_seed\s+on\s+public\.organizations/i,
    );
    expect(downSql).toMatch(
      /drop\s+function\s+if\s+exists\s+public\.company_memberships_seed_org_owner/i,
    );
    expect(downSql).not.toMatch(/delete\s+from/i);
    expect(downSql).not.toMatch(/\bupdate\s+public\./i);
    expect(downSql).not.toMatch(/drop\s+table/i);
    // The rollback carries no approval marker — nothing to approve in undoing.
    expect(down).not.toMatch(/(^|\r?\n)[ \t]*--[ \t]*@human-gate-approved\b/i);
  });
});
