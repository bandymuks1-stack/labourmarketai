import { describe, expect, it } from "vitest";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * M-P0-4 SLICE 2 GUARDS — membership commands v1.
 *
 * Pinned here:
 *   1. the migration ships RED — NO `@human-gate-approved` marker until an
 *      owner apply decision is recorded;
 *   2. the seven commands exist, are SECURITY DEFINER with pinned
 *      search_path, and authenticated may EXECUTE them while anon may not;
 *   3. the internal authority helper carries NO authenticated grant;
 *   4. RPC-ONLY WRITES: no app code inserts/updates/deletes
 *      company_memberships directly — the commands are the only write path;
 *   5. server actions never accept an organization id from the client —
 *      the target org is the validated active workspace;
 *   6. governance ≠ employment: the migration touches no engagement /
 *      project / roster / identity table;
 *   7. the paired rollback drops ONLY functions — never the table or rows.
 */

const APP_ROOT = join(__dirname, "..", "..");
const REPO_ROOT = join(APP_ROOT, "..", "..");
const MIGRATION = join(
  REPO_ROOT, "supabase", "migrations",
  "20260806120000_company_membership_commands_v1.sql",
);
const ROLLBACK = join(
  REPO_ROOT, "supabase", "rollbacks",
  "20260806120000_company_membership_commands_v1.down.sql",
);

const stripComments = (sql: string) =>
  sql
    .split(/\r?\n/)
    .filter((line) => !/^\s*--/.test(line))
    .join("\n");

const raw = readFileSync(MIGRATION, "utf8");
const sql = stripComments(raw);

const COMMANDS = [
  "membership_invite_v1",
  "membership_accept_v1",
  "membership_decline_v1",
  "membership_cancel_invite_v1",
  "membership_change_role_v1",
  "membership_revoke_v1",
  "membership_leave_v1",
] as const;

describe("M-P0-4 slice 2 — membership commands package", () => {
  it("ships RED — no human-gate marker before an owner apply decision", () => {
    const ANNOTATION = /(^|\r?\n)[ \t]*--[ \t]*@human-gate-approved\b/i;
    expect(ANNOTATION.test(raw)).toBe(false);
  });

  it("all seven commands exist, SECURITY DEFINER, pinned search_path", () => {
    for (const fn of COMMANDS) {
      const def = new RegExp(
        `create\\s+or\\s+replace\\s+function\\s+public\\.${fn}[\\s\\S]{0,400}?security definer[\\s\\S]{0,80}?set search_path = public`,
        "i",
      );
      expect(def.test(sql), `${fn} definition`).toBe(true);
    }
  });

  it("grants: authenticated may call the commands; anon/public may not", () => {
    // The grant loop names every command exactly once.
    for (const fn of COMMANDS) {
      expect(sql).toMatch(new RegExp(`'${fn}\\(`, "i"));
    }
    expect(sql).toMatch(/revoke all on function public\.%s from public/i);
    expect(sql).toMatch(/revoke all on function public\.%s from anon/i);
    expect(sql).toMatch(/grant execute on function public\.%s to authenticated/i);
  });

  it("the internal authority helper is not callable by app roles", () => {
    expect(sql).toMatch(
      /revoke all on function public\.membership_actor_role_v1\(uuid, uuid\) from authenticated/i,
    );
    expect(sql).not.toMatch(
      /grant[^;]*membership_actor_role_v1[^;]*to authenticated/i,
    );
  });

  it("command authority comes from membership truth — legacy arms only in the §7b/§7c consumers", () => {
    expect(sql).toMatch(/membership_actor_role_v1\(uid, /);
    // owner_profile_id survives ONLY inside the §7c validator widening (its
    // deliberately-kept legacy arm, §13 compatibility rule) — never as a
    // command's authority source. engagement_contexts likewise appears only
    // in the §7b/§7c READ arms. The seven command bodies live BEFORE §7b in
    // the file — the slice before the first consumer widening must contain
    // neither identifier.
    const commandsRegion = sql.slice(
      0,
      sql.indexOf("belongs_to_organization"),
    );
    expect(commandsRegion).toMatch(/membership_leave_v1/); // sanity: region covers the commands
    expect(commandsRegion).not.toMatch(/owner_profile_id/);
    expect(commandsRegion).not.toMatch(/engagement_contexts/);
    const ownerMentions = sql.match(/owner_profile_id/g) ?? [];
    expect(ownerMentions.length).toBeLessThanOrEqual(1);
    const engagementMentions = sql.match(/engagement_contexts/g) ?? [];
    expect(engagementMentions.length).toBeLessThanOrEqual(2);
  });

  it("governance ≠ employment: no write outside company_memberships (+ audit_logs)", () => {
    const writes = [
      ...sql.matchAll(/\b(?:insert\s+into|update|delete\s+from)\s+public\.([a-z_]+)/gi),
    ].map((m) => m[1]);
    expect(new Set(writes)).toEqual(new Set(["company_memberships", "audit_logs"]));
  });

  it("fails closed without Slice 1", () => {
    expect(sql).toMatch(/to_regclass\('public\.company_memberships'\)\s+is\s+null/i);
  });

  it("rollback exists and drops ONLY functions — the table and rows stay", () => {
    expect(existsSync(ROLLBACK)).toBe(true);
    const down = stripComments(readFileSync(ROLLBACK, "utf8"));
    expect(down).toMatch(/drop function if exists public\.membership_invite_v1/i);
    expect(down).not.toMatch(/drop\s+table/i);
    expect(down).not.toMatch(/\b(insert\s+into|update|delete\s+from)\b/i);
  });

  it("RPC-ONLY WRITES: no app code mutates company_memberships directly", () => {
    const offenders: string[] = [];
    const scan = (dir: string) => {
      for (const entry of readdirSync(join(APP_ROOT, dir), { withFileTypes: true })) {
        const rel = join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === "node_modules" || entry.name === ".next") continue;
          scan(rel);
          continue;
        }
        if (!/\.(ts|tsx)$/.test(entry.name) || entry.name.endsWith(".test.ts")) continue;
        const src = readFileSync(join(APP_ROOT, rel), "utf8");
        if (
          /from\(["']company_memberships["']\)\s*[\s\S]{0,80}?\.(insert|update|upsert|delete)\(/.test(
            src,
          )
        ) {
          offenders.push(rel);
        }
      }
    };
    scan("lib");
    scan("app");
    scan("components");
    expect(offenders).toEqual([]);
  });

  it("server actions never accept an organization id from the client", () => {
    const actions = readFileSync(
      join(APP_ROOT, "lib", "company", "membership-actions.ts"),
      "utf8",
    );
    expect(actions).toMatch(/activeOrganizationId\(\)/);
    expect(actions).not.toMatch(
      /formData\.get\(["'](organization_?[iI]d|org)/,
    );
  });

  it("the workspace switcher consumes ACTIVE governance memberships (§13)", () => {
    const src = readFileSync(
      join(APP_ROOT, "lib", "company", "active-organization.ts"),
      "utf8",
    );
    expect(src).toMatch(/readGovernanceMemberships/);
    expect(src).toMatch(/from\("company_memberships"\)/);
    expect(src).toMatch(/\.eq\("status", "active"\)/);
  });
});
